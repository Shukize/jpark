/* ============================================================
   J Park Hotel — online reservations (no online payment).
   Permanent policy: the site never collects payment online. A reservation
   made here is confirmed immediately (it holds the room-type inventory the
   same way a paid booking would); the guest pays in person at check-in by
   cash, credit/debit card, or PromptPay QR at the front desk. Mounted at
   /api/v1 in server.js:
     GET  /api/v1/booking-availability    -> { [room]: remainingCount }
     POST /api/v1/reservations            -> create a confirmed overnight booking
     POST /api/v1/payments/dayuse-booking -> pending 3-hour day-use request

   Security notes:
   - The client only ever tells us WHICH room/variant/dates it wants; the
     price is always recomputed here from lib/rateOverrides.js (which merges
     lib/roomRates.js's static base rates with any live admin edits saved via
     the Site Editor's Rates tab). Never trust a client-supplied amount.
   ============================================================ */
const express = require('express');
const crypto = require('crypto');
const db = require('../db');
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

// Generous but bounded — guards against scripted flooding of the reservation
// endpoint (each submission triggers two emails and an inventory-lock query).
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

/* POST /reservations — create a CONFIRMED overnight booking with no payment
   taken. Holds the room via the same overlap/inventory guard a paid booking
   would use, then fires the standard hotel-notice + guest-confirmation email
   pair via the shared fireBookingEmails() helper (guestBookings.js) — those
   emails show the balance due and state that payment is collected in person
   at check-in. Reuses computeTotal() so the recorded total already reflects
   any live admin rate overrides. */
router.post('/reservations', async (req, res) => {
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
       VALUES ($1,'direct','Direct (Website)',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'THB','confirmed',$13,
               'in_person','pay_at_checkin','pending')
       RETURNING *`,
      [
        ref, guestName, guestLastName, guest.email, guest.phone || null,
        room, checkIn, checkOut, nights, adults, children, total,
        b.lang || 'en',
      ]
    );
    await client.query('COMMIT');
    const saved = rows[0];

    fireBookingEmails({ ...saved, inserted: true });

    res.status(201).json({ status: 'confirmed', booking: row2js(saved) });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error('[payments] reservations', e);
    res.status(500).json({ error: 'Database error' });
  } finally {
    client.release();
  }
});

// Day-use guest email: distinct from the overnight confirmation because a
// day-use stay has a preferred TIME (not a check-in/check-out night range)
// and a flat price, not a per-night total. Day-use requests still stay
// PENDING after submission — front desk must confirm the exact time slot is
// available — so this keeps sending its own bespoke pair of emails rather
// than going through fireBookingEmails() (which only fires for 'confirmed').
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
    `Total (3-hour day-use): ${money}. Payable in person at check-in by cash, credit/debit card, or PromptPay QR.`,
    '',
    'This request is PENDING until we confirm your exact time slot — no payment is needed online.',
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
    `<tr><td style="padding:4px 12px 4px 0;color:#555">Total</td><td style="padding:4px 0">${money}</td></tr>` +
    `</table>` +
    `<p style="background:#eef6f4;border:1px solid #a9d6cb;border-radius:8px;padding:10px 14px;color:#0f4a3e">` +
    `<strong>Payable in person</strong> at check-in by cash, credit/debit card, or PromptPay QR at our front desk.</p>` +
    `<p style="background:#fbf3df;border:1px solid #e0c178;border-radius:8px;padding:10px 14px;color:#5a4a1a">` +
    `<strong>This request is pending</strong> until we confirm your exact time slot.</p>` +
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
  const method = 'pay_at_checkin';

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
               'in_person',$10,'pending')
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

    res.status(201).json({ status: 'pending', booking: row2js(saved) });
  } catch (e) {
    console.error('[payments] dayuse-booking', e);
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;
