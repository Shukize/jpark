/* ============================================================
   J Park Hotel — per-room-type availability (Site Editor)
   GET /api/availability    public: list of currently delisted room names
   PUT /api/availability    admin: replace the delisted-room list

   A room name NOT in the list is bookable (the default for every catalog
   room type except Deluxe, which ships delisted — see backend/schema.sql).
   Modelled directly on backend/routes/rates.js (a dedicated, validated
   route rather than the generic content.js PUT, which today has no
   frontend caller and doesn't actually round-trip) so this is the one
   other Site Editor field, besides Rates, that reliably syncs across
   devices/staff.
   ============================================================ */
const express = require('express');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');
const roomRates = require('../lib/roomRates');

const router = express.Router();

/* GET /api/availability — no auth required (index.html + booking.html +
   Site Editor all read it). `rooms` (the full valid room-name list) is
   included so the Site Editor can render one checkbox per room without
   keeping its own hardcoded copy of the 13-room catalog in sync. */
router.get('/', async (_req, res) => {
  try {
    const { rows } = await db.query('SELECT unavailable_rooms FROM site_content WHERE id = 1');
    const unavailable = (rows.length && rows[0].unavailable_rooms) || [];
    res.json({ unavailable, rooms: roomRates.roomKeys() });
  } catch (e) {
    console.error('[availability] get', e);
    // Fail open on reads: never block the public site from rendering just
    // because this fetch failed — worst case every room shows as bookable.
    res.json({ unavailable: [], rooms: roomRates.roomKeys() });
  }
});

/* PUT /api/availability — admin only, body: { unavailable: string[] }
   Rejects unknown room names (protects against a typo silently making a
   room name permanently unmatchable by any card/search filter). */
router.put('/', requireAdmin, async (req, res) => {
  const submitted = (req.body && req.body.unavailable) || [];
  if (!Array.isArray(submitted)) {
    return res.status(400).json({ error: 'unavailable must be an array' });
  }

  const violations = [];
  submitted.forEach((roomName) => {
    if (!roomRates.getRoom(roomName)) {
      violations.push(`Unknown room: "${roomName}"`);
    }
  });
  if (violations.length) {
    return res.status(400).json({ error: 'Invalid room names', details: violations });
  }

  try {
    // De-dupe defensively; order doesn't matter to any consumer.
    const unique = Array.from(new Set(submitted));
    await db.query(
      `INSERT INTO site_content (id, unavailable_rooms, updated_at)
       VALUES (1, $1, NOW())
       ON CONFLICT (id) DO UPDATE SET unavailable_rooms = EXCLUDED.unavailable_rooms, updated_at = NOW()`,
      [unique]
    );
    res.json({ ok: true, unavailable: unique });
  } catch (e) {
    console.error('[availability] put', e);
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;
