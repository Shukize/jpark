/* ============================================================
   J Park Hotel — what the front desk may change on a request

   The Guest Requests board is ONE board fed by two tables:
   service_requests (housekeeping / maintenance / front desk) and
   orders (in-room dining). The console merges them and shows the
   same controls on every card, so the two routes have to accept
   exactly the same PATCH body — a field honoured by one and
   ignored by the other shows up as a button that silently does
   nothing on half the cards.

   Hence this builder: it turns a staff PATCH body into the SET
   fragments both routes run, in one place, so they cannot drift.

   The rule it enforces, and the reason it is server-side: the
   client may not assert that a guest is verified, or which
   building they are in. It may only name a booking REFERENCE; the
   verified flag, building and room type are then read back off
   that booking here (same as at intake — see lib/guestLookup.js).
   This mirrors PATCH /api/chat/:guestId/confirm-guest, which
   likewise refuses to take the badge's word from the browser.
   ============================================================ */
const { verifyGuest } = require('./guestLookup');

const MAX_NOTE = 500;

/* Build the SET list for a staff PATCH.

   body     the request body
   user     req.user (the signed-in staff member — stamped as confirmed_by)
   opts     { guestNoteColumn } — 'note' on service_requests, 'notes' on
            orders. The two tables spell the guest's own note differently;
            everything else has identical column names by design.

   Returns { error } on a bad value, or { sets, vals } where `sets` are
   fragments already numbered from $1 and the caller appends the row id as the
   next parameter. Empty `sets` means the body asked for nothing. */
async function buildStaffPatch(body, user, opts) {
  const b = body || {};
  const guestNoteColumn = (opts && opts.guestNoteColumn) || 'note';
  const sets = [];
  const vals = [];
  const set = (column, value) => {
    vals.push(value);
    sets.push(`${column} = $${vals.length}`);
  };
  // Only keys the caller actually sent are touched. Deliberately not
  // COALESCE($n, col): that idiom cannot express "clear this field", so a
  // staff note or an assignment could be added but never taken back.
  const sent = (key) => Object.prototype.hasOwnProperty.call(b, key);
  const str = (v, max) => (v == null || v === '' ? null : String(v).trim().slice(0, max) || null);

  /* The front desk's own note — never written to the guest's note column. */
  if (sent('staffNote')) set('staff_note', str(b.staffNote, MAX_NOTE));

  /* The guest's note, kept editable for the rare correction (a phoned-in
     amendment to what they asked for). */
  if (sent('note') || sent('notes')) {
    set(guestNoteColumn, str(sent('note') ? b.note : b.notes, MAX_NOTE));
  }

  /* Filed while testing the portal. Kept, not deleted, so it can be
     un-marked — but the console stops counting it. */
  if (sent('test') || sent('isTest')) {
    set('is_test', !!(sent('test') ? b.test : b.isTest));
  }

  /* Who is walking to the room. Passing a null id releases the request back
     to the queue, so both columns clear together. */
  if (sent('assignedStaffId') || sent('assignedStaffName')) {
    const id = str(b.assignedStaffId, 50);
    set('assigned_staff_id', id);
    set('assigned_staff_name', id ? str(b.assignedStaffName, 100) : null);
  }

  /* Manual overrides, for a walk-in with no booking anywhere on file. The
     building is NEVER guessed from the room number (see lib/buildings.js) —
     this is a human reading it off the key-card sleeve. */
  if (sent('building')) {
    if (b.building == null || b.building === '') {
      set('building', null);
    } else {
      const n = parseInt(b.building, 10);
      if (!(n >= 1 && n <= 5)) return { error: 'building must be 1-5 or null' };
      set('building', n);
    }
  }
  if (sent('roomNumber') || sent('room')) {
    const room = str(sent('roomNumber') ? b.roomNumber : b.room, 10);
    if (!room) return { error: 'roomNumber cannot be empty' };
    set('room_number', room);
  }
  if (sent('roomType')) set('room_type', str(b.roomType, 50));

  /* "Link to booking": staff found the reservation by hand. The booking is
     re-read here rather than trusted from the body, so a linked request is
     verified by the same lookup an automatic match goes through. */
  if (sent('bookingRef')) {
    const ref = str(b.bookingRef, 100);
    if (ref) {
      const who = await verifyGuest(ref);
      if (!who.verified) return { error: 'No booking matches that reference' };
      set('guest_verified', true);
      set('booking_ref', who.ref);
      set('confirmed_by', str(user && user.name, 100));
      // Only overwrite these when the booking actually names them — a booking
      // whose room type doesn't say which building must not wipe a building a
      // staff member already filled in by hand.
      if (who.building != null) set('building', who.building);
      if (who.roomType) set('room_type', who.roomType);
    } else {
      // Unlinking a wrong match. The building/room type stay: they may have
      // been corrected by hand, and they're the part staff walk on.
      set('guest_verified', false);
      set('booking_ref', null);
      set('confirmed_by', null);
    }
  }

  return { sets, vals };
}

module.exports = { buildStaffPatch };
