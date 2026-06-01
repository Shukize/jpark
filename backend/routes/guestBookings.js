/* ============================================================
   J Park Hotel — guest bookings routes
   GET    /api/guest-bookings          list all (auth)
   GET    /api/guest-bookings/:id      single booking (auth)
   POST   /api/guest-bookings          ingest / create booking
   PATCH  /api/guest-bookings/:id      update status / mark read
   DELETE /api/guest-bookings/:id      delete (admin)
   ============================================================ */
const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { sendEmail } = require('../mailer');

const router = express.Router();

// Build a plain confirmation email from a booking row. Kept simple and English;
// the staff console can still send a localised follow-up via POST /api/email.
function confirmationEmail(bk) {
  const money = bk.total != null ? `${bk.total} ${bk.currency || 'THB'}` : '—';
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
    `</table>` +
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

/* POST /api/guest-bookings — ingest from OTA bridge or staff manual entry */
router.post('/', async (req, res) => {
  const b = req.body || {};
  const channel = normChannel(b.channel || b.source || 'direct');
  const ref = b.ref || b.bookingId || b.confirmationCode
    || ('GB-' + Date.now().toString(36).toUpperCase());
  const nights = b.nights || computeNights(b.checkIn || b.check_in, b.checkOut || b.check_out);

  try {
    const { rows } = await db.query(
      `INSERT INTO guest_bookings
         (ref, channel, channel_name, channel_email, guest_name, guest_last_name,
          guest_email, guest_phone, room, check_in, check_out, nights, adults,
          children, total, currency, status, lang, confirmation)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
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
        b.checkIn || b.check_in,
        b.checkOut || b.check_out,
        nights,
        b.adults != null ? b.adults : 1,
        b.children != null ? b.children : 0,
        b.total != null ? b.total : null,
        b.currency || 'THB',
        b.status || 'confirmed',
        b.lang || 'en',
        b.confirmation || b.body || null,
      ]
    );
    const saved = rows[0];
    res.status(201).json(row2js(saved));

    // Fire-and-forget confirmation email — only for a genuinely new, confirmed
    // booking that has a guest email. Never blocks or fails the API response;
    // webhook retries (ON CONFLICT updates) won't re-send because inserted=false.
    if (saved.inserted && saved.guest_email && saved.status === 'confirmed') {
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
  } catch (e) {
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
