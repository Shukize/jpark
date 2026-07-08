/* ============================================================
   J Park Hotel — Google Hotel Ads feed data layer.

   Pure data-shaping only — no XML here (see backend/lib/xml.js and
   backend/routes/hotelAds.js). Reuses the exact same pricing source of
   truth guests are charged from (backend/lib/rateOverrides.js) so the feed
   can never drift from what a booking actually costs.

   Deliberately out of scope:
   - Day-use bookings (backend/lib/roomRates.js's DAYUSE) — a flat 3-hour
     price with no per-night model, doesn't fit Google's ARI rate shape.
   - Guest-count surcharges (extraBed, extraBreakfastGuest) — the feed
     advertises the base-occupancy nightly rate only, same as how OTAs
     already list this property.
   ============================================================ */
const db = require('../db');
const roomRates = require('./roomRates');
const rateOverrides = require('./rateOverrides');
const availability = require('./availability');
const ids = require('./hotelAdsIds');

// Cap the advertised "available" count so Google never sees the internal
// placeholder ceiling (roomRates.ROOM_INVENTORY is deliberately set to 999
// per room type — see that file's comment — because the owner has said
// overbooking isn't a real-world concern here). Google only needs "plenty
// available" vs. "sold out", not the literal number.
const MAX_ADVERTISED_COUNT = 99;

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// Default lat/long geocoded from the exact address string below via
// OpenStreetMap Nominatim (independent public geocoder, not guessed) —
// matched the property by name and address ("J. Park Hotel", 88/88 Thanon
// Sukprayun / ถนนศุขประยูร, 20000). Overridable via env vars in case the
// owner's verified Google Business Profile records a different pin.
const DEFAULT_LAT = '13.3872779';
const DEFAULT_LNG = '101.0169145';

async function getHotelListData() {
  return {
    id: process.env.HOTEL_ADS_PROPERTY_ID || 'jparkhotel-chonburi',
    name: 'J Park Hotel',
    address: '88/88 Thanon Sukprayun, Na Pa, Mueang Chonburi District, Chon Buri 20000',
    country: 'TH',
    phone: '+66863260664',
    latitude: process.env.HOTEL_ADS_LAT || DEFAULT_LAT,
    longitude: process.env.HOTEL_ADS_LNG || DEFAULT_LNG,
  };
}

// { startDate, endDateExclusive } -> { hotelId, plans: [{ roomTypeId,
//   ratePlanId, roomName, variantLabel, breakfast, maxOccupancyBase,
//   nightly: [{ date, amount, currency, available, count }] }] }
async function getAriData({ startDate, endDateExclusive } = {}) {
  const start = startDate || todayStr();
  const end = endDateExclusive || addDays(start, 60);

  const rooms = await rateOverrides.getAllEffectiveRooms();
  const plans = [];

  for (const name of roomRates.roomKeys()) {
    const room = rooms[name];
    if (!room) continue;
    const inventory = roomRates.getInventory(name);
    let bookedByNight;
    try {
      bookedByNight = await availability.countOverlappingByNight(db, name, start, end);
    } catch (e) {
      console.error('[hotelAdsFeed] availability query failed, defaulting to 0 booked', e);
      bookedByNight = {};
    }

    room.variants.forEach((v) => {
      const isMultiGuest = /twin|double|2 bedroom/i.test(v.label);
      [false, true].forEach((breakfast) => {
        const rate = breakfast ? v.bf : v.room;
        const nightly = [];
        for (let d = start; d < end; d = addDays(d, 1)) {
          const booked = bookedByNight[d] || 0;
          const remaining = Math.max(0, inventory - booked);
          nightly.push({
            date: d,
            amount: rate,
            currency: 'THB',
            available: remaining > 0,
            count: Math.min(remaining, MAX_ADVERTISED_COUNT),
          });
        }
        plans.push({
          roomTypeId: ids.roomTypeId(name),
          ratePlanId: ids.ratePlanId(name, v.label, breakfast),
          roomName: name,
          variantLabel: v.label,
          breakfast,
          maxOccupancyBase: isMultiGuest ? 2 : 1,
          nightly,
        });
      });
    });
  }

  return { hotelId: process.env.HOTEL_ADS_PROPERTY_ID || 'jparkhotel-chonburi', startDate: start, endDateExclusive: end, plans };
}

module.exports = { getHotelListData, getAriData, MAX_ADVERTISED_COUNT };
