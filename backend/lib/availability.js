/* ============================================================
   J Park Hotel — room-availability queries against guest_bookings.

   countOverlapping() was moved here verbatim from backend/routes/payments.js
   (same SQL, same signature, same callers) so backend/lib/hotelAdsFeed.js
   can reuse it without importing a route file. countOverlappingByNight() is
   new: it answers "how many bookings hold this room on each night in a
   range" in one query, for the Google Hotel Ads feed's per-night
   availability counts (avoids one query per night per room type).
   ============================================================ */
const PENDING_HOLD_MINUTES = 20;

// Count bookings that hold a room of this type over the requested date
// range: confirmed bookings, plus still-pending ones inside their hold
// window (so two guests can't both grab the last room while one is mid
// PromptPay-scan or 3-D Secure challenge). `queryable` is either the pool
// or a transaction client, so callers can run this inside a lock.
async function countOverlapping(queryable, room, checkIn, checkOut) {
  const { rows } = await queryable.query(
    `SELECT COUNT(*)::int AS cnt
       FROM guest_bookings
      WHERE room = $1
        AND check_in < $3 AND check_out > $2
        AND (
          status = 'confirmed'
          OR (status = 'pending' AND created_at > NOW() - INTERVAL '${PENDING_HOLD_MINUTES} minutes')
        )`,
    [room, checkIn, checkOut]
  );
  return rows[0].cnt;
}

// Same overlap/hold rules as countOverlapping(), but returns a count per
// night across [startDate, endDateExclusive) in a single query instead of
// one call per night.
async function countOverlappingByNight(queryable, room, startDate, endDateExclusive) {
  const { rows } = await queryable.query(
    `SELECT d::date AS night, COUNT(gb.*)::int AS cnt
       FROM generate_series($2::date, $3::date - interval '1 day', interval '1 day') AS d
       LEFT JOIN guest_bookings gb
         ON gb.room = $1
        AND gb.check_in <= d AND gb.check_out > d
        AND (
          gb.status = 'confirmed'
          OR (gb.status = 'pending' AND gb.created_at > NOW() - INTERVAL '${PENDING_HOLD_MINUTES} minutes')
        )
      GROUP BY d
      ORDER BY d`,
    [room, startDate, endDateExclusive]
  );
  const out = {};
  rows.forEach((r) => {
    const key = r.night instanceof Date ? r.night.toISOString().slice(0, 10) : String(r.night);
    out[key] = r.cnt;
  });
  return out;
}

module.exports = { countOverlapping, countOverlappingByNight, PENDING_HOLD_MINUTES };
