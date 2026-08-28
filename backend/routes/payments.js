/* ============================================================
   J Park Hotel — online reservations + optional online payment.
   A reservation made here is confirmed immediately (it holds the room-type
   inventory the same way any booking would), regardless of how the guest
   chooses to pay. Payment is a HYBRID choice per booking: pay in person at
   check-in (cash / card / PromptPay QR at the front desk, the default), or
   pay online now by card or PromptPay QR through Omise / Opn Payments, the
   hotel's approved acquirer (see lib/payments/). Mounted at /api/v1 in
   server.js:
     GET  /api/v1/booking-availability     -> { [room]: remainingCount }
     GET  /api/v1/payments/config          -> { provider, publicKey, paymentEnabled, methods, testMode }
     POST /api/v1/reservations             -> create a confirmed overnight booking
     POST /api/v1/reservations/group       -> create a confirmed multi-room ("group") booking
     GET  /api/v1/payments/status/:id      -> poll a booking's payment_status
     POST /api/v1/payments/webhook         -> gateway notification receiver
     GET  /api/v1/payments/webhook         -> a human opened that URL; explains itself
     POST /api/v1/payments/reconcile       -> scheduled backstop for a lost webhook
     GET  /api/v1/payments/diagnostics     -> go-live checklist, run against the live keys
     POST /api/v1/payments/dayuse-booking  -> pending 3-hour day-use request

   Security notes:
   - The client only ever tells us WHICH room/variant/dates it wants; the
     price is always recomputed here from lib/rateOverrides.js (which merges
     lib/roomRates.js's static base rates with any live admin edits saved via
     the Site Editor's Rates tab). Never trust a client-supplied amount.
   - A webhook body is never trusted on its own. Omise DOES sign deliveries
     (verified here when OMISE_WEBHOOK_SIGNING_SECRET is set), but the status
     itself always comes from re-asking the gateway's API — see
     lib/payments' verify().
   - Omise does NOT retry failed webhook deliveries, so the webhook is a fast
     path and not a guarantee. backend/paymentReconciler.js is what actually
     guarantees a paid charge is recognised; see its header.

   Overbooking is a known non-goal for this property (the owner has said it
   isn't a real concern — see lib/roomRates.js's ROOM_INVENTORY placeholders),
   so a booking is written as status='confirmed' the moment it's submitted
   regardless of payment outcome. Only the payment_* columns differ: a charge
   that settles SYNCHRONOUSLY is approved/declined before the row is ever
   written, while an asynchronous one (a PromptPay QR awaiting a scan, or a
   card awaiting a 3-D Secure challenge) stays payment_status='pending' until
   the webhook below confirms it — there is no "hold room pending payment"
   state to reconcile.
   ============================================================ */
const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const payments = require('../lib/payments');
const paymentDetail = require('../lib/payments/detail');
const reconciler = require('../paymentReconciler');
const paymentsLedger = require('../lib/paymentsLedger');
const paymentReport = require('../lib/paymentReport');
const T = require('../lib/emailTemplate');
// Mirrors the constants in routes/guestBookings.js; the day-use request is
// the only guest email built here rather than there.
const HOTEL_ADDRESS_LINE = '88/88 Thanon Sukprayun, Na Pa, Mueang Chonburi District, Chon Buri 20000, Thailand';
const HOTEL_PHONE_LIST = ['+66 86 326 0664', '+66 38 448 111'];
const HOTEL_EMAIL_ADDR = 'jparkhotel1@gmail.com';
const { requireAuth, requireAdmin } = require('../middleware/auth');
const roomRates = require('../lib/roomRates');
const rateOverrides = require('../lib/rateOverrides');
const { countOverlappingPool } = require('../lib/availability');
const { makeLimiter } = require('../lib/rateLimit');
const { sendEmail } = require('../mailer');
const {
  row2js,
  row2jsPublic,
  fireBookingEmails,
  fireGroupBookingEmails,
  sendPaymentConfirmedEmail,
  sendGroupPaymentConfirmedEmail,
  // Tells the hotel a guest's card was refused. Nothing said this out loud
  // before: a decline rolled back its transaction and left, and the only
  // record was a percentage on the acquirer's dashboard.
  sendDeclinedAttemptNotice: fireDeclinedAttemptNotice,
  computeNights,
  hotelNotice,
  confirmationEmail,
  hotelRecipients,
  emailLetterhead,
  escapeHtml: esc,
  SPAM_NOTE_TEXT,
  EMAIL_I18N,
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
// overrides for a booking paid online — omitted (or undefined), they default
// to exactly what every pay-at-checkin booking has always used, so no
// existing call site needs to change.
async function insertBookingRow(client, p) {
  const { rows } = await client.query(
    `INSERT INTO guest_bookings
       (ref, channel, channel_name, guest_name, guest_last_name, guest_email, guest_phone,
        room, check_in, check_out, nights, adults, children, total, currency, status, lang,
        payment_provider, payment_method, payment_status, payment_charge_id,
        smoking_preference, breakfast, child_ages,
        special_requests, group_ref, group_index, group_size, extra_bed, non_refundable,
        -- Everything the gateway said about the payment. Appended at the END
        -- of the list on purpose: inserting a column mid-list silently shifts
        -- every positional parameter after it, which is exactly how the test
        -- stub's group_ref came to be read one slot late.
        payment_amount, payment_currency, payment_fee, payment_fee_vat, payment_net,
        payment_refunded_amount, payment_paid_at, payment_transaction_id,
        payment_card_brand, payment_card_last4, payment_card_expiry,
        payment_card_bank, payment_card_country, payment_card_funding,
        payment_3ds, payment_failure_code, payment_failure_message,
        payment_livemode, payment_detail, payment_detail_at)
     VALUES ($1,'direct','Direct (Website)',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'THB','confirmed',$13,
             $14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,
             $27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41,$42,$43,$44,$45,$46)
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
      // One flattening function shared with the reconciler and the backfill,
      // so the four places a payment can be written can never disagree about
      // what a payment record contains.
      ...(function () {
        const c = paymentDetail.toColumns(p.paymentDetail);
        return [
          c.payment_amount, c.payment_currency, c.payment_fee, c.payment_fee_vat, c.payment_net,
          c.payment_refunded_amount, c.payment_paid_at, c.payment_transaction_id,
          c.payment_card_brand, c.payment_card_last4, c.payment_card_expiry,
          c.payment_card_bank, c.payment_card_country, c.payment_card_funding,
          c.payment_3ds, c.payment_failure_code, c.payment_failure_message,
          c.payment_livemode, c.payment_detail, c.payment_detail_at,
        ];
      }()),
    ]
  );
  return rows[0];
}

/* ── Recording a payment ATTEMPT, including the ones that failed ─────────
   A declined charge deliberately leaves no booking row: the route charges
   before it inserts, so a card the bank refuses writes nothing that would
   have to be rolled back. That is correct, and it means the decline itself
   had nowhere to live — a guest with a real name and a real email tried to
   give the hotel money, was turned away by their bank, and the only trace was
   a percentage in the acquirer's dashboard.

   That is a lost booking somebody could phone back.

   Two rules this function must obey, both learned from the surrounding code:

   1. IT USES THE POOL, NEVER THE CALLER'S CLIENT. Every decline call site sits
      immediately after `await client.query('ROLLBACK')` with `client.release()`
      already queued in a `finally`. A query on that client would either write
      into a dead transaction or throw into the outer catch and turn a clean
      402 into a 500 — converting "your card was declined" into "the hotel's
      website is broken".

   2. IT IS NEVER AWAITED INTO THE RESPONSE PATH. Bookkeeping must not be able
      to delay, or fail, the answer a guest is waiting for. Fire, catch, log. */
function recordAttempt(a) {
  const d = a.detail || null;
  const card = (d && d.card) || {};
  const failure = a.failure || (d && d.failure) || {};
  db.query(
    `INSERT INTO payment_attempts
       (charge_id, provider, method, outcome, booking_ref, group_ref, booking_id,
        guest_name, guest_email, guest_phone, room, check_in, check_out,
        amount, currency, failure_code, failure_message,
        card_brand, card_last4, card_bank, card_country, livemode, detail)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)`,
    [
      a.chargeId || (d && d.chargeId) || null,
      a.provider || (d && d.provider) || null,
      a.method || null,
      a.outcome || null,
      a.bookingRef || null,
      a.groupRef || null,
      a.bookingId || null,
      a.guestName || null,
      a.guestEmail || null,
      a.guestPhone || null,
      a.room || null,
      a.checkIn || null,
      a.checkOut || null,
      a.amount != null ? a.amount : (d && d.amount),
      a.currency || (d && d.currency) || 'THB',
      failure.code || null,
      failure.message || null,
      card.brand || null,
      card.last4 || null,
      card.bank || null,
      card.country || null,
      d ? d.livemode : null,
      d && d.snapshot ? JSON.stringify(d.snapshot) : null,
    ]
  ).catch((e) => console.error('[payments] could not record payment attempt', (e && e.message) || e));
}

// ── Online payment (card + PromptPay, via lib/payments) ─────────────────────
// Hybrid, per-booking choice — a guest may still pick pay-at-checkin (the
// default, and the only option while no gateway's keys are set). Nothing
// below ever trusts a client-supplied amount; amountTHB is always the sum
// that computeTotal()/validateAndPriceRoom() produced server-side.
const ONLINE_PAYMENT_METHODS = ['card', 'promptpay'];

// Is prepayment currently required (busy/holiday policy) AND actually
// enforceable? require_prepayment is an admin switch (site_content, toggled from
// routes/bookingPolicy.js), but it only takes effect while a payment gateway is
// configured — forcing prepay when nobody can pay online would block every
// booking. Fails safe to FALSE on any DB error: a booking must never be blocked
// by this lookup.
async function isPrepayRequired() {
  if (!payments.isConfigured()) return false;
  try {
    const { rows } = await db.query('SELECT require_prepayment FROM site_content WHERE id = 1');
    return rows.length ? !!rows[0].require_prepayment : false;
  } catch (e) {
    console.error('[payments] prepay flag', e);
    return false;
  }
}

/* ── Online payment is the rule, not an option ───────────────────────────
   A booking made on this website is paid on this website, by card or
   PromptPay. "Pay at check-in" is no longer offered.

   ONE exception, and it is a deliberate one: if no gateway is configured — no
   keys, a suspended merchant account, a provider outage that leaves
   isConfigured() false — the site falls back to pay-at-check-in rather than
   refusing every direct booking. An online-only rule that turns the booking
   form into a dead end the moment the acquirer has a bad afternoon is not a
   policy, it is an outage with a policy painted on it. The front desk can
   always take money; the website cannot always reach a gateway.

   ALLOW_PAY_AT_CHECKIN=true re-opens it deliberately (a phone booking taken
   through the same form, a gateway migration), and is deliberately an
   environment variable rather than an admin toggle: it is a temporary
   operational escape hatch, not a setting somebody should be able to leave on
   by accident from a phone.

   This deliberately does NOT reuse site_content.require_prepayment. That flag
   means something else and still does: "these dates are non-refundable
   because they are busy", which stamps non_refundable on the booking and
   changes the guest-facing copy. Folding a permanent payment rule into a
   seasonal refund policy would make every booking non-refundable forever. */
function payAtCheckinAllowed() {
  if (!payments.isConfigured()) return true; // no gateway — never dead-end a guest
  return String(process.env.ALLOW_PAY_AT_CHECKIN || '').trim().toLowerCase() === 'true';
}

function resolvePaymentChoice(b, prepayRequired) {
  const raw = b.paymentMethod;
  if (!raw || raw === 'pay_at_checkin') {
    // The online-only rule, checked BEFORE the seasonal prepay flag: it is the
    // broader of the two, and its message is the one a guest needs.
    if (!payAtCheckinAllowed()) {
      return {
        error: 'Bookings made on our website are paid online, by card or PromptPay. ' +
          'If you would rather pay in person, please call the hotel and we will take your booking by phone.',
        // A machine-readable code so the booking page can recover — reload the
        // payment config and re-render with a valid method — instead of
        // dead-ending a guest on a fully filled form.
        code: 'ONLINE_PAYMENT_REQUIRED',
      };
    }
    // Busy/holiday policy: no pay-at-check-in — the guest must pay online now.
    if (prepayRequired) {
      return {
        error: 'Prepayment is required for these dates. Please pay online by card or PromptPay.',
        code: 'ONLINE_PAYMENT_REQUIRED',
      };
    }
    return { method: 'pay_at_checkin' };
  }
  if (!ONLINE_PAYMENT_METHODS.includes(raw)) {
    return { error: 'paymentMethod must be "pay_at_checkin", "card", or "promptpay"' };
  }
  // supportsMethod() is per-method, not just per-gateway: a GB Prime Pay
  // account can have cards activated while its QR Cash product is still
  // pending, and offering PromptPay in that window would fail at charge time.
  if (!payments.supportsMethod(raw)) {
    return { error: 'Online payment is not currently available. Please choose pay at check-in.' };
  }
  if (raw === 'card' && !b.cardToken) {
    return { error: 'Missing card token' };
  }
  return { method: raw, cardToken: b.cardToken };
}

// Builds the payment fragment of the API response from a charge outcome.
// Deliberately narrow: the frontend gets what it needs to show a QR, follow
// a 3-D Secure redirect, or print a "paid" banner — and nothing else about
// the gateway transaction.
function paymentResponse(method, onlinePayment) {
  if (!onlinePayment) return null;
  return {
    method,
    provider: onlinePayment.provider,
    paid: Boolean(onlinePayment.paid),
    qrImage: onlinePayment.qrImage || null,
    redirect: onlinePayment.redirect || null,
    expiresAt: onlinePayment.expiresAt || null,
  };
}

/* GET /payments/config — tells the booking page which online payment methods
   to offer, and how to tokenize a card for whichever gateway is live. While
   no gateway's keys are set this reports paymentEnabled: false and the guest
   sees only pay-at-checkin — i.e. all of this ships long before the hotel's
   merchant account is approved, and needs no redeploy when it is. */
router.get('/payments/config', async (_req, res) => {
  // prepayRequired already folds in payments.isConfigured() (see
  // isPrepayRequired), so the booking page only ever hides pay-at-check-in when
  // online payment can actually be taken — the switch is inert until real keys
  // are live.
  res.json(Object.assign(payments.publicConfig(), {
    prepayRequired: await isPrepayRequired(),
    // FALSE in normal operation: bookings made here are paid here. It only
    // goes true when no gateway is reachable (so the site must not dead-end a
    // guest) or when ALLOW_PAY_AT_CHECKIN is deliberately set. The booking
    // page renders the pay-at-check-in option only when this says it may.
    payAtCheckinAllowed: payAtCheckinAllowed(),
  }));
});

/* GET /payments/status/:id — the frontend polls this while an online payment
   is still resolving: a PromptPay QR awaiting the guest's scan, or a card
   awaiting the 3-D Secure round trip. Works the same for a solo or group-cart
   row — each row (even within a group sharing one charge) has its own id.

   :id is EITHER the booking id (what the page has when it never left the
   browser) or a reference string (what it has after coming back from a 3-D
   Secure redirect, since the booking id was never in that URL).

   All four candidate columns are matched in ONE query rather than picking a
   lookup by the shape of the id, which is how this route was written and why
   it was broken: it tested /^\d+$/ and treated a non-numeric id as a
   reference, on the assumption that booking ids are integers. They are not —
   guest_bookings.id is `TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text`,
   so every real booking id fell through to the reference branch, matched
   nothing, and 404'd. The effect was invisible server-side (the webhook still
   settled the charge and the emails still went out) and highly visible to the
   guest: after paying by PromptPay or clearing a 3-D Secure challenge, the
   page polled a 404 until it gave up and never showed "paid".

   Which column identifies a payment depends on the gateway, so all of them
   are tried: Omise mints its charge id only once the charge exists — too late
   to appear in a return URL built before it — so an Omise booking is found by
   its own ref, or by group_ref since every room of a group shares one charge.
   Every one of these values is unguessable, and the response is the same
   three non-sensitive fields the poll always exposed. */
router.get('/payments/status/:id', async (req, res) => {
  const id = String(req.params.id || '');
  try {
    const { rows } = await db.query(
      `SELECT id, ref, status, payment_status FROM guest_bookings
        WHERE id = $1 OR payment_charge_id = $1 OR ref = $1 OR group_ref = $1
        ORDER BY group_index NULLS FIRST LIMIT 1`,
      [id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Booking not found' });
    const bk = rows[0];
    res.json({ ref: bk.ref, status: bk.status, paymentStatus: bk.payment_status });
  } catch (e) {
    console.error('[payments] status', e);
    res.status(500).json({ error: 'Database error' });
  }
});

/* GET|POST /payments/return — the landing point for a guest coming back from
   a 3-D Secure challenge, and nothing more than a redirector.

   It exists because of a hosting mismatch: GB Prime Pay returns the payer by
   POSTing to responseUrl, while the booking page is served from static
   hosting that answers a POST with 405. This route absorbs that POST and
   sends the guest on to the booking page as a plain GET.

   It deliberately reads NO payment status from the request. Whatever the
   gateway posts here arrives through the guest's own browser and is therefore
   forgeable; the authoritative confirmation is the server-to-server webhook
   below, which re-verifies against the gateway's API. All this route carries
   forward is the charge reference, which the booking page uses only to poll
   for a status this server already knows. */
router.all('/payments/return', express.urlencoded({ extended: false, limit: '64kb' }), (req, res) => {
  const ref = String((req.query && req.query.ref) || (req.body && req.body.referenceNo) || '');
  const target = payments.bookingPageUrl(ref);
  if (!target) {
    // No PUBLIC_SITE_URL / FRONTEND_ORIGIN configured — better a plain,
    // truthful page than a redirect to nowhere. The booking is already
    // confirmed and the guest has their emailed confirmation regardless.
    return res.status(200).type('html').send(
      '<!doctype html><meta charset="utf-8"><title>Payment received</title>' +
      '<p style="font-family:system-ui;padding:2rem">Thank you — your payment has been submitted and your reservation is confirmed. ' +
      'You can close this window; a confirmation email is on its way.</p>'
    );
  }
  res.redirect(302, target);
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
  if (paymentChoice.error) {
    return res.status(400).json({ error: paymentChoice.error, code: paymentChoice.code });
  }
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

    // The guest-facing booking ref is minted BEFORE the charge so it can ride
    // along to the gateway (GB Prime Pay shows it against the transaction in
    // the merchant dashboard) — that line is what lets the front desk match a
    // settlement entry back to a reservation.
    const ref = genRef();

    // Charge BEFORE inserting anything: a declined card must leave no row
    // behind at all — there is nothing to roll back, since nothing was
    // written. An asynchronous charge (PromptPay QR, or a card heading into a
    // 3-D Secure challenge) always "succeeds" at this step — it only creates
    // a pending charge — so it always proceeds to the insert below.
    let onlinePayment = null;
    if (paymentChoice.method !== 'pay_at_checkin') {
      const result = await payments.charge({
        method: paymentChoice.method,
        amountTHB: v.total,
        cardToken: paymentChoice.cardToken,
        bookingRef: ref,
        guest: { name: `${guestName} ${guestLastName || ''}`.trim(), email: guest.email, phone: guest.phone },
        description: `J Park Hotel — ${v.room} (${v.variantLabel}) ${checkIn} to ${checkOut}`,
        // `bookingRef` is what makes a charge in the gateway's dashboard
        // traceable back to a reservation. It was being passed to
        // payments.charge() and then dropped — omise.chargeCard() never
        // destructured it — so every single-room charge reached Omise with no
        // reference at all, and the group path was the only one that carried
        // one. A declined charge is exactly when that matters most: there is
        // no booking row to match it against, so without the ref in metadata
        // there is nothing to match it BY.
        metadata: { bookingRef: ref, room: v.room, variantLabel: v.variantLabel, checkIn, checkOut },
      });
      const attemptBase = {
        provider: result.provider || (payments.active() && payments.active().id),
        method: paymentChoice.method,
        bookingRef: ref,
        guestName: `${guestName} ${guestLastName || ''}`.trim(),
        guestEmail: guest.email,
        guestPhone: guest.phone,
        // `room` here is the room TYPE ("Studio Single"), never a room
        // number — no room has been assigned at booking time, and the two are
        // different columns for exactly that reason.
        room: v.room,
        checkIn,
        checkOut,
        amount: v.total,
        detail: result.detail || null,
      };
      if (!result.ok) {
        await client.query('ROLLBACK');
        // Recorded on the POOL, after the rollback, never awaited — see
        // recordAttempt(). This is the only record that this guest tried.
        recordAttempt(Object.assign({}, attemptBase, {
          outcome: result.status === 402 ? 'declined' : 'error',
          failure: result.failure || null,
        }));
        fireDeclinedAttemptNotice(Object.assign({}, attemptBase, { failure: result.failure || null }));
        return res.status(result.status).json({ error: result.error });
      }
      recordAttempt(Object.assign({}, attemptBase, {
        outcome: result.paid ? 'paid' : 'pending',
        chargeId: result.chargeRef,
      }));
      onlinePayment = result;
    }

    const saved = await insertBookingRow(client, {
      ref, guestName, guestLastName, guestEmail: guest.email, guestPhone: guest.phone,
      room: v.room, checkIn, checkOut, nights, adults: v.adults, children: v.children,
      total: v.total, lang: b.lang, smoking: v.smoking, breakfast: v.breakfast,
      childAges: v.childAges, extraBed: v.extraBed, specialRequests,
      nonRefundable: prepayRequired,
      paymentProvider: onlinePayment ? onlinePayment.provider : undefined,
      paymentMethod: onlinePayment ? paymentChoice.method : undefined,
      paymentStatus: onlinePayment ? (onlinePayment.paid ? 'paid' : 'pending') : undefined,
      paymentChargeId: onlinePayment ? onlinePayment.chargeRef : undefined,
      paymentDetail: onlinePayment ? onlinePayment.detail : undefined,
    });
    await client.query('COMMIT');

    fireBookingEmails({ ...saved, inserted: true });

    // A charge that did not settle inline (a PromptPay QR awaiting a scan, a
    // card heading into 3-D Secure) is now waiting on a webhook Omise does
    // not promise to retry. Start watching it independently, so the payment
    // is recognised even if that delivery never lands.
    if (onlinePayment && !onlinePayment.paid && onlinePayment.chargeRef) {
      reconciler.watch(onlinePayment.chargeRef);
    }

    res.status(201).json({
      status: 'confirmed',
      booking: row2jsPublic(saved),
      payment: paymentResponse(paymentChoice.method, onlinePayment),
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
  if (paymentChoice.error) {
    return res.status(400).json({ error: paymentChoice.error, code: paymentChoice.code });
  }
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
      const result = await payments.charge({
        method: paymentChoice.method,
        amountTHB: grandTotal,
        cardToken: paymentChoice.cardToken,
        bookingRef: groupRef,
        guest: { name: `${guestName} ${guestLastName || ''}`.trim(), email: guest.email, phone: guest.phone },
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
        paymentProvider: onlinePayment ? onlinePayment.provider : undefined,
        paymentMethod: onlinePayment ? paymentChoice.method : undefined,
        paymentStatus: onlinePayment ? (onlinePayment.paid ? 'paid' : 'pending') : undefined,
        paymentChargeId: onlinePayment ? onlinePayment.chargeRef : undefined,
        // Every room of a group shares ONE charge, so every room carries the
        // same detail record. The money is not multiplied by writing it to
        // each row — each row's own `total` is its share, and any report that
        // sums a group's payment_amount must group by payment_charge_id. The
        // ledger and the daily report both do.
        paymentDetail: onlinePayment ? onlinePayment.detail : undefined,
      });
      savedRows.push(saved);
    }
    await client.query('COMMIT');

    // One aggregated guest confirmation + one aggregated hotel notice for the
    // whole group (fire-and-forget; queries the just-inserted rows by group_ref).
    fireGroupBookingEmails(groupRef);

    // Same safety net as the single-room path. Every room of the group shares
    // one payment_charge_id, so one watch covers the whole reservation.
    if (onlinePayment && !onlinePayment.paid && onlinePayment.chargeRef) {
      reconciler.watch(onlinePayment.chargeRef);
    }

    res.status(201).json({
      status: 'confirmed',
      groupRef,
      grandTotal,
      currency: 'THB',
      rooms: savedRows.map((r) => ({ ref: r.ref, room: r.room, total: Number(r.total || 0) })),
      bookings: savedRows.map(row2jsPublic),
      payment: paymentResponse(paymentChoice.method, onlinePayment),
    });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error('[payments] reservations/group', e);
    res.status(500).json({ error: 'Database error' });
  } finally {
    client.release();
  }
});

// Optional shared-secret gate for the webhook, ?key=<PAYMENT_WEBHOOK_SECRET>.
/* A tally of what the webhook endpoint has actually been receiving.

   Enforcing signature verification introduces a failure mode that enabling it
   is supposed to prevent: if OMISE_WEBHOOK_SIGNING_SECRET does not match what
   the gateway signs with — and test mode and live mode have DIFFERENT signing
   secrets — then every genuine delivery is rejected as a forgery. Payments
   still get recovered, because the reconciler does not depend on the webhook,
   so nothing breaks loudly. The fast path simply dies in silence.

   These counters make that visible on the diagnostics page. In memory only —
   they reset on deploy, cost nothing, and touch no database. */
const webhookStats = { accepted: 0, badSignature: 0, badKey: 0, ignored: 0, lastAt: null };

// This is a SECONDARY guard only — every webhook delivery is re-verified
// against the gateway's own API below regardless of this check, since no
// supported gateway cryptographically signs its notification bodies and none
// may ever be trusted on their own. Same shape as guestBookings.js's
// ingestKeyOk(). OMISE_WEBHOOK_SECRET is still honoured so an existing
// deployment's env doesn't have to be renamed to keep working.
function webhookKeyOk(provided) {
  const expected = process.env.PAYMENT_WEBHOOK_SECRET || process.env.OMISE_WEBHOOK_SECRET || '';
  if (!expected) return true;
  if (!provided) return false;
  const a = Buffer.from(String(provided));
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/* POST /payments/webhook — payment-gateway notification receiver (GB Prime
   Pay's backgroundUrl, Omise's webhook). Confirms any charge that could not
   settle synchronously: a PromptPay QR once the guest has scanned and paid,
   or a card once the guest has cleared the 3-D Secure challenge. A charge
   that already settled inline is a no-op here — see the payment_status !=
   'paid' guard below. For a group booking, every room shares the SAME
   payment_charge_id (one charge covers the whole cart), so the UPDATE
   naturally flips every row in the group in one statement.

   Mounted with a urlencoded body parser in addition to the router-wide JSON
   one because GB Prime Pay posts form-encoded notifications for some payment
   products and JSON for others; express.json() ignores the former, which
   would otherwise leave req.body empty and silently drop every confirmation. */
/* GET /payments/webhook — a human opened the webhook address in a browser.

   The webhook itself is POST-only, so without this the URL answers Express's
   bare "Cannot GET /api/v1/payments/webhook", which reads as a broken
   endpoint at exactly the moment someone is checking whether they set it up
   correctly. They almost certainly want the diagnostics page, so say so.

   Deliberately says nothing about whether the ?key= was right: the webhook's
   shared secret must not have a public oracle to guess against. Key checking
   belongs on the diagnostics route, which is itself gated. */
router.get('/payments/webhook', (req, res) => {
  const site = payments.siteBaseUrl();
  const wantsHtml = String(req.get('accept') || '').includes('text/html');
  const message = 'This is the payment webhook endpoint. It is working, and it is meant to be ' +
    'called by the payment gateway, not opened in a browser — it only accepts POST requests.';
  const next = 'To check your payment setup, open /api/v1/payments/diagnostics?key=YOUR_PAYMENT_WEBHOOK_SECRET';

  if (!wantsHtml) {
    return res.json({ ok: true, endpoint: 'payments/webhook', accepts: 'POST', message, next });
  }
  res.type('html').send(
    '<!doctype html><meta charset="utf-8"><title>Payment webhook · J Park Hotel</title>' +
    '<div style="font-family:system-ui,sans-serif;max-width:640px;margin:12vh auto;padding:0 24px;line-height:1.6;color:#1a1a1a">' +
    '<p style="color:#0c5b58;font-weight:700;letter-spacing:.02em;margin:0 0 6px">J PARK HOTEL · PAYMENTS</p>' +
    '<h1 style="margin:0 0 16px;font-size:1.5rem">Webhook endpoint is live</h1>' +
    '<p>' + esc(message) + '</p>' +
    '<p style="background:#f2f7f6;border:1px solid #cfe3e0;border-radius:10px;padding:14px 16px">' +
    'Nothing is wrong. Seeing this page means the address is correct — register this exact URL in the ' +
    'Omise dashboard under <strong>Webhooks</strong>.</p>' +
    '<p><strong>To actually check your setup</strong>, open:<br>' +
    '<code style="background:#f4f4f4;padding:3px 6px;border-radius:5px">/api/v1/payments/diagnostics?key=YOUR_PAYMENT_WEBHOOK_SECRET</code></p>' +
    (site ? '<p style="margin-top:28px"><a href="' + esc(site) + '" style="color:#0c5b58">← Back to jparkhotel.com</a></p>' : '') +
    '</div>'
  );
});

router.post('/payments/webhook', express.urlencoded({ extended: false, limit: '64kb' }), async (req, res) => {
  webhookStats.lastAt = new Date().toISOString();
  if (!webhookKeyOk(req.query.key)) {
    webhookStats.badKey += 1;
    return res.status(401).json({ error: 'Invalid webhook key' });
  }

  // Cryptographic check, when Omise is signing (OMISE_WEBHOOK_SIGNING_SECRET
  // set). `null` means this provider has no signature scheme or no secret is
  // configured — carry on, because the API re-verification below is the real
  // authority either way. `false` means a signature was presented and did not
  // check out, which is a forgery attempt, not a delivery.
  const signature = payments.verifySignature(req.rawBody, req.headers);
  if (signature === false) {
    webhookStats.badSignature += 1;
    console.error('[payments] webhook rejected — bad signature. If this is happening to ' +
      'real deliveries, OMISE_WEBHOOK_SIGNING_SECRET does not match the gateway ' +
      '(test and live mode have different signing secrets).');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const parsed = payments.parseWebhook(req.body);
  if (!parsed || !parsed.chargeRef) {
    webhookStats.ignored += 1;
    return res.status(200).json({ ok: true });
  }
  webhookStats.accepted += 1;
  const chargeRef = parsed.chargeRef;

  try {
    // Never trust the notification body's own claimed status — re-ask the
    // gateway and act only on that answer. checkOnce() re-verifies, then
    // routes the answer: a paid charge through the same atomic settle() the
    // reconciler uses (so a webhook and a reconciliation check can race safely
    // and only one of them ever records the payment or sends the email), and a
    // FAILED or EXPIRED one through markUnpaid().
    //
    // This used to call settle() directly, which acted only on success — so a
    // charge the bank refused, or a PromptPay QR that expired, stayed at
    // 'pending' until a sweep noticed hours later. On the booking board
    // 'pending' reads as "money is on its way", which is the one thing it is
    // not.
    await reconciler.checkOnce(chargeRef);
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[payments] webhook', e);
    // Omise does NOT retry failed deliveries, so a non-2xx here does not buy
    // a second chance the way it would with most gateways — this response is
    // for the logs. What actually recovers the payment is
    // backend/paymentReconciler.js, which re-checks this charge on its own
    // schedule until it settles.
    res.status(500).json({ error: 'Webhook processing error' });
  }
});

/* POST /payments/reconcile — the scheduled backstop for a webhook that never
   arrived. Re-checks every recent booking still waiting on an online payment
   against the gateway, settles any that were really paid, and closes out any
   whose charge expired. See backend/paymentReconciler.js for why this is
   necessary rather than belt-and-braces: Omise does not retry failed webhook
   deliveries, so without this a single missed delivery means the guest paid
   and the hotel never found out.

   Gated by the same shared secret as the webhook. Called by
   .github/workflows/health-check.yml on its 4×/day schedule — the one that
   already wakes the database, so this adds no extra Neon compute — and safe
   to run by hand at any time (it is idempotent). */
router.post('/payments/reconcile', async (req, res) => {
  if (!webhookKeyOk(req.query.key)) {
    return res.status(401).json({ error: 'Invalid webhook key' });
  }
  if (!payments.isConfigured()) {
    return res.json({ ok: true, skipped: 'no payment gateway configured' });
  }
  try {
    const result = await reconciler.sweep({ reason: 'scheduled' });
    res.json(Object.assign({ ok: true }, result));
  } catch (e) {
    console.error('[payments] reconcile', e);
    res.status(500).json({ error: 'Reconcile failed' });
  }
});

/* POST /payments/email-preview — send the real templates to the hotel's own
   inbox, so they can be judged where they will actually be read.

   A rendered file in a browser is not the test that matters: mail clients
   rewrite HTML, block images, and Outlook lays out with Word. This posts the
   genuine builders through the genuine mailer, with sample data, so what lands
   in the inbox is what a guest would receive.

   Two properties keep it from being a mail relay, which is what the last
   audit found and closed on POST /api/email:

     • the recipient is NOT taken from the request. It is always
       hotelRecipients() — the hotel's own configured address. There is no
       parameter that can redirect it anywhere.
     • the body is NOT taken from the request either. It is rendered from
       fixed sample data by the same functions that build real confirmations,
       so nothing a caller sends can appear in the message.

   Every subject is prefixed so nobody mistakes one for a real reservation. */
router.post('/payments/email-preview', diagnosticsAuth, async (_req, res) => {
  const sample = {
    id: '00000000-0000-4000-8000-000000000000',
    ref: 'JP-SAMPLE-001',
    channel: 'direct', channel_name: 'Direct (Website)',
    guest_name: 'Sample Guest', guest_last_name: 'Preview',
    guest_email: hotelRecipients()[0], guest_phone: '+66 86 326 0664',
    room: 'Studio Single', check_in: '2026-12-01', check_out: '2026-12-03',
    nights: 2, adults: 2, children: 1, total: '1980.00', currency: 'THB',
    status: 'confirmed', lang: 'en',
    smoking_preference: 'non_smoking', breakfast: true, extra_bed: false,
    child_ages: [7], special_requests: 'Late arrival, around 23:00',
    payment_provider: 'omise', payment_method: 'card',
    payment_status: 'paid', payment_charge_id: 'chrg_sample_preview',
    non_refundable: false,
  };

  const messages = [
    ['Guest confirmation (paid online)', confirmationEmail(sample)],
    ['Guest confirmation (pay at check-in)', confirmationEmail(Object.assign({}, sample, {
      payment_provider: 'in_person', payment_method: 'pay_at_checkin', payment_status: 'pending', payment_charge_id: null,
    }))],
    ['Hotel notice (new booking)', hotelNotice(sample)],
  ];

  const to = hotelRecipients();
  const sent = [];
  for (const [label, msg] of messages) {
    const r = await sendEmail({
      to,
      subject: `[TEST — please ignore] ${label} — J Park Hotel email preview`,
      html: msg.html,
      text: `*** THIS IS A TEST EMAIL. No booking has been made. ***

` + msg.text,
    }, { kind: 'email-preview' });
    sent.push({ label, ok: !!(r && r.ok), error: (r && r.error) || null });
  }
  res.json({ ok: sent.every((x) => x.ok), to, sent });
});

/* GET /payments/diagnostics — admin-only go-live check, run against the
   DEPLOYED service where the keys actually live.

   This exists because every way pasting the keys can go wrong is silent. Test
   keys look exactly like live keys apart from one prefix segment. An
   unregistered webhook fails invisibly until a real guest pays. A missing
   PUBLIC_SITE_URL only shows up when someone is stranded after 3-D Secure.
   None of that surfaces anywhere until money is involved, so it is asked
   here, out loud, in one place.

   Two ways in, because the person who needs this most is the one pasting keys
   into Render, who has no admin session in hand at that moment:
     • a signed-in admin (the staff console), or
     • ?key=<PAYMENT_WEBHOOK_SECRET>, so it can be opened in a browser.
   The key route is available ONLY when that secret is actually set — an unset
   secret makes the webhook accept unauthenticated posts by design, and that
   must never extend to an endpoint that reports merchant-account details.

   Talks to the gateway for real (GET /account), so it is gated and not
   something to hammer. It returns no secret — only the account facts needed
   to answer "is this actually going to work". */
/* Renders the diagnostics result for whoever asked.

   A browser gets a readable checklist, because the person running this is the
   one pasting keys into Render — often not a developer, and usually mid-way
   through a go-live with a hotel to run. A raw JSON dump is a poor answer to
   "did it work?". Anything else (curl, a script) still gets the JSON. */
function sendDiagnostics(req, res, out) {
  // Advisory items are recommendations; they never fail the report.
  out.ok = out.checks.every((c) => c.ok || c.advisory);
  if (!String(req.get('accept') || '').includes('text/html')) return res.json(out);

  const row = (c) => {
    const mark = c.ok ? '✓' : (c.advisory ? '•' : '✕');
    const colour = c.ok ? '#1a7f37' : (c.advisory ? '#8a5a00' : '#b3261e');
    return '<li style="display:flex;gap:12px;padding:11px 0;border-bottom:1px solid #ececec">' +
      '<span style="color:' + colour + ';font-weight:700;flex:0 0 16px">' + mark + '</span>' +
      '<span><strong style="font-weight:600">' + esc(c.name) + '</strong>' +
      (c.detail ? '<br><span style="color:#666;font-size:.9em">' + esc(c.detail) + '</span>' : '') +
      '</span></li>';
  };

  const live = out.mode === 'live';
  const banner = !out.configured
    ? { bg: '#fdecea', bd: '#f0b7b1', fg: '#8a2a1a', text: 'Online payment is OFF — no gateway keys are set. Guests can only pay at check-in.' }
    : live
      ? { bg: '#e6f4ea', bd: '#a6d8b1', fg: '#1a7f37', text: 'LIVE MODE — real payments are being taken.' }
      : { bg: '#fff4e5', bd: '#f0c07a', fg: '#8a5a00', text: 'TEST MODE — no real money will move. Swap in the live keys when ready.' };

  res.type('html').send(
    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Payment status · J Park Hotel</title>' +
    '<div style="font-family:system-ui,sans-serif;max-width:720px;margin:8vh auto;padding:0 24px;line-height:1.55;color:#1a1a1a">' +
    '<p style="color:#0c5b58;font-weight:700;letter-spacing:.02em;margin:0 0 6px">J PARK HOTEL · PAYMENTS</p>' +
    '<h1 style="margin:0 0 4px;font-size:1.6rem">' + (out.ok ? 'Everything checks out' : 'Needs attention') + '</h1>' +
    '<p style="color:#666;margin:0 0 20px">' +
      (out.provider ? esc(out.provider) : 'no gateway') +
      (out.methods && out.methods.length ? ' · ' + esc(out.methods.join(', ')) : '') + '</p>' +
    '<p style="background:' + banner.bg + ';border:1px solid ' + banner.bd + ';border-radius:10px;' +
      'padding:12px 16px;color:' + banner.fg + ';font-weight:600">' + esc(banner.text) + '</p>' +
    '<ul style="list-style:none;padding:0;margin:24px 0 0">' + out.checks.map(row).join('') + '</ul>' +
    (out.ok
      ? '<p style="margin-top:24px;color:#666">Nothing to do. A guest paying online will be charged, ' +
        'confirmed by email, and shown as paid on the booking board.</p>'
      : '<p style="margin-top:24px;color:#666">Fix anything marked ✕ above, then reload this page. ' +
        'See <code>docs/PAYMENTS_SETUP.md</code> for what each check means.</p>') +
    '</div>'
  );
}

function diagnosticsAuth(req, res, next) {
  const secret = process.env.PAYMENT_WEBHOOK_SECRET || process.env.OMISE_WEBHOOK_SECRET || '';
  if (secret && req.query.key && webhookKeyOk(req.query.key)) return next();
  return requireAdmin(req, res, next);
}

router.get('/payments/diagnostics', diagnosticsAuth, async (req, res) => {
  const provider = payments.active();
  const expectedWebhook = payments.webhookUrl();
  // payments.webhookUrl() embeds PAYMENT_WEBHOOK_SECRET as ?key=… — that is
  // correct for the URL registered with Omise, and wrong to hand back in a
  // response body that gets pasted into chats, screenshots and logs. Report
  // the address, redact the credential: nobody needs to copy it by hand,
  // because POST /payments/diagnostics/register-webhook registers the real
  // URL directly. The registered-vs-expected comparison below only ever looks
  // at the part before the query string, so redaction costs the check nothing.
  const redact = (url) => String(url || '').replace(/([?&]key=)[^&]+/, '$1***');
  const out = {
    configured: payments.isConfigured(),
    provider: provider ? provider.id : null,
    mode: payments.mode(),
    methods: provider && provider.isConfigured() ? provider.methods() : [],
    expectedWebhookUrl: redact(expectedWebhook) || null,
    siteBaseUrl: payments.siteBaseUrl() || null,
    // Since the last deploy. Zeroes are normal on a quiet API or a fresh
    // restart; they mean "nothing observed", not "nothing working".
    webhookDeliveries: Object.assign({}, webhookStats),
    apiBaseUrl: payments.apiBaseUrl() || null,
    checks: [],
  };
  const add = (name, ok, detail, advisory) =>
    out.checks.push({ name, ok, detail: detail || '', advisory: Boolean(advisory) });

  add('Gateway keys are set', out.configured,
    out.configured ? `${out.provider} (${out.mode} mode)` : 'No gateway keys in the environment — online payment is switched off');
  add('Public site URL is set (guests return here after 3-D Secure)', Boolean(out.siteBaseUrl),
    out.siteBaseUrl || 'Set PUBLIC_SITE_URL, or a non-wildcard FRONTEND_ORIGIN');
  add('API base URL is known (used to build the webhook address)', Boolean(out.apiBaseUrl),
    out.apiBaseUrl || 'Set PUBLIC_API_URL (Render injects RENDER_EXTERNAL_URL automatically)');

  if (!out.configured || !provider || !provider.account) {
    return sendDiagnostics(req, res, out);
  }

  try {
    const acct = await provider.account();
    out.account = {
      email: acct.email || null,
      country: acct.country || null,
      currency: acct.currency || null,
      livemode: Boolean(acct.livemode),
      // Redacted like every other rendering of this URL: once the webhook
      // is registered, the account's own webhook_uri carries ?key=<secret>,
      // and this object is the part most likely to be copied into a chat.
      webhookUri: redact(acct.webhook_uri) || null,
      apiVersion: acct.api_version || null,
    };
    add('Gateway credentials are accepted', true, `Account ${acct.email || acct.id || ''}`.trim());
    add('Account currency is THB', String(acct.currency || '').toLowerCase() === 'thb', acct.currency || 'unknown');
    add('Account country is Thailand', String(acct.country || '').toUpperCase() === 'TH', acct.country || 'unknown');
    // The key's mode and the account's own livemode must agree; if they ever
    // disagree the keys are not the ones this account thinks they are.
    add('Key mode matches the account', Boolean(acct.livemode) === (out.mode === 'live'),
      `keys look ${out.mode}, account reports livemode=${Boolean(acct.livemode)}`);

    // The check this route is really for. A webhook that is unregistered, or
    // registered against the wrong host, is the single most likely reason a
    // real payment silently never reaches the booking board.
    const registered = String(acct.webhook_uri || '');
    const expectedBase = String(expectedWebhook || '').split('?')[0];
    add('Webhook is registered with the gateway', Boolean(registered),
      redact(registered) || 'Not set. Register it in the Omise dashboard, or POST /payments/diagnostics/register-webhook');
    if (registered && expectedBase) {
      add('Registered webhook points at this API', registered.split('?')[0] === expectedBase,
        `registered: ${redact(registered)}  ·  expected: ${redact(expectedWebhook)}`);
    }
    /* The specific pattern that means the signing secret is WRONG: real
       deliveries arriving and every one being rejected as a forgery. Rejections
       alongside accepted deliveries are just someone probing the endpoint, which
       is not a fault and must not raise an alarm. Both counters are since the
       last deploy, so this can only ever fire on evidence. */
    if (webhookStats.badSignature > 0 && webhookStats.accepted === 0) {
      add('Webhook deliveries are being accepted', false,
        webhookStats.badSignature + ' delivery(ies) rejected for a bad signature and none accepted — ' +
        'OMISE_WEBHOOK_SIGNING_SECRET almost certainly does not match the gateway. ' +
        'Test mode and live mode have DIFFERENT signing secrets. Payments are still being ' +
        'recovered by the reconciler, so nothing is lost, but the webhook is doing nothing.');
    } else if (webhookStats.accepted > 0) {
      add('Webhook deliveries are being accepted', true,
        webhookStats.accepted + ' accepted since the last deploy' +
        (webhookStats.badSignature ? ', ' + webhookStats.badSignature + ' rejected (probing — harmless while others are accepted)' : ''));
    }

    add('Webhook signature checking is on', Boolean(process.env.OMISE_WEBHOOK_SIGNING_SECRET),
      process.env.OMISE_WEBHOOK_SIGNING_SECRET
        ? 'OMISE_WEBHOOK_SIGNING_SECRET set'
        : 'Recommended, not required — every delivery is re-verified against the gateway API regardless',
      true);
  } catch (e) {
    add('Gateway credentials are accepted', false, (e && e.message) || 'Could not reach the gateway');
  }
  sendDiagnostics(req, res, out);
});

/* POST /payments/diagnostics/register-webhook — point the merchant account's
   webhook at this API.

   Separated from the read-only diagnostics above and never triggered
   automatically, because it WRITES to the live merchant account and
   overwrites whatever webhook is currently registered there. An admin has to
   ask for it deliberately. */
router.post('/payments/diagnostics/register-webhook', diagnosticsAuth, async (_req, res) => {
  const provider = payments.active();
  if (!provider || !provider.isConfigured() || !provider.setWebhookUri) {
    return res.status(400).json({ error: 'No gateway configured, or it does not support webhook registration by API.' });
  }
  const url = payments.webhookUrl();
  if (!url) {
    return res.status(400).json({ error: 'Cannot build the webhook URL — PUBLIC_API_URL / RENDER_EXTERNAL_URL is not set.' });
  }
  try {
    const acct = await provider.setWebhookUri(url);
    res.json({ ok: true, webhookUri: acct.webhook_uri || url });
  } catch (e) {
    console.error('[payments] register webhook', e);
    res.status(502).json({ error: (e && e.message) || 'Could not register the webhook.' });
  }
});

// Day-use guest email: distinct from the overnight confirmation because a
// day-use stay has a preferred TIME (not a check-in/check-out night range)
// and a flat price, not a per-night total. Day-use requests still stay
// PENDING after submission — front desk must confirm the exact time slot is
// available — so this keeps sending its own bespoke pair of emails rather
// than going through fireBookingEmails() (which only fires for 'confirmed').
function dayUseGuestEmail(bk, preferredTime) {
  // Localised from the same table every other guest email uses. This one was
  // written later and never joined it, so a guest who browsed the site in
  // Japanese and asked for a day-use room got an English letter back.
  const L = EMAIL_I18N[bk.lang] || EMAIL_I18N.en;
  const money = bk.total != null ? `${bk.total} ${bk.currency || 'THB'}` : '—';
  const lines = [
    L.greeting(bk.guest_name),
    '',
    `${L.dayuseIntro} (${L.confirmation}: ${bk.ref})`,
    '',
    `${L.room}: ${bk.room || '—'}`,
    `${L.dayuseDate}: ${bk.check_in}`,
    `${L.dayuseTime}: ${preferredTime || '—'}`,
    ...(bk.special_requests ? [`${L.specialRequests}: ${bk.special_requests}`] : []),
    `${L.dayuseTotal}: ${money}. ${L.dayusePayable}`,
    '',
    L.dayusePending,
    '',
    SPAM_NOTE_TEXT,
    '',
    'J Park Hotel, Chonburi',
  ];
  const letterhead = emailLetterhead();
  const text = lines.join('\n') + letterhead.text;
  const html =
    T.wrap({
      preheader: `${L.dayuseHeading} · ${bk.ref}`,
      footer: T.footerBlock({ address: HOTEL_ADDRESS_LINE, phones: HOTEL_PHONE_LIST, email: HOTEL_EMAIL_ADDR, site: 'https://jparkhotel.com' }),
      body:
        T.heading(L.dayuseHeading) +
        T.paragraph(L.greeting(bk.guest_name)) +
        T.paragraph(L.dayuseIntro) +
        T.refBlock(L.confirmation, bk.ref) +
        T.table(
          T.row(L.room, bk.room || '—', { strong: true }) +
          T.row(L.dayuseDate, bk.check_in) +
          T.row(L.dayuseTime, preferredTime || '—') +
          (bk.special_requests ? T.row(L.specialRequests, bk.special_requests) : '') +
          T.row(L.dayuseTotal, money, { strong: true })
        ) +
        T.notice('warn', L.dayusePending, { strong: true }) +
        T.notice('due', L.dayusePayable) +
        T.paragraph(SPAM_NOTE_TEXT, { small: true, muted: true }),
    });
  return { text, html };
}

/* POST /payments/dayuse-booking — request a 3-hour day-use session (flat
   rate, no nights, no breakfast/extra-guest surcharges). Day-use requests
   are always "subject to availability" (front desk assigns the exact time
   slot), so — unlike overnight bookings — this deliberately does NOT run
   the overlap/inventory guard: check_in and check_out are stored equal,
   which countOverlapping()'s strict `check_in < check_out` condition never
   matches, so day-use rows never block or get blocked by anything. */
/* ── The payments ledger (admin only) ────────────────────────────────────
   Reads charges straight from the gateway and lines them up against this
   database, so "was there a payment today?" is a screen rather than a
   cross-check between two dashboards. See lib/paymentsLedger.js for what it
   compares and why.

   requireAuth, NOT the shared ?key= that guards /payments/diagnostics. These
   responses carry guest names, email addresses, card brands, last-4s and the
   hotel's own fee and net takings, so they need a real signed-in person; the
   diagnostics key is pasted into browsers and CI logs by design and is the
   wrong instrument for PII.

   Staff rather than administrators only, at the owner's explicit request: the
   people who take payments at the desk are the people who need to see whether
   one landed. It does mean any signed-in employee can see every guest's card
   summary and the hotel's own takings — a deliberate trade, not an oversight.

   Its own rate bucket on top: each request can mean several outbound gateway
   calls, so a stuck browser tab must not be able to hammer the acquirer. */
const ledgerLimited = makeLimiter(60, 10 * 60 * 1000);

function ledgerGuard(req, res) {
  if (ledgerLimited(req.ip || 'unknown')) {
    res.status(429).json({ error: 'Too many requests. Please wait a moment.' });
    return false;
  }
  return true;
}

router.get('/payments/ledger', requireAuth, async (req, res) => {
  if (!ledgerGuard(req, res)) return;
  try {
    const [ledger, balance] = await Promise.all([
      paymentsLedger.buildLedger({
        from: req.query.from || undefined,
        to: req.query.to || undefined,
        limit: req.query.limit,
        offset: Number(req.query.offset) || 0,
      }),
      // The balance is a nicety beside the charge list; a failure to read it
      // must not empty the screen the owner actually came for.
      paymentsLedger.accountBalance().catch(() => null),
    ]);
    res.json(Object.assign({}, ledger, { balance }));
  } catch (e) {
    console.error('[payments] ledger', e);
    res.status(502).json({
      error: 'Could not read the payment gateway. It may be temporarily unavailable — nothing has been changed.',
    });
  }
});

/* Bring one charge into line with the gateway. The button beside a row that
   says "paid at the gateway, not recorded here". */
router.post('/payments/ledger/reconcile', requireAuth, async (req, res) => {
  if (!ledgerGuard(req, res)) return;
  const chargeId = String((req.body && req.body.chargeId) || '').trim();
  if (!chargeId) return res.status(400).json({ error: 'chargeId is required' });
  try {
    const result = await paymentsLedger.reconcileCharge(chargeId);
    res.status(result.ok ? 200 : 502).json(result);
  } catch (e) {
    console.error('[payments] reconcile one', e);
    res.status(500).json({ error: 'Could not reconcile that charge.' });
  }
});

/* Fill in the payment detail for every booking that never got it — the
   one-off after deploying these columns, and the catch-up after any spell
   where the gateway was unreachable. */
router.post('/payments/backfill', requireAuth, async (req, res) => {
  if (!ledgerGuard(req, res)) return;
  try {
    const result = await paymentsLedger.runBackfill({ limit: (req.body && req.body.limit) || 50 });
    res.status(result.ok ? 200 : 400).json(result);
  } catch (e) {
    console.error('[payments] backfill', e);
    res.status(500).json({ error: 'Backfill failed.' });
  }
});

/* Work out which bank transfer paid each recent charge out — the "when does
   the hotel actually have the money" half, which cannot exist at charge time
   because the transfer does not exist yet. */
router.post('/payments/settlement-refresh', requireAuth, async (req, res) => {
  if (!ledgerGuard(req, res)) return;
  try {
    const result = await paymentsLedger.refreshSettlement({ limit: (req.body && req.body.limit) || 40 });
    res.status(result.ok ? 200 : 400).json(result);
  } catch (e) {
    console.error('[payments] settlement refresh', e);
    res.status(500).json({ error: 'Settlement refresh failed.' });
  }
});

/* Fill in ONE booking's payment record from the gateway.

   Deliberately narrower than the admin ledger, and deliberately requireAuth
   rather than requireAdmin. The ledger sweeps every recent charge and returns
   guest names, emails and card details across the whole property — that is an
   admin screen. This asks about a single booking the member of staff already
   has open, and returns only that booking's own payment. A receptionist
   printing a receipt at the desk needs it; making them fetch an administrator
   first is how a guest ends up handed a half-empty document.

   The reason it exists at all: bookings taken before these columns shipped
   have a charge id and nothing else, so their receipt renders with "Paid by:
   card" and little more. Rather than telling staff to run a backfill, the
   console asks for the detail the moment somebody opens such a booking.

   Idempotent, and safe to call on a booking that already has its detail: the
   write goes through reconciler.recordDetail(), which COALESCEs — it can only
   ever add. */
router.post('/payments/refresh/:id', requireAuth, async (req, res) => {
  if (!ledgerGuard(req, res)) return;
  try {
    const { rows } = await db.query(
      `SELECT id, ref, payment_charge_id, payment_status FROM guest_bookings WHERE id = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Booking not found' });
    const bk = rows[0];
    if (!bk.payment_charge_id) {
      // Not an error: an OTA, walk-in or pay-at-desk booking has no gateway
      // charge and never will. Say so plainly so the client stops asking.
      return res.json({ ok: true, refreshed: false, reason: 'no_charge' });
    }
    if (!payments.isConfigured()) {
      return res.status(503).json({ error: 'The payment gateway is not reachable right now.' });
    }

    let verified;
    try {
      verified = await payments.verify(bk.payment_charge_id);
    } catch (e) {
      return res.status(502).json({ error: 'Could not reach the payment gateway. Nothing has been changed.' });
    }

    // A charge the gateway now reports as PAID that this database still has as
    // pending goes through the same atomic settle() the webhook uses, so the
    // guest's confirmation email is sent exactly once — never from here twice.
    if (verified.paid && bk.payment_status !== 'paid') {
      await reconciler.settle(bk.payment_charge_id, verified);
    } else if (verified.detail) {
      await reconciler.recordDetail(bk.payment_charge_id, verified.detail);
    }

    const fresh = await db.query('SELECT * FROM guest_bookings WHERE id = $1', [req.params.id]);
    res.json({
      ok: true,
      refreshed: true,
      payment: fresh.rows.length ? require('../lib/payments/detail').fromColumns(fresh.rows[0]) : null,
      paymentStatus: fresh.rows.length ? fresh.rows[0].payment_status : null,
    });
  } catch (e) {
    console.error('[payments] refresh one', e);
    res.status(500).json({ error: 'Could not refresh that payment.' });
  }
});

/* The daily payments report to the hotel's inbox.

   Called by the existing 4x/day health workflow, which already wakes Neon at
   those moments — so this adds no database compute of its own. It is called
   four times and sends ONCE: the first call of each Bangkok day claims the
   date with an INSERT ... ON CONFLICT DO NOTHING before any work is done, so
   two overlapping runs cannot both send.

   Guarded like the reconcile backstop beside it — the shared ?key= or an
   admin session — rather than by requireAdmin alone, because a scheduled
   workflow has no session to present. Unlike the ledger, the report's own
   response body carries only counts, not guest PII; the detail goes to the
   hotel's inbox, which is where it belongs. */
router.post('/payments/daily-report', diagnosticsAuth, async (req, res) => {
  try {
    const result = await paymentReport.sendDailyReport({
      force: String((req.query && req.query.force) || '') === 'true',
      date: (req.query && req.query.date) || undefined,
    });
    res.json(result);
  } catch (e) {
    console.error('[payments] daily report', e);
    res.status(500).json({ error: 'Could not send the payments report.' });
  }
});

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
  /* Day use is deliberately OUTSIDE the online-only rule.

     It is a request, not a reservation: the row is written as 'pending' for
     staff to confirm by phone, nothing is charged, and there is no gateway
     call anywhere in this route. Routing it through resolvePaymentChoice
     would reject every day-use enquiry the moment online-only came into
     force, for a flow that never took money online in the first place. */
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

    res.status(201).json({ status: 'pending', booking: row2jsPublic(saved) });
  } catch (e) {
    console.error('[payments] dayuse-booking', e);
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;
