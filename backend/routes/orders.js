/* ============================================================
   J Park Hotel — in-room dining orders
   GET  /api/orders               all orders (staff)
   GET  /api/orders?guestId=X     guest's own orders
   POST /api/orders               place an order
   PATCH /api/orders/:id          update status (staff)
   DELETE /api/orders/:id         delete (admin)
   ============================================================ */
const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

function row2js(r) {
  return {
    id: r.id,
    guestId: r.guest_id,
    guestName: r.guest_name,
    room: r.room_number,
    items: r.items || [],
    deliverAt: r.deliver_at,
    note: r.notes,
    total: r.total ? Number(r.total) : null,
    status: r.status,
    kind: 'order',
    category: 'dining',
    titleKey: 'staff.requests.order',
    createdAt: new Date(r.created_at).getTime(),
    updatedAt: r.updated_at ? new Date(r.updated_at).getTime() : null,
  };
}

/* GET /api/orders */
router.get('/', async (req, res) => {
  try {
    const { guestId } = req.query;
    let rows;
    if (guestId) {
      ({ rows } = await db.query(
        'SELECT * FROM orders WHERE guest_id = $1 ORDER BY created_at DESC',
        [guestId]
      ));
    } else {
      // Staff must be authenticated to see all orders
      const authHeader = req.get('authorization') || '';
      if (!authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Auth required' });
      ({ rows } = await db.query('SELECT * FROM orders ORDER BY created_at DESC'));
    }
    res.json(rows.map(row2js));
  } catch (e) {
    console.error('[orders] list', e);
    res.status(500).json({ error: 'Database error' });
  }
});

/* POST /api/orders */
router.post('/', async (req, res) => {
  const { guestId, guestName, room, items, deliverAt, notes, total } = req.body || {};
  if (!guestId || !room) return res.status(400).json({ error: 'guestId and room required' });

  try {
    const { rows } = await db.query(
      `INSERT INTO orders (guest_id, guest_name, room_number, items, deliver_at, notes, total)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [
        guestId,
        guestName || 'Guest',
        room,
        JSON.stringify(items || []),
        deliverAt || 'asap',
        notes || null,
        total != null ? total : null,
      ]
    );
    res.status(201).json(row2js(rows[0]));
  } catch (e) {
    console.error('[orders] create', e);
    res.status(500).json({ error: 'Database error' });
  }
});

/* PATCH /api/orders/:id */
router.patch('/:id', requireAuth, async (req, res) => {
  const { status } = req.body || {};
  const VALID = ['pending', 'preparing', 'delivered', 'cancelled'];
  if (!status || !VALID.includes(status))
    return res.status(400).json({ error: `status must be one of: ${VALID.join(', ')}` });

  try {
    const { rows } = await db.query(
      'UPDATE orders SET status = $1 WHERE id = $2 RETURNING *',
      [status, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Order not found' });
    res.json(row2js(rows[0]));
  } catch (e) {
    console.error('[orders] patch', e);
    res.status(500).json({ error: 'Database error' });
  }
});

/* DELETE /api/orders/:id (admin) */
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    await db.query('DELETE FROM orders WHERE id = $1', [req.params.id]);
    res.json({ deleted: true });
  } catch (e) {
    console.error('[orders] delete', e);
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;
