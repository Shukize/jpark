const express = require('express');
const db = require('../db');
const router = express.Router();

// GET /api/messages?userId=<id>
// Returns all messages visible to the given user (sent to them or to all)
router.get('/', async (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: 'userId required' });

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
// Body: { fromId, fromName, fromRole, subject, body, toAll, toIds, toNames, lang }
router.post('/', async (req, res) => {
  const { fromId, fromName, fromRole, subject, body, toAll, toIds, toNames, lang } = req.body;
  if (!fromId || !subject || !body) return res.status(400).json({ error: 'fromId, subject and body required' });

  try {
    const { rows } = await db.query(
      `INSERT INTO messages (from_id, from_name, from_role, subject, body, to_all, to_ids, to_names, lang)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [fromId, fromName, fromRole, subject, body, !!toAll, toIds || [], toNames || [], lang || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// PATCH /api/messages/:id/read
// Body: { userId }  — marks the message as read by this user
router.patch('/:id/read', async (req, res) => {
  const { userId } = req.body;
  const { id } = req.params;
  if (!userId) return res.status(400).json({ error: 'userId required' });

  try {
    const { rows } = await db.query(
      `UPDATE messages
       SET read_by = array_append(read_by, $1)
       WHERE id = $2 AND NOT ($1 = ANY(read_by))
       RETURNING *`,
      [userId, id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Message not found or already read' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// DELETE /api/messages/:id  (admin only — caller must enforce role)
router.delete('/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM messages WHERE id = $1', [req.params.id]);
    res.json({ deleted: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;
