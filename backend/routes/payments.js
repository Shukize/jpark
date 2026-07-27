/* ============================================================
   J Park Hotel — online reservations + optional online payment.
   A reservation made here is confirmed immediately (it holds the room-type
   inventory the same way any booking would), regardless of how the guest
   chooses to pay. Payment is a HYBRID choice per booking: pay in person at
   check-in (cash / card / PromptPay QR at the front desk, the default), or
   pay online now via Omise/Opn Payments (card or PromptPay QR). Mounted at
   /api/v1 in server.js:
     GET  /api/v1/booking-availability    -> { [room]: remainingCount }
     GET  /api/v1/payments/config         -> { publicKey, paymentEnabled }
     POST /api/v1/reservations            -> create a confirmed overnight booking
     POST /api/v1/reservations/group      -> create a confirmed multi-room ("group") booking
     GET  /api/v1/payments/status/:id     -> poll a booking's payment_status
     POST /api/v1/payments/webhook        -> Omise event receiver
     POST /api/v1/payments/dayuse-booking -> pending 3-hour day-use request

   Security notes:
   - The client only ever tells us WHICH room/variant/dates it wants; the
     price is always recomputed here from lib/rateOverrides.js (which merges
     lib/roomRates.js's static base rates with any live admin edits saved via
     the Site Editor's Rates tab). Never trust a client-supplied amount.
   - Omise webhooks are not cryptographically signed, so on receipt we
     re-fetch the charge from Omise's own API before trusting its status.

   Overbooking is a known non-goal for this property (the owner has said it
   isn't a real concern — see lib/roomRates.js's ROOM_INVENTORY placeholders),
   so a booking is written as status='confirmed' the moment it's submitted
   regardless of payment outcome. Only the payment_* columns differ: a card
   charge resolves SYNCHRONOUSLY (approved/declined before the row is ever
   written), while a PromptPay charge stays payment_status='pending' until
   the webhook below confirms it — there is no "hold room pending payment"
   state to reconcile.
   ============================================================ */
const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const omise = require('../lib/omise');
const roomRates = require('../lib/roomRates');
const rateOverrides = require('../lib/rateOverrides');
const { countOverlappingPool } = require('../lib/availability');
const { makeLimiter } = require('../lib/rateLimit');
const { sendEmail } = require('../mailer');
const {
  row2js,
  fireBookingEmails,
  fireGroupBookingEmails,
  sendPaymentConfirmedEmail,
  sendGroupPaymentConfirmedEmail,
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

// A real charge (card or PromptPay) gets its own, much tighter guard on top
// of bookingRateLimited() above — card-testing abuse (many stolen numbers
// tried against one endpoint) is a different threat from booking-form spam,
// and the generous per-building ceiling above exists specifically so a
// shared IP is never punished for volume; a shared IP SHOULD be punished for
// repeated card attempts. Per-IP only (not per-device) since a stolen-card
// script has no reason to send a stable device id at all.
const paymentAttemptLimited = makeLimiter(10, 10 * 60 * 1000);

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
// p.paymentProvider/paymentMethod/paymentStatus/paymentChargeId are optional
// overrides for a booking paid online (Omise) — omitted (or undefined), they
// default to exactly what every pay-at-checkin booking has always used, so
// no existing call site needs to change.
async function insertBookingRow(client, p) {
  const { rows } = await client.query(
    `INSERT INTO guest_bookings
       (ref, channel, channel_name, guest_name, guest_last_name, guest_email, guest_phone,
        room, check_in, check_out, nights, adults, children, total, currency, status, lang,
        payment_provider, payment_method, payment_status, payment_charge_id,
        smoking_preference, breakfast, child_ages,
        special_requests, group_ref, group_index, group_size, extra_bed, non_refundable)
     VALUES ($1,'direct','Direct (Website)',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'THB','confirmed',$13,
             $14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)
     RETURNING *`,
    [
      p.ref, p.guestName, p.guestLastName, p.guestEmail, p.guestPhone || null,
      p.room, p.checkIn, p.checkOut, p.nights, p.adults, p.children, p.total,
      p.lang || 'en',
      p.paymentProvider || 'in_person', p.paymentMethod || 'pay_at_checkin',
      p.paymentStatus || 'pending', p.paymentChargeId || null,
      p.smoking, p.breakfast, JSON.stringify(p.childAges),
      p.specialRequests, p.groupRef || null, p.groupIndex || null, p.groupSize || null,
      Boolean(p.extraBed), Boolean(p.nonRefundable),
    ]
  );
  return rows[0];
}

// ── Online payment (Omise/Opn: card + PromptPay) ────────────────────────────
// Hybrid, per-booking choice — a guest may still pick pay-at-checkin (the
// default, and the only option while OMISE_SECRET_KEY is unset). Nothing
// below ever trusts a client-supplied amount; amountTHB is always the sum
// that computeTotal()/validateAndPriceRoom() produced server-side.
const ONLINE_PAYMENT_METHODS = ['card', 'promptpay'];

// Is prepayment currently required (busy/holiday policy) AND actually
// enforceable? require_prepayment is an admin switch (site_content, toggled from
// routes/bookingPolicy.js), but it only takes effect while Omise is configured —
// forcing prepay when nobody can pay online would block every booking. Fails
// safe to FALSE on any DB error: a booking must never be blocked by this lookup.
async function isPrepayRequired() {
  if (!omise.isConfigured()) return false;
  try {
    const { rows } = await db.query('SELECT require_prepayment FROM site_content WHERE id = 1');
    return rows.length ? !!rows[0].require_prepayment : false;
  } catch (e) {
    console.error('[payments] prepay flag', e);
    return false;
  }
}

function resolvePaymentChoice(b, prepayRequired) {
  const raw = b.paymentMethod;
  if (!raw || raw === 'pay_at_checkin') {
    // Busy/holiday policy: no pay-at-check-in — the guest must pay online now.
    if (prepayRequired) {
      return { error: 'Prepayment is required for these dates. Please pay online by card or PromptPay.' };
    }
    return { method: 'pay_at_checkin' };
  }
  if (!ONLINE_PAYMENT_METHODS.includes(raw)) {
    return { error: 'paymentMethod must be "pay_at_checkin", "card", or "promptpay"' };
  }
  if (!omise.isConfigured()) {
    return { error: 'Online payment is not currently available. Please choose pay at check-in.' };
  }
  if (raw === 'card' && !b.cardToken) {
    return { error: 'Missing card token' };
  }
  return { method: raw, cardToken: b.cardToken };
}

// Charges ONE amount — a single room's total, or a whole group cart's grand
// total — via Omise. Card resolves synchronously (paid: true/false known
// immediately); PromptPay stays async (paid: false until the webhook below
// confirms it) and returns a QR image for the frontend to display.
async function chargeOnline({ method, amountTHB, cardToken, description, metadata }) {
  const amountSatang = Math.round(amountTHB * 100);
  try {
    if (method === 'card') {
      const charge = await omise.createCardCharge({ amountSatang, currency: 'thb', token: cardToken, description, metadata });
      if (charge.status === 'successful') {
        return { ok: true, paid: true, chargeId: charge.id };
      }
      return { ok: false, status: 402, error: 'Your card was declined. Please try a different card or pay at check-in.' };
    }
    if (method === 'promptpay') {
      const source = await omise.createPromptPaySource({ amountSatang, currency: 'thb' });
      const charge = await omise.createChargeFromSource({ amountSatang, currency: 'thb', sourceId: source.id, description, metadata });
      const qrImage = (charge.source && charge.source.scannable_code
        && charge.source.scannable_code.image && charge.source.scannable_code.image.download_uri) || null;
      return { ok: true, paid: false, chargeId: charge.id, qrImage, expiresAt: charge.expires_at || null };
    }
    return { ok: false, status: 400, error: 'Unsupported payment method' };
  } catch (e) {
    console.error('[payments] omise charge error', (e && e.omise) || (e && e.message) || e);
    return { ok: false, status: 502, error: (e && e.omise && e.omise.message) || 'Could not process online payment. Please try again or pay at check-in.' };
  }
}

/* GET /payments/config — tells the booking page whether to show the online
   payment choice at all. One flag covers both card and PromptPay (the owner
   hasn't asked to enable them independently); while OMISE_SECRET_KEY is
   unset this is false and the guest sees only pay-at-checkin — i.e. this
   route can ship long before the client's Omise account exists. */
router.get('/payments/config', async (_req, res) => {
  // prepayRequired already folds in omise.isConfigured() (see isPrepayRequired),
  // so the booking page only ever hides pay-at-check-in when online payment can
  // actually be taken — the switch is inert until the hotel's Omise keys are live.
  res.json({
    publicKey: omise.publicKey(),
    paymentEnabled: omise.isConfigured(),
    prepayRequired: await isPrepayRequired(),
  });
});

/* GET /payments/status/:id — the frontend polls this while a PromptPay QR is
   awaiting the guest's scan. Works the same for a solo or group-cart row —
   each row (even within a group sharing one charge) has its own id. */
router.get('/payments/status/:id', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT id, ref, status, payment_status FROM guest_bookings WHERE id = $1',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Booking not found' });
    const bk = rows[0];
    res.json({ ref: bk.ref, status: bk.status, paymentStatus: bk.payment_status });
  } catch (e) {
    console.error('[payments] status', e);
    res.status(500).json({ error: 'Database error' });
  }
});

/* GET /booking-availability?checkIn=&checkOut= */
router.get('/booking-availability', async (req, res) => {
  const { checkIn, checkOut } = req.query;
  if (!checkIn || !checkOut) {
    return res.status(400).json({ error: 'checkIn and checkOut are required' });
  }
  try {
    const result = {};
    // One read of the admin-editable room counts for the whole sweep (Site
    // Editor "How many rooms" — see lib/rateOverrides.js), not one per room.
    const inventory = await rateOverrides.getEffectiveInventoryMap();
    for (const room of roomRates.roomKeys()) {
      // Single/Twin siblings (Studio, Prestige, Premium) share ONE physical
      // pool — count every key in that pool, not just this one, so both
      // labels report the same (correct) remaining count.
      const cnt = await countOverlappingPool(db, roomRates.getInventoryPoolRooms(room), checkIn, checkOut);
      result[room] = Math.max(0, (inventory[room] || 0) - cnt);
    }
    res.json(result);
  } catch (e) {
    console.error('[payments] availability', e);
    res.status(500).json({ error: 'Database error' });
  }
});

/* POST /reservations — create a CONFIRMED overnight booking. Payment is the
   guest's choice: pay at check-in (default, unchanged from before online
   payment existed), or pay online now by card/PromptPay via Omise. Holds the
   room via the same overlap/inventory guard either way, then fires the
   standard hotel-notice + guest-confirmation email pair via the shared
   fireBookingEmails() helper (guestBookings.js) — its copy adapts to whichever
   payment outcome the booking actually has. Reuses computeTotal() so the
   recorded total already reflects any live admin rate overrides; the amount
   charged online is always this server-computed total, never client-supplied. */
router.post('/reservations', async (req, res) => {
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

  const prepayRequired = await isPrepayRequired();
  const paymentChoice = resolvePaymentChoice(b, prepayRequired);
  if (paymentChoice.error) return res.status(400).json({ error: paymentChoice.error });
  if (paymentChoice.method !== 'pay_at_checkin' && paymentAttemptLimited(req.ip || 'unknown')) {
    return res.status(429).json({ error: 'Too many payment attempts. Please try again later.' });
  }

  const priced = await validateAndPriceRoom(b, nights);
  if (priced.error) return res.status(400).json({ error: priced.error });
  const v = priced.values;

  const guestName = String(guest.firstName || 'Guest').trim();
  const guestLastName = guest.lastName ? String(guest.lastName).trim() : null;

  // Read the admin-editable room counts BEFORE opening the transaction, so the
  // guard below doesn't check out a second pooled connection while holding one.
  const inventory = await rateOverrides.getEffectiveInventoryMap();

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    // Lock by the POOL's canonical key, not the literal room string — so a
    // 'Studio Single' and a concurrent 'Studio Twin' booking for the same
    // dates serialize against each other instead of racing past two
    // independent locks (they share one physical pool of rooms).
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1)::bigint)', [roomRates.getInventoryPoolKey(v.room)]);

    const cnt = await countOverlappingPool(client, roomRates.getInventoryPoolRooms(v.room), checkIn, checkOut);
    if (cnt >= (inventory[v.room] || 0)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Sorry, this room type is fully booked for those dates.' });
    }

    // Charge BEFORE inserting anything: a declined card must leave no row
    // behind at all — there is nothing to roll back, since nothing was
    // written. A PromptPay charge always "succeeds" at this step (it only
    // creates a pending charge for the guest to scan) so it always proceeds
    // to the insert below.
    let onlinePayment = null;
    if (paymentChoice.method !== 'pay_at_checkin') {
      const result = await chargeOnline({
        method: paymentChoice.method,
        amountTHB: v.total,
        cardToken: paymentChoice.cardToken,
        description: `J Park Hotel — ${v.room} (${v.variantLabel}) ${checkIn} to ${checkOut}`,
        metadata: { room: v.room, variantLabel: v.variantLabel, checkIn, checkOut },
      });
      if (!result.ok) {
        await client.query('ROLLBACK');
        return res.status(result.status).json({ error: result.error });
      }
      onlinePayment = result;
    }

    const saved = await insertBookingRow(client, {
      ref: genRef(), guestName, guestLastName, guestEmail: guest.email, guestPhone: guest.phone,
      room: v.room, checkIn, checkOut, nights, adults: v.adults, children: v.children,
      total: v.total, lang: b.lang, smoking: v.smoking, breakfast: v.breakfast,
      childAges: v.childAges, extraBed: v.extraBed, specialRequests,
      nonRefundable: prepayRequired,
      paymentProvider: onlinePayment ? 'omise' : undefined,
      paymentMethod: onlinePayment ? paymentChoice.method : undefined,
      paymentStatus: onlinePayment ? (onlinePayment.paid ? 'paid' : 'pending') : undefined,
      paymentChargeId: onlinePayment ? onlinePayment.chargeId : undefined,
    });
    await client.query('COMMIT');

    fireBookingEmails({ ...saved, inserted: true });

    res.status(201).json({
      status: 'confirmed',
      booking: row2js(saved),
      payment: onlinePayment
        ? { method: paymentChoice.method, paid: onlinePayment.paid, qrImage: onlinePayment.qrImage || null, expiresAt: onlinePayment.expiresAt || null }
        : null,
    });
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

  const prepayRequired = await isPrepayRequired();
  const paymentChoice = resolvePaymentChoice(b, prepayRequired);
  if (paymentChoice.error) return res.status(400).json({ error: paymentChoice.error });
  if (paymentChoice.method !== 'pay_at_checkin' && paymentAttemptLimited(req.ip || 'unknown')) {
    return res.status(429).json({ error: 'Too many payment attempts. Please try again later.' });
  }

  // Validate + price every room up front (no DB writes yet). Any bad room
  // fails the whole booking with a clear 400 naming the offending room.
  const priced = [];
  for (let i = 0; i < rooms.length; i++) {
    const r = await validateAndPriceRoom(rooms[i], nights);
    if (r.error) return res.status(400).json({ error: `Room ${i + 1}: ${r.error}` });
    priced.push(r.values);
  }
  const grandTotal = priced.reduce((s, p) => s + Number(p.total || 0), 0);

  const guestName = String(guest.firstName || 'Guest').trim();
  const guestLastName = guest.lastName ? String(guest.lastName).trim() : null;

  // Same as the single-room path: read the admin-editable room counts before
  // the transaction opens rather than from inside it.
  const inventory = await rateOverrides.getEffectiveInventoryMap();

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // Lock every DISTINCT inventory POOL (not the literal room string) in
    // sorted order, so two concurrent group bookings that share any pool —
    // including Single/Twin siblings sharing one physical pool — acquire
    // locks in the same order and can never deadlock each other.
    const distinctPoolKeys = [...new Set(priced.map((p) => roomRates.getInventoryPoolKey(p.room)))].sort();
    for (const poolKey of distinctPoolKeys) {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1)::bigint)', [poolKey]);
    }

    // Per-pool inventory: existing overlapping bookings across every room
    // key sharing this pool, plus however many of that pool this group
    // requests (which may span more than one label — e.g. 2 "Studio Single"
    // + 1 "Studio Twin" — since they draw from the same physical rooms),
    // must fit within the pool's shared inventory.
    for (const poolKey of distinctPoolKeys) {
      const poolRooms = roomRates.getInventoryPoolRooms(poolKey);
      const inThisPool = priced.filter((p) => poolRooms.includes(p.room));
      const existing = await countOverlappingPool(client, poolRooms, checkIn, checkOut);
      if (existing + inThisPool.length > (inventory[poolKey] || 0)) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: `Sorry, ${inThisPool[0].room} is fully booked for those dates.` });
      }
    }

    const groupRef = genRef();
    const groupSize = priced.length;

    // ONE charge for the whole cart's grand total — not one per room. Every
    // row in this group will share the same payment_charge_id, which is what
    // lets the webhook below flip all of them together with a single UPDATE.
    let onlinePayment = null;
    if (paymentChoice.method !== 'pay_at_checkin') {
      const result = await chargeOnline({
        method: paymentChoice.method,
        amountTHB: grandTotal,
        cardToken: paymentChoice.cardToken,
        description: `J Park Hotel — group booking, ${groupSize} rooms, ${checkIn} to ${checkOut}`,
        metadata: { groupRef, rooms: priced.map((p) => p.room), checkIn, checkOut },
      });
      if (!result.ok) {
        await client.query('ROLLBACK');
        return res.status(result.status).json({ error: result.error });
      }
      onlinePayment = result;
    }

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
        nonRefundable: prepayRequired,
        paymentProvider: onlinePayment ? 'omise' : undefined,
        paymentMethod: onlinePayment ? paymentChoice.method : undefined,
        paymentStatus: onlinePayment ? (onlinePayment.paid ? 'paid' : 'pending') : undefined,
        paymentChargeId: onlinePayment ? onlinePayment.chargeId : undefined,
      });
      savedRows.push(saved);
    }
    await client.query('COMMIT');

    // One aggregated guest confirmation + one aggregated hotel notice for the
    // whole group (fire-and-forget; queries the just-inserted rows by group_ref).
    fireGroupBookingEmails(groupRef);

    res.status(201).json({
      status: 'confirmed',
      groupRef,
      grandTotal,
      currency: 'THB',
      rooms: savedRows.map((r) => ({ ref: r.ref, room: r.room, total: Number(r.total || 0) })),
      bookings: savedRows.map(row2js),
      payment: onlinePayment
        ? { method: paymentChoice.method, paid: onlinePayment.paid, qrImage: onlinePayment.qrImage || null, expiresAt: onlinePayment.expiresAt || null }
        : null,
    });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error('[payments] reservations/group', e);
    res.status(500).json({ error: 'Database error' });
  } finally {
    client.release();
  }
});

// Optional shared-secret gate for the webhook, ?key=<OMISE_WEBHOOK_SECRET>.
// This is a SECONDARY guard only — every webhook delivery is re-verified
// against Omise's own API below regardless of this check, since Omise
// webhook bodies aren't cryptographically signed and must never be trusted
// on their own. Same shape as guestBookings.js's ingestKeyOk().
function omiseWebhookKeyOk(provided) {
  const expected = process.env.OMISE_WEBHOOK_SECRET || '';
  if (!expected) return true;
  if (!provided) return false;
  const a = Buffer.from(String(provided));
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/* POST /payments/webhook — Omise event receiver. Confirms a PromptPay charge
   once the guest has scanned and paid (card charges already resolved
   synchronously at booking time, so this is mostly a no-op for them — see
   the payment_status != 'paid' guard below). For a group booking, every room
   shares the SAME payment_charge_id (one charge covers the whole cart), so
   the UPDATE naturally flips every row in the group in one statement. */
router.post('/payments/webhook', async (req, res) => {
  if (!omiseWebhookKeyOk(req.query.key)) {
    return res.status(401).json({ error: 'Invalid webhook key' });
  }
  const chargeId = req.body && req.body.data && req.body.data.id;
  if (!chargeId) return res.status(200).json({ ok: true });

  try {
    // Never trust the webhook body's own claimed status — re-fetch the
    // charge from Omise's API and act only on that.
    const charge = await omise.getCharge(chargeId);
    if (!charge || charge.status !== 'successful') {
      return res.status(200).json({ ok: true }); // not (yet) a successful charge
    }

    const { rows } = await db.query(
      `UPDATE guest_bookings SET payment_status = 'paid'
       WHERE payment_charge_id = $1 AND payment_status != 'paid'
       RETURNING *`,
      [chargeId]
    );
    if (rows.length) {
      if (rows[0].group_ref) {
        const sorted = rows.slice().sort((a, b) => (a.group_index || 0) - (b.group_index || 0));
        sendGroupPaymentConfirmedEmail(sorted).catch((err) => console.error('[payments] webhook group email error', err));
      } else {
        sendPaymentConfirmedEmail(rows[0]).catch((err) => console.error('[payments] webhook email error', err));
      }
    }
    // Otherwise: 0 rows matched, either a duplicate delivery of an event we
    // already processed (payment_status already 'paid') or a charge id we
    // don't recognise — either way, nothing left to do.
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[payments] webhook', e);
    // A non-2xx here makes Omise retry the delivery later — the right call
    // for a transient failure on OUR side (e.g. a DB blip), since the charge
    // itself already succeeded and must not be silently dropped.
    res.status(500).json({ error: 'Webhook processing error' });
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
