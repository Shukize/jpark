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
const { verifyGuest } = require('../lib/guestLookup');

const router = express.Router();

/* Orders were born with their own status words (preparing / delivered) while
   service requests used progress / done, so a single "Guest Requests" board
   couldn't drive both. Both vocabularies are accepted on the way in and
   everything leaves as the shared pending → progress → done → cancelled. */
const STATUS_IN  = { preparing: 'progress', in_progress: 'progress', delivered: 'done' };
const VALID_STATUS = ['pending', 'progress', 'done', 'cancelled'];
function normaliseStatus(s) { return STATUS_IN[s] || s || 'pending'; }

function row2js(r) {
  return {
    id: r.id,
    guestId: r.guest_id,
    guestName: r.guest_name,
    room: r.room_number,
    roomNumber: r.room_number,
    items: r.items || [],
    deliverAt: r.deliver_at,
    note: r.notes,
    total: r.total ? Number(r.total) : null,
    guestVerified: r.guest_verified === true,
    bookingRef: r.booking_ref || null,
    status: normaliseStatus(r.status),
    kind: 'order',
    category: 'dining',
    titleKey: 'staff.requests.order',
    createdAt: new Date(r.created_at).getTime(),
    updatedAt: r.updated_at ? new Date(r.updated_at).getTime() : null,
  };
}

/* GET /api/orders */
router.get('/', async (req, res) => {
  const { guestId } = req.query;
  // The staff list-all (no guestId) returns every guest's order + PII, so it
  // needs a VERIFIED token — a bare "Bearer <anything>" string is not enough.
  // The guest-scoped view stays public (a guest reads their own orders by the
  // guestId they were issued).
  if (!guestId) {
    return requireAuth(req, res, async () => {
      try {
        // Bounded for the same reason as the service-requests board it shares:
        // polled every 10s per open console. Open orders never age off.
        const { rows } = await db.query(
          `SELECT * FROM orders
            WHERE status IN ('pending', 'progress', 'in_progress', 'preparing')
               OR created_at > NOW() - INTERVAL '7 days'
            ORDER BY created_at DESC
            LIMIT 300`
        );
        res.json(rows.map(row2js));
      } catch (e) {
        console.error('[orders] list', e);
        res.status(500).json({ error: 'Database error' });
      }
    });
  }
  try {
    const { rows } = await db.query(
      'SELECT * FROM orders WHERE guest_id = $1 ORDER BY created_at DESC',
      [guestId]
    );
    res.json(rows.map(row2js));
  } catch (e) {
    console.error('[orders] list', e);
    res.status(500).json({ error: 'Database error' });
  }
});

/* POST /api/orders */
router.post('/', async (req, res) => {
  const { guestId, guestName, room, items, deliverAt, notes, total, bookingRef } = req.body || {};
  if (!guestId || !room) return res.status(400).json({ error: 'guestId and room required' });

  try {
    // Same identity check as a service request — see serviceRequests.js.
    const who = await verifyGuest(bookingRef);
    const { rows } = await db.query(
      `INSERT INTO orders (guest_id, guest_name, room_number, items, deliver_at, notes, total,
                           guest_verified, booking_ref)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [
        guestId,
        guestName || 'Guest',
        room,
        JSON.stringify(items || []),
        deliverAt || 'asap',
        notes || null,
        total != null ? total : null,
        who.verified,
        who.ref,
      ]
    );
    res.status(201).json(row2js(rows[0]));
  } catch (e) {
    console.error('[orders] create', e);
    res.status(500).json({ error: 'Database error' });
  }
});

/* PATCH /api/orders/:id
   Staff (authenticated) can move an order through any status. A guest has no
   login, so — exactly as in serviceRequests.js — they may cancel their OWN
   pending order by passing the guestId they were issued, scoped in the WHERE
   clause so it can never touch another guest's order. */
router.patch('/:id', async (req, res) => {
  const { status, guestId } = req.body || {};
  const next = normaliseStatus(status);
  if (!status || !VALID_STATUS.includes(next))
    return res.status(400).json({ error: `status must be one of: ${VALID_STATUS.join(', ')}` });

  if (next === 'cancelled' && guestId) {
    try {
      const { rows } = await db.query(
        `UPDATE orders SET status = 'cancelled'
          WHERE id = $1 AND guest_id = $2 AND status = 'pending'
          RETURNING *`,
        [req.params.id, guestId]
      );
      if (!rows.length) return res.status(404).json({ error: 'Order not found' });
      return res.json(row2js(rows[0]));
    } catch (e) {
      console.error('[orders] guest cancel', e);
      return res.status(500).json({ error: 'Database error' });
    }
  }

  return requireAuth(req, res, async () => {
    try {
      const { rows } = await db.query(
        'UPDATE orders SET status = $1 WHERE id = $2 RETURNING *',
        [next, req.params.id]
      );
      if (!rows.length) return res.status(404).json({ error: 'Order not found' });
      res.json(row2js(rows[0]));
    } catch (e) {
      console.error('[orders] patch', e);
      res.status(500).json({ error: 'Database error' });
    }
  });
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
