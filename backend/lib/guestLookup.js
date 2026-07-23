/* ============================================================
   J Park Hotel — "is this person actually staying with us?"

   One booking lookup shared by the two places a guest identifies
   themselves without a login:
     • POST /api/auth/guest-login   (homepage guest portal)
     • POST /api/chat/identify      (live-chat sign-in)
   Keeping it here means both accept exactly the same inputs and
   can never drift into answering differently for the same guest.
   ============================================================ */
const db = require('../db');

// Escape a value used inside a SQL LIKE/ILIKE pattern so caller-supplied `%`
// and `_` are matched literally instead of as wildcards (paired with ESCAPE
// '\' on the query). Without this, e.g. ref="%" matches every booking.
function escapeLike(s) {
  return String(s).replace(/[\\%_]/g, '\\$&');
}

const COLS = `id, ref, channel, channel_name, guest_name, guest_last_name,
              room, room_number, check_in, check_out, nights, adults, children, status`;

/* Find the booking a guest is identifying themselves with.

   Matching on the room accepts EITHER `room_number` — the physical room the
   front desk assigns at check-in, which is what a guest reads off their
   key-card sleeve — OR `room`, which despite the name holds a room *TYPE*
   ("deluxe"). Only the type was checked before, so a guest typing their actual
   room number could never sign in; the type is kept as a fallback because a
   guest whose room isn't assigned yet may well answer "Deluxe".

   Ordering prefers the stay that covers today (ICT), so a returning guest with
   several bookings is identified by the one they're actually here on rather
   than by whichever was booked most recently. */
async function findBooking({ ref, lastName, room }) {
  const hasRef = !!(ref && ref.trim());
  const hasNameRoom = !!(lastName && lastName.trim() && room && room.trim());
  if (!hasRef && !hasNameRoom) return null;

  const params = [];
  const clauses = [];
  if (hasRef) {
    params.push(escapeLike(ref.trim()));
    clauses.push(`ref ILIKE $${params.length} ESCAPE '\\'`);
  }
  if (hasNameRoom) {
    params.push(escapeLike(lastName.trim()));
    const last = params.length;
    params.push(room.trim());              // exact match against room_number
    const roomExact = params.length;
    params.push(escapeLike(room.trim()));  // pattern match against room type
    clauses.push(
      `(guest_last_name ILIKE $${last} ESCAPE '\\'` +
      ` AND (room_number = $${roomExact} OR room ILIKE $${params.length} ESCAPE '\\'))`
    );
  }

  const { rows } = await db.query(
    `SELECT ${COLS}
       FROM guest_bookings
      WHERE status != 'cancelled'
        AND (${clauses.join(' OR ')})
      ORDER BY ((NOW() AT TIME ZONE 'Asia/Bangkok')::date BETWEEN check_in AND check_out) DESC,
               check_in DESC
      LIMIT 1`,
    params
  );
  return rows[0] || null;
}

/* Where the guest is in their stay, for the staff console's booking strip:
   in_house (here right now), upcoming (arriving later) or past. Dates are
   plain DATEs and the hotel runs on ICT, so the comparison is done on the
   ICT calendar date rather than the server's local one. */
function stayStatus(bk) {
  if (!bk) return null;
  const today = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
  const ymd = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));
  const ci = ymd(bk.check_in);
  const co = ymd(bk.check_out);
  if (today < ci) return 'upcoming';
  if (today > co) return 'past';
  return 'in_house';
}

/* Did the guest who filed this request/order actually match a booking?

   Re-checked server-side from the booking ref the portal was issued at
   sign-in, rather than trusted from the request body — a client can claim
   anything. It is NOT a gate: an OTA or walk-in guest has no row in
   guest_bookings by design (see routes/guestBookings.js) and is served all
   the same. The flag only tells the front desk which requests to check
   against the register first. */
async function verifyGuest(bookingRef) {
  if (!bookingRef) return { verified: false, ref: null };
  try {
    const bk = await findBooking({ ref: bookingRef });
    return { verified: !!bk, ref: bk ? bk.ref : null };
  } catch (_) {
    return { verified: false, ref: null }; // never fail a guest request over this
  }
}

module.exports = { escapeLike, findBooking, stayStatus, verifyGuest };
