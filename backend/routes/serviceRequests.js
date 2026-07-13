const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const router = express.Router();

// GET /api/service-requests?guestId=<id>  (guest view — own requests only)
// GET /api/service-requests                (staff/admin — returns ALL; requires auth)
router.get('/', async (req, res) => {
  const { guestId } = req.query;
  // The list-all view (no guestId) exposes every guest's name/room/requests, so
  // it must be authenticated staff. The guest-scoped view stays public — a guest
  // has no login and reads their own thread by the guestId they were issued.
  if (!guestId) {
    return requireAuth(req, res, async () => {
      try {
        const { rows } = await db.query('SELECT * FROM service_requests ORDER BY created_at DESC');
        res.json(rows);
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
      }
    });
  }
  try {
    const { rows } = await db.query(
      'SELECT * FROM service_requests WHERE guest_id = $1 ORDER BY created_at DESC',
      [guestId]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// POST /api/service-requests
// Body: { guestId, guestName, roomNumber, type, items, notes }
router.post('/', async (req, res) => {
  const { guestId, guestName, roomNumber, type, items, notes } = req.body;
  if (!guestId || !roomNumber || !type) {
    return res.status(400).json({ error: 'guestId, roomNumber and type are required' });
  }

  try {
    const { rows } = await db.query(
      `INSERT INTO service_requests (guest_id, guest_name, room_number, type, items, notes)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING *`,
      [guestId, guestName || '', roomNumber, type, JSON.stringify(items || []), notes || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// PATCH /api/service-requests/:id
// Body: { status, notes }  — staff updates a request (auth required)
router.patch('/:id', requireAuth, async (req, res) => {
  const { status, notes } = req.body;
  const allowed = ['pending', 'in_progress', 'done', 'cancelled'];
  if (status && !allowed.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${allowed.join(', ')}` });
  }

  try {
    const { rows } = await db.query(
      `UPDATE service_requests
       SET status = COALESCE($1, status),
           notes  = COALESCE($2, notes)
       WHERE id = $3
       RETURNING *`,
      [status || null, notes || null, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Request not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// DELETE /api/service-requests/:id  (admin only)
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    await db.query('DELETE FROM service_requests WHERE id = $1', [req.params.id]);
    res.json({ deleted: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;
