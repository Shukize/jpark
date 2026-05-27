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

const router = express.Router();

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
       RETURNING *`,
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
    res.status(201).json(row2js(rows[0]));
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
