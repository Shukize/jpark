const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const router = express.Router();

// GET /api/messages
// Returns every message visible to the signed-in user (sent to them, sent by
// them, or broadcast to all). userId is taken from the bearer token, never
// from the query string, so callers can't read someone else's inbox.
router.get('/', requireAuth, async (req, res) => {
  const userId = req.user.id;
  try {
    const { rows } = await db.query(
      `SELECT * FROM messages
       WHERE to_all = TRUE OR $1 = ANY(to_ids) OR from_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// POST /api/messages
// Body: { subject, body, toAll, toIds, toNames, lang }
// from_* is derived from the bearer token.
router.post('/', requireAuth, async (req, res) => {
  const { subject, body, toAll, toIds, toNames, lang } = req.body || {};
  if (!subject || !body) return res.status(400).json({ error: 'subject and body required' });

  const fromId = req.user.id;
  if (!fromId) return res.status(401).json({ error: 'Token missing user id' });
  const fromName = req.user.name || fromId;
  const fromRole = req.user.role || 'frontdesk';

  // Normalise recipient arrays to strings so node-pg can serialise them as
  // text[] even when the caller sends mixed/empty arrays. Explicit ::text[]
  // casts are required because Postgres can't always infer the type of an
  // empty array parameter, which surfaces as "Database error" on send.
  const toIdsArr   = Array.isArray(toIds)   ? toIds.map(String)   : [];
  const toNamesArr = Array.isArray(toNames) ? toNames.map(String) : [];

  try {
    const { rows } = await db.query(
      `INSERT INTO messages (from_id, from_name, from_role, subject, body, to_all, to_ids, to_names, lang, read_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7::text[],$8::text[],$9,$10::text[])
       RETURNING *`,
      [fromId, fromName, fromRole, subject, body, !!toAll, toIdsArr, toNamesArr, lang || null, [fromId]]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[messages] insert failed:', err.message || err);
    res.status(500).json({ error: 'Database error: ' + (err.message || 'unknown') });
  }
});

// PATCH /api/messages/:id/read   marks the message as read by the caller.
router.patch('/:id/read', requireAuth, async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;
  try {
    const { rows } = await db.query(
      `UPDATE messages
       SET read_by = array_append(read_by, $1::text)
       WHERE id = $2 AND NOT ($1 = ANY(read_by))
       RETURNING *`,
      [userId, id]
    );
    // Idempotent: already-read is success, not an error.
    if (!rows.length) return res.json({ ok: true, alreadyRead: true });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// PATCH /api/messages/:id/report   flags the message as reported by the caller.
router.patch('/:id/report', requireAuth, async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;
  try {
    const { rows } = await db.query(
      `UPDATE messages
       SET reported_by = array_append(reported_by, $1::text)
       WHERE id = $2 AND NOT ($1 = ANY(reported_by))
       RETURNING *`,
      [userId, id]
    );
    if (!rows.length) return res.json({ ok: true, alreadyReported: true });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// DELETE /api/messages/:id  (admin only)
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    await db.query('DELETE FROM messages WHERE id = $1', [req.params.id]);
    res.json({ deleted: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;
