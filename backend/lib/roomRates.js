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
  extraBed: 500,            // physical rollaway bed for a 3rd guest, per night
  extraBreakfastGuest: 190, // each guest beyond the variant's base 2, per night, when breakfast is selected
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

// Physical room count per type. The owner has said overbooking isn't a
// real-world concern for this property, so these are deliberately set high
// (not the true physical count) so the overbooking guard never realistically
// triggers. If that changes, replace with the real per-type room counts.
const ROOM_INVENTORY = {
  'Studio Single': 999,
  'Studio Twin': 999,
  'Prestige Single': 999,
  'Prestige Twin': 999,
  'Studio B4': 999,
  'Deluxe': 999,
  'Premium Single': 999,
  'Premium Twin': 999,
  'Grand Premium': 999,
  'Corner Suite': 999,
  'Grand Deluxe': 999,
  'Executive Suite 1 Bedroom': 999,
  'Premium Suite': 999,
  'Grand Suite': 999,
};

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

module.exports = { ROOMS, ROOM_INVENTORY, DEFAULT_SURCHARGES, DAYUSE, getRoom, getVariant, getInventory, roomKeys, getDayUsePrice };
