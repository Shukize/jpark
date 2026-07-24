/* ============================================================
   J Park Hotel — per-room-type & per-day-use-building availability (Site Editor)
   GET /api/availability    public: currently delisted room names + day-use buildings
   PUT /api/availability    admin: replace the delisted-room and/or day-use list

   A room name NOT in the list is bookable (the default for every catalog
   room type except Deluxe, which ships delisted — see backend/schema.sql).
   A day-use building key NOT in `unavailableDayUse` is bookable (every
   building ships on). Modelled directly on backend/routes/rates.js (a
   dedicated, validated route rather than the generic content.js PUT, which
   today has no frontend caller and doesn't actually round-trip) so this is
   the one other Site Editor field, besides Rates, that reliably syncs across
   devices/staff. PUT updates only the list(s) present in the body, so saving
   room availability never clobbers the day-use list and vice versa.
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
  const dayUseRooms = Object.keys(roomRates.DAYUSE);
  try {
    const { rows } = await db.query('SELECT unavailable_rooms, unavailable_dayuse FROM site_content WHERE id = 1');
    const unavailable = (rows.length && rows[0].unavailable_rooms) || [];
    const unavailableDayUse = (rows.length && rows[0].unavailable_dayuse) || [];
    res.json({ unavailable, rooms: roomRates.roomKeys(), unavailableDayUse, dayUseRooms });
  } catch (e) {
    console.error('[availability] get', e);
    // Fail open on reads: never block the public site from rendering just
    // because this fetch failed — worst case every room shows as bookable.
    res.json({ unavailable: [], rooms: roomRates.roomKeys(), unavailableDayUse: [], dayUseRooms });
  }
});

/* PUT /api/availability — admin only, body may contain `unavailable`
   (room names) and/or `unavailableDayUse` (day-use building keys). Only the
   list(s) actually present in the body are updated, so the two Site Editor
   cards save independently. Rejects unknown names/keys (protects against a
   typo silently making a room/building permanently unmatchable by any card
   or search filter). */
router.put('/', requireAdmin, async (req, res) => {
  const body = req.body || {};
  const hasRooms = Object.prototype.hasOwnProperty.call(body, 'unavailable');
  const hasDayUse = Object.prototype.hasOwnProperty.call(body, 'unavailableDayUse');
  if (!hasRooms && !hasDayUse) {
    return res.status(400).json({ error: 'Provide unavailable and/or unavailableDayUse' });
  }

  let roomsUnique, dayUseUnique;

  if (hasRooms) {
    const submitted = body.unavailable || [];
    if (!Array.isArray(submitted)) {
      return res.status(400).json({ error: 'unavailable must be an array' });
    }
    const violations = submitted
      .filter((roomName) => !roomRates.getRoom(roomName))
      .map((roomName) => `Unknown room: "${roomName}"`);
    if (violations.length) {
      return res.status(400).json({ error: 'Invalid room names', details: violations });
    }
    roomsUnique = Array.from(new Set(submitted)); // de-dupe; order is irrelevant
  }

  if (hasDayUse) {
    const submitted = body.unavailableDayUse || [];
    if (!Array.isArray(submitted)) {
      return res.status(400).json({ error: 'unavailableDayUse must be an array' });
    }
    const violations = submitted
      .filter((key) => roomRates.getDayUsePrice(key) == null)
      .map((key) => `Unknown day-use building: "${key}"`);
    if (violations.length) {
      return res.status(400).json({ error: 'Invalid day-use buildings', details: violations });
    }
    dayUseUnique = Array.from(new Set(submitted));
  }

  try {
    // Make sure the singleton row exists, then update only the column(s) the
    // caller submitted so one list's save never overwrites the other.
    await db.query('INSERT INTO site_content (id) VALUES (1) ON CONFLICT (id) DO NOTHING');
    if (hasRooms) {
      await db.query(
        'UPDATE site_content SET unavailable_rooms = $1, updated_at = NOW() WHERE id = 1',
        [roomsUnique]
      );
    }
    if (hasDayUse) {
      await db.query(
        'UPDATE site_content SET unavailable_dayuse = $1, updated_at = NOW() WHERE id = 1',
        [dayUseUnique]
      );
    }
    const { rows } = await db.query('SELECT unavailable_rooms, unavailable_dayuse FROM site_content WHERE id = 1');
    res.json({
      ok: true,
      unavailable: (rows.length && rows[0].unavailable_rooms) || [],
      unavailableDayUse: (rows.length && rows[0].unavailable_dayuse) || [],
    });
  } catch (e) {
    console.error('[availability] put', e);
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;
