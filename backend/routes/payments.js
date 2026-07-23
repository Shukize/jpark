/* ============================================================
   J Park Hotel — online reservations (no online payment).
   Permanent policy: the site never collects payment online. A reservation
   made here is confirmed immediately (it holds the room-type inventory the
   same way a paid booking would); the guest pays in person at check-in by
   cash, credit/debit card, or PromptPay QR at the front desk. Mounted at
   /api/v1 in server.js:
     GET  /api/v1/booking-availability    -> { [room]: remainingCount }
     POST /api/v1/reservations            -> create a confirmed overnight booking
     POST /api/v1/payments/dayuse-booking -> pending 3-hour day-use request

   Security notes:
   - The client only ever tells us WHICH room/variant/dates it wants; the
     price is always recomputed here from lib/rateOverrides.js (which merges
     lib/roomRates.js's static base rates with any live admin edits saved via
     the Site Editor's Rates tab). Never trust a client-supplied amount.
   ============================================================ */
const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const roomRates = require('../lib/roomRates');
const rateOverrides = require('../lib/rateOverrides');
const { countOverlapping } = require('../lib/availability');
const { makeLimiter } = require('../lib/rateLimit');
const { sendEmail } = require('../mailer');
const {
  row2js,
  fireBookingEmails,
  fireGroupBookingEmails,
  computeNights,
  hotelNotice,
  hotelRecipients,
  emailLetterhead,
  escapeHtml: esc,
  SPAM_NOTE_TEXT,
  SPAM_NOTE_HTML,
} = require('./guestBookings');

const router = express.Router();

// Hard cap on rooms in a single multi-room ("group") booking — a sanity
// bound against an abusive/accidental huge payload, comfortably above any
// real family/tour booking.
const MAX_GROUP_ROOMS = 8;

// Guards against scripted flooding of the reservation endpoint (each
// submission triggers two emails and an inventory-lock query) WITHOUT ever
// turning a real guest away.
//
// This was 10 per 10 minutes per IP, which is a booking-losing ceiling: the
// hotel's own Wi-Fi is one NAT address, Thai mobile carriers are heavily
// CGNAT'd, and an office or a wedding party books from a single egress IP —
// so the 11th reservation from a whole building was refused. Worse, the
// limiter counts ATTEMPTS, so ten failed validations from one guest (a typo'd
// email, a date they kept changing) locked that guest out for ten minutes at
// the final step of the funnel, with nobody told it happened.
//
// Same shape as the guest-login limiters in routes/auth.js: a loose per-IP
// ceiling that a whole building can share, plus a tight per-device budget
// that stops one scripted browser hammering the endpoint.
const rateLimited = makeLimiter(120, 10 * 60 * 1000);
const deviceRateLimited = makeLimiter(12, 10 * 60 * 1000);

// The booking page sends a stable per-browser id; fall back to the IP so a
// caller that omits it is still bounded.
function bookingDeviceKey(req) {
  const b = req.body || {};
  const raw = b.clientId || b.deviceId || b.guestId ||
    (req.get && (req.get('X-JPark-Device') || req.get('x-jpark-device')));
  return raw ? 'd:' + String(raw).slice(0, 64) : 'ip:' + (req.ip || 'unknown');
}
function bookingRateLimited(req) {
  return rateLimited(req.ip || 'unknown') || deviceRateLimited(bookingDeviceKey(req));
}

function genRef() {
  return 'JP-' + Date.now().toString(36).toUpperCase() + '-' + crypto.randomBytes(2).toString('hex').toUpperCase();
}

// `totalGuests` (adults+children) drives two optional per-night surcharges
// on top of the variant's own room/bf rate (which already covers the
// variant's base occupancy — 1 for Single/1 Bedroom, 2 for Twin/Double/2
// Bedrooms): an extra breakfast guest (+surcharges.extraBreakfastGuest, only
// when breakfast is selected) and a physical extra bed
// (+surcharges.extraBed, only for rooms with extraBedAvailable) — see
// backend/lib/rateOverrides.js's computeGuestSurcharge(). For an occupancy-
// tier room (Single/Twin/Double variants all share the same room-only
// rate — the label is a bed-style preference, not a different product),
// the breakfast rate itself is also derived from the ADULT count rather than
// the submitted variant, via effectiveBreakfastRate() — see its comment.
// Adults, not total guests: a child is priced exactly once, by age, inside
// computeGuestSurcharge().
// `extraBed` is a flat, opt-in physical add-on (+surcharges.extraBed/night),
// separate from the guest-count surcharge above: it lets a guest pay for a
// rollaway bed even when the party is a young child the age-tiered math never
// bills a bed for (children under 9 sleep free). Only honoured for a room that
// physically allows one (extraBedAvailable); mirrors assets/js/booking-payment
// .js's extraBedRate() so the charged total matches the displayed one.
async function computeTotal(room, variantLabel, breakfast, nights, totalGuests, childAges, extraBed) {
  const effectiveRoom = await rateOverrides.getEffectiveRoom(room);
  if (!effectiveRoom) return null;
  const variant = effectiveRoom.variants.find((v) => v.label === variantLabel);
  if (!variant) return null;
  const surcharges = await rateOverrides.getEffectiveSurcharges();
  const adults = Array.isArray(childAges)
    ? Math.max(0, Number(totalGuests || 0) - childAges.length)
    : Number(totalGuests || 0);
  const rate = breakfast ? rateOverrides.effectiveBreakfastRate(effectiveRoom, variant, adults, surcharges) : variant.room;
  const bedAddon = (extraBed && effectiveRoom.extraBedAvailable) ? surcharges.extraBed : 0;
  const perNight = rate + rateOverrides.computeGuestSurcharge(effectiveRoom, totalGuests, breakfast, surcharges, childAges) + bedAddon;
  return perNight * nights;
}

// ── Shared validation/pricing/insert helpers ─────────────────────────────────
// Both the single-room POST /reservations and the multi-room POST
// /reservations/group route through the SAME three helpers below, so the two
// paths can never diverge on how a guest/date is validated, how a room is
// priced, or which columns get written. That shared path is the guarantee
// that "book 1 room" and "book that room as part of a group" charge exactly
// the same amount.

// guest_name / guest_last_name / guest_email / guest_phone are VARCHAR(100),
// (100)/(150)/(50), and Postgres rejects a NUL byte in any text value. An
// over-long paste or a mangled autofill therefore used to reach the INSERT and
// come back as a bare 500 "Database error" at the last step of the booking
// funnel, with no guidance for the guest. Trim to what the columns hold and
// strip control characters, the same treatment `specialRequests` already gets.
function cleanField(v, max) {
  if (v == null) return v;
  // eslint-disable-next-line no-control-regex
  return String(v).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
}
function sanitiseGuest(guest) {
  const g = guest || {};
  return Object.assign({}, g, {
    firstName: cleanField(g.firstName, 100),
    lastName:  cleanField(g.lastName, 100),
    email:     cleanField(g.email, 150),
    phone:     cleanField(g.phone, 50),
    note:      cleanField(g.note, 1000),
  });
}

function validateGuest(guest) {
  if (!guest.firstName || !guest.email || !guest.phone) {
    return 'Guest name, email, and phone number are required';
  }
  // Lenient email sanity check — the address is the confirmation recipient, so a
  // typo'd one silently fails to deliver. Kept permissive (one @, a dotted
  // domain) so real international addresses are never rejected.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(guest.email).trim())) {
    return 'Please enter a valid email address';
  }
  return null;
}

function validateDates(checkIn, checkOut) {
  if (!checkIn || !checkOut) {
    return 'check-in and check-out are required';
  }
  // Dates must be real and chronological. Equal or inverted ranges would
  // otherwise be floored to a phantom 1-night stay that holds no inventory
  // (countOverlapping uses check_in < check_out) yet is confirmed and billed.
  const ciDate = new Date(checkIn);
  const coDate = new Date(checkOut);
  if (isNaN(ciDate.getTime()) || isNaN(coDate.getTime()) || coDate <= ciDate) {
    return 'check-out must be a valid date after check-in';
  }
  return null;
}

// Validate ONE room's own fields (type/variant/breakfast/smoking/occupancy/
// childAges) against an already-validated shared date range, and price it via
// computeTotal(). Returns { error } (a 400 message) or { values } ready to
// insert. `r` is either the whole request body (single-room path) or one
// entry of the rooms[] array (group path) — the field names are identical.
async function validateAndPriceRoom(r, nights) {
  const room = r.room;
  const variantLabel = r.variantLabel;
  const breakfast = Boolean(r.breakfast);
  const adults = r.adults != null ? Number(r.adults) : 1;
  const children = r.children != null ? Number(r.children) : 0;
  // Guest preference only (front desk assigns the physical room accordingly)
  // — anything other than the literal 'smoking' string is the safer default.
  const smoking = r.smoking === 'smoking' ? 'smoking' : 'non_smoking';

  if (!room || !variantLabel) {
    return { error: 'room and variantLabel are required' };
  }
  // Guest counts must be whole numbers, at least 1 adult — a 0/NaN/negative/
  // fractional count would slip past the maxGuests guard and either underflow
  // the breakfast rate (undercharge) or fail the INSERT with a raw 500.
  if (!Number.isInteger(adults) || adults < 1 || !Number.isInteger(children) || children < 0) {
    return { error: 'adults must be a whole number ≥ 1 and children a whole number ≥ 0' };
  }
  // childAges (one integer per child, 0-17) drives the age-tiered breakfast/
  // extra-guest pricing — required whenever children > 0 so every child is
  // deliberately priced, never silently free or full-adult-rate.
  let childAges = [];
  if (children > 0) {
    if (!Array.isArray(r.childAges) || r.childAges.length !== children) {
      return { error: 'childAges must list one age (0-17) per child' };
    }
    childAges = r.childAges.map((a) => Number(a));
    if (childAges.some((a) => !Number.isInteger(a) || a < 0 || a > 17)) {
      return { error: 'Each child age must be a whole number between 0 and 17' };
    }
  }
  const roomInfo = roomRates.getRoom(room);
  if (!roomInfo) return { error: 'Unknown room type' };
  if (adults + children > roomInfo.maxGuests) {
    return { error: 'Too many guests for this room type' };
  }
  // Opt-in extra bed — a flat add-on, only meaningful for a room that allows
  // one (silently ignored otherwise so a stale/hostile flag can't inflate the
  // total on a room with no rollaway). It does NOT count against maxGuests: a
  // bed is a physical surface for an already-counted guest, not a new head.
  const extraBed = Boolean(r.extraBed) && !!roomInfo.extraBedAvailable;
  const total = await computeTotal(room, variantLabel, breakfast, nights, adults + children, childAges, extraBed);
  if (total == null) return { error: 'Unknown room variant' };

  return { values: { room, variantLabel, breakfast, smoking, adults, children, childAges, extraBed, total } };
}

// Insert one confirmed direct booking row. `p.groupRef/groupIndex/groupSize`
// are omitted (→ NULL) for a single-room booking, so a non-grouped INSERT is
// byte-for-byte what it was before this feature; they are set for each room
// of a multi-room group. Runs on whatever client/pool is passed (a shared
// transaction client for the group path).
async function insertBookingRow(client, p) {
  const { rows } = await client.query(
    `INSERT INTO guest_bookings
       (ref, channel, channel_name, guest_name, guest_last_name, guest_email, guest_phone,
        room, check_in, check_out, nights, adults, children, total, currency, status, lang,
        payment_provider, payment_method, payment_status, smoking_preference, breakfast, child_ages,
        special_requests, group_ref, group_index, group_size, extra_bed)
     VALUES ($1,'direct','Direct (Website)',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'THB','confirmed',$13,
             'in_person','pay_at_checkin','pending',$14,$15,$16,$17,$18,$19,$20,$21)
     RETURNING *`,
    [
      p.ref, p.guestName, p.guestLastName, p.guestEmail, p.guestPhone || null,
      p.room, p.checkIn, p.checkOut, p.nights, p.adults, p.children, p.total,
      p.lang || 'en', p.smoking, p.breakfast, JSON.stringify(p.childAges),
      p.specialRequests, p.groupRef || null, p.groupIndex || null, p.groupSize || null,
      Boolean(p.extraBed),
    ]
  );
  return rows[0];
}

/* GET /booking-availability?checkIn=&checkOut= */
router.get('/booking-availability', async (req, res) => {
  const { checkIn, checkOut } = req.query;
  if (!checkIn || !checkOut) {
    return res.status(400).json({ error: 'checkIn and checkOut are required' });
  }
  try {
    const result = {};
    for (const room of roomRates.roomKeys()) {
      const cnt = await countOverlapping(db, room, checkIn, checkOut);
      result[room] = Math.max(0, roomRates.getInventory(room) - cnt);
    }
    res.json(result);
  } catch (e) {
    console.error('[payments] availability', e);
    res.status(500).json({ error: 'Database error' });
  }
});

/* POST /reservations — create a CONFIRMED overnight booking with no payment
   taken. Holds the room via the same overlap/inventory guard a paid booking
   would use, then fires the standard hotel-notice + guest-confirmation email
   pair via the shared fireBookingEmails() helper (guestBookings.js) — those
   emails show the balance due and state that payment is collected in person
   at check-in. Reuses computeTotal() so the recorded total already reflects
   any live admin rate overrides. */
router.post('/reservations', async (req, res) => {
  const ip = req.ip || 'unknown';
  if (bookingRateLimited(req)) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }

  const b = req.body || {};
  const guest = sanitiseGuest(b.guest);
  const { checkIn, checkOut } = b;
  // Optional free-text special request the guest typed (late arrival, high
  // floor, allergies…). Trimmed and length-capped so it's safe to store and
  // echo into the confirmation/hotel-notice emails; empty/whitespace -> NULL.
  const specialRequests = typeof guest.note === 'string' && guest.note.trim()
    ? guest.note.trim().slice(0, 1000) : null;

  const guestErr = validateGuest(guest);
  if (guestErr) return res.status(400).json({ error: guestErr });
  const dateErr = validateDates(checkIn, checkOut);
  if (dateErr) return res.status(400).json({ error: dateErr });

  const nights = computeNights(checkIn, checkOut);
  if (nights > 365) {
    return res.status(400).json({ error: 'Stay length exceeds the maximum of 365 nights' });
  }

  const priced = await validateAndPriceRoom(b, nights);
  if (priced.error) return res.status(400).json({ error: priced.error });
  const v = priced.values;

  const guestName = String(guest.firstName || 'Guest').trim();
  const guestLastName = guest.lastName ? String(guest.lastName).trim() : null;

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1)::bigint)', [v.room]);

    const cnt = await countOverlapping(client, v.room, checkIn, checkOut);
    if (cnt >= roomRates.getInventory(v.room)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Sorry, this room type is fully booked for those dates.' });
    }

    const saved = await insertBookingRow(client, {
      ref: genRef(), guestName, guestLastName, guestEmail: guest.email, guestPhone: guest.phone,
      room: v.room, checkIn, checkOut, nights, adults: v.adults, children: v.children,
      total: v.total, lang: b.lang, smoking: v.smoking, breakfast: v.breakfast,
      childAges: v.childAges, extraBed: v.extraBed, specialRequests,
    });
    await client.query('COMMIT');

    fireBookingEmails({ ...saved, inserted: true });

    res.status(201).json({ status: 'confirmed', booking: row2js(saved) });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error('[payments] reservations', e);
    res.status(500).json({ error: 'Database error' });
  } finally {
    client.release();
  }
});

/* POST /reservations/group — create ONE guest reservation that holds several
   rooms, stored as one guest_bookings row per room, all sharing a group_ref
   (the guest-facing confirmation number). Every room is validated and priced
   by the exact same validateAndPriceRoom()/computeTotal() a single-room
   booking uses — so each room's charge is identical to booking it on its own,
   and the grand total is simply the sum. All rooms share one date range and
   one guest contact (per the confirmed design); occupancy/room-type/breakfast/
   smoking are per room. The whole group is inserted in ONE transaction: if any
   room is invalid or sold out, nothing is written (never a partial group). */
router.post('/reservations/group', async (req, res) => {
  const ip = req.ip || 'unknown';
  if (bookingRateLimited(req)) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }

  const b = req.body || {};
  const guest = sanitiseGuest(b.guest);
  const { checkIn, checkOut } = b;
  const rooms = Array.isArray(b.rooms) ? b.rooms : null;
  const specialRequests = typeof guest.note === 'string' && guest.note.trim()
    ? guest.note.trim().slice(0, 1000) : null;

  if (!rooms || rooms.length < 2) {
    return res.status(400).json({ error: 'A group booking needs at least 2 rooms' });
  }
  if (rooms.length > MAX_GROUP_ROOMS) {
    return res.status(400).json({ error: `A single booking can hold at most ${MAX_GROUP_ROOMS} rooms` });
  }

  const guestErr = validateGuest(guest);
  if (guestErr) return res.status(400).json({ error: guestErr });
  const dateErr = validateDates(checkIn, checkOut);
  if (dateErr) return res.status(400).json({ error: dateErr });

  const nights = computeNights(checkIn, checkOut);
  if (nights > 365) {
    return res.status(400).json({ error: 'Stay length exceeds the maximum of 365 nights' });
  }

  // Validate + price every room up front (no DB writes yet). Any bad room
  // fails the whole booking with a clear 400 naming the offending room.
  const priced = [];
  for (let i = 0; i < rooms.length; i++) {
    const r = await validateAndPriceRoom(rooms[i], nights);
    if (r.error) return res.status(400).json({ error: `Room ${i + 1}: ${r.error}` });
    priced.push(r.values);
  }

  const guestName = String(guest.firstName || 'Guest').trim();
  const guestLastName = guest.lastName ? String(guest.lastName).trim() : null;

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // Lock every DISTINCT room type in sorted order so two concurrent group
    // bookings that share any room type acquire the locks in the same order
    // and can never deadlock each other.
    const distinctRooms = [...new Set(priced.map((p) => p.room))].sort();
    for (const room of distinctRooms) {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1)::bigint)', [room]);
    }

    // Per-type inventory: existing overlapping bookings + how many of this
    // type this group requests must fit within inventory. (Inventory is 999
    // for this property so this never realistically trips, but it stays
    // correct even for a room type booked twice within the same group.)
    for (const room of distinctRooms) {
      const requested = priced.filter((p) => p.room === room).length;
      const existing = await countOverlapping(client, room, checkIn, checkOut);
      if (existing + requested > roomRates.getInventory(room)) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: `Sorry, ${room} is fully booked for those dates.` });
      }
    }

    const groupRef = genRef();
    const groupSize = priced.length;
    const savedRows = [];
    for (let i = 0; i < priced.length; i++) {
      const v = priced[i];
      const saved = await insertBookingRow(client, {
        ref: `${groupRef}-R${i + 1}`,
        guestName, guestLastName, guestEmail: guest.email, guestPhone: guest.phone,
        room: v.room, checkIn, checkOut, nights, adults: v.adults, children: v.children,
        total: v.total, lang: b.lang, smoking: v.smoking, breakfast: v.breakfast,
        childAges: v.childAges, extraBed: v.extraBed, specialRequests,
        groupRef, groupIndex: i + 1, groupSize,
      });
      savedRows.push(saved);
    }
    await client.query('COMMIT');

    // One aggregated guest confirmation + one aggregated hotel notice for the
    // whole group (fire-and-forget; queries the just-inserted rows by group_ref).
    fireGroupBookingEmails(groupRef);

    const grandTotal = savedRows.reduce((s, r) => s + Number(r.total || 0), 0);
    res.status(201).json({
      status: 'confirmed',
      groupRef,
      grandTotal,
      currency: 'THB',
      rooms: savedRows.map((r) => ({ ref: r.ref, room: r.room, total: Number(r.total || 0) })),
      bookings: savedRows.map(row2js),
    });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error('[payments] reservations/group', e);
    res.status(500).json({ error: 'Database error' });
  } finally {
    client.release();
  }
});

// Day-use guest email: distinct from the overnight confirmation because a
// day-use stay has a preferred TIME (not a check-in/check-out night range)
// and a flat price, not a per-night total. Day-use requests still stay
// PENDING after submission — front desk must confirm the exact time slot is
// available — so this keeps sending its own bespoke pair of emails rather
// than going through fireBookingEmails() (which only fires for 'confirmed').
function dayUseGuestEmail(bk, preferredTime) {
  const money = bk.total != null ? `${bk.total} ${bk.currency || 'THB'}` : '—';
  const lines = [
    `Dear ${bk.guest_name || 'Guest'},`,
    '',
    `Thank you for your day-use request at J Park Hotel, Chonburi (Ref: ${bk.ref}).`,
    '',
    `Room: ${bk.room || '—'}`,
    `Date: ${bk.check_in}`,
    `Preferred time: ${preferredTime || 'Not specified — we will contact you to confirm'}`,
    ...(bk.special_requests ? [`Special requests: ${bk.special_requests}`] : []),
    `Total (3-hour day-use): ${money}. Payable in person at check-in by cash, credit/debit card, or PromptPay QR.`,
    '',
    'This request is PENDING until we confirm your exact time slot — no payment is needed online.',
    '',
    'We will contact you by phone or email shortly to confirm availability.',
    '',
    SPAM_NOTE_TEXT,
    '',
    'J Park Hotel, Chonburi',
  ];
  const letterhead = emailLetterhead();
  const text = lines.join('\n') + letterhead.text;
  const html =
    `<div style="font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;line-height:1.5">` +
    `<h2 style="color:#0f766e;margin:0 0 12px">Day-use request received</h2>` +
    `<p>Dear ${bk.guest_name || 'Guest'},</p>` +
    `<p>Thank you for your day-use request at <strong>J Park Hotel, Chonburi</strong> (Ref: <strong>${bk.ref}</strong>).</p>` +
    `<table style="border-collapse:collapse;margin:16px 0">` +
    `<tr><td style="padding:4px 12px 4px 0;color:#555">Room</td><td style="padding:4px 0">${bk.room || '—'}</td></tr>` +
    `<tr><td style="padding:4px 12px 4px 0;color:#555">Date</td><td style="padding:4px 0">${bk.check_in}</td></tr>` +
    `<tr><td style="padding:4px 12px 4px 0;color:#555">Preferred time</td><td style="padding:4px 0">${preferredTime || 'Not specified'}</td></tr>` +
    (bk.special_requests ? `<tr><td style="padding:4px 12px 4px 0;color:#555">Special requests</td><td style="padding:4px 0">${esc(bk.special_requests)}</td></tr>` : '') +
    `<tr><td style="padding:4px 12px 4px 0;color:#555">Total</td><td style="padding:4px 0">${money}</td></tr>` +
    `</table>` +
    `<p style="background:#eef6f4;border:1px solid #a9d6cb;border-radius:8px;padding:10px 14px;color:#0f4a3e">` +
    `<strong>Payable in person</strong> at check-in by cash, credit/debit card, or PromptPay QR at our front desk.</p>` +
    `<p style="background:#fbf3df;border:1px solid #e0c178;border-radius:8px;padding:10px 14px;color:#5a4a1a">` +
    `<strong>This request is pending</strong> until we confirm your exact time slot.</p>` +
    `<p>We will contact you by phone or email shortly to confirm availability.</p>` +
    SPAM_NOTE_HTML +
    `<p style="color:#0f766e;font-weight:bold;margin-top:24px">J Park Hotel, Chonburi</p>` +
    letterhead.html +
    `</div>`;
  return { text, html };
}

/* POST /payments/dayuse-booking — request a 3-hour day-use session (flat
   rate, no nights, no breakfast/extra-guest surcharges). Day-use requests
   are always "subject to availability" (front desk assigns the exact time
   slot), so — unlike overnight bookings — this deliberately does NOT run
   the overlap/inventory guard: check_in and check_out are stored equal,
   which countOverlapping()'s strict `check_in < check_out` condition never
   matches, so day-use rows never block or get blocked by anything. */
router.post('/payments/dayuse-booking', async (req, res) => {
  const ip = req.ip || 'unknown';
  if (bookingRateLimited(req)) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }

  const b = req.body || {};
  const guest = sanitiseGuest(b.guest);
  const { room, date } = b;
  const preferredTime = typeof b.preferredTime === 'string' ? b.preferredTime.trim().slice(0, 200) : '';
  const specialRequests = typeof guest.note === 'string' && guest.note.trim()
    ? guest.note.trim().slice(0, 1000) : null;
  const method = 'pay_at_checkin';

  if (!room || !date) {
    return res.status(400).json({ error: 'room and date are required' });
  }
  if (!guest.firstName || !guest.email || !guest.phone) {
    return res.status(400).json({ error: 'Guest name, email, and phone number are required' });
  }
  const price = await rateOverrides.getEffectiveDayUsePrice(room);
  if (price == null) return res.status(400).json({ error: 'Unknown day-use room type' });

  const guestName = String(guest.firstName || 'Guest').trim();
  const guestLastName = guest.lastName ? String(guest.lastName).trim() : null;
  const ref = genRef();

  try {
    const { rows } = await db.query(
      `INSERT INTO guest_bookings
         (ref, channel, channel_name, guest_name, guest_last_name, guest_email, guest_phone,
          room, check_in, check_out, nights, adults, children, total, currency, status, lang,
          payment_provider, payment_method, payment_status, special_requests)
       VALUES ($1,'direct','Direct (Website)',$2,$3,$4,$5,$6,$7,$7,1,1,0,$8,'THB','pending',$9,
               'in_person',$10,'pending',$11)
       RETURNING *`,
      [
        ref, guestName, guestLastName, guest.email, guest.phone || null,
        room + ' (Day Use)', date, price,
        b.lang || 'en',
        method, specialRequests,
      ]
    );
    const saved = rows[0];

    const to = hotelRecipients();
    if (to.length) {
      const { text, html } = hotelNotice(saved);
      sendEmail({
        to,
        subject: `New day-use request (pending) — Direct (${saved.ref})`,
        text: text + `\nPreferred time: ${preferredTime || 'Not specified'}`,
        html: html.replace('</table>', `<tr><td style="padding:4px 12px 4px 0;color:#555">Preferred time</td><td style="padding:4px 0">${preferredTime || 'Not specified'}</td></tr></table>`),
        replyTo: saved.guest_email || undefined,
      }).catch((err) => console.error('[payments] dayuse hotel notice error', err));
    }
    if (saved.guest_email) {
      const { text, html } = dayUseGuestEmail(saved, preferredTime);
      sendEmail({
        to: saved.guest_email,
        subject: `J Park Hotel — day-use request received (${saved.ref})`,
        text,
        html,
      }, { bookingId: saved.id, bookingRef: saved.ref, kind: 'dayuse_request' })
        .catch((err) => console.error('[payments] dayuse guest email error', err));
    }

    res.status(201).json({ status: 'pending', booking: row2js(saved) });
  } catch (e) {
    console.error('[payments] dayuse-booking', e);
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;
