/* ============================================================
   J Park Hotel — per-room-type & per-day-use-building availability (Site Editor)
   GET /api/availability    public: delisted room names + day-use buildings + room counts
   PUT /api/availability    admin: replace the delisted-room list, day-use list and/or room counts

   A room name NOT in the list is bookable (the default for every catalog
   room type except Deluxe, which ships delisted — see backend/schema.sql).
   A day-use building key NOT in `unavailableDayUse` is bookable (every
   building ships on). `inventory` is the third, orthogonal control: HOW MANY
   physical rooms of a bookable type may be sold for one night (the ceiling the
   overbooking guards in routes/payments.js enforce). Delisting hides a type
   entirely; the count limits a type that is still on sale.

   Modelled directly on backend/routes/rates.js (a dedicated, validated route
   rather than the generic content.js PUT, which today has no frontend caller
   and doesn't actually round-trip) so this is the one other Site Editor field,
   besides Rates, that reliably syncs across devices/staff. PUT updates only
   the field(s) present in the body, so saving room availability never
   clobbers the day-use list or the counts, and vice versa.
   ============================================================ */
const express = require('express');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');
const roomRates = require('../lib/roomRates');
const rateOverrides = require('../lib/rateOverrides');

const router = express.Router();

/* GET /api/availability — no auth required (index.html + booking.html +
   Site Editor all read it). `rooms` (the full valid room-name list) is
   included so the Site Editor can render one checkbox per room without
   keeping its own hardcoded copy of the 13-room catalog in sync, and
   `pools` groups those keys into the physical pools the Site Editor renders
   one room-count input per (see roomRates.inventoryPools()). */
router.get('/', async (_req, res) => {
  const dayUseRooms = Object.keys(roomRates.DAYUSE);
  const pools = roomRates.inventoryPools();
  try {
    const [{ rows }, inventory] = await Promise.all([
      db.query('SELECT unavailable_rooms, unavailable_dayuse FROM site_content WHERE id = 1'),
      rateOverrides.getEffectiveInventoryMap(),
    ]);
    const unavailable = (rows.length && rows[0].unavailable_rooms) || [];
    const unavailableDayUse = (rows.length && rows[0].unavailable_dayuse) || [];
    res.json({ unavailable, rooms: roomRates.roomKeys(), unavailableDayUse, dayUseRooms, inventory, pools });
  } catch (e) {
    console.error('[availability] get', e);
    // Fail open on reads: never block the public site from rendering just
    // because this fetch failed — worst case every room shows as bookable
    // at its static room count.
    res.json({
      unavailable: [], rooms: roomRates.roomKeys(), unavailableDayUse: [], dayUseRooms,
      inventory: { ...roomRates.ROOM_INVENTORY }, pools,
    });
  }
});

/* PUT /api/availability — admin only, body may contain `unavailable`
   (room names), `unavailableDayUse` (day-use building keys) and/or
   `inventory` ({ roomName: count }). Only the field(s) actually present in
   the body are updated, so the Site Editor cards save independently. Rejects
   unknown names/keys (protects against a typo silently making a room/building
   permanently unmatchable by any card or search filter) and counts that
   aren't whole numbers in range. */
router.put('/', requireAdmin, async (req, res) => {
  const body = req.body || {};
  const hasRooms = Object.prototype.hasOwnProperty.call(body, 'unavailable');
  const hasDayUse = Object.prototype.hasOwnProperty.call(body, 'unavailableDayUse');
  const hasInventory = Object.prototype.hasOwnProperty.call(body, 'inventory');
  if (!hasRooms && !hasDayUse && !hasInventory) {
    return res.status(400).json({ error: 'Provide unavailable, unavailableDayUse and/or inventory' });
  }

  let roomsUnique, dayUseUnique, mergedInventory;

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

  if (hasInventory) {
    const submitted = body.inventory || {};
    if (typeof submitted !== 'object' || Array.isArray(submitted)) {
      return res.status(400).json({ error: 'inventory must be an object' });
    }
    const violations = [];
    Object.keys(submitted).forEach((roomName) => {
      if (!roomRates.getRoom(roomName)) {
        violations.push(`Unknown room: "${roomName}"`);
        return;
      }
      if (!rateOverrides.isValidInventory(submitted[roomName])) {
        violations.push(`"${roomName}" room count must be a whole number between ${rateOverrides.MIN_INVENTORY} and ${rateOverrides.MAX_INVENTORY}`);
      }
    });
    if (violations.length) {
      return res.status(400).json({ error: 'Invalid room counts', details: violations });
    }
    // Merge onto the current effective counts rather than a blind replace, so
    // editing one room never resets the others (same reason routes/rates.js
    // merges its surcharges/day-use maps).
    mergedInventory = { ...(await rateOverrides.getEffectiveInventoryMap()) };
    Object.keys(submitted).forEach((roomName) => {
      // Write the value across the whole physical pool, not just the key the
      // admin happened to edit: 'Studio Single' and 'Studio Twin' are one set
      // of rooms with two bed layouts, and the guards read whichever key the
      // guest booked — leaving the sibling behind would let the same rooms be
      // sold to two different ceilings.
      roomRates.getInventoryPoolRooms(roomName).forEach((key) => {
        mergedInventory[key] = submitted[roomName];
      });
    });
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
    if (hasInventory) {
      await db.query(
        'UPDATE site_content SET room_inventory = $1, updated_at = NOW() WHERE id = 1',
        [JSON.stringify(mergedInventory)]
      );
    }
    const [{ rows }, inventory] = await Promise.all([
      db.query('SELECT unavailable_rooms, unavailable_dayuse FROM site_content WHERE id = 1'),
      rateOverrides.getEffectiveInventoryMap(),
    ]);
    res.json({
      ok: true,
      unavailable: (rows.length && rows[0].unavailable_rooms) || [],
      unavailableDayUse: (rows.length && rows[0].unavailable_dayuse) || [],
      inventory,
    });
  } catch (e) {
    console.error('[availability] put', e);
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;
