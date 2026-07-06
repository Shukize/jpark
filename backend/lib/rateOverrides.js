/* ============================================================
   J Park Hotel — live rate-override merge layer.

   backend/lib/roomRates.js holds the static fallback/base rates. This file
   merges in any admin-saved overrides (site_content.rates, edited via the
   Site Editor's Rates tab, written through backend/routes/rates.js) and is
   what backend/routes/payments.js actually charges guests from.

   Security posture: an override can only ever adjust the `room`/`bf`
   numbers of a room+variant that already exists in the static ROOMS object
   — it can never add a new room/variant, and never touches maxGuests or
   inventory. Every number is re-validated here independently of the write-time
   validation in routes/rates.js (defense in depth): an invalid stored value is
   skipped (logged) and falls back to the static default for that one field
   only, never for the whole room. A DB read failure fails closed to the
   static defaults (returns no overrides) rather than throwing into the
   payment path.
   ============================================================ */
const roomRates = require('./roomRates');
const db = require('../db');

const MIN_RATE = 0;
const MAX_RATE = 100000;

function isValidRate(n) {
  return typeof n === 'number' && Number.isFinite(n) && n > MIN_RATE && n <= MAX_RATE;
}

// Deep-clones `base` (a ROOMS[name] entry), then overlays any *valid*
// override for each variant. Never adds/removes variants, never touches
// maxGuests.
function mergeRoom(base, overridesForRoom) {
  const merged = { maxGuests: base.maxGuests, variants: base.variants.map((v) => ({ ...v })) };
  if (!overridesForRoom || typeof overridesForRoom !== 'object') return merged;
  merged.variants.forEach((v) => {
    const ov = overridesForRoom[v.label];
    if (!ov || typeof ov !== 'object') return;
    if (isValidRate(ov.room)) {
      v.room = ov.room;
    } else if (ov.room != null) {
      console.warn(`[rateOverrides] invalid room rate for "${v.label}", ignoring`, ov.room);
    }
    if (isValidRate(ov.bf)) {
      v.bf = ov.bf;
    } else if (ov.bf != null) {
      console.warn(`[rateOverrides] invalid bf rate for "${v.label}", ignoring`, ov.bf);
    }
  });
  return merged;
}

async function loadRawOverrides() {
  try {
    const { rows } = await db.query('SELECT rates FROM site_content WHERE id = 1');
    const rates = rows.length ? rows[0].rates : null;
    return rates && typeof rates === 'object' ? rates : {};
  } catch (e) {
    console.error('[rateOverrides] DB read failed, falling back to static defaults', e);
    return {};
  }
}

async function getEffectiveRoom(name) {
  const base = roomRates.getRoom(name);
  if (!base) return null;
  const all = await loadRawOverrides();
  return mergeRoom(base, all[name]);
}

async function getEffectiveVariant(name, variantLabel) {
  const room = await getEffectiveRoom(name);
  if (!room) return null;
  return room.variants.find((v) => v.label === variantLabel) || null;
}

// Full merged view of every room, each variant tagged `overridden` — used by
// GET /api/rates so neither the booking page nor the Site Editor needs its
// own copy of the static base numbers.
async function getAllEffectiveRooms() {
  const all = await loadRawOverrides();
  const out = {};
  roomRates.roomKeys().forEach((name) => {
    const base = roomRates.ROOMS[name];
    const overridesForRoom = all[name];
    const merged = mergeRoom(base, overridesForRoom);
    out[name] = {
      maxGuests: merged.maxGuests,
      variants: merged.variants.map((v) => ({
        ...v,
        overridden: !!(overridesForRoom && overridesForRoom[v.label]),
      })),
    };
  });
  return out;
}

module.exports = {
  isValidRate,
  mergeRoom,
  loadRawOverrides,
  getEffectiveRoom,
  getEffectiveVariant,
  getAllEffectiveRooms,
  MIN_RATE,
  MAX_RATE,
};
