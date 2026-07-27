/* ============================================================
   J Park Hotel — server-side room rate + inventory mirror.

   These numbers are the FALLBACK/BASE rates. The real, live-authoritative
   price for a charge is backend/lib/rateOverrides.js's merge of this base
   set with any admin edits saved via the Site Editor's Rates tab (stored in
   site_content.rates, backend/routes/rates.js) — see that file for the
   override/validation rules. Only backend/lib/rateOverrides.js and
   backend/routes/rates.js should read ROOMS directly for pricing; payments.js
   goes through rateOverrides.

   Overrides can only ever adjust `room`/`bf` numbers for a room+variant key
   that already exists below — they can never add a new room type or variant.
   So adding an entirely new room/variant (as done for 'Studio Twin' and the
   'Executive Suite 1 Bedroom' 2nd variant) still requires a manual code
   change here, AND a matching one in the ROOMS array in
   assets/js/booking-page.js (name, maxGuests, variants/rates) — there is no
   shared build step between frontend and backend, so the two files must be
   kept in sync by hand for anything beyond a plain number tweak.
   ============================================================ */

// Two flat, room-wide surcharges (THB/night), layered on top of a variant's
// room/bf rate based on total guest count (adults+children). Both numbers
// happen to match a pattern already baked into every room's own bf delta
// (every "2-breakfast" variant is exactly +190 over its "1-breakfast"
// sibling — see git history / the 2026 rate card) — a 3rd breakfast guest
// continues that same +190 step. These two numbers are also admin-editable
// via the Site Editor's Rates tab (site_content.surcharges) — see
// backend/lib/rateOverrides.js's getEffectiveSurcharges().
const DEFAULT_SURCHARGES = {
  extraBed: 500,             // physical rollaway bed for a 3rd guest, per night
  extraBreakfastGuest: 190,  // each guest beyond the variant's base 2, per night, when breakfast is selected
  childBreakfast5to8: 100,   // flat breakfast surcharge for a child aged 5-8 (0-4 free, 9+ = extraBreakfastGuest) — see lib/rateOverrides.js's computeGuestSurcharge()
};

// name -> { maxGuests, extraBedAvailable, variants: [{ label, room, bf }] }
// `room` = room-only THB/night, `bf` = room + breakfast THB/night (for the
// variant's base occupancy — 1 guest for Single/1 Bedroom, 2 for Twin/
// Double/2 Bedrooms). `extraBedAvailable`: whether a 3rd guest can be added
// via a paid rollaway bed (DEFAULT_SURCHARGES.extraBed) — false for rooms
// too small to physically fit one; those rooms can still take a 3rd guest
// (maxGuests already reflects that) but only pay the breakfast surcharge,
// never the bed surcharge. See backend/routes/payments.js's computeTotal().
const ROOMS = {
  'Studio Single':              { maxGuests: 3, extraBedAvailable: true,  variants: [{ label: 'Single', room: 990,  bf: 1110 }] },
  'Studio Twin':                { maxGuests: 3, extraBedAvailable: true,  variants: [{ label: 'Twin',   room: 990,  bf: 1300 }] },
  'Prestige Single':            { maxGuests: 3, extraBedAvailable: false, variants: [{ label: 'Single', room: 1040, bf: 1160 }] },
  'Prestige Twin':              { maxGuests: 3, extraBedAvailable: false, variants: [{ label: 'Twin',   room: 1040, bf: 1350 }] },
  'Studio B4':                  { maxGuests: 3, extraBedAvailable: true,  variants: [{ label: 'Single', room: 1070, bf: 1190 }, { label: 'Twin', room: 1070, bf: 1380 }] },
  'Deluxe':                     { maxGuests: 3, extraBedAvailable: true,  variants: [{ label: 'Single', room: 1110, bf: 1230 }] },
  'Premium Single':             { maxGuests: 3, extraBedAvailable: true,  variants: [{ label: 'Single', room: 1160, bf: 1280 }] },
  'Premium Twin':                { maxGuests: 3, extraBedAvailable: true,  variants: [{ label: 'Twin', room: 1160, bf: 1470 }] },
  'Grand Premium':              { maxGuests: 3, extraBedAvailable: false, variants: [{ label: 'Single', room: 1260, bf: 1380 }] },
  'Corner Suite':                { maxGuests: 3, extraBedAvailable: false, variants: [{ label: 'Single', room: 1260, bf: 1380 }, { label: 'Twin', room: 1260, bf: 1570 }] },
  'Grand Deluxe':                { maxGuests: 3, extraBedAvailable: false, variants: [{ label: 'Single', room: 1340, bf: 1460 }] },
  'Executive Suite 1 Bedroom':  { maxGuests: 4, extraBedAvailable: false, variants: [{ label: '1 Bedroom', room: 1850, bf: 1970 }, { label: '2 Bedrooms', room: 2100, bf: 2410 }] },
  'Premium Suite':               { maxGuests: 3, extraBedAvailable: false, variants: [{ label: '1 Bedroom', room: 2100, bf: 2220 }] },
  'Grand Suite':                 { maxGuests: 4, extraBedAvailable: false, variants: [{ label: '1 Bedroom', room: 2700, bf: 2820 }, { label: '2 Bedrooms', room: 3000, bf: 3310 }] },
};

// Real per-type physical room counts, as given by the owner (2026-07-24) now
// that online payment makes it worth actually enforcing availability rather
// than relying on the old 999-placeholder ceiling.
//
// These are the FALLBACK/BASE counts — the live-authoritative number is
// backend/lib/rateOverrides.js's getEffectiveInventoryMap(), which merges this
// set with any admin edits saved from the Site Editor's "How many rooms" card
// (stored in site_content.room_inventory, written by routes/availability.js).
// Same rule as ROOMS above: an override can only ever change the NUMBER for a
// room key that already exists here, never add a new room type. Only
// rateOverrides.js and routes/availability.js should read ROOM_INVENTORY
// directly; every availability guard goes through rateOverrides.
//
// Two wrinkles from that same conversation:
//
// 1. 'Single' vs 'Twin' (Studio/Prestige/Premium) is a bed-configuration
//    choice at booking time, not a different physical room — the owner said
//    these share ONE pool of rooms. The two labels are still separate keys
//    below (matching each one's own rate), but SHARED_INVENTORY_POOLS below
//    ties them together so availability-checking code counts both against
//    one shared limit — see getInventoryPoolRooms().
// 2. Executive Suite (1BR/2BR) and Grand Suite (1BR/2BR) each got DIFFERENT
//    counts per bed layout (e.g. Executive Suite: 2, Executive Suite 2BR:
//    1), but both layouts share ONE room key here with two variants — the
//    availability guard can only track a whole key, not a single variant of
//    it. Per owner decision, these are combined into one pool sized at the
//    sum (Executive Suite 1 Bedroom: 2+1=3, Grand Suite: 2+1=3) — this
//    guarantees the combined total is never exceeded, but can't reserve the
//    2-bedroom layout's 1 room specifically; splitting these into fully
//    separate room types would be a larger structural change.
const ROOM_INVENTORY = {
  'Studio Single': 10,
  'Studio Twin': 10,
  'Prestige Single': 7,
  'Prestige Twin': 7,
  'Studio B4': 10,
  'Deluxe': 4,
  'Premium Single': 10,
  'Premium Twin': 10,
  'Grand Premium': 2,
  'Corner Suite': 2,
  'Grand Deluxe': 4,
  'Executive Suite 1 Bedroom': 3,
  'Premium Suite': 2,
  'Grand Suite': 3,
};

// Room-key groups that share ONE physical pool of rooms (see point 1 above).
// Every key not listed here is its own standalone pool of one.
const SHARED_INVENTORY_POOLS = [
  ['Studio Single', 'Studio Twin'],
  ['Prestige Single', 'Prestige Twin'],
  ['Premium Single', 'Premium Twin'],
];

// Every room key sharing a physical pool with `name` (including itself) —
// what availability-checking code must count together against ONE limit.
function getInventoryPoolRooms(name) {
  const pool = SHARED_INVENTORY_POOLS.find((p) => p.includes(name));
  return pool || [name];
}

// A single canonical key identifying `name`'s whole pool, for locking
// purposes (so booking 'Studio Single' and 'Studio Twin' for the same dates
// take the SAME advisory lock instead of two independent ones).
function getInventoryPoolKey(name) {
  return getInventoryPoolRooms(name)[0];
}

// Every distinct physical pool, in ROOMS order, each as its full key list
// (['Studio Single','Studio Twin'], ['Deluxe'], …). The Site Editor renders
// ONE room-count input per pool rather than one per room key, so two labels
// that draw from the same physical rooms can never be given different counts
// — see routes/availability.js.
function inventoryPools() {
  const seen = new Set();
  const pools = [];
  Object.keys(ROOMS).forEach((name) => {
    if (seen.has(name)) return;
    const pool = getInventoryPoolRooms(name);
    pool.forEach((key) => seen.add(key));
    pools.push(pool);
  });
  return pools;
}

// Day-use rates (2026) — short 3-hour stays, flat THB price per BUILDING
// (not per room type — every room in a given building shares one day-use
// price), no breakfast/extra-guest surcharges. Mirrors
// assets/js/booking-page.js's DAYUSE array by hand (same no-shared-build-step
// caveat as ROOMS above). Used by POST /api/v1/payments/dayuse-booking to
// price a day-use request authoritatively rather than trusting the client.
const DAYUSE = {
  B1: 800,
  B2: 700,
  B3: 700,
  B4: 800,
  B5: 900,
};

function getDayUsePrice(room) {
  return Object.prototype.hasOwnProperty.call(DAYUSE, room) ? DAYUSE[room] : null;
}

function getRoom(name) {
  return Object.prototype.hasOwnProperty.call(ROOMS, name) ? ROOMS[name] : null;
}

function getVariant(name, variantLabel) {
  const room = getRoom(name);
  if (!room) return null;
  return room.variants.find((v) => v.label === variantLabel) || null;
}

function getInventory(name) {
  return Object.prototype.hasOwnProperty.call(ROOM_INVENTORY, name) ? ROOM_INVENTORY[name] : 0;
}

function roomKeys() {
  return Object.keys(ROOMS);
}

module.exports = {
  ROOMS, ROOM_INVENTORY, DEFAULT_SURCHARGES, DAYUSE,
  getRoom, getVariant, getInventory, roomKeys, getDayUsePrice,
  getInventoryPoolRooms, getInventoryPoolKey, inventoryPools,
};
