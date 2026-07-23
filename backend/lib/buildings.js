/* ============================================================
   J Park Hotel — which building is this guest in?

   The property is spread over five buildings (B1–B5; B5 is J Park
   Hall), so "Room 407" alone doesn't tell housekeeping where to walk.
   The building is read off the ROOM TYPE recorded on the booking,
   which is the one field every intake path fills in with the same
   kind of text:

     • direct website booking → guest_bookings.room, the room type the
       guest picked, e.g. "Studio B4"
     • OTA confirmation email → lib/otaEmailParser.js pulls the
       "Room type" line into that same column, e.g.
       "Deluxe Room, Building 2" / "Studio B4 (อาคาร 4)"

   so one matcher serves Agoda, Booking.com, Trip.com, a walk-in typed
   in by the front desk, and the website alike.

   Deliberately NEVER guessed from the room NUMBER. There is no
   room→building rule at this property (407 is not "building 4"), and
   a confidently wrong building sends staff to the far end of the site.
   No marker in the text → null, and the UI simply shows nothing.
   ============================================================ */

// Thai digits appear in Thai-language OTA confirmations.
const THAI_DIGITS = { '๑': '1', '๒': '2', '๓': '3', '๔': '4', '๕': '5' };

const PATTERNS = [
  /\bbuildings?\s*[-#]?\s*([1-5])\b/i,      // "Building 2", "Building-2"
  /\bbldgs?\.?\s*[-#]?\s*([1-5])\b/i,       // "Bldg 3", "Bldg. 3"
  /\bb\s*[-]?\s*([1-5])\b/i,                // "B4", "Studio B4", "B-4"
  /\b([1-5])\s*wing\b/i,                    // "4 wing"
  /\bwing\s*[-#]?\s*([1-5])\b/i,            // "Wing 4"
  /อาคาร\s*(?:บี)?\s*([1-5๑-๕])/,           // "อาคาร 2", "อาคารบี4"
  /ตึก\s*(?:บี)?\s*([1-5๑-๕])/,             // "ตึก 3"
  /ビル\s*([1-5])/,                          // Japanese "ビル5"
  /(?:第)?\s*([1-5])\s*(?:号)?(?:楼|棟|栋|館|馆)/, // zh/ja "5楼" / "第5号棟"
];

/* Building number (1–5) named anywhere in `text`, or null.
   Accepts a room type, a room name, or a whole confirmation-email body. */
function buildingFor(text) {
  if (!text) return null;
  const s = String(text);
  for (const re of PATTERNS) {
    const m = s.match(re);
    if (m) {
      const raw = m[1];
      const digit = THAI_DIGITS[raw] || raw;
      const n = parseInt(digit, 10);
      if (n >= 1 && n <= 5) return n;
    }
  }
  return null;
}

/* The building for a booking row.

   Prefers the stored guest_bookings.building, which is worked out ONCE at
   intake by resolveBuilding() below — that's the only moment the whole
   confirmation email is in hand, and re-reading that column on every lookup
   would put a large TEXT field back on the hot path (the exact egress
   mistake that suspended the database on 2026-07-13). Falls back to the room
   type for rows that predate the column. */
function buildingForBooking(booking) {
  if (!booking) return null;
  if (booking.building != null && booking.building !== '') {
    const n = parseInt(booking.building, 10);
    if (n >= 1 && n <= 5) return n;
  }
  return buildingFor(booking.room) || buildingFor(booking.room_type) || null;
}

/* Called at intake, where both the room type and the raw confirmation body
   are available. Some channels name the building on the room-type line
   ("Studio B4"), others only in the property/unit block further down the
   email, so both are checked — room type first, as it's the precise one. */
function resolveBuilding(roomType, confirmationText) {
  return buildingFor(roomType) || buildingFor(confirmationText) || null;
}

module.exports = { buildingFor, buildingForBooking, resolveBuilding };
