/* ============================================================
   J Park Hotel — Google Hotel Ads feed data layer.

   Pure data-shaping only — no XML here (see backend/lib/xml.js and
   backend/routes/hotelAds.js). Reuses the exact same pricing source of
   truth guests are charged from (backend/lib/rateOverrides.js) so the feed
   can never drift from what a booking actually costs.

   THE ADVERTISED PRICE INCLUDES THE ONLINE PAYMENT FEE. A booking made on
   this website is paid on this website, so the gateway fee (lib/paymentFees.js)
   is not optional for anyone arriving through this feed — it is a mandatory
   charge, and Google requires mandatory charges to be inside the advertised
   price rather than added at checkout. Advertising the bare room rate would
   under-quote every itinerary by the same 3.9% and put the property's
   price accuracy in question across the whole module.

   Grossed up per NIGHT here, where the booking engine grosses up the whole
   stay total once. The two differ only by the whole-Baht rounding — under a
   Baht per stay — which is far inside any price-accuracy tolerance, and it
   errs high rather than low.

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
const paymentFees = require('./paymentFees');
const availability = require('./availability');
const ids = require('./hotelAdsIds');

// Cap the advertised "available" count — ROOM_INVENTORY now holds the real
// per-type physical room counts (see roomRates.js), which are already small,
// but Google only needs "plenty available" vs. "sold out", not the literal
// number, so this cap is kept as a ceiling regardless.
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
  // Admin-editable room counts (Site Editor "How many rooms"), read once for
  // the whole feed — advertising a stale ceiling would offer rooms the
  // booking guard then refuses.
  const inventoryMap = await rateOverrides.getEffectiveInventoryMap();
  /* Quoted at the CARD rate, the dearer of the two methods. A guest who pays
     by PromptPay is then charged slightly less than advertised, which is the
     only direction an advertised price is allowed to be wrong in. */
  const feeSchedule = await paymentFees.getEffectiveFees();
  const advertised = (rate) => paymentFees.quote(rate, 'card', feeSchedule).total;
  const plans = [];

  for (const name of roomRates.roomKeys()) {
    const room = rooms[name];
    if (!room) continue;
    const inventory = inventoryMap[name] || 0;
    let bookedByNight;
    try {
      // Single/Twin siblings share one physical pool (see roomRates.js) —
      // count every key in the pool, not just this one, so the feed never
      // advertises the same physical rooms as available twice over.
      bookedByNight = await availability.countOverlappingByNightPool(db, roomRates.getInventoryPoolRooms(name), start, end);
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
            // What a guest arriving from this listing actually pays for the
            // night, fee included — see the note at the top of this file.
            amount: advertised(rate),
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
