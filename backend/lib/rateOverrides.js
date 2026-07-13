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
// maxGuests or extraBedAvailable (those are capacity/capability facts, not
// prices — not editable via the Rates tab).
function mergeRoom(base, overridesForRoom) {
  const merged = {
    maxGuests: base.maxGuests,
    extraBedAvailable: !!base.extraBedAvailable,
    variants: base.variants.map((v) => ({ ...v })),
  };
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

// The two flat, room-wide surcharges (extra bed, extra breakfast guest) are
// admin-editable the same way individual room rates are, but they live in
// their own `surcharges` column/shape rather than nested under a room name,
// since they apply globally rather than per room+variant.
async function loadRawSurcharges() {
  try {
    const { rows } = await db.query('SELECT surcharges FROM site_content WHERE id = 1');
    const s = rows.length ? rows[0].surcharges : null;
    return s && typeof s === 'object' ? s : {};
  } catch (e) {
    console.error('[rateOverrides] DB read failed, falling back to default surcharges', e);
    return {};
  }
}

async function getEffectiveSurcharges() {
  const raw = await loadRawSurcharges();
  const merged = { ...roomRates.DEFAULT_SURCHARGES };
  Object.keys(merged).forEach((key) => {
    if (isValidRate(raw[key])) {
      merged[key] = raw[key];
    } else if (raw[key] != null) {
      console.warn(`[rateOverrides] invalid surcharge for "${key}", ignoring`, raw[key]);
    }
  });
  return merged;
}

// Day Use (3-hour short-stay) flat prices are admin-editable the same way
// surcharges are — a flat { [roomName]: number } map, not per-variant like
// room rates, since Day Use has no room/breakfast split. Only a room key
// that already exists in roomRates.DAYUSE may be overridden.
async function loadRawDayUseRates() {
  try {
    const { rows } = await db.query('SELECT day_use_rates FROM site_content WHERE id = 1');
    const d = rows.length ? rows[0].day_use_rates : null;
    return d && typeof d === 'object' ? d : {};
  } catch (e) {
    console.error('[rateOverrides] DB read failed, falling back to default day-use rates', e);
    return {};
  }
}

async function getEffectiveDayUseRates() {
  const raw = await loadRawDayUseRates();
  const merged = { ...roomRates.DAYUSE };
  Object.keys(merged).forEach((room) => {
    if (isValidRate(raw[room])) {
      merged[room] = raw[room];
    } else if (raw[room] != null) {
      console.warn(`[rateOverrides] invalid day-use rate for "${room}", ignoring`, raw[room]);
    }
  });
  return merged;
}

async function getEffectiveDayUsePrice(room) {
  if (!Object.prototype.hasOwnProperty.call(roomRates.DAYUSE, room)) return null;
  const rates = await getEffectiveDayUseRates();
  return rates[room];
}

// The per-night THB added on top of a variant's room/bf rate for a given
// guest count. `room` is an *effective* room object (from getEffectiveRoom/
// getAllEffectiveRooms — has extraBedAvailable). `surcharges` is an
// *effective* surcharges object (from getEffectiveSurcharges).
//
// `childAges` (optional array of integers) enables the age-aware policy
// advertised on the site ("children under 9 stay free of any extra-guest
// charge; breakfast free ages 0-4, ฿100 flat ages 5-8"): every child is
// priced independently of adult count — age 0-4 is entirely free, age 5-8
// only ever adds the flat `childBreakfast5to8` (and never an extra-bed
// charge), age 9+ is priced exactly like an extra adult guest. Only ADULTS
// beyond the first 2 pay today's flat `extraBreakfastGuest`/`extraBed`
// surcharge — a young child never "uses up" or extends that adult
// allowance either way.
//
// When `childAges` is omitted (OTA/manual bookings, or any booking that
// predates this feature — direct bookings always pass `child_ages`, even
// as `[]`, once collected) this falls back byte-for-byte to the original
// flat calculation: every guest beyond a total of 2, adult or child alike,
// pays the same flat rate. That fallback exists because those bookings
// never collected per-child ages, so there is no age to price by.
function computeGuestSurcharge(room, totalGuests, breakfast, surcharges, childAges) {
  if (Array.isArray(childAges)) {
    const adults = Math.max(0, Number(totalGuests || 0) - childAges.length);
    const extraAdults = Math.max(0, adults - 2);
    let total = 0;
    if (extraAdults > 0) {
      if (breakfast) total += extraAdults * surcharges.extraBreakfastGuest;
      if (room.extraBedAvailable) total += extraAdults * surcharges.extraBed;
    }
    childAges.forEach((ageRaw) => {
      const age = Number(ageRaw);
      if (age >= 9) {
        if (breakfast) total += surcharges.extraBreakfastGuest;
        if (room.extraBedAvailable) total += surcharges.extraBed;
      } else if (age >= 5 && breakfast) {
        total += surcharges.childBreakfast5to8;
      }
      // age 0-4: always free, no charge of any kind.
    });
    return total;
  }
  const extraGuests = Math.max(0, Number(totalGuests || 0) - 2);
  if (extraGuests <= 0) return 0;
  let total = 0;
  if (breakfast) total += extraGuests * surcharges.extraBreakfastGuest;
  if (room.extraBedAvailable) total += extraGuests * surcharges.extraBed;
  return total;
}

// A room whose variants all share the same room-only rate isn't really
// offering differently priced products — the variant label is just a
// bed-style preference. Per the 2026 rate card, room-only price is flat
// regardless of guest count for these rooms; only breakfast differs, by a
// flat surcharges.extraBreakfastGuest (190 THB) per breakfast guest up to
// the 2-guest tier (the 3rd+ guest is added by computeGuestSurcharge()).
//
// Each variant's `bf` is the room+breakfast rate at THAT variant's OWN base
// occupancy: a Single/1-Bedroom variant's bf is the 1-guest rate, a Twin's
// bf is the 2-guest rate. Studio/Prestige/Premium are each split into two
// separate single-variant ROOMS keys ("… Single" and "… Twin") because
// those keys are live Google Hotel Ads room-type IDs that must never be
// renamed/merged (see roomRates.js + lib/hotelAdsIds.js). For a standalone
// "… Twin" entry variants[0] IS the Twin, so its bf is already the 2-guest
// rate — the old `variants[0].bf + 190` double-charged the 2nd guest's
// breakfast (e.g. Studio Twin, 2 guests, breakfast billed 1490 instead of
// 1300). So we normalise off the SELECTED variant's base occupancy instead
// of assuming variants[0] is the 1-guest rate. occBaseGuests() mirrors
// hotelAdsFeed.js's maxOccupancyBase test. Also mirrors
// assets/js/booking-page.js's isOccupancyTier()/occupancyBreakfastPrice()
// (whose call sites always pass the 1-guest Single as variants[0], so that
// simpler form stays correct there) so the server charge always agrees with
// what the guest was shown.
function isOccupancyTier(room) {
  return room.variants.every((v) => v.room === room.variants[0].room);
}

// A Twin/Double/2-Bedroom variant's rate already covers 2 guests; a
// Single/1-Bedroom variant covers 1. Same idiom as hotelAdsFeed.js.
function occBaseGuests(label) {
  return /twin|double|2 bedroom/i.test(label) ? 2 : 1;
}

function effectiveBreakfastRate(room, variant, totalGuests, surcharges) {
  if (!isOccupancyTier(room)) return variant.bf;
  const step = surcharges.extraBreakfastGuest;
  const guests = Math.min(Number(totalGuests || 0), 2);
  return variant.bf + step * (guests - occBaseGuests(variant.label));
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
      extraBedAvailable: merged.extraBedAvailable,
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
  loadRawSurcharges,
  getEffectiveSurcharges,
  computeGuestSurcharge,
  isOccupancyTier,
  effectiveBreakfastRate,
  loadRawDayUseRates,
  getEffectiveDayUseRates,
  getEffectiveDayUsePrice,
  MIN_RATE,
  MAX_RATE,
};
