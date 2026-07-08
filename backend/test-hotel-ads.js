// Unit test for the Google Hotel Ads feed (backend/lib/hotelAdsIds.js,
// backend/lib/hotelAdsFeed.js, backend/lib/xml.js, backend/routes/hotelAds.js).
// No live DB needed: db.query is monkey-patched with an in-memory fake before
// anything that touches it is required, matching test-ota-email.js's
// no-server/no-DB convention. Run: node test-hotel-ads.js
'use strict';

process.env.HOTEL_ADS_PROPERTY_ID = 'jparkhotel-chonburi';

const db = require('./db');
const roomRates = require('./lib/roomRates');
const hotelAdsIds = require('./lib/hotelAdsIds');
const { escapeXml } = require('./lib/xml');

let passed = 0;
let failed = 0;

function check(label, actual, expected) {
  const ok = actual === expected;
  if (ok) { passed++; console.log(`  ok   ${label}: ${JSON.stringify(actual)}`); }
  else { failed++; console.log(`  FAIL ${label}: got ${JSON.stringify(actual)} want ${JSON.stringify(expected)}`); }
}

function checkTrue(label, actual) { check(label, !!actual, true); }

// ── hotelAdsIds: catalog shape and stability ────────────────────────────────
console.log('\n# hotelAdsIds — rate-plan catalog');
{
  const plans = hotelAdsIds.allRatePlans();
  const expectedVariantCount = roomRates.roomKeys()
    .reduce((sum, name) => sum + roomRates.getRoom(name).variants.length, 0);
  check('total rate plans (2x variant count for breakfast on/off)', plans.length, expectedVariantCount * 2);

  const ids = plans.map((p) => p.ratePlanId);
  check('all ratePlanIds unique', new Set(ids).size, ids.length);

  const sample = plans.find((p) => p.roomName === 'Studio Single' && !p.breakfast);
  check('roomTypeId slug', sample.roomTypeId, 'studio-single');
  check('ratePlanId slug', sample.ratePlanId, 'studio-single__single__ro');

  const parsed = hotelAdsIds.parseRatePlanId(sample.ratePlanId);
  check('parseRatePlanId round-trips roomName', parsed.roomName, sample.roomName);
  check('parseRatePlanId round-trips variantLabel', parsed.variantLabel, sample.variantLabel);
  check('parseRatePlanId round-trips breakfast', parsed.breakfast, sample.breakfast);
  check('parseRatePlanId returns null for garbage', hotelAdsIds.parseRatePlanId('not-a-real-id'), null);
}

// ── xml.escapeXml ────────────────────────────────────────────────────────────
console.log('\n# xml.escapeXml');
{
  check('escapes all five special chars', escapeXml(`Tom & "Jerry" <O'Brien's>`),
    'Tom &amp; &quot;Jerry&quot; &lt;O&apos;Brien&apos;s&gt;');
  check('null/undefined -> empty string', escapeXml(null), '');
  check('numbers pass through as strings', escapeXml(990), '990');
}

// ── hotelAdsFeed, with a mocked DB ──────────────────────────────────────────
console.log('\n# hotelAdsFeed — with mocked guest_bookings');
db.query = async (sql, params) => {
  if (/FROM site_content/.test(sql)) return { rows: [] }; // no admin overrides
  if (/generate_series/.test(sql)) {
    // Sold out on the first night only, for one room, to exercise the
    // available:false / Status="Close" path.
    const [room, start, end] = params;
    const rows = [];
    let d = new Date(start + 'T00:00:00Z');
    const endD = new Date(end + 'T00:00:00Z');
    let i = 0;
    while (d < endD) {
      rows.push({ night: d.toISOString().slice(0, 10), cnt: (room === 'Studio Single' && i === 0) ? 999 : 0 });
      d.setUTCDate(d.getUTCDate() + 1);
      i++;
    }
    return { rows };
  }
  return { rows: [] };
};

const hotelAdsFeed = require('./lib/hotelAdsFeed');

(async () => {
  const hotel = await hotelAdsFeed.getHotelListData();
  check('hotel id', hotel.id, 'jparkhotel-chonburi');
  check('hotel country', hotel.country, 'TH');
  checkTrue('hotel has a phone', hotel.phone && hotel.phone.length > 0);
  checkTrue('hotel has default lat/long (geocoded, not blocked on owner)', !!hotel.latitude && !!hotel.longitude);

  const data = await hotelAdsFeed.getAriData({ startDate: '2026-08-01', endDateExclusive: '2026-08-04' });
  check('ari nightly window length (3 nights)', data.plans[0].nightly.length, 3);
  const studioSingleRO = data.plans.find((p) => p.roomName === 'Studio Single' && !p.breakfast);
  check('rate matches roomRates static base (no admin override present)', studioSingleRO.nightly[0].amount, roomRates.getRoom('Studio Single').variants[0].room);
  check('sold-out night reports available:false', studioSingleRO.nightly[0].available, false);
  check('sold-out night reports count:0', studioSingleRO.nightly[0].count, 0);
  check('open night reports available:true', studioSingleRO.nightly[1].available, true);
  checkTrue('day-use rooms excluded (no DAYUSE-only rooms in plans)', data.plans.every((p) => roomRates.getRoom(p.roomName)));

  // ── routes/hotelAds.js — end-to-end over real HTTP, DB still mocked ───────
  console.log('\n# routes/hotelAds.js — HTTP endpoints');
  const express = require('express');
  const hotelAdsRouter = require('./routes/hotelAds');
  const app = express();
  app.use('/api/v1/hotel-ads', hotelAdsRouter);
  const server = app.listen(0);
  const port = server.address().port;
  const http = require('http');

  function get(p) {
    return new Promise((resolve, reject) => {
      http.get(`http://localhost:${port}${p}`, (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => resolve({ status: res.statusCode, contentType: res.headers['content-type'], body }));
      }).on('error', reject);
    });
  }

  // Minimal hand-rolled well-formedness check (tag-stack scan) — deliberately
  // not a real XML-validating dependency, consistent with this repo's
  // dependency-light style; good enough to catch a broken template literal.
  function isWellFormed(xml) {
    const re = /<(\/?)([a-zA-Z][\w:-]*)([^>]*?)(\/?)>/g;
    const stack = [];
    let m;
    while ((m = re.exec(xml))) {
      const [, closing, tag, , selfClose] = m;
      if (xml.slice(m.index, m.index + 2) === '<?') continue; // <?xml ... ?>
      if (selfClose) continue;
      if (closing) {
        const top = stack.pop();
        if (top !== tag) return false;
      } else {
        stack.push(tag);
      }
    }
    return stack.length === 0;
  }

  const hl = await get('/api/v1/hotel-ads/hotel-list.xml');
  check('hotel-list.xml status', hl.status, 200);
  checkTrue('hotel-list.xml content-type is XML', /application\/xml/i.test(hl.contentType));
  checkTrue('hotel-list.xml well-formed', isWellFormed(hl.body));
  checkTrue('hotel-list.xml contains property id', hl.body.includes('jparkhotel-chonburi'));

  const ari = await get('/api/v1/hotel-ads/ari.xml?start=2026-08-01&end=2026-08-04');
  check('ari.xml status', ari.status, 200);
  checkTrue('ari.xml well-formed', isWellFormed(ari.body));
  checkTrue('ari.xml contains a sold-out night', ari.body.includes('Status="Close"'));
  checkTrue('ari.xml contains open nights', ari.body.includes('Status="Open"'));

  process.env.HOTEL_ADS_FEED_SECRET = 'test-secret-value';
  const denied = await get('/api/v1/hotel-ads/hotel-list.xml');
  check('feed key required once HOTEL_ADS_FEED_SECRET is set', denied.status, 401);
  const allowed = await get('/api/v1/hotel-ads/hotel-list.xml?key=test-secret-value');
  check('feed key accepted with correct ?key=', allowed.status, 200);
  delete process.env.HOTEL_ADS_FEED_SECRET;

  server.close();

  console.log(`\n${passed} passed, ${failed} failed.`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error('UNCAUGHT ERROR', e);
  process.exit(1);
});
