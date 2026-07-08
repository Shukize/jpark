/* ============================================================
   J Park Hotel — stable room-type / rate-plan IDs for the Google Hotel Ads
   feed (backend/lib/hotelAdsFeed.js, backend/routes/hotelAds.js).

   Every room type in this app is keyed only by a human-readable display
   name (e.g. "Studio Single", "Grand Suite" — see backend/lib/roomRates.js).
   Google's ARI feed needs a permanent, never-reused roomTypeId/ratePlanId
   per product instead. Rather than add a DB column or rename anything,
   these IDs are derived at runtime by slugifying the existing names.

   IMPORTANT: because these IDs are meant to be permanent once Google has
   ingested a feed referencing them, never rename an existing key in
   roomRates.js's ROOMS object without treating the resulting slug change as
   a breaking change to the live Google feed (Google's docs: a roomTypeId
   must never be reused for a different room once assigned).

   assets/js/booking-page.js's URL deep-link handler duplicates the same
   slugify() algorithm client-side (no shared build step between the static
   frontend and this Node backend) — keep the two in sync if this changes.
   ============================================================ */
const roomRates = require('./roomRates');

function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

const ROOM_SLUGS = {};
roomRates.roomKeys().forEach((name) => { ROOM_SLUGS[name] = slugify(name); });
const SLUG_TO_ROOM = Object.fromEntries(Object.entries(ROOM_SLUGS).map(([k, v]) => [v, k]));

function roomTypeId(roomName) {
  return Object.prototype.hasOwnProperty.call(ROOM_SLUGS, roomName) ? ROOM_SLUGS[roomName] : null;
}

// Breakfast is modeled as a distinct rate plan under the same room type
// (mirrors how `bf` is already just a second flat nightly number per
// variant in roomRates.js, not a separate add-on).
function ratePlanId(roomName, variantLabel, breakfast) {
  const rt = roomTypeId(roomName);
  if (!rt) return null;
  return `${rt}__${slugify(variantLabel)}__${breakfast ? 'bf' : 'ro'}`;
}

function parseRatePlanId(id) {
  const parts = String(id || '').split('__');
  if (parts.length !== 3) return null;
  const [rt, variantSlug, bfFlag] = parts;
  const roomName = SLUG_TO_ROOM[rt];
  if (!roomName) return null;
  const room = roomRates.getRoom(roomName);
  const variant = room.variants.find((v) => slugify(v.label) === variantSlug);
  if (!variant) return null;
  return { roomName, variantLabel: variant.label, breakfast: bfFlag === 'bf' };
}

// Full rate-plan catalog: one row per room x variant x breakfast state.
function allRatePlans() {
  const out = [];
  roomRates.roomKeys().forEach((name) => {
    const room = roomRates.getRoom(name);
    room.variants.forEach((v) => {
      [false, true].forEach((breakfast) => {
        out.push({
          roomName: name,
          roomTypeId: roomTypeId(name),
          variantLabel: v.label,
          breakfast,
          ratePlanId: ratePlanId(name, v.label, breakfast),
        });
      });
    });
  });
  return out;
}

module.exports = { slugify, roomTypeId, ratePlanId, parseRatePlanId, allRatePlans };
