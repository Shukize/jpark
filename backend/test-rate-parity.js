// Guards against exactly the drift risk documented in roomRates.js/
// booking-page.js's own comments: those two files hand-mirror the same room
// names, variant labels, room/breakfast rates, day-use prices and surcharges
// with no shared build step, so nothing previously caught it if they ever
// disagreed. This test extracts booking-page.js's static ROOMS/DAYUSE/
// SURCHARGES literals (browser-only file, not a Node module — no DOM/window
// access needed for this data, so it's read as text and evaluated in
// isolation) and diffs every number against roomRates.js, the backend's
// authoritative source. A mismatch here means a guest could be shown one
// price and charged another. Run: node test-rate-parity.js
'use strict';

const fs = require('fs');
const path = require('path');
const roomRates = require('./lib/roomRates');

let passed = 0;
let failed = 0;

function check(label, actual, expected) {
  const ok = actual === expected;
  if (ok) { passed++; console.log(`  ok   ${label}: ${JSON.stringify(actual)}`); }
  else { failed++; console.log(`  FAIL ${label}: got ${JSON.stringify(actual)} want ${JSON.stringify(expected)}`); }
}

// Extracts the literal assigned to `var <name> = <literal>;` from a JS source
// string by bracket-depth scanning (skipping over string contents, so
// bracket-looking characters inside room names/amenity text never confuse
// it), then safely evaluates just that isolated literal — no other code in
// the source file is ever executed.
function extractLiteral(source, varName) {
  const marker = `var ${varName} = `;
  const start = source.indexOf(marker);
  if (start === -1) throw new Error(`Could not find "${marker}" in booking-page.js`);
  const openIdx = start + marker.length;
  const open = source[openIdx];
  const close = open === '[' ? ']' : '}';
  if (open !== '[' && open !== '{') {
    throw new Error(`Expected "${varName}" to start with [ or {, found "${open}"`);
  }
  let depth = 0;
  let inString = null; // null | "'" | '"'
  let i = openIdx;
  for (; i < source.length; i++) {
    const c = source[i];
    if (inString) {
      if (c === '\\') { i++; continue; } // skip escaped char
      if (c === inString) inString = null;
      continue;
    }
    if (c === "'" || c === '"') { inString = c; continue; }
    if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) { i++; break; }
    }
  }
  const literalText = source.slice(openIdx, i);
  // eslint-disable-next-line no-new-func
  return new Function(`return ${literalText}`)();
}

const bookingPageSrc = fs.readFileSync(path.join(__dirname, '../assets/js/booking-page.js'), 'utf8');
const clientRooms = extractLiteral(bookingPageSrc, 'ROOMS');
const clientDayUse = extractLiteral(bookingPageSrc, 'DAYUSE');
const clientSurcharges = extractLiteral(bookingPageSrc, 'SURCHARGES');

console.log('\n# Room rate parity — backend/lib/roomRates.js vs assets/js/booking-page.js');

const serverRoomNames = new Set(roomRates.roomKeys());
const clientRoomNames = new Set(clientRooms.map((r) => r.name));

for (const name of serverRoomNames) {
  check(`"${name}" exists in booking-page.js`, clientRoomNames.has(name), true);
}
for (const name of clientRoomNames) {
  check(`"${name}" exists in roomRates.js`, serverRoomNames.has(name), true);
}

clientRooms.forEach((clientRoom) => {
  const serverRoom = roomRates.getRoom(clientRoom.name);
  if (!serverRoom) return; // already flagged as a missing-room mismatch above

  check(`"${clientRoom.name}" maxGuests`, clientRoom.maxGuests, serverRoom.maxGuests);
  check(`"${clientRoom.name}" extraBedAvailable`, clientRoom.extraBedAvailable, serverRoom.extraBedAvailable);

  const serverLabels = new Set(serverRoom.variants.map((v) => v.label));
  const clientLabels = new Set(clientRoom.variants.map((v) => v.label));
  for (const label of serverLabels) {
    check(`"${clientRoom.name}" — ${label} variant exists client-side`, clientLabels.has(label), true);
  }
  for (const label of clientLabels) {
    check(`"${clientRoom.name}" — ${label} variant exists server-side`, serverLabels.has(label), true);
  }

  clientRoom.variants.forEach((cv) => {
    const sv = serverRoom.variants.find((v) => v.label === cv.label);
    if (!sv) return; // already flagged above
    check(`"${clientRoom.name}" — ${cv.label} room-only rate`, cv.room, sv.room);
    check(`"${clientRoom.name}" — ${cv.label} room+breakfast rate`, cv.bf, sv.bf);
  });
});

console.log('\n# Day-use rate parity');
const serverDayUseRooms = new Set(Object.keys(roomRates.DAYUSE));
const clientDayUseRooms = new Set(clientDayUse.map((d) => d.room));
for (const room of serverDayUseRooms) {
  check(`day-use "${room}" exists in booking-page.js`, clientDayUseRooms.has(room), true);
}
for (const room of clientDayUseRooms) {
  check(`day-use "${room}" exists in roomRates.js`, serverDayUseRooms.has(room), true);
}
clientDayUse.forEach((d) => {
  const serverPrice = roomRates.DAYUSE[d.room];
  if (serverPrice === undefined) return; // already flagged above
  check(`day-use "${d.room}" price`, d.price, serverPrice);
});

console.log('\n# Surcharge parity');
const serverSurchargeKeys = new Set(Object.keys(roomRates.DEFAULT_SURCHARGES));
const clientSurchargeKeys = new Set(Object.keys(clientSurcharges));
for (const key of serverSurchargeKeys) {
  check(`surcharge "${key}" exists in booking-page.js`, clientSurchargeKeys.has(key), true);
}
for (const key of clientSurchargeKeys) {
  check(`surcharge "${key}" exists in roomRates.js`, serverSurchargeKeys.has(key), true);
}
serverSurchargeKeys.forEach((key) => {
  if (!clientSurchargeKeys.has(key)) return; // already flagged above
  check(`surcharge "${key}" value`, clientSurcharges[key], roomRates.DEFAULT_SURCHARGES[key]);
});

/* ── Homepage "from ฿X / night" parity ──────────────────────────────────
   assets/js/room-prices.js carries a THIRD mirror of the room-only rates, so
   the homepage can name a price before any API call resolves (the card
   acquirer requires a visible Thai Baht price, and a blank card while the
   database wakes would not satisfy that). Same drift risk as booking-page.js
   above, so the same guard: every rate in that table is diffed against
   roomRates.js, in both directions, on every build. */
console.log('\n# Homepage from-price parity (assets/js/room-prices.js)');
const pricesSrc = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'room-prices.js'), 'utf8');
const fromMatch = pricesSrc.match(/var FROM_RATES = (\{[\s\S]*?\n\s*\});/);
if (!fromMatch) {
  check('FROM_RATES table found in room-prices.js', false, true);
} else {
  // eslint-disable-next-line no-new-func
  const clientFrom = new Function(`return ${fromMatch[1]}`)();
  const serverRooms = roomRates.roomKeys();

  for (const room of serverRooms) {
    check(`room "${room}" priced on the homepage`, Object.prototype.hasOwnProperty.call(clientFrom, room), true);
  }
  for (const room of Object.keys(clientFrom)) {
    check(`homepage room "${room}" exists in roomRates.js`, serverRooms.includes(room), true);
  }
  for (const room of serverRooms) {
    if (!clientFrom[room]) continue; // already flagged above
    roomRates.getRoom(room).variants.forEach((v) => {
      check(`from-price "${room}" / "${v.label}"`, clientFrom[room][v.label], v.room);
    });
    // A variant the homepage invents would price a room the guest cannot book.
    Object.keys(clientFrom[room]).forEach((label) => {
      const known = roomRates.getRoom(room).variants.some((v) => v.label === label);
      check(`homepage variant "${room}" / "${label}" exists in roomRates.js`, known, true);
    });
  }
}

console.log(`\n${passed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
