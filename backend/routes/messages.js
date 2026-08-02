const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const router = express.Router();

// The set of messages one signed-in user may read. userId comes from the bearer
// token, never from the query string, so callers can't read someone else's inbox.
const VISIBLE_TO_CALLER = '(to_all = TRUE OR $1 = ANY(to_ids) OR from_id = $1)';

// Every open staff console re-reads this list every 10 seconds, so what it
// costs must not grow with the hotel's history — an unbounded SELECT on a poll
// loop is exactly what exhausted the database's transfer allowance on
// 2026-07-13. Two bounds, in order of how much they save:
//
//   1. A version fingerprint (?v=), same pattern as guest-bookings. Internal
//      memos change a handful of times a day, so nearly every poll is a no-op
//      and now answers in a few bytes instead of re-sending every message.
//   2. LIMIT — only the newest MESSAGES_LIST_LIMIT are carried. Older ones are
//      already in the console's cache and are kept there (see _pollMessages in
//      assets/js/staff.js), so nothing disappears from anyone's inbox; this
//      caps what the POLL carries, not what exists.
const MESSAGES_LIST_LIMIT = 200;

// MAX(updated_at) moves on any insert, edit or read-stamp (trg_messages_updated_at)
// and COUNT(*) moves on delete, so the pair changes on anything this caller
// could see. Both are aggregates: the whole probe is one short row on the wire.
async function messagesVersion(userId) {
  const { rows } = await db.query(
    `SELECT COALESCE(MAX(updated_at)::text, '') AS m, COUNT(*)::int AS c
       FROM messages WHERE ${VISIBLE_TO_CALLER}`,
    [userId]
  );
  return rows[0].m + '|' + rows[0].c;
}

function listMessages(userId) {
  return db.query(
    `SELECT * FROM messages
      WHERE ${VISIBLE_TO_CALLER}
      ORDER BY created_at DESC
      LIMIT ${MESSAGES_LIST_LIMIT}`,
    [userId]
  ).then((r) => r.rows);
}

// GET /api/messages          → plain array (legacy callers, and any client
//                              running against a half-rolled-out deploy)
// GET /api/messages?v=<fp>   → { unchanged: true, v } when nothing this user can
//                              see has changed, else { v, messages, truncated }.
//                              `truncated` tells the console the window is full,
//                              so it knows to keep the older rows it already has
//                              rather than treating the page as the whole inbox.
router.get('/', requireAuth, async (req, res) => {
  const userId = req.user.id;
  try {
    if (req.query.v !== undefined) {
      const version = await messagesVersion(userId);
      if (req.query.v === version) return res.json({ unchanged: true, v: version });
      const rows = await listMessages(userId);
      return res.json({
        v: version,
        messages: rows,
        truncated: rows.length >= MESSAGES_LIST_LIMIT,
      });
    }
    res.json(await listMessages(userId));
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
    res.status(500).json({ error: 'Database error' });
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
