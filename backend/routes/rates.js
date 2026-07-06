/* ============================================================
   J Park Hotel — room-rate overrides (Site Editor "Rates" tab)
   GET /api/rates    public: current effective (base + override) rates
   PUT /api/rates    admin: save rate overrides

   Deliberately a dedicated route rather than folded into the generic
   content.js PUT (which does a blind full-replace with no shape
   validation) — this endpoint drives real guest charges, so every
   submitted number is validated against the known room/variant list and
   a sane price range before anything is written. See backend/lib/
   rateOverrides.js for the read-time merge + re-validation logic that
   backend/routes/payments.js actually charges from.
   ============================================================ */
const express = require('express');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');
const roomRates = require('../lib/roomRates');
const rateOverrides = require('../lib/rateOverrides');

const router = express.Router();

/* GET /api/rates — no auth required (booking.html + Site Editor both read it) */
router.get('/', async (_req, res) => {
  try {
    const rooms = await rateOverrides.getAllEffectiveRooms();
    const { rows } = await db.query('SELECT updated_at FROM site_content WHERE id = 1');
    res.json({
      rooms,
      updatedAt: rows.length && rows[0].updated_at ? new Date(rows[0].updated_at).getTime() : null,
    });
  } catch (e) {
    console.error('[rates] get', e);
    // Fail open on reads: never block booking.html from showing the static
    // defaults just because the overrides fetch failed.
    res.json({ rooms: {}, updatedAt: null });
  }
});

/* PUT /api/rates — admin only, body: { rates: { [room]: { [variant]: { room, bf } } } }
   Validates the ENTIRE payload before writing anything: unknown room/variant
   keys or out-of-range numbers reject the whole batch with every violation
   listed, so an admin never has a partial save. */
router.put('/', requireAdmin, async (req, res) => {
  const submitted = (req.body && req.body.rates) || {};
  if (typeof submitted !== 'object' || Array.isArray(submitted)) {
    return res.status(400).json({ error: 'rates must be an object' });
  }

  const violations = [];
  Object.keys(submitted).forEach((roomName) => {
    const room = roomRates.getRoom(roomName);
    if (!room) {
      violations.push(`Unknown room: "${roomName}"`);
      return;
    }
    const variantsForRoom = submitted[roomName];
    if (!variantsForRoom || typeof variantsForRoom !== 'object') {
      violations.push(`Invalid variants payload for "${roomName}"`);
      return;
    }
    Object.keys(variantsForRoom).forEach((variantLabel) => {
      const variant = roomRates.getVariant(roomName, variantLabel);
      if (!variant) {
        violations.push(`Unknown variant "${variantLabel}" for "${roomName}"`);
        return;
      }
      const ov = variantsForRoom[variantLabel] || {};
      if (!rateOverrides.isValidRate(ov.room)) {
        violations.push(`"${roomName}" — ${variantLabel}: room-only rate must be a number between ${rateOverrides.MIN_RATE} and ${rateOverrides.MAX_RATE}`);
      }
      if (!rateOverrides.isValidRate(ov.bf)) {
        violations.push(`"${roomName}" — ${variantLabel}: room+breakfast rate must be a number between ${rateOverrides.MIN_RATE} and ${rateOverrides.MAX_RATE}`);
      }
    });
  });

  if (violations.length) {
    return res.status(400).json({ error: 'Invalid rates', details: violations });
  }

  try {
    await db.query(
      `INSERT INTO site_content (id, rates, updated_at)
       VALUES (1, $1, NOW())
       ON CONFLICT (id) DO UPDATE SET rates = EXCLUDED.rates, updated_at = NOW()`,
      [JSON.stringify(submitted)]
    );
    const rooms = await rateOverrides.getAllEffectiveRooms();
    res.json({ ok: true, rooms });
  } catch (e) {
    console.error('[rates] put', e);
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;
