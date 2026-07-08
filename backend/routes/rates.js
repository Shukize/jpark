/* ============================================================
   J Park Hotel — room-rate overrides (Site Editor "Rates" tab)
   GET /api/rates    public: current effective (base + override) rates + surcharges
   PUT /api/rates    admin: save rate overrides + surcharges

   Deliberately a dedicated route rather than folded into the generic
   content.js PUT (which does a blind full-replace with no shape
   validation) — this endpoint drives real guest charges, so every
   submitted number is validated against the known room/variant list and
   a sane price range before anything is written. See backend/lib/
   rateOverrides.js for the read-time merge + re-validation logic that
   backend/routes/payments.js actually charges from — including the two
   flat `surcharges` (extra bed, extra breakfast guest) applied on top of
   a variant's rate based on guest count.
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
    const [rooms, surcharges, dayUse] = await Promise.all([
      rateOverrides.getAllEffectiveRooms(),
      rateOverrides.getEffectiveSurcharges(),
      rateOverrides.getEffectiveDayUseRates(),
    ]);
    const { rows } = await db.query('SELECT updated_at FROM site_content WHERE id = 1');
    res.json({
      rooms,
      surcharges,
      dayUse,
      updatedAt: rows.length && rows[0].updated_at ? new Date(rows[0].updated_at).getTime() : null,
    });
  } catch (e) {
    console.error('[rates] get', e);
    // Fail open on reads: never block booking.html from showing the static
    // defaults just because the overrides fetch failed.
    res.json({ rooms: {}, surcharges: { ...roomRates.DEFAULT_SURCHARGES }, dayUse: { ...roomRates.DAYUSE }, updatedAt: null });
  }
});

/* PUT /api/rates — admin only, body:
     { rates: { [room]: { [variant]: { room, bf } } }, surcharges: { extraBed, extraBreakfastGuest },
       dayUse: { [room]: number } }
   Validates the ENTIRE payload before writing anything: unknown room/variant
   keys or out-of-range numbers reject the whole batch with every violation
   listed, so an admin never has a partial save. */
router.put('/', requireAdmin, async (req, res) => {
  const submitted = (req.body && req.body.rates) || {};
  const submittedSurcharges = (req.body && req.body.surcharges) || {};
  const submittedDayUse = (req.body && req.body.dayUse) || {};
  if (typeof submitted !== 'object' || Array.isArray(submitted)) {
    return res.status(400).json({ error: 'rates must be an object' });
  }
  if (typeof submittedSurcharges !== 'object' || Array.isArray(submittedSurcharges)) {
    return res.status(400).json({ error: 'surcharges must be an object' });
  }
  if (typeof submittedDayUse !== 'object' || Array.isArray(submittedDayUse)) {
    return res.status(400).json({ error: 'dayUse must be an object' });
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

  const surchargeKeys = Object.keys(roomRates.DEFAULT_SURCHARGES);
  Object.keys(submittedSurcharges).forEach((key) => {
    if (!surchargeKeys.includes(key)) {
      violations.push(`Unknown surcharge: "${key}"`);
      return;
    }
    if (!rateOverrides.isValidRate(submittedSurcharges[key])) {
      violations.push(`Surcharge "${key}" must be a number between ${rateOverrides.MIN_RATE} and ${rateOverrides.MAX_RATE}`);
    }
  });

  Object.keys(submittedDayUse).forEach((roomName) => {
    if (roomRates.getDayUsePrice(roomName) == null) {
      violations.push(`Unknown day-use room: "${roomName}"`);
      return;
    }
    if (!rateOverrides.isValidRate(submittedDayUse[roomName])) {
      violations.push(`"${roomName}" day-use rate must be a number between ${rateOverrides.MIN_RATE} and ${rateOverrides.MAX_RATE}`);
    }
  });

  if (violations.length) {
    return res.status(400).json({ error: 'Invalid rates', details: violations });
  }

  try {
    // Merge onto the current effective surcharges/day-use rates rather than
    // a blind replace, so a partial submission (e.g. only extraBed, or only
    // one day-use room) never silently resets the others to their default.
    const mergedSurcharges = { ...(await rateOverrides.getEffectiveSurcharges()), ...submittedSurcharges };
    const mergedDayUse = { ...(await rateOverrides.getEffectiveDayUseRates()), ...submittedDayUse };
    await db.query(
      `INSERT INTO site_content (id, rates, surcharges, day_use_rates, updated_at)
       VALUES (1, $1, $2, $3, NOW())
       ON CONFLICT (id) DO UPDATE SET rates = EXCLUDED.rates, surcharges = EXCLUDED.surcharges,
         day_use_rates = EXCLUDED.day_use_rates, updated_at = NOW()`,
      [JSON.stringify(submitted), JSON.stringify(mergedSurcharges), JSON.stringify(mergedDayUse)]
    );
    const [rooms, surcharges, dayUse] = await Promise.all([
      rateOverrides.getAllEffectiveRooms(),
      rateOverrides.getEffectiveSurcharges(),
      rateOverrides.getEffectiveDayUseRates(),
    ]);
    res.json({ ok: true, rooms, surcharges, dayUse });
  } catch (e) {
    console.error('[rates] put', e);
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;
