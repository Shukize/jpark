/* ============================================================
   J Park Hotel — guest bookings routes
   GET    /api/guest-bookings          list all (auth)
   GET    /api/guest-bookings/:id      single booking (auth)
   POST   /api/guest-bookings          ingest / create booking
   PATCH  /api/guest-bookings/:id      update status / mark read
   DELETE /api/guest-bookings/:id      delete (admin)
   ============================================================ */
const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { sendEmail } = require('../mailer');

const router = express.Router();

// Optional shared-secret gate for the public ingest endpoint (POST below).
// A channel manager / OTA bridge authenticates server-to-server with
//   X-API-Key: <OTA_WEBHOOK_SECRET>
// When OTA_WEBHOOK_SECRET is unset the endpoint stays open (local dev / the
// demo browser ingest). When it IS set, an inbound POST must present the
// matching key — this stops anyone from spamming fake reservations (and the
// hotel/guest emails each one triggers) at the live property. Uses the same
// secret as /api/v1/ota-sync so the channel manager only needs one key.
function ingestKeyOk(provided) {
  const expected = process.env.OTA_WEBHOOK_SECRET || '';
  if (!expected) return true;            // no secret configured → endpoint open
  if (!provided) return false;
  const a = Buffer.from(String(provided));
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// Where new-booking notifications land. This is the hotel's own inbox (the same
// address the OTAs send their confirmations to), so the front desk gets a copy of
// every reservation that flows through the Guest Booking system. Override with the
// HOTEL_NOTIFY_EMAIL env var; comma-separated values are allowed for multiple staff.
function hotelRecipients() {
  return (process.env.HOTEL_NOTIFY_EMAIL || 'jparkhotel1@gmail.com')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

// Build a hotel-facing "new booking" notice from a booking row. Sent to the front
// desk inbox so staff see every OTA / direct reservation as it arrives, mirroring
// the Guest Booking entry in the staff console.
function paymentLabel(bk) {
  if (!bk.payment_status || bk.payment_status === 'n/a') return null;
  const method = bk.payment_method === 'promptpay' ? 'PromptPay' : bk.payment_method === 'card' ? 'Card' : bk.payment_provider || 'Online';
  const statusWord = bk.payment_status === 'paid' ? 'Paid'
    : bk.payment_status === 'pending' ? 'Awaiting payment'
    : bk.payment_status === 'failed' ? 'Failed'
    : bk.payment_status;
  return `${method} — ${statusWord}`;
}

function hotelNotice(bk) {
  const money = bk.total != null ? `${bk.total} ${bk.currency || 'THB'}` : '—';
  const guests = `${bk.adults} adult(s), ${bk.children} child(ren)`;
  const via = bk.channel_name || bk.channel || 'Direct';
  const payment = paymentLabel(bk);
  const lines = [
    `New booking via ${via}.`,
    '',
    `Confirmation: ${bk.ref}`,
    `Guest: ${bk.guest_name || '—'}`,
    `Guest email: ${bk.guest_email || '—'}`,
    `Guest phone: ${bk.guest_phone || '—'}`,
    `Room: ${bk.room || '—'}`,
    `Check-in: ${bk.check_in}`,
    `Check-out: ${bk.check_out}`,
    `Nights: ${bk.nights}`,
    `Guests: ${guests}`,
    `Total: ${money}`,
    ...(payment ? [`Payment: ${payment}`] : []),
    '',
    'This reservation is now in the Guest Booking inbox of the staff console.',
  ];
  const text = lines.join('\n');
  const html =
    `<div style="font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;line-height:1.5">` +
    `<h2 style="color:#0f766e;margin:0 0 12px">New booking via ${via}</h2>` +
    `<table style="border-collapse:collapse;margin:16px 0">` +
    `<tr><td style="padding:4px 12px 4px 0;color:#555">Confirmation</td><td style="padding:4px 0"><strong>${bk.ref}</strong></td></tr>` +
    `<tr><td style="padding:4px 12px 4px 0;color:#555">Guest</td><td style="padding:4px 0">${bk.guest_name || '—'}</td></tr>` +
    `<tr><td style="padding:4px 12px 4px 0;color:#555">Guest email</td><td style="padding:4px 0">${bk.guest_email || '—'}</td></tr>` +
    `<tr><td style="padding:4px 12px 4px 0;color:#555">Guest phone</td><td style="padding:4px 0">${bk.guest_phone || '—'}</td></tr>` +
    `<tr><td style="padding:4px 12px 4px 0;color:#555">Room</td><td style="padding:4px 0">${bk.room || '—'}</td></tr>` +
    `<tr><td style="padding:4px 12px 4px 0;color:#555">Check-in</td><td style="padding:4px 0">${bk.check_in}</td></tr>` +
    `<tr><td style="padding:4px 12px 4px 0;color:#555">Check-out</td><td style="padding:4px 0">${bk.check_out}</td></tr>` +
    `<tr><td style="padding:4px 12px 4px 0;color:#555">Nights</td><td style="padding:4px 0">${bk.nights}</td></tr>` +
    `<tr><td style="padding:4px 12px 4px 0;color:#555">Guests</td><td style="padding:4px 0">${guests}</td></tr>` +
    `<tr><td style="padding:4px 12px 4px 0;color:#555">Total</td><td style="padding:4px 0">${money}</td></tr>` +
    (payment ? `<tr><td style="padding:4px 12px 4px 0;color:#555">Payment</td><td style="padding:4px 0">${payment}</td></tr>` : '') +
    `</table>` +
    `<p style="color:#555">This reservation is now in the <strong>Guest Booking</strong> inbox of the staff console.</p>` +
    `</div>`;
  return { text, html };
}

// Build a plain confirmation email from a booking row. Kept simple and English;
// the staff console can still send a localised follow-up via POST /api/email.
const DEPOSIT_NOTE_TEXT =
  'Please note: a 200 THB deposit for your room key card is collected in cash at check-in (cash only) and refunded in full at check-out.';
const DEPOSIT_NOTE_HTML =
  '<p style="background:#fbf3df;border:1px solid #e0c178;border-radius:8px;padding:10px 14px;color:#5a4a1a">' +
  '<strong>Please note:</strong> a 200 THB deposit for your room key card is collected in <strong>cash only</strong> at check-in, and refunded in full at check-out.' +
  '</p>';

function confirmationEmail(bk) {
  const money = bk.total != null ? `${bk.total} ${bk.currency || 'THB'}` : '—';
  const payment = paymentLabel(bk);
  const lines = [
    `Dear ${bk.guest_name || 'Guest'},`,
    '',
    'Thank you for choosing J Park Hotel, Chonburi. Your reservation is confirmed.',
    '',
    `Confirmation: ${bk.ref}`,
    `Room: ${bk.room || '—'}`,
    `Check-in: ${bk.check_in}`,
    `Check-out: ${bk.check_out}`,
    `Nights: ${bk.nights}`,
    `Guests: ${bk.adults} adult(s), ${bk.children} child(ren)`,
    `Total: ${money}`,
    ...(payment ? [`Payment: ${payment}`] : []),
    '',
    DEPOSIT_NOTE_TEXT,
    '',
    'We look forward to welcoming you. Reply to this email if you need anything before arrival.',
    '',
    'J Park Hotel, Chonburi',
  ];
  const text = lines.join('\n');
  const html =
    `<div style="font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;line-height:1.5">` +
    `<h2 style="color:#0f766e;margin:0 0 12px">Your reservation is confirmed</h2>` +
    `<p>Dear ${bk.guest_name || 'Guest'},</p>` +
    `<p>Thank you for choosing <strong>J Park Hotel, Chonburi</strong>. Your reservation is confirmed.</p>` +
    `<table style="border-collapse:collapse;margin:16px 0">` +
    `<tr><td style="padding:4px 12px 4px 0;color:#555">Confirmation</td><td style="padding:4px 0"><strong>${bk.ref}</strong></td></tr>` +
    `<tr><td style="padding:4px 12px 4px 0;color:#555">Room</td><td style="padding:4px 0">${bk.room || '—'}</td></tr>` +
    `<tr><td style="padding:4px 12px 4px 0;color:#555">Check-in</td><td style="padding:4px 0">${bk.check_in}</td></tr>` +
    `<tr><td style="padding:4px 12px 4px 0;color:#555">Check-out</td><td style="padding:4px 0">${bk.check_out}</td></tr>` +
    `<tr><td style="padding:4px 12px 4px 0;color:#555">Nights</td><td style="padding:4px 0">${bk.nights}</td></tr>` +
    `<tr><td style="padding:4px 12px 4px 0;color:#555">Guests</td><td style="padding:4px 0">${bk.adults} adult(s), ${bk.children} child(ren)</td></tr>` +
    `<tr><td style="padding:4px 12px 4px 0;color:#555">Total</td><td style="padding:4px 0">${money}</td></tr>` +
    (payment ? `<tr><td style="padding:4px 12px 4px 0;color:#555">Payment</td><td style="padding:4px 0">${payment}</td></tr>` : '') +
    `</table>` +
    DEPOSIT_NOTE_HTML +
    `<p>We look forward to welcoming you. Just reply to this email if you need anything before arrival.</p>` +
    `<p style="color:#0f766e;font-weight:bold;margin-top:24px">J Park Hotel, Chonburi</p>` +
    `</div>`;
  return { text, html };
}

function row2js(r) {
  return {
    id: r.id,
    ref: r.ref,
    channel: r.channel,
    channelName: r.channel_name,
    channelEmail: r.channel_email,
    guestName: r.guest_name,
    lastName: r.guest_last_name,
    guestEmail: r.guest_email,
    guestPhone: r.guest_phone,
    room: r.room,
    checkIn: r.check_in,
    checkOut: r.check_out,
    nights: r.nights,
    adults: r.adults,
    children: r.children,
    total: r.total ? Number(r.total) : null,
    currency: r.currency,
    status: r.status,
    lang: r.lang,
    confirmation: r.confirmation,
    paymentProvider: r.payment_provider,
    paymentMethod: r.payment_method,
    paymentStatus: r.payment_status,
    paymentChargeId: r.payment_charge_id,
    readBy: r.read_by || [],
    createdAt: new Date(r.created_at).getTime(),
    updatedAt: r.updated_at ? new Date(r.updated_at).getTime() : null,
  };
}

/* GET /api/guest-bookings */
router.get('/', requireAuth, async (_req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM guest_bookings ORDER BY created_at DESC'
    );
    res.json(rows.map(row2js));
  } catch (e) {
    console.error('[guest-bookings] list', e);
    res.status(500).json({ error: 'Database error' });
  }
});

/* GET /api/guest-bookings/:id */
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM guest_bookings WHERE id = $1', [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(row2js(rows[0]));
  } catch (e) {
    console.error('[guest-bookings] get', e);
    res.status(500).json({ error: 'Database error' });
  }
});

/* Fire the hotel notice + guest confirmation for a freshly-inserted booking.
   Fire-and-forget: never awaited, never throws into the request path. Only runs
   for a genuinely new, confirmed booking so webhook / re-forward retries
   (ON CONFLICT updates, inserted=false) don't re-send. */
function fireBookingEmails(saved) {
  if (!saved || !saved.inserted || saved.status !== 'confirmed') return;

  // 1) Notify the hotel front desk (jparkhotel1@gmail.com) for EVERY booking,
  //    even when the OTA didn't pass a guest email. Mirrors the Guest Booking
  //    entry that staff also see in the console.
  const to = hotelRecipients();
  if (to.length) {
    const { text, html } = hotelNotice(saved);
    sendEmail({
      to,
      subject: `New booking — ${saved.channel_name || saved.channel || 'Direct'} (${saved.ref})`,
      text,
      html,
      replyTo: saved.guest_email || undefined,
    }).then((r) => {
      if (r.ok) console.log(`[guest-bookings] hotel notified at ${to.join(', ')} (${saved.ref})`);
      else if (!r.skipped) console.warn(`[guest-bookings] hotel notice failed (${saved.ref}): ${r.error}`);
    }).catch((err) => console.error('[guest-bookings] hotel notice error', err));
  }

  // 2) Send the guest their confirmation, when the booking carries a guest email.
  if (saved.guest_email) {
    const { text, html } = confirmationEmail(saved);
    sendEmail({
      to: saved.guest_email,
      subject: `J Park Hotel — booking confirmed (${saved.ref})`,
      text,
      html,
    }).then((r) => {
      if (r.ok) console.log(`[guest-bookings] confirmation emailed to ${saved.guest_email} (${saved.ref})`);
      else if (!r.skipped) console.warn(`[guest-bookings] confirmation email failed (${saved.ref}): ${r.error}`);
    }).catch((err) => console.error('[guest-bookings] email error', err));
  }
}

/* Core ingest: upsert one booking (de-duped on `ref`) and fire its emails.
   Shared by the POST route below and the OTA email-forwarding bridge
   (routes/otaEmail.js) so both intake paths behave identically. Accepts both
   camelCase and snake_case field names. Returns the saved row (with an
   `inserted` flag). Throws on DB error. */
async function ingestGuestBooking(b) {
  b = b || {};
  const channel = normChannel(b.channel || b.source || 'direct');
  const ref = b.ref || b.bookingId || b.confirmationCode
    || ('GB-' + Date.now().toString(36).toUpperCase());
  const checkIn = b.checkIn || b.check_in;
  const checkOut = b.checkOut || b.check_out;
  if (!checkIn || !checkOut) {
    throw new Error('check_in and check_out are required');
  }
  const nights = b.nights || computeNights(checkIn, checkOut);

  const { rows } = await db.query(
    `INSERT INTO guest_bookings
       (ref, channel, channel_name, channel_email, guest_name, guest_last_name,
        guest_email, guest_phone, room, check_in, check_out, nights, adults,
        children, total, currency, status, lang, confirmation,
        payment_provider, payment_method, payment_status, payment_charge_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
     ON CONFLICT (ref) DO UPDATE SET
       status = EXCLUDED.status,
       updated_at = NOW()
     RETURNING *, (xmax = 0) AS inserted`,
    [
      ref,
      channel,
      b.channelName || b.channel_name || channel,
      b.channelEmail || b.channel_email || null,
      b.guestName || b.guest_name || 'Guest',
      (b.guestName || b.guest_name || '').split(' ').pop().toLowerCase() || null,
      b.guestEmail || b.guest_email || null,
      b.guestPhone || b.guest_phone || null,
      b.room || b.roomType || b.room_type || null,
      checkIn,
      checkOut,
      nights,
      b.adults != null ? b.adults : 1,
      b.children != null ? b.children : 0,
      b.total != null ? b.total : null,
      b.currency || 'THB',
      b.status || 'confirmed',
      b.lang || 'en',
      b.confirmation || b.body || null,
      b.paymentProvider || b.payment_provider || null,
      b.paymentMethod || b.payment_method || null,
      b.paymentStatus || b.payment_status || 'n/a',
      b.paymentChargeId || b.payment_charge_id || null,
    ]
  );
  const saved = rows[0];
  fireBookingEmails(saved);
  return saved;
}

/* POST /api/guest-bookings — ingest from OTA bridge / channel manager.
   Protected by an optional X-API-Key (see ingestKeyOk): open when
   OTA_WEBHOOK_SECRET is unset, key-gated once it is. */
router.post('/', async (req, res) => {
  if (!ingestKeyOk(req.get('x-api-key'))) {
    return res.status(401).json({ error: 'Invalid or missing API key' });
  }
  try {
    const saved = await ingestGuestBooking(req.body || {});
    res.status(201).json(row2js(saved));
  } catch (e) {
    if (/check_in and check_out/.test(e.message)) {
      return res.status(400).json({ error: e.message });
    }
    console.error('[guest-bookings] create', e);
    res.status(500).json({ error: 'Database error' });
  }
});

/* PATCH /api/guest-bookings/:id */
router.patch('/:id', async (req, res) => {
  const { status, readBy, userId } = req.body || {};
  try {
    if (userId) {
      // mark read for this user
      await db.query(
        `UPDATE guest_bookings
            SET read_by = array_append(read_by, $1)
          WHERE id = $2 AND NOT ($1 = ANY(read_by))`,
        [userId, req.params.id]
      );
    }
    if (status) {
      await db.query(
        'UPDATE guest_bookings SET status = $1 WHERE id = $2',
        [status, req.params.id]
      );
    }
    const { rows } = await db.query('SELECT * FROM guest_bookings WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(row2js(rows[0]));
  } catch (e) {
    console.error('[guest-bookings] patch', e);
    res.status(500).json({ error: 'Database error' });
  }
});

/* DELETE /api/guest-bookings/:id (admin) */
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    await db.query('DELETE FROM guest_bookings WHERE id = $1', [req.params.id]);
    res.json({ deleted: true });
  } catch (e) {
    console.error('[guest-bookings] delete', e);
    res.status(500).json({ error: 'Database error' });
  }
});

function normChannel(raw) {
  const k = String(raw || '').toLowerCase();
  if (k.includes('agoda'))   return 'agoda';
  if (k.includes('booking')) return 'booking';
  if (k.includes('airbnb'))  return 'airbnb';
  if (k.includes('trip'))    return 'trip';
  if (k.includes('expedia')) return 'expedia';
  return 'direct';
}

function computeNights(ci, co) {
  if (!ci || !co) return 1;
  const n = Math.round((new Date(co) - new Date(ci)) / 86400000);
  return n > 0 ? n : 1;
}

module.exports = router;
// Shared with routes/otaEmail.js (the email-forwarding bridge) and
// routes/payments.js (the online booking + card/PromptPay flow), so every
// intake path renders identically in the staff console and sends the same
// hotel-notice / guest-confirmation emails (including the deposit note).
module.exports.ingestGuestBooking = ingestGuestBooking;
module.exports.row2js = row2js;
module.exports.fireBookingEmails = fireBookingEmails;
module.exports.hotelNotice = hotelNotice;
module.exports.confirmationEmail = confirmationEmail;
module.exports.computeNights = computeNights;
