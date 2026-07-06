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

// name -> { maxGuests, variants: [{ label, room, bf }] }
// `room` = room-only THB/night, `bf` = room + breakfast THB/night.
const ROOMS = {
  'Studio Single':              { maxGuests: 2, variants: [{ label: 'Single', room: 990,  bf: 1110 }] },
  'Studio Twin':                { maxGuests: 2, variants: [{ label: 'Twin',   room: 990,  bf: 1300 }] },
  'Prestige Single':            { maxGuests: 2, variants: [{ label: 'Single', room: 1040, bf: 1160 }] },
  'Prestige Twin':              { maxGuests: 2, variants: [{ label: 'Twin',   room: 1040, bf: 1350 }] },
  'Studio B4':                  { maxGuests: 2, variants: [{ label: 'Single', room: 1070, bf: 1190 }, { label: 'Twin', room: 1070, bf: 1380 }] },
  'Deluxe':                     { maxGuests: 2, variants: [{ label: 'Single', room: 1110, bf: 1230 }, { label: 'Double', room: 1110, bf: 1420 }] },
  'Premium Single':             { maxGuests: 2, variants: [{ label: 'Single', room: 1160, bf: 1280 }] },
  'Premium Twin':                { maxGuests: 2, variants: [{ label: 'Twin', room: 1160, bf: 1470 }] },
  'Grand Premium':              { maxGuests: 2, variants: [{ label: 'Single', room: 1260, bf: 1380 }, { label: 'Twin', room: 1260, bf: 1570 }] },
  'Corner Suite':                { maxGuests: 2, variants: [{ label: 'Single', room: 1260, bf: 1380 }, { label: 'Twin', room: 1260, bf: 1570 }] },
  'Grand Deluxe':                { maxGuests: 2, variants: [{ label: 'Single', room: 1340, bf: 1460 }, { label: 'Double', room: 1340, bf: 1650 }] },
  'Executive Suite 1 Bedroom':  { maxGuests: 4, variants: [{ label: '1 Bedroom', room: 1850, bf: 1970 }, { label: '2 Bedrooms', room: 2100, bf: 2410 }] },
  'Premium Suite':               { maxGuests: 3, variants: [{ label: '1 Bedroom', room: 2100, bf: 2220 }, { label: '2 Bedrooms', room: 2100, bf: 2410 }] },
  'Grand Suite':                 { maxGuests: 4, variants: [{ label: '1 Bedroom', room: 2700, bf: 2820 }, { label: '2 Bedrooms', room: 3000, bf: 3310 }] },
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

module.exports = { ROOMS, ROOM_INVENTORY, getRoom, getVariant, getInventory, roomKeys };
