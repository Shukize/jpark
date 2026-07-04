/* ============================================================
   J Park Hotel — site-wide maintenance mode
   GET /api/maintenance    public: is the guest site currently down?
   PUT /api/maintenance    admin: turn maintenance mode on/off
   ============================================================ */
const express = require('express');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

/* GET /api/maintenance — no auth required (guest pages poll this on load) */
router.get('/', async (_req, res) => {
  try {
    const { rows } = await db.query('SELECT maintenance_mode FROM site_content WHERE id = 1');
    res.json({ enabled: rows.length ? !!rows[0].maintenance_mode : false });
  } catch (e) {
    console.error('[maintenance] get', e);
    // Fail open: if the DB is unreachable, don't lock guests out of the site.
    res.json({ enabled: false });
  }
});

/* PUT /api/maintenance — admin only, body: { enabled: boolean } */
router.put('/', requireAdmin, async (req, res) => {
  const enabled = !!(req.body && req.body.enabled);
  try {
    await db.query(
      `INSERT INTO site_content (id, maintenance_mode)
       VALUES (1, $1)
       ON CONFLICT (id) DO UPDATE SET maintenance_mode = EXCLUDED.maintenance_mode`,
      [enabled]
    );
    res.json({ ok: true, enabled });
  } catch (e) {
    console.error('[maintenance] put', e);
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;
