/* ============================================================
   J Park Hotel — online booking payments (Omise / Opn Payments).
   Mounted at /api/v1 in server.js:
     GET  /api/v1/payments/config          -> { publicKey, promptpayEnabled }
     GET  /api/v1/booking-availability     -> { [room]: remainingCount }
     POST /api/v1/payments/charge          -> create booking + charge (card or PromptPay)
     GET  /api/v1/payments/status/:id      -> poll payment status
     POST /api/v1/payments/webhook         -> Omise event receiver

   Security notes:
   - The client only ever tells us WHICH room/variant/dates it wants; the
     price is always recomputed here from lib/roomRates.js. Never trust a
     client-supplied amount.
   - Card numbers never reach this server — only the Omise.js browser
     token (tokn_...) does.
   - Omise webhooks are not cryptographically signed, so on receipt we
     re-fetch the charge from Omise's own API before trusting its status.
   ============================================================ */
const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const omise = require('../lib/omise');
const roomRates = require('../lib/roomRates');
const {
  row2js,
  fireBookingEmails,
  computeNights,
} = require('./guestBookings');

const router = express.Router();

const PENDING_HOLD_MINUTES = 20;

// ---------------------------------------------------------------
// Minimal in-memory sliding-window rate limit. This is the only endpoint
// in the app that can trigger a real charge, so — unlike the rest of the
// (rate-limit-free) backend — it gets a guard against card-testing abuse.
// ---------------------------------------------------------------
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const attemptsByIp = new Map();

function rateLimited(ip) {
  const now = Date.now();
  const attempts = (attemptsByIp.get(ip) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  attempts.push(now);
  attemptsByIp.set(ip, attempts);
  return attempts.length > RATE_LIMIT_MAX;
}

function genRef() {
  return 'JP-' + Date.now().toString(36).toUpperCase() + '-' + crypto.randomBytes(2).toString('hex').toUpperCase();
}

// Only ever redirect back to a known, configured front-end origin — never
// an attacker-supplied return_uri (open-redirect guard for the 3-D Secure
// card flow).
function allowedFrontendOrigins() {
  return (process.env.FRONTEND_ORIGIN || 'https://jparkhotel.com,https://www.jparkhotel.com,https://shukize.github.io')
    .split(',').map((s) => s.trim()).filter(Boolean);
}

function safeReturnUri(candidateOrigin, bookingId) {
  const allowed = allowedFrontendOrigins();
  const origin = allowed.includes(candidateOrigin) ? candidateOrigin : allowed[0];
  return `${origin}/booking.html?omise_return=1&bookingId=${encodeURIComponent(bookingId)}`;
}

function computeTotal(room, variantLabel, breakfast, nights) {
  const variant = roomRates.getVariant(room, variantLabel);
  if (!variant) return null;
  const rate = breakfast ? variant.bf : variant.room;
  return rate * nights;
}

// Count bookings that hold a room of this type over the requested date
// range: confirmed bookings, plus still-pending ones inside their hold
// window (so two guests can't both grab the last room while one is mid
// PromptPay-scan or 3-D Secure challenge). `queryable` is either the pool
// or a transaction client, so callers can run this inside a lock.
async function countOverlapping(queryable, room, checkIn, checkOut) {
  const { rows } = await queryable.query(
    `SELECT COUNT(*)::int AS cnt
       FROM guest_bookings
      WHERE room = $1
        AND check_in < $3 AND check_out > $2
        AND (
          status = 'confirmed'
          OR (status = 'pending' AND created_at > NOW() - INTERVAL '${PENDING_HOLD_MINUTES} minutes')
        )`,
    [room, checkIn, checkOut]
  );
  return rows[0].cnt;
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
  if (method !== 'card' && method !== 'promptpay') {
    return res.status(400).json({ error: 'method must be "card" or "promptpay"' });
  }
  if (method === 'card' && !b.token) {
    return res.status(400).json({ error: 'Missing card token' });
  }

  const roomInfo = roomRates.getRoom(room);
  if (!roomInfo) return res.status(400).json({ error: 'Unknown room type' });
  if (adults + children > roomInfo.maxGuests) {
    return res.status(400).json({ error: 'Too many guests for this room type' });
  }

  const nights = computeNights(checkIn, checkOut);
  const total = computeTotal(room, variantLabel, breakfast, nights);
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

    if (method === 'card') {
      let charge;
      try {
        charge = await omise.createCardCharge({
          amountSatang,
          currency: 'thb',
          token: b.token,
          description,
          metadata,
          returnUri: safeReturnUri(b.returnOrigin, ref),
        });
      } catch (e) {
        await client.query('ROLLBACK');
        console.error('[payments] card charge error', e.omise || e.message);
        return res.status(402).json({ error: (e.omise && e.omise.message) || 'Card payment failed' });
      }

      if (charge.status === 'failed') {
        await client.query('ROLLBACK');
        return res.status(402).json({ error: charge.failure_message || 'Card was declined' });
      }

      const confirmed = charge.status === 'successful';
      const { rows } = await client.query(
        `INSERT INTO guest_bookings
           (ref, channel, channel_name, guest_name, guest_last_name, guest_email, guest_phone,
            room, check_in, check_out, nights, adults, children, total, currency, status, lang,
            payment_provider, payment_method, payment_status, payment_charge_id)
         VALUES ($1,'direct','Direct (Website)',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'THB',$13,$14,
                 'omise','card',$15,$16)
         RETURNING *`,
        [
          ref, guestName, guestLastName, guest.email, guest.phone || null,
          room, checkIn, checkOut, nights, adults, children, total,
          confirmed ? 'confirmed' : 'pending',
          b.lang || 'en',
          confirmed ? 'paid' : 'pending',
          charge.id,
        ]
      );
      await client.query('COMMIT');
      const saved = rows[0];

      if (confirmed) {
        fireBookingEmails({ ...saved, inserted: true });
        return res.json({ status: 'paid', booking: row2js(saved) });
      }
      // 3-D Secure (or other) authorization required before the charge settles.
      return res.json({
        status: 'requires_action',
        authorizeUri: charge.authorize_uri,
        bookingId: saved.id,
      });
    }

    // method === 'promptpay'
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
