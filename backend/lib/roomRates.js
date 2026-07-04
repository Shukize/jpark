/* ============================================================
   J Park Hotel — server-side room rate + inventory mirror.

   This is the ONLY source the payment endpoint trusts for price and
   room-type capacity. The client (assets/js/booking-page.js) tells us
   WHICH room/variant/dates a guest wants — never a price — and this
   file is used to recompute the authoritative total server-side.

   IMPORTANT: this list must be kept in sync by hand with the ROOMS
   array in assets/js/booking-page.js (name, maxGuests, variants/rates).
   There is no shared build step between frontend and backend, so a
   rate change on the booking page must be mirrored here too.
   ============================================================ */

// name -> { maxGuests, variants: [{ label, room, bf }] }
// `room` = room-only THB/night, `bf` = room + breakfast THB/night.
const ROOMS = {
  'Studio Single':              { maxGuests: 2, variants: [{ label: 'Single', room: 990,  bf: 1110 }] },
  'Prestige Single':            { maxGuests: 2, variants: [{ label: 'Single', room: 1040, bf: 1160 }] },
  'Prestige Twin':              { maxGuests: 2, variants: [{ label: 'Twin',   room: 1040, bf: 1350 }] },
  'Studio B4':                  { maxGuests: 2, variants: [{ label: 'Single', room: 1070, bf: 1190 }, { label: 'Twin', room: 1070, bf: 1380 }] },
  'Deluxe':                     { maxGuests: 2, variants: [{ label: 'Single', room: 1110, bf: 1230 }, { label: 'Double', room: 1110, bf: 1420 }] },
  'Premium Single':             { maxGuests: 2, variants: [{ label: 'Single', room: 1160, bf: 1280 }] },
  'Premium Twin':                { maxGuests: 2, variants: [{ label: 'Twin', room: 1160, bf: 1470 }] },
  'Grand Premium':              { maxGuests: 2, variants: [{ label: 'Single', room: 1260, bf: 1380 }, { label: 'Twin', room: 1260, bf: 1570 }] },
  'Corner Suite':                { maxGuests: 2, variants: [{ label: 'Single', room: 1260, bf: 1380 }, { label: 'Twin', room: 1260, bf: 1570 }] },
  'Grand Deluxe':                { maxGuests: 2, variants: [{ label: 'Single', room: 1340, bf: 1460 }, { label: 'Double', room: 1340, bf: 1650 }] },
  'Executive Suite 1 Bedroom':  { maxGuests: 4, variants: [{ label: '1 Bedroom', room: 1850, bf: 1970 }] },
  'Premium Suite':               { maxGuests: 3, variants: [{ label: '1 Bedroom', room: 2100, bf: 2220 }, { label: '2 Bedrooms', room: 2100, bf: 2410 }] },
  'Grand Suite':                 { maxGuests: 4, variants: [{ label: '1 Bedroom', room: 2700, bf: 2820 }, { label: '2 Bedrooms', room: 3000, bf: 3310 }] },
};

// Physical room count per type. PLACEHOLDER VALUES — the hotel owner
// must correct these to the real counts before go-live (see
// docs/PAYMENTS_SETUP.md). Used only to block overbooking; wrong
// numbers here mean rooms are wrongly blocked (too low) or oversold
// (too high), not a crash, but they should be set correctly ASAP.
const ROOM_INVENTORY = {
  'Studio Single': 5,
  'Prestige Single': 5,
  'Prestige Twin': 5,
  'Studio B4': 5,
  'Deluxe': 5,
  'Premium Single': 5,
  'Premium Twin': 5,
  'Grand Premium': 5,
  'Corner Suite': 5,
  'Grand Deluxe': 5,
  'Executive Suite 1 Bedroom': 3,
  'Premium Suite': 3,
  'Grand Suite': 3,
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
