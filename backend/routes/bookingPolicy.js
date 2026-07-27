/* ============================================================
   J Park Hotel — booking policy: "require prepayment" switch
   GET /api/booking-policy    public: does the booking page need to force prepay?
   PUT /api/booking-policy    admin: turn "require prepayment" on/off

   Mirrors routes/maintenance.js. When ON, the booking flow drops the
   pay-at-check-in option so every new direct booking must pay online and is
   stamped non_refundable (busy/holiday policy — see schema.sql
   site_content.require_prepayment). The actual enforcement + the "is online
   payment even available" guard live in routes/payments.js; this route just
   stores the admin's choice.
   ============================================================ */
const express = require('express');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

/* GET /api/booking-policy — no auth (the booking page reads it on load). */
router.get('/', async (_req, res) => {
  try {
    const { rows } = await db.query('SELECT require_prepayment FROM site_content WHERE id = 1');
    res.json({ requirePrepayment: rows.length ? !!rows[0].require_prepayment : false });
  } catch (e) {
    console.error('[booking-policy] get', e);
    // Fail open: if the DB is unreachable, don't force prepay (never block a booking).
    res.json({ requirePrepayment: false });
  }
});

/* PUT /api/booking-policy — admin only, body: { requirePrepayment: boolean } */
router.put('/', requireAdmin, async (req, res) => {
  const requirePrepayment = !!(req.body && req.body.requirePrepayment);
  try {
    await db.query(
      `INSERT INTO site_content (id, require_prepayment)
       VALUES (1, $1)
       ON CONFLICT (id) DO UPDATE SET require_prepayment = EXCLUDED.require_prepayment`,
      [requirePrepayment]
    );
    res.json({ ok: true, requirePrepayment });
  } catch (e) {
    console.error('[booking-policy] put', e);
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;
