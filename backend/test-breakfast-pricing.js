// Regression test for the occupancy-tier breakfast calculation in
// lib/rateOverrides.js's effectiveBreakfastRate().
//
// Guards the bug where a 2-guest booking of a standalone "… Twin" room-type
// (Studio/Prestige/Premium Twin — separate ROOMS keys kept for Google Hotel
// Ads room-type IDs) was over-charged by one extra breakfast guest (190 THB):
// e.g. Studio Twin, 2 guests, with breakfast billed 1490 instead of 1300,
// because the old code assumed variants[0].bf was always the 1-guest rate
// when for a standalone Twin it is already the 2-guest rate.
//
// These functions are pure (they take `surcharges` explicitly and never touch
// the DB), so this runs offline against the static base rates in roomRates.js.
// Run: node test-breakfast-pricing.js
'use strict';

const roomRates = require('./lib/roomRates');
const rateOverrides = require('./lib/rateOverrides');

const S = roomRates.DEFAULT_SURCHARGES;

let passed = 0;
let failed = 0;

function check(label, actual, expected) {
  if (actual === expected) { passed++; console.log(`  ok   ${label}: ${JSON.stringify(actual)}`); }
  else { failed++; console.log(`  FAIL ${label}: got ${JSON.stringify(actual)} want ${JSON.stringify(expected)}`); }
}

// Breakfast rate for a room+variant at a given guest count (the value the
// fix changed). Looks the variant up in the static ROOMS mirror.
function bfRate(roomName, variantLabel, guests) {
  const room = roomRates.getRoom(roomName);
  const variant = room.variants.find((v) => v.label === variantLabel);
  return rateOverrides.effectiveBreakfastRate(room, variant, guests, S);
}

// Full per-night charge, replicating routes/payments.js's computeTotal()
// (rate + guest surcharge) without the DB override layer.
function perNight(roomName, variantLabel, breakfast, guests, childAges) {
  const room = roomRates.getRoom(roomName);
  const variant = room.variants.find((v) => v.label === variantLabel);
  const rate = breakfast ? rateOverrides.effectiveBreakfastRate(room, variant, guests, S) : variant.room;
  return rate + rateOverrides.computeGuestSurcharge(room, guests, breakfast, S, childAges);
}

console.log('Standalone "… Twin" room-types — 2-guest breakfast (the bug):');
check('Studio Twin / Twin @2 guests', bfRate('Studio Twin', 'Twin', 2), 1300);
check('Prestige Twin / Twin @2 guests', bfRate('Prestige Twin', 'Twin', 2), 1350);
check('Premium Twin / Twin @2 guests', bfRate('Premium Twin', 'Twin', 2), 1470);

console.log('\nEach "… Twin" @2 must equal its "… Single" @2 (front/back parity):');
check('Studio  Single@2 == Twin@2', bfRate('Studio Single', 'Single', 2), bfRate('Studio Twin', 'Twin', 2));
check('Prestige Single@2 == Twin@2', bfRate('Prestige Single', 'Single', 2), bfRate('Prestige Twin', 'Twin', 2));
check('Premium Single@2 == Twin@2', bfRate('Premium Single', 'Single', 2), bfRate('Premium Twin', 'Twin', 2));

console.log('\n1-guest breakfast normalises off base occupancy:');
check('Studio Single / Single @1 guest', bfRate('Studio Single', 'Single', 1), 1110);
check('Studio Twin   / Twin   @1 guest', bfRate('Studio Twin', 'Twin', 1), 1110);
check('Premium Twin  / Twin   @1 guest', bfRate('Premium Twin', 'Twin', 1), 1280);

console.log('\n3rd guest does NOT bump the breakfast rate (that guest is billed by computeGuestSurcharge):');
check('Studio Twin   / Twin   @3 guests (rate)', bfRate('Studio Twin', 'Twin', 3), 1300);
check('Studio Single / Single @3 guests (rate)', bfRate('Studio Single', 'Single', 3), 1300);

console.log('\nMerged & single-Single occupancy rooms are unchanged:');
check('Studio B4 / Single @2', bfRate('Studio B4', 'Single', 2), 1380);
check('Studio B4 / Twin   @2', bfRate('Studio B4', 'Twin', 2), 1380);
check('Deluxe / Single @2', bfRate('Deluxe', 'Single', 2), 1420);
check('Grand Deluxe / Single @2', bfRate('Grand Deluxe', 'Single', 2), 1650);
check('Premium Suite / 1 Bedroom @2', bfRate('Premium Suite', '1 Bedroom', 2), 2410);
check('Corner Suite / Single @2', bfRate('Corner Suite', 'Single', 2), 1570);
check('Corner Suite / Twin   @2', bfRate('Corner Suite', 'Twin', 2), 1570);

console.log('\nNon-occupancy rooms (room-only differs per variant) return variant.bf verbatim:');
check('Executive Suite 1BR (any guests)', bfRate('Executive Suite 1 Bedroom', '1 Bedroom', 2), 1970);
check('Executive Suite 2BR (any guests)', bfRate('Executive Suite 1 Bedroom', '2 Bedrooms', 2), 2410);
check('Grand Suite 1BR (any guests)', bfRate('Grand Suite', '1 Bedroom', 2), 2820);
check('Grand Suite 2BR (any guests)', bfRate('Grand Suite', '2 Bedrooms', 2), 3310);

console.log('\nEnd-to-end totals matching the reported confirmation email (Studio Twin, 1 night, 2 adults):');
check('Studio Twin, breakfast NO,  2 guests', perNight('Studio Twin', 'Twin', false, 2, []), 990);
check('Studio Twin, breakfast YES, 2 guests', perNight('Studio Twin', 'Twin', true, 2, []), 1300);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
