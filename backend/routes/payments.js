/* ============================================================
   J Park Hotel — online booking payments (Omise / Opn Payments).
   PromptPay QR is the only online payment method, by permanent policy —
   card and cash are in-person-only. Mounted at /api/v1 in server.js:
     GET  /api/v1/payments/config          -> { publicKey, promptpayEnabled }
     GET  /api/v1/booking-availability     -> { [room]: remainingCount }
     POST /api/v1/payments/charge          -> create booking + PromptPay charge
     POST /api/v1/payments/manual-booking  -> pending overnight booking (PromptPay QR, no Omise charge)
     POST /api/v1/payments/dayuse-booking  -> pending 3-hour day-use request (flat rate, no Omise charge)
     GET  /api/v1/payments/status/:id      -> poll payment status
     POST /api/v1/payments/webhook         -> Omise event receiver

   Security notes:
   - The client only ever tells us WHICH room/variant/dates it wants; the
     price is always recomputed here from lib/rateOverrides.js (which merges
     lib/roomRates.js's static base rates with any live admin edits saved via
     the Site Editor's Rates tab). Never trust a client-supplied amount.
   - Omise webhooks are not cryptographically signed, so on receipt we
     re-fetch the charge from Omise's own API before trusting its status.
   ============================================================ */
const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const omise = require('../lib/omise');
const roomRates = require('../lib/roomRates');
const rateOverrides = require('../lib/rateOverrides');
const { countOverlapping } = require('../lib/availability');
const { makeLimiter } = require('../lib/rateLimit');
const { sendEmail } = require('../mailer');
const {
  row2js,
  fireBookingEmails,
  computeNights,
  hotelNotice,
  hotelRecipients,
} = require('./guestBookings');

const router = express.Router();

// This is the only endpoint in the app that can trigger a real charge, so it
// gets a guard against card-testing abuse: 10 attempts / 10 minutes per IP.
const rateLimited = makeLimiter(10, 10 * 60 * 1000);

function genRef() {
  return 'JP-' + Date.now().toString(36).toUpperCase() + '-' + crypto.randomBytes(2).toString('hex').toUpperCase();
}

// `totalGuests` (adults+children) drives two optional per-night surcharges
// on top of the variant's own room/bf rate (which already covers the
// variant's base occupancy — 1 for Single/1 Bedroom, 2 for Twin/Double/2
// Bedrooms): an extra breakfast guest (+surcharges.extraBreakfastGuest, only
// when breakfast is selected) and a physical extra bed
// (+surcharges.extraBed, only for rooms with extraBedAvailable) — see
// backend/lib/rateOverrides.js's computeGuestSurcharge().
async function computeTotal(room, variantLabel, breakfast, nights, totalGuests) {
  const effectiveRoom = await rateOverrides.getEffectiveRoom(room);
  if (!effectiveRoom) return null;
  const variant = effectiveRoom.variants.find((v) => v.label === variantLabel);
  if (!variant) return null;
  const surcharges = await rateOverrides.getEffectiveSurcharges();
  const rate = breakfast ? variant.bf : variant.room;
  const perNight = rate + rateOverrides.computeGuestSurcharge(effectiveRoom, totalGuests, breakfast, surcharges);
  return perNight * nights;
}

/* GET /payments/config */
router.get('/payments/config', (_req, res) => {
  res.json({
    publicKey: omise.publicKey(),
    promptpayEnabled: omise.isConfigured(),
  });
});

/* GET /booking-availability?checkIn=&checkOut= */
router.get('/booking-availability', async (req, res) => {
  const { checkIn, checkOut } = req.query;
  if (!checkIn || !checkOut) {
    return res.status(400).json({ error: 'checkIn and checkOut are required' });
  }
  try {
    const result = {};
    for (const room of roomRates.roomKeys()) {
      const cnt = await countOverlapping(db, room, checkIn, checkOut);
      result[room] = Math.max(0, roomRates.getInventory(room) - cnt);
    }
    res.json(result);
  } catch (e) {
    console.error('[payments] availability', e);
    res.status(500).json({ error: 'Database error' });
  }
});

/* POST /payments/charge */
router.post('/payments/charge', async (req, res) => {
  const ip = req.ip || 'unknown';
  if (rateLimited(ip)) {
    return res.status(429).json({ error: 'Too many payment attempts. Please try again later.' });
  }

  if (!omise.isConfigured()) {
    return res.status(503).json({ error: 'Online payment is not yet available. Please call or email to book.' });
  }

  const b = req.body || {};
  const guest = b.guest || {};
  const { room, variantLabel, checkIn, checkOut, method } = b;
  const breakfast = Boolean(b.breakfast);
  const adults = b.adults != null ? Number(b.adults) : 1;
  const children = b.children != null ? Number(b.children) : 0;

  if (!room || !variantLabel || !checkIn || !checkOut) {
    return res.status(400).json({ error: 'room, variantLabel, checkIn and checkOut are required' });
  }
  if (!guest.firstName || !guest.email) {
    return res.status(400).json({ error: 'Guest name and email are required' });
  }
  if (method !== 'promptpay') {
    return res.status(400).json({ error: 'method must be "promptpay"' });
  }

  const roomInfo = roomRates.getRoom(room);
  if (!roomInfo) return res.status(400).json({ error: 'Unknown room type' });
  if (adults + children > roomInfo.maxGuests) {
    return res.status(400).json({ error: 'Too many guests for this room type' });
  }

  const nights = computeNights(checkIn, checkOut);
  const total = await computeTotal(room, variantLabel, breakfast, nights, adults + children);
  if (total == null) return res.status(400).json({ error: 'Unknown room variant' });
  const amountSatang = Math.round(total * 100);

  const guestName = String(guest.firstName || 'Guest').trim();
  const guestLastName = guest.lastName ? String(guest.lastName).trim() : null;
  const description = `J Park Hotel — ${room} (${variantLabel}) ${checkIn} to ${checkOut}`;
  const metadata = { room, variantLabel, checkIn, checkOut };

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1)::bigint)', [room]);

    const cnt = await countOverlapping(client, room, checkIn, checkOut);
    if (cnt >= roomRates.getInventory(room)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Sorry, this room type is fully booked for those dates.' });
    }

    const ref = genRef();

    let source, charge;
    try {
      source = await omise.createPromptPaySource({ amountSatang, currency: 'thb' });
      charge = await omise.createChargeFromSource({
        amountSatang, currency: 'thb', sourceId: source.id, description, metadata,
      });
    } catch (e) {
      await client.query('ROLLBACK');
      console.error('[payments] promptpay charge error', e.omise || e.message);
      return res.status(502).json({ error: (e.omise && e.omise.message) || 'Could not create PromptPay charge' });
    }

    const { rows } = await client.query(
      `INSERT INTO guest_bookings
         (ref, channel, channel_name, guest_name, guest_last_name, guest_email, guest_phone,
          room, check_in, check_out, nights, adults, children, total, currency, status, lang,
          payment_provider, payment_method, payment_status, payment_charge_id)
       VALUES ($1,'direct','Direct (Website)',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'THB','pending',$13,
               'omise','promptpay','pending',$14)
       RETURNING *`,
      [
        ref, guestName, guestLastName, guest.email, guest.phone || null,
        room, checkIn, checkOut, nights, adults, children, total,
        b.lang || 'en',
        charge.id,
      ]
    );
    await client.query('COMMIT');
    const saved = rows[0];

    const qrImage = charge.source && charge.source.scannable_code
      && charge.source.scannable_code.image && charge.source.scannable_code.image.download_uri;

    res.json({
      status: 'pending',
      bookingId: saved.id,
      chargeId: charge.id,
      qrImage: qrImage || null,
      expiresAt: charge.expires_at || null,
    });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error('[payments] charge', e);
    res.status(500).json({ error: 'Database error' });
  } finally {
    client.release();
  }
});

// A pending manual booking never goes through fireBookingEmails() (that
// helper only ever fires for status 'confirmed') so it sends its own pair:
// the same hotel front-desk notice every other booking gets, plus a guest
// acknowledgment explaining payment is still owed, not yet confirmed.
function manualGuestEmail(bk) {
  const money = bk.total != null ? `${bk.total} ${bk.currency || 'THB'}` : '—';
  const lines = [
    `Dear ${bk.guest_name || 'Guest'},`,
    '',
    `Thank you for your reservation request at J Park Hotel, Chonburi (Ref: ${bk.ref}).`,
    '',
    `Room: ${bk.room || '—'}`,
    `Check-in: ${bk.check_in}`,
    `Check-out: ${bk.check_out}`,
    `Nights: ${bk.nights}`,
    `Guests: ${bk.adults} adult(s), ${bk.children} child(ren)`,
    `Total: ${money} (payable by PromptPay)`,
    '',
    'This reservation is PENDING until we confirm your payment — please complete it via the PromptPay QR shown on the booking page.',
    '',
    'Please note: a separate 200 THB deposit for your room key card is collected in cash only at check-in, and refunded in full at check-out.',
    '',
    'We will confirm your reservation by phone or email once payment is received. Reply to this email if you need anything before then.',
    '',
    'J Park Hotel, Chonburi',
  ];
  const text = lines.join('\n');
  const html =
    `<div style="font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;line-height:1.5">` +
    `<h2 style="color:#0f766e;margin:0 0 12px">Reservation request received</h2>` +
    `<p>Dear ${bk.guest_name || 'Guest'},</p>` +
    `<p>Thank you for your reservation request at <strong>J Park Hotel, Chonburi</strong> (Ref: <strong>${bk.ref}</strong>).</p>` +
    `<table style="border-collapse:collapse;margin:16px 0">` +
    `<tr><td style="padding:4px 12px 4px 0;color:#555">Room</td><td style="padding:4px 0">${bk.room || '—'}</td></tr>` +
    `<tr><td style="padding:4px 12px 4px 0;color:#555">Check-in</td><td style="padding:4px 0">${bk.check_in}</td></tr>` +
    `<tr><td style="padding:4px 12px 4px 0;color:#555">Check-out</td><td style="padding:4px 0">${bk.check_out}</td></tr>` +
    `<tr><td style="padding:4px 12px 4px 0;color:#555">Nights</td><td style="padding:4px 0">${bk.nights}</td></tr>` +
    `<tr><td style="padding:4px 12px 4px 0;color:#555">Guests</td><td style="padding:4px 0">${bk.adults} adult(s), ${bk.children} child(ren)</td></tr>` +
    `<tr><td style="padding:4px 12px 4px 0;color:#555">Total</td><td style="padding:4px 0">${money} (payable by PromptPay)</td></tr>` +
    `</table>` +
    `<p style="background:#fbf3df;border:1px solid #e0c178;border-radius:8px;padding:10px 14px;color:#5a4a1a">` +
    `<strong>This reservation is pending</strong> until we confirm your payment — please complete it via the PromptPay QR shown on the booking page.</p>` +
    `<p style="background:#fbf3df;border:1px solid #e0c178;border-radius:8px;padding:10px 14px;color:#5a4a1a">` +
    `<strong>Please note:</strong> a separate 200 THB deposit for your room key card is collected in <strong>cash only</strong> at check-in, and refunded in full at check-out.</p>` +
    `<p>We will confirm your reservation by phone or email once payment is received.</p>` +
    `<p style="color:#0f766e;font-weight:bold;margin-top:24px">J Park Hotel, Chonburi</p>` +
    `</div>`;
  return { text, html };
}

function sendManualBookingEmails(saved) {
  const to = hotelRecipients();
  if (to.length) {
    const { text, html } = hotelNotice(saved);
    sendEmail({
      to,
      subject: `New booking request (pending) — Direct (${saved.ref})`,
      text,
      html,
      replyTo: saved.guest_email || undefined,
    }).catch((err) => console.error('[payments] manual-booking hotel notice error', err));
  }
  if (saved.guest_email) {
    const { text, html } = manualGuestEmail(saved);
    sendEmail({
      to: saved.guest_email,
      subject: `J Park Hotel — reservation request received (${saved.ref})`,
      text,
      html,
    }).catch((err) => console.error('[payments] manual-booking guest email error', err));
  }
}

/* POST /payments/manual-booking — interim flow for while Omise isn't
   configured (or whenever a guest prefers to pay by the hotel's static
   PromptPay QR instead of the live Omise-PromptPay flow). Takes no payment
   itself: it records a PENDING booking that holds the room via the same
   overlap/inventory guard as /payments/charge, and emails both the front
   desk and the guest so staff can confirm by hand once payment is
   verified. Reuses computeTotal() so the recorded total already reflects
   any live admin rate overrides, same as the paid flow. `method` is always
   forced to 'promptpay_manual' — PromptPay is the only online payment
   method, by permanent policy; a client-supplied 'cash' (e.g. a stale
   cached page) is silently ignored rather than honored. */
router.post('/payments/manual-booking', async (req, res) => {
  const ip = req.ip || 'unknown';
  if (rateLimited(ip)) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }

  const b = req.body || {};
  const guest = b.guest || {};
  const { room, variantLabel, checkIn, checkOut } = b;
  const breakfast = Boolean(b.breakfast);
  const adults = b.adults != null ? Number(b.adults) : 1;
  const children = b.children != null ? Number(b.children) : 0;
  const method = 'promptpay_manual';

  if (!room || !variantLabel || !checkIn || !checkOut) {
    return res.status(400).json({ error: 'room, variantLabel, checkIn and checkOut are required' });
  }
  if (!guest.firstName || !guest.email) {
    return res.status(400).json({ error: 'Guest name and email are required' });
  }

  const roomInfo = roomRates.getRoom(room);
  if (!roomInfo) return res.status(400).json({ error: 'Unknown room type' });
  if (adults + children > roomInfo.maxGuests) {
    return res.status(400).json({ error: 'Too many guests for this room type' });
  }

  const nights = computeNights(checkIn, checkOut);
  const total = await computeTotal(room, variantLabel, breakfast, nights, adults + children);
  if (total == null) return res.status(400).json({ error: 'Unknown room variant' });

  const guestName = String(guest.firstName || 'Guest').trim();
  const guestLastName = guest.lastName ? String(guest.lastName).trim() : null;

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1)::bigint)', [room]);

    const cnt = await countOverlapping(client, room, checkIn, checkOut);
    if (cnt >= roomRates.getInventory(room)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Sorry, this room type is fully booked for those dates.' });
    }

    const ref = genRef();
    const { rows } = await client.query(
      `INSERT INTO guest_bookings
         (ref, channel, channel_name, guest_name, guest_last_name, guest_email, guest_phone,
          room, check_in, check_out, nights, adults, children, total, currency, status, lang,
          payment_provider, payment_method, payment_status)
       VALUES ($1,'direct','Direct (Website)',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'THB','pending',$13,
               'manual',$14,'pending')
       RETURNING *`,
      [
        ref, guestName, guestLastName, guest.email, guest.phone || null,
        room, checkIn, checkOut, nights, adults, children, total,
        b.lang || 'en',
        method,
      ]
    );
    await client.query('COMMIT');
    const saved = rows[0];

    sendManualBookingEmails(saved);

    res.status(201).json({ status: 'pending_manual', booking: row2js(saved) });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error('[payments] manual-booking', e);
    res.status(500).json({ error: 'Database error' });
  } finally {
    client.release();
  }
});

// Day-use guest email: distinct from manualGuestEmail() because a day-use
// stay has a preferred TIME (not a check-in/check-out night range) and a
// flat price, not a per-night total.
function dayUseGuestEmail(bk, preferredTime) {
  const money = bk.total != null ? `${bk.total} ${bk.currency || 'THB'}` : '—';
  const lines = [
    `Dear ${bk.guest_name || 'Guest'},`,
    '',
    `Thank you for your day-use request at J Park Hotel, Chonburi (Ref: ${bk.ref}).`,
    '',
    `Room: ${bk.room || '—'}`,
    `Date: ${bk.check_in}`,
    `Preferred time: ${preferredTime || 'Not specified — we will contact you to confirm'}`,
    `Total (3-hour day-use): ${money} (payable by PromptPay)`,
    '',
    'This request is PENDING until we confirm your exact time slot and payment — please complete payment via the PromptPay QR once confirmed.',
    '',
    'We will contact you by phone or email shortly to confirm availability.',
    '',
    'J Park Hotel, Chonburi',
  ];
  const text = lines.join('\n');
  const html =
    `<div style="font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;line-height:1.5">` +
    `<h2 style="color:#0f766e;margin:0 0 12px">Day-use request received</h2>` +
    `<p>Dear ${bk.guest_name || 'Guest'},</p>` +
    `<p>Thank you for your day-use request at <strong>J Park Hotel, Chonburi</strong> (Ref: <strong>${bk.ref}</strong>).</p>` +
    `<table style="border-collapse:collapse;margin:16px 0">` +
    `<tr><td style="padding:4px 12px 4px 0;color:#555">Room</td><td style="padding:4px 0">${bk.room || '—'}</td></tr>` +
    `<tr><td style="padding:4px 12px 4px 0;color:#555">Date</td><td style="padding:4px 0">${bk.check_in}</td></tr>` +
    `<tr><td style="padding:4px 12px 4px 0;color:#555">Preferred time</td><td style="padding:4px 0">${preferredTime || 'Not specified'}</td></tr>` +
    `<tr><td style="padding:4px 12px 4px 0;color:#555">Total</td><td style="padding:4px 0">${money} (payable by PromptPay)</td></tr>` +
    `</table>` +
    `<p style="background:#fbf3df;border:1px solid #e0c178;border-radius:8px;padding:10px 14px;color:#5a4a1a">` +
    `<strong>This request is pending</strong> until we confirm your exact time slot and payment.</p>` +
    `<p>We will contact you by phone or email shortly to confirm availability.</p>` +
    `<p style="color:#0f766e;font-weight:bold;margin-top:24px">J Park Hotel, Chonburi</p>` +
    `</div>`;
  return { text, html };
}

/* POST /payments/dayuse-booking — request a 3-hour day-use session (flat
   rate, no nights, no breakfast/extra-guest surcharges). Day-use requests
   are always "subject to availability" (front desk assigns the exact time
   slot), so — unlike overnight bookings — this deliberately does NOT run
   the overlap/inventory guard: check_in and check_out are stored equal,
   which countOverlapping()'s strict `check_in < check_out` condition never
   matches, so day-use rows never block or get blocked by anything. */
router.post('/payments/dayuse-booking', async (req, res) => {
  const ip = req.ip || 'unknown';
  if (rateLimited(ip)) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }

  const b = req.body || {};
  const guest = b.guest || {};
  const { room, date } = b;
  const preferredTime = typeof b.preferredTime === 'string' ? b.preferredTime.trim().slice(0, 200) : '';
  const method = 'promptpay_manual'; // PromptPay is the only online method — ignore any client-supplied value

  if (!room || !date) {
    return res.status(400).json({ error: 'room and date are required' });
  }
  if (!guest.firstName || !guest.email) {
    return res.status(400).json({ error: 'Guest name and email are required' });
  }
  const price = await rateOverrides.getEffectiveDayUsePrice(room);
  if (price == null) return res.status(400).json({ error: 'Unknown day-use room type' });

  const guestName = String(guest.firstName || 'Guest').trim();
  const guestLastName = guest.lastName ? String(guest.lastName).trim() : null;
  const ref = genRef();

  try {
    const { rows } = await db.query(
      `INSERT INTO guest_bookings
         (ref, channel, channel_name, guest_name, guest_last_name, guest_email, guest_phone,
          room, check_in, check_out, nights, adults, children, total, currency, status, lang,
          payment_provider, payment_method, payment_status)
       VALUES ($1,'direct','Direct (Website)',$2,$3,$4,$5,$6,$7,$7,1,1,0,$8,'THB','pending',$9,
               'manual',$10,'pending')
       RETURNING *`,
      [
        ref, guestName, guestLastName, guest.email, guest.phone || null,
        room + ' (Day Use)', date, price,
        b.lang || 'en',
        method,
      ]
    );
    const saved = rows[0];

    const to = hotelRecipients();
    if (to.length) {
      const { text, html } = hotelNotice(saved);
      sendEmail({
        to,
        subject: `New day-use request (pending) — Direct (${saved.ref})`,
        text: text + `\nPreferred time: ${preferredTime || 'Not specified'}`,
        html: html.replace('</table>', `<tr><td style="padding:4px 12px 4px 0;color:#555">Preferred time</td><td style="padding:4px 0">${preferredTime || 'Not specified'}</td></tr></table>`),
        replyTo: saved.guest_email || undefined,
      }).catch((err) => console.error('[payments] dayuse hotel notice error', err));
    }
    if (saved.guest_email) {
      const { text, html } = dayUseGuestEmail(saved, preferredTime);
      sendEmail({
        to: saved.guest_email,
        subject: `J Park Hotel — day-use request received (${saved.ref})`,
        text,
        html,
      }).catch((err) => console.error('[payments] dayuse guest email error', err));
    }

    res.status(201).json({ status: 'pending_manual', booking: row2js(saved) });
  } catch (e) {
    console.error('[payments] dayuse-booking', e);
    res.status(500).json({ error: 'Database error' });
  }
});

/* GET /payments/status/:id — polled by the frontend while a PromptPay QR
   or a 3-D Secure redirect is pending. Deliberately returns only the
   minimal fields a guest needs to see their own payment resolve. */
router.get('/payments/status/:id', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT ref, status, payment_status FROM guest_bookings WHERE id = $1',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    const r = rows[0];
    res.json({ ref: r.ref, status: r.status, paymentStatus: r.payment_status });
  } catch (e) {
    console.error('[payments] status', e);
    res.status(500).json({ error: 'Database error' });
  }
});

/* POST /payments/webhook — Omise event receiver. Omise doesn't sign
   webhook payloads, so an optional shared-secret query key is accepted for
   basic noise filtering, but the real check is re-fetching the charge from
   Omise's own API before ever trusting its status. */
function webhookKeyOk(provided) {
  const expected = process.env.OMISE_WEBHOOK_SECRET || '';
  if (!expected) return true;
  if (!provided) return false;
  const a = Buffer.from(String(provided));
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

router.post('/payments/webhook', async (req, res) => {
  if (!webhookKeyOk(req.query.key)) {
    return res.status(401).json({ error: 'Invalid key' });
  }
  try {
    const chargeId = req.body && req.body.data && req.body.data.id;
    if (!chargeId) return res.status(400).json({ error: 'Missing charge id' });

    const charge = await omise.getCharge(chargeId);
    if (charge.status !== 'successful') {
      return res.json({ received: true, ignored: true });
    }

    const { rows } = await db.query(
      `UPDATE guest_bookings
          SET status = 'confirmed', payment_status = 'paid', updated_at = NOW()
        WHERE payment_charge_id = $1 AND payment_status != 'paid'
        RETURNING *`,
      [chargeId]
    );
    if (rows.length) {
      fireBookingEmails({ ...rows[0], inserted: true });
    }
    res.json({ received: true });
  } catch (e) {
    console.error('[payments] webhook', e);
    res.status(500).json({ error: 'Webhook processing error' });
  }
});

module.exports = router;
