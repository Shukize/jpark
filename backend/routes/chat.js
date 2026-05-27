/* ============================================================
   J Park Hotel — live chat routes
   GET  /api/chat?guestId=X     get conversation (guest or staff)
   GET  /api/chat/all           all conversations summary (staff)
   POST /api/chat               post a message
   PATCH /api/chat/:guestId/read  mark staff messages read (guest)
   ============================================================ */
const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function row2msg(r) {
  return {
    id: r.id,
    from: r.from_role,
    fromName: r.from_name,
    text: r.body,
    lang: r.lang,
    escalated: r.escalated,
    ts: new Date(r.created_at).getTime(),
  };
}

/* GET /api/chat/all — all conversations grouped by guest (staff only) */
router.get('/all', requireAuth, async (_req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT DISTINCT ON (guest_id)
        guest_id, guest_name, room,
        body AS last_msg,
        lang,
        escalated,
        created_at AS last_at,
        (SELECT COUNT(*) FROM chat_messages cm2
          WHERE cm2.guest_id = cm.guest_id
            AND cm2.from_role = 'guest'
            AND cm2.created_at > COALESCE(
              (SELECT created_at FROM chat_messages
                WHERE guest_id = cm.guest_id AND from_role IN ('staff','system')
                ORDER BY created_at DESC LIMIT 1),
              '1970-01-01'
            )
        ) AS unread_for_staff
      FROM chat_messages cm
      ORDER BY guest_id, created_at DESC
    `);

    const convos = rows.map((r) => ({
      id: r.guest_id,
      guestName: r.guest_name,
      room: r.room,
      lastMsg: r.last_msg,
      lang: r.lang,
      escalated: r.escalated,
      lastAt: new Date(r.last_at).getTime(),
      unreadForStaff: Number(r.unread_for_staff),
    }));
    res.json(convos);
  } catch (e) {
    console.error('[chat] all', e);
    res.status(500).json({ error: 'Database error' });
  }
});

/* GET /api/chat?guestId=X — full conversation for one guest */
router.get('/', async (req, res) => {
  const { guestId } = req.query;
  if (!guestId) return res.status(400).json({ error: 'guestId required' });
  try {
    const { rows } = await db.query(
      `SELECT * FROM chat_messages WHERE guest_id = $1 ORDER BY created_at ASC`,
      [guestId]
    );
    const messages = rows.map(row2msg);
    const last = rows[rows.length - 1];
    const escalated = rows.some((r) => r.escalated);
    const unreadForGuest = rows.filter(
      (r) => r.from_role !== 'guest' && r.from_role !== 'bot'
    ).length;

    res.json({
      id: guestId,
      guestName: last ? last.guest_name : null,
      room: last ? last.room : null,
      lang: last ? last.lang : 'en',
      escalated,
      unreadForGuest,
      lastMsg: last ? last.body : '',
      lastAt: last ? new Date(last.created_at).getTime() : null,
      messages,
    });
  } catch (e) {
    console.error('[chat] get', e);
    res.status(500).json({ error: 'Database error' });
  }
});

/* POST /api/chat — post a message */
router.post('/', async (req, res) => {
  const { guestId, guestName, room, from, fromName, text, lang, escalated } = req.body || {};
  if (!guestId || !text) return res.status(400).json({ error: 'guestId and text required' });

  try {
    const { rows } = await db.query(
      `INSERT INTO chat_messages
         (guest_id, guest_name, room, from_role, from_name, body, lang, escalated)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [
        guestId,
        guestName || null,
        room || null,
        from || 'guest',
        fromName || null,
        text,
        lang || 'en',
        !!escalated,
      ]
    );
    res.status(201).json(row2msg(rows[0]));
  } catch (e) {
    console.error('[chat] post', e);
    res.status(500).json({ error: 'Database error' });
  }
});

/* PATCH /api/chat/:guestId/read — guest marks staff replies as read */
router.patch('/:guestId/read', async (req, res) => {
  // We track read state per-conversation in the client;
  // this endpoint exists so the badge resets on the guest side.
  res.json({ ok: true });
});

module.exports = router;
