// Unit test for the admin-editable per-room-type room count (Site Editor
// "How many rooms"): backend/lib/roomRates.js's inventoryPools(),
// backend/lib/rateOverrides.js's getEffectiveInventoryMap() and
// backend/routes/availability.js's GET/PUT.
//
// The thing worth protecting here is the overbooking ceiling: a bad stored
// value, a half-saved shared pool, or a DB hiccup must never end up letting
// the booking guards sell more rooms than exist. No live DB needed — db.query
// is monkey-patched with an in-memory fake before anything that touches it is
// required, matching test-hotel-ads.js's no-server/no-DB convention.
// Run: node test-room-inventory.js
'use strict';

const db = require('./db');

let passed = 0;
let failed = 0;

function check(label, actual, expected) {
  const ok = actual === expected;
  if (ok) { passed++; console.log(`  ok   ${label}: ${JSON.stringify(actual)}`); }
  else { failed++; console.log(`  FAIL ${label}: got ${JSON.stringify(actual)} want ${JSON.stringify(expected)}`); }
}

function checkTrue(label, actual) { check(label, !!actual, true); }

// ── in-memory site_content ───────────────────────────────────────────────────
const store = { room_inventory: {}, unavailable_rooms: ['Deluxe'], unavailable_dayuse: [] };
let failReads = false;

db.query = async (sql, params) => {
  if (failReads) throw new Error('simulated DB outage');
  if (/SELECT room_inventory FROM site_content/.test(sql)) {
    return { rows: [{ room_inventory: store.room_inventory }] };
  }
  if (/SELECT unavailable_rooms, unavailable_dayuse FROM site_content/.test(sql)) {
    return { rows: [{ unavailable_rooms: store.unavailable_rooms, unavailable_dayuse: store.unavailable_dayuse }] };
  }
  if (/UPDATE site_content SET room_inventory/.test(sql)) {
    store.room_inventory = JSON.parse(params[0]);
    return { rows: [] };
  }
  if (/UPDATE site_content SET unavailable_rooms/.test(sql)) {
    store.unavailable_rooms = params[0];
    return { rows: [] };
  }
  if (/UPDATE site_content SET unavailable_dayuse/.test(sql)) {
    store.unavailable_dayuse = params[0];
    return { rows: [] };
  }
  return { rows: [] }; // INSERT … ON CONFLICT DO NOTHING, and every other read
};

// The PUT route is admin-gated; this test is about the validation/merge rules,
// not the auth layer (middleware/auth.js has its own coverage), so let every
// request through. Patched on the module object BEFORE routes/availability.js
// is required, so its destructured `requireAdmin` picks up this version.
const auth = require('./middleware/auth');
auth.requireAdmin = (_req, _res, next) => next();

const roomRates = require('./lib/roomRates');
const rateOverrides = require('./lib/rateOverrides');

// ── roomRates.inventoryPools ─────────────────────────────────────────────────
console.log('\n# roomRates.inventoryPools');
{
  const pools = roomRates.inventoryPools();
  const flat = pools.reduce((acc, p) => acc.concat(p), []);
  check('every room key appears exactly once across all pools', flat.length, roomRates.roomKeys().length);
  check('no duplicate keys across pools', new Set(flat).size, flat.length);
  checkTrue('every pooled key is a real room', flat.every((k) => !!roomRates.getRoom(k)));

  const studio = pools.find((p) => p.includes('Studio Single'));
  check('Studio Single/Twin share one pool', studio.join(' + '), 'Studio Single + Studio Twin');
  const deluxe = pools.find((p) => p.includes('Deluxe'));
  check('a room with no sibling is a pool of one', deluxe.length, 1);
}

// ── rateOverrides.isValidInventory ───────────────────────────────────────────
console.log('\n# rateOverrides.isValidInventory');
{
  check('accepts a whole number', rateOverrides.isValidInventory(7), true);
  check('accepts 0 (sell none of this type)', rateOverrides.isValidInventory(0), true);
  check('accepts the max', rateOverrides.isValidInventory(rateOverrides.MAX_INVENTORY), true);
  check('rejects above the max', rateOverrides.isValidInventory(rateOverrides.MAX_INVENTORY + 1), false);
  check('rejects negative', rateOverrides.isValidInventory(-1), false);
  check('rejects a fraction', rateOverrides.isValidInventory(2.5), false);
  check('rejects a numeric string', rateOverrides.isValidInventory('7'), false);
  check('rejects null', rateOverrides.isValidInventory(null), false);
  check('rejects NaN', rateOverrides.isValidInventory(NaN), false);
  check('rejects Infinity', rateOverrides.isValidInventory(Infinity), false);
}

(async () => {
  // ── rateOverrides.getEffectiveInventoryMap ─────────────────────────────────
  console.log('\n# rateOverrides.getEffectiveInventoryMap');
  {
    store.room_inventory = {};
    const map = await rateOverrides.getEffectiveInventoryMap();
    check('no overrides -> static ROOM_INVENTORY', map['Studio Single'], roomRates.ROOM_INVENTORY['Studio Single']);
    check('covers every room key', Object.keys(map).length, roomRates.roomKeys().length);

    store.room_inventory = { 'Deluxe': 6 };
    check('a valid override wins', (await rateOverrides.getEffectiveInventoryMap())['Deluxe'], 6);
    check('single-room lookup agrees', await rateOverrides.getEffectiveInventory('Deluxe'), 6);
    check('rooms with no override keep their static count',
      (await rateOverrides.getEffectiveInventoryMap())['Grand Suite'], roomRates.ROOM_INVENTORY['Grand Suite']);

    store.room_inventory = { 'Deluxe': 2.5, 'Grand Premium': -4, 'Corner Suite': '3', 'Premium Suite': 9 };
    const mixed = await rateOverrides.getEffectiveInventoryMap();
    check('a fractional stored value is ignored', mixed['Deluxe'], roomRates.ROOM_INVENTORY['Deluxe']);
    check('a negative stored value is ignored', mixed['Grand Premium'], roomRates.ROOM_INVENTORY['Grand Premium']);
    check('a string stored value is ignored', mixed['Corner Suite'], roomRates.ROOM_INVENTORY['Corner Suite']);
    check('one bad value does not poison the good ones', mixed['Premium Suite'], 9);

    store.room_inventory = { 'Not A Room': 12 };
    const unknown = await rateOverrides.getEffectiveInventoryMap();
    check('an unknown stored room never enters the map', unknown['Not A Room'], undefined);
    check('unknown stored room does not change the key count', Object.keys(unknown).length, roomRates.roomKeys().length);

    store.room_inventory = { 'Deluxe': 6 };
    failReads = true;
    const onOutage = await rateOverrides.getEffectiveInventoryMap();
    failReads = false;
    check('a DB read failure falls back to the static counts, never to unlimited',
      onOutage['Deluxe'], roomRates.ROOM_INVENTORY['Deluxe']);
  }

  // ── routes/availability.js over real HTTP, DB still faked ──────────────────
  console.log('\n# routes/availability.js — HTTP endpoints');
  store.room_inventory = {};
  const express = require('express');
  const availabilityRouter = require('./routes/availability');
  const app = express();
  app.use(express.json());
  app.use('/api/availability', availabilityRouter);
  const server = app.listen(0);
  const port = server.address().port;
  const http = require('http');

  function request(method, path, body) {
    return new Promise((resolve, reject) => {
      const payload = body == null ? null : JSON.stringify(body);
      const req = http.request(
        { host: 'localhost', port, path, method, headers: payload
          ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {} },
        (res) => {
          let raw = '';
          res.on('data', (c) => (raw += c));
          res.on('end', () => {
            let json = null;
            try { json = JSON.parse(raw); } catch (_e) { /* non-JSON body */ }
            resolve({ status: res.statusCode, body: json });
          });
        }
      );
      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    });
  }

  const initial = await request('GET', '/api/availability');
  check('GET status', initial.status, 200);
  check('GET reports every room count', Object.keys(initial.body.inventory).length, roomRates.roomKeys().length);
  check('GET reports the pools for the editor', initial.body.pools.length, roomRates.inventoryPools().length);
  check('GET still reports delisted rooms', initial.body.unavailable.join(','), 'Deluxe');

  const saved = await request('PUT', '/api/availability', { inventory: { 'Deluxe': 6 } });
  check('PUT a valid count', saved.status, 200);
  check('PUT echoes the new count', saved.body.inventory['Deluxe'], 6);
  check('PUT persisted it', (await request('GET', '/api/availability')).body.inventory['Deluxe'], 6);

  // The pool rule is the whole reason this card edits pools, not room keys:
  // editing either label must move BOTH, or the same physical rooms would be
  // sold to two different ceilings depending on which label a guest picked.
  const pooled = await request('PUT', '/api/availability', { inventory: { 'Studio Single': 4 } });
  check('editing one pool member sets it', pooled.body.inventory['Studio Single'], 4);
  check('editing one pool member sets its sibling too', pooled.body.inventory['Studio Twin'], 4);
  check('an unrelated room is untouched', pooled.body.inventory['Deluxe'], 6);

  const partial = await request('PUT', '/api/availability', { inventory: { 'Premium Suite': 1 } });
  check('a partial save keeps earlier counts', partial.body.inventory['Deluxe'], 6);
  check('a partial save keeps earlier pool counts', partial.body.inventory['Studio Twin'], 4);

  const zero = await request('PUT', '/api/availability', { inventory: { 'Corner Suite': 0 } });
  check('0 is a legitimate count (sell none)', zero.body.inventory['Corner Suite'], 0);

  const unknownRoom = await request('PUT', '/api/availability', { inventory: { 'Presidential Villa': 3 } });
  check('unknown room rejected', unknownRoom.status, 400);
  const fraction = await request('PUT', '/api/availability', { inventory: { 'Deluxe': 2.5 } });
  check('fractional count rejected', fraction.status, 400);
  const negative = await request('PUT', '/api/availability', { inventory: { 'Deluxe': -1 } });
  check('negative count rejected', negative.status, 400);
  const tooMany = await request('PUT', '/api/availability', { inventory: { 'Deluxe': 100000 } });
  check('absurd count rejected', tooMany.status, 400);
  const asString = await request('PUT', '/api/availability', { inventory: { 'Deluxe': '6' } });
  check('string count rejected', asString.status, 400);
  const asArray = await request('PUT', '/api/availability', { inventory: [] });
  check('array payload rejected', asArray.status, 400);
  check('no rejected write leaked through', (await request('GET', '/api/availability')).body.inventory['Deluxe'], 6);

  // The three controls in this route save independently.
  const delist = await request('PUT', '/api/availability', { unavailable: ['Grand Suite'] });
  check('saving availability does not clear the counts', delist.body.inventory['Deluxe'], 6);
  const counts = await request('PUT', '/api/availability', { inventory: { 'Deluxe': 5 } });
  check('saving counts does not clear the delisted list', counts.body.unavailable.join(','), 'Grand Suite');
  const empty = await request('PUT', '/api/availability', {});
  check('an empty body is rejected', empty.status, 400);

  server.close();

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
