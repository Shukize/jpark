/* ============================================================
   J Park Hotel — guest service requests
   GET    /api/service-requests             all requests (staff, auth)
   GET    /api/service-requests?guestId=X   the guest's own requests
   POST   /api/service-requests             guest files a request
   PATCH  /api/service-requests/:id         status/note update
   DELETE /api/service-requests/:id         delete (admin)

   The columns written here MUST track schema.sql. They drifted once —
   the route still wrote a "notes" column that had been renamed to
   "note", and dropped kind/title/lang entirely — so every single guest
   request 500'd and the front desk's Guest Requests panel sat empty for
   weeks while guests were told "Request sent!". Hence row2js() and the
   explicit column list below: one place to keep in sync, and errors are
   logged with the payload instead of dying anonymously.
   ============================================================ */
const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { verifyGuest } = require('../lib/guestLookup');
const router = express.Router();

/* The guest portal and the staff console both speak camelCase and the
   three-step vocabulary pending → progress → done. */
function row2js(r) {
  return {
    id: r.id,
    guestId: r.guest_id,
    guestName: r.guest_name,
    room: r.room_number,
    roomNumber: r.room_number,
    type: r.type,
    category: r.type,
    kind: r.kind || 'service',
    titleKey: r.title_key,
    title: r.title,
    items: r.items || [],
    deliverAt: r.deliver_at,
    total: r.total != null ? Number(r.total) : null,
    note: r.note,
    lang: r.lang || 'en',
    guestVerified: r.guest_verified === true,
    bookingRef: r.booking_ref || null,
    status: normaliseStatus(r.status),
    createdAt: new Date(r.created_at).getTime(),
    updatedAt: r.updated_at ? new Date(r.updated_at).getTime() : null,
  };
}

// "in_progress" is the older spelling and still arrives from consoles that
// haven't reloaded since the fix; both mean the same step.
function normaliseStatus(s) {
  return s === 'in_progress' ? 'progress' : (s || 'pending');
}

const VALID_STATUS = ['pending', 'progress', 'done', 'cancelled'];

/* GET / */
router.get('/', async (req, res) => {
  const { guestId } = req.query;
  // The list-all view (no guestId) exposes every guest's name/room/requests, so
  // it must be authenticated staff. The guest-scoped view stays public — a guest
  // has no login and reads their own thread by the guestId they were issued.
  if (!guestId) {
    return requireAuth(req, res, async () => {
      try {
        // The console polls this every 10s, so it must not grow without bound
        // — an unbounded SELECT on a poll loop is what exhausted the Neon
        // transfer cap on 2026-07-13. Anything still open is always returned
        // no matter how old it is; finished work ages off the live board.
        const { rows } = await db.query(
          `SELECT * FROM service_requests
            WHERE status IN ('pending', 'progress', 'in_progress')
               OR created_at > NOW() - INTERVAL '7 days'
            ORDER BY created_at DESC
            LIMIT 300`
        );
        res.json(rows.map(row2js));
      } catch (err) {
        console.error('[service-requests] list', err);
        res.status(500).json({ error: 'Database error' });
      }
    });
  }
  try {
    const { rows } = await db.query(
      'SELECT * FROM service_requests WHERE guest_id = $1 ORDER BY created_at DESC',
      [guestId]
    );
    res.json(rows.map(row2js));
  } catch (err) {
    console.error('[service-requests] guest list', err);
    res.status(500).json({ error: 'Database error' });
  }
});

/* POST /
   Body: { guestId, guestName, roomNumber|room, type, kind, titleKey, title,
           items, deliverAt, total, note|notes, lang } */
router.post('/', async (req, res) => {
  const b = req.body || {};
  const roomNumber = b.roomNumber || b.room;
  const type = b.type || b.category;
  if (!b.guestId || !roomNumber || !type) {
    return res.status(400).json({ error: 'guestId, roomNumber and type are required' });
  }

  try {
    const who = await verifyGuest(b.bookingRef);
    const { rows } = await db.query(
      `INSERT INTO service_requests
         (guest_id, guest_name, room_number, type, kind, title_key, title,
          items, deliver_at, total, note, lang, guest_verified, booking_ref)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      [
        b.guestId,
        b.guestName || 'Guest',
        String(roomNumber).slice(0, 10),
        type,
        b.kind || 'service',
        b.titleKey || null,
        b.title || null,
        JSON.stringify(b.items || []),
        b.deliverAt || null,
        b.total != null ? b.total : null,
        b.note || b.notes || null,
        b.lang || 'en',
        who.verified,
        who.ref,
      ]
    );
    res.status(201).json(row2js(rows[0]));
  } catch (err) {
    // Log the payload too: a silent 500 here is invisible to the guest (they
    // just never get their towels) and invisible to the front desk.
    console.error('[service-requests] create failed', err, JSON.stringify(b));
    res.status(500).json({ error: 'Database error' });
  }
});

/* PATCH /:id
   Staff (authenticated) can move a request through any status. A guest has no
   login, so they may cancel their OWN pending request by passing the guestId
   they were issued — scoped in the WHERE clause, so it can't touch anyone
   else's. Everything else still requires a staff token. */
router.patch('/:id', async (req, res) => {
  const { status, note, notes, guestId } = req.body || {};
  const next = status ? normaliseStatus(status) : null;
  if (next && !VALID_STATUS.includes(next)) {
    return res.status(400).json({ error: `status must be one of: ${VALID_STATUS.join(', ')}` });
  }

  const guestCancel = next === 'cancelled' && guestId && note == null && notes == null;
  if (guestCancel) {
    try {
      const { rows } = await db.query(
        `UPDATE service_requests
            SET status = 'cancelled'
          WHERE id = $1 AND guest_id = $2 AND status = 'pending'
          RETURNING *`,
        [req.params.id, guestId]
      );
      if (!rows.length) return res.status(404).json({ error: 'Request not found' });
      return res.json(row2js(rows[0]));
    } catch (err) {
      console.error('[service-requests] guest cancel', err);
      return res.status(500).json({ error: 'Database error' });
    }
  }

  return requireAuth(req, res, async () => {
    try {
      const { rows } = await db.query(
        `UPDATE service_requests
            SET status = COALESCE($1, status),
                note   = COALESCE($2, note)
          WHERE id = $3
          RETURNING *`,
        [next, note || notes || null, req.params.id]
      );
      if (!rows.length) return res.status(404).json({ error: 'Request not found' });
      res.json(row2js(rows[0]));
    } catch (err) {
      console.error('[service-requests] patch', err);
      res.status(500).json({ error: 'Database error' });
    }
  });
});

/* DELETE /:id  (admin only) */
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    await db.query('DELETE FROM service_requests WHERE id = $1', [req.params.id]);
    res.json({ deleted: true });
  } catch (err) {
    console.error('[service-requests] delete', err);
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;
