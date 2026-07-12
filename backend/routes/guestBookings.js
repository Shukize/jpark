/* ============================================================
   J Park Hotel — guest bookings routes
   GET    /api/guest-bookings          list all (auth)
   GET    /api/guest-bookings/:id      single booking (auth)
   POST   /api/guest-bookings          ingest / create booking
   PATCH  /api/guest-bookings/:id      confirm a pending slot / mark read /
                                        assign room / record payment (auth)
   POST   /api/guest-bookings/:id/cancel  staff-mediated cancel (auth)
   POST   /api/guest-bookings/:id/reopen  restore a cancelled booking (auth)
   DELETE /api/guest-bookings/:id      permanently delete (admin)
   ============================================================ */
const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { sendEmail } = require('../mailer');
const { makeLimiter } = require('../lib/rateLimit');
const { countOverlapping } = require('../lib/availability');
const roomRates = require('../lib/roomRates');

const router = express.Router();

// Generous limit — the Gmail-forwarder OTA bridge is known to burst dozens
// of requests when clearing a backlog (a single run has ingested 105 real
// bookings), so this only needs to bound a genuine flood, not normal use.
const rateLimited = makeLimiter(120, 10 * 60 * 1000);

// Optional shared-secret gate for the public ingest endpoint (POST below).
// A channel manager / OTA bridge authenticates server-to-server with
//   X-API-Key: <OTA_WEBHOOK_SECRET>
// When OTA_WEBHOOK_SECRET is unset the endpoint stays open (local dev / the
// demo browser ingest). When it IS set, an inbound POST must present the
// matching key — this stops anyone from spamming fake reservations (and the
// hotel/guest emails each one triggers) at the live property. Uses the same
// secret as /api/v1/ota-sync so the channel manager only needs one key.
function ingestKeyOk(provided) {
  const expected = process.env.OTA_WEBHOOK_SECRET || '';
  if (!expected) return true;            // no secret configured → endpoint open
  if (!provided) return false;
  const a = Buffer.from(String(provided));
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// Where new-booking notifications land. This is the hotel's own inbox (the same
// address the OTAs send their confirmations to), so the front desk gets a copy of
// every reservation that flows through the Guest Booking system. Override with the
// HOTEL_NOTIFY_EMAIL env var; comma-separated values are allowed for multiple staff.
function hotelRecipients() {
  return (process.env.HOTEL_NOTIFY_EMAIL || 'jparkhotel1@gmail.com')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

// Build a hotel-facing "new booking" notice from a booking row. Sent to the front
// desk inbox so staff see every OTA / direct reservation as it arrives, mirroring
// the Guest Booking entry in the staff console.
function paymentLabel(bk) {
  if (!bk.payment_status || bk.payment_status === 'n/a') return null;
  const method = bk.payment_method === 'cash' ? 'Cash'
    : bk.payment_method === 'card' ? 'Card'
    : bk.payment_method === 'promptpay_instore' ? 'PromptPay (in person)'
    : bk.payment_method === 'pay_at_checkin' ? 'Pay at check-in (cash / card / PromptPay)'
    : bk.payment_method === 'promptpay' ? 'PromptPay' // legacy rows from the retired online-Omise flow
    : bk.payment_provider || 'Online';
  const statusWord = bk.payment_status === 'paid' ? 'Paid'
    : bk.payment_status === 'pending' ? 'Awaiting payment'
    : bk.payment_status === 'failed' ? 'Failed'
    : bk.payment_status;
  return `${method} — ${statusWord}`;
}

// A prominent, guest-facing "here's what you owe and how to pay it" callout
// — distinct from the terse `Payment: {label}` row above, which stays a
// uniform one-liner across every booking type in the inbox. Only shown for
// a reservation still awaiting its in-person payment (see routes/payments.js
// POST /reservations, which always creates bookings in this state).
function balanceDueNote(bk) {
  if (bk.payment_method !== 'pay_at_checkin' || bk.payment_status !== 'pending') return null;
  const money = bk.total != null ? `${bk.total} ${bk.currency || 'THB'}` : '—';
  return {
    text: `Balance due: ${money}. Payable in person at check-in by cash, credit/debit card, or PromptPay QR at our front desk.`,
    html: `<p style="background:#eef6f4;border:1px solid #a9d6cb;border-radius:8px;padding:10px 14px;color:#0f4a3e">` +
      `<strong>Balance due: ${money}.</strong> Payable in person at check-in by cash, credit/debit card, or PromptPay QR at our front desk.</p>`,
  };
}

function smokingLabel(bk) {
  return bk.smoking_preference === 'smoking' ? 'Smoking' : 'Non-Smoking';
}

function breakfastLabel(bk) {
  return bk.breakfast ? 'Yes' : 'No';
}

// House-wide check-in/check-out hours (see chat.a.checkin in i18n-app.js and
// the demo seed text in store.js for the same 14:00/12:00 convention) — ICT
// spelled out explicitly since guests booking from abroad won't know the
// local UTC offset.
const CHECKIN_TIME_NOTE = '(from 14:00 ICT)';
const CHECKOUT_TIME_NOTE = '(until 12:00 ICT)';

// Branding + contact block appended to guest/staff-facing emails so a
// forwarded or printed copy is self-identifying without needing the site.
// The logo is loaded from the live public site since email clients can't
// reach a relative/local file path.
const SITE_ORIGIN = 'https://jparkhotel.com';
const HOTEL_ADDRESS = '88/88 Thanon Sukprayun, Na Pa, Mueang Chonburi District, Chon Buri 20000, Thailand';
const HOTEL_PHONES = ['+66 86 326 0664', '+66 38 448 111'];
const HOTEL_EMAIL = 'jparkhotel1@gmail.com';

function emailLetterhead() {
  const text =
    '\n' +
    'J Park Hotel, Chonburi\n' +
    `${HOTEL_ADDRESS}\n` +
    `Tel: ${HOTEL_PHONES.join(' / ')}\n` +
    `Email: ${HOTEL_EMAIL}`;
  const html =
    '<div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e2e2;text-align:center">' +
    `<img src="${SITE_ORIGIN}/images/logo-full.png" alt="J Park Hotel" width="160" style="max-width:160px;height:auto;margin-bottom:10px" />` +
    '<p style="color:#666;font-size:12px;line-height:1.6;margin:0">' +
    `${HOTEL_ADDRESS}<br>` +
    `Tel: ${HOTEL_PHONES.join(' &nbsp;/&nbsp; ')} &nbsp;&middot;&nbsp; Email: <a href="mailto:${HOTEL_EMAIL}" style="color:#0f766e">${HOTEL_EMAIL}</a>` +
    '</p></div>';
  return { text, html };
}

function hotelNotice(bk) {
  const money = bk.total != null ? `${bk.total} ${bk.currency || 'THB'}` : '—';
  const guests = `${bk.adults} adult(s), ${bk.children} child(ren)`;
  const via = bk.channel_name || bk.channel || 'Direct';
  const payment = paymentLabel(bk);
  const balanceDue = balanceDueNote(bk);
  const lines = [
    `New booking via ${via}.`,
    '',
    `Confirmation: ${bk.ref}`,
    `Guest: ${bk.guest_name || '—'}`,
    `Guest email: ${bk.guest_email || '—'}`,
    `Guest phone: ${bk.guest_phone || '—'}`,
    `Room: ${bk.room || '—'}`,
    `Check-in: ${bk.check_in} ${CHECKIN_TIME_NOTE}`,
    `Check-out: ${bk.check_out} ${CHECKOUT_TIME_NOTE}`,
    `Nights: ${bk.nights}`,
    `Guests: ${guests}`,
    `Room preference: ${smokingLabel(bk)}`,
    `Breakfast: ${breakfastLabel(bk)}`,
    `Total: ${money}`,
    ...(payment ? [`Payment: ${payment}`] : []),
    ...(balanceDue ? ['', balanceDue.text] : []),
    '',
    'This reservation is now in the Guest Booking inbox of the staff console.',
  ];
  const letterhead = emailLetterhead();
  const text = lines.join('\n') + letterhead.text;
  const html =
    `<div style="font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;line-height:1.5">` +
    `<h2 style="color:#0f766e;margin:0 0 12px">New booking via ${via}</h2>` +
    `<table style="border-collapse:collapse;margin:16px 0">` +
    `<tr><td style="padding:4px 12px 4px 0;color:#555">Confirmation</td><td style="padding:4px 0"><strong>${bk.ref}</strong></td></tr>` +
    `<tr><td style="padding:4px 12px 4px 0;color:#555">Guest</td><td style="padding:4px 0">${bk.guest_name || '—'}</td></tr>` +
    `<tr><td style="padding:4px 12px 4px 0;color:#555">Guest email</td><td style="padding:4px 0">${bk.guest_email || '—'}</td></tr>` +
    `<tr><td style="padding:4px 12px 4px 0;color:#555">Guest phone</td><td style="padding:4px 0">${bk.guest_phone || '—'}</td></tr>` +
    `<tr><td style="padding:4px 12px 4px 0;color:#555">Room</td><td style="padding:4px 0">${bk.room || '—'}</td></tr>` +
    `<tr><td style="padding:4px 12px 4px 0;color:#555">Check-in</td><td style="padding:4px 0">${bk.check_in} ${CHECKIN_TIME_NOTE}</td></tr>` +
    `<tr><td style="padding:4px 12px 4px 0;color:#555">Check-out</td><td style="padding:4px 0">${bk.check_out} ${CHECKOUT_TIME_NOTE}</td></tr>` +
    `<tr><td style="padding:4px 12px 4px 0;color:#555">Nights</td><td style="padding:4px 0">${bk.nights}</td></tr>` +
    `<tr><td style="padding:4px 12px 4px 0;color:#555">Guests</td><td style="padding:4px 0">${guests}</td></tr>` +
    `<tr><td style="padding:4px 12px 4px 0;color:#555">Room preference</td><td style="padding:4px 0">${smokingLabel(bk)}</td></tr>` +
    `<tr><td style="padding:4px 12px 4px 0;color:#555">Breakfast</td><td style="padding:4px 0">${breakfastLabel(bk)}</td></tr>` +
    `<tr><td style="padding:4px 12px 4px 0;color:#555">Total</td><td style="padding:4px 0">${money}</td></tr>` +
    (payment ? `<tr><td style="padding:4px 12px 4px 0;color:#555">Payment</td><td style="padding:4px 0">${payment}</td></tr>` : '') +
    `</table>` +
    (balanceDue ? balanceDue.html : '') +
    `<p style="color:#555">This reservation is now in the <strong>Guest Booking</strong> inbox of the staff console.</p>` +
    letterhead.html +
    `</div>`;
  return { text, html };
}

// Build a plain confirmation email from a booking row. Kept simple and English;
// the staff console can still send a localised follow-up via POST /api/email.
const DEPOSIT_NOTE_TEXT =
  'Please note: a 200 THB deposit for your room key card is collected in cash at check-in (cash only) and refunded in full at check-out.';
const DEPOSIT_NOTE_HTML =
  '<p style="background:#fbf3df;border:1px solid #e0c178;border-radius:8px;padding:10px 14px;color:#5a4a1a">' +
  '<strong>Please note:</strong> a 200 THB deposit for your room key card is collected in <strong>cash only</strong> at check-in, and refunded in full at check-out.' +
  '</p>';

// Some inboxes (Yahoo, Outlook, etc.) route new senders to spam even on a
// verified domain until enough mail has been exchanged to build sender
// reputation — so every guest-facing confirmation proactively tells the
// guest where to look instead of relying on them to think of it.
const SPAM_NOTE_TEXT =
  "Can't find this email later, or missing a reply from us? Please check your spam/junk folder — and consider adding us to your contacts.";
const SPAM_NOTE_HTML =
  '<p style="color:#888;font-size:0.85rem">Can\'t find this email later, or missing a reply from us? Please check your <strong>spam/junk folder</strong> — and consider adding us to your contacts.</p>';

function confirmationEmail(bk) {
  const money = bk.total != null ? `${bk.total} ${bk.currency || 'THB'}` : '—';
  const payment = paymentLabel(bk);
  const balanceDue = balanceDueNote(bk);
  const lines = [
    `Dear ${bk.guest_name || 'Guest'},`,
    '',
    'Thank you for choosing J Park Hotel, Chonburi. Your reservation is confirmed.',
    '',
    `Confirmation: ${bk.ref}`,
    `Room: ${bk.room || '—'}`,
    `Check-in: ${bk.check_in} ${CHECKIN_TIME_NOTE}`,
    `Check-out: ${bk.check_out} ${CHECKOUT_TIME_NOTE}`,
    `Nights: ${bk.nights}`,
    `Guests: ${bk.adults} adult(s), ${bk.children} child(ren)`,
    `Room preference: ${smokingLabel(bk)}`,
    `Breakfast: ${breakfastLabel(bk)}`,
    `Total: ${money}`,
    ...(payment ? [`Payment: ${payment}`] : []),
    ...(balanceDue ? ['', balanceDue.text] : []),
    '',
    DEPOSIT_NOTE_TEXT,
    '',
    'We look forward to welcoming you. Reply to this email if you need anything before arrival.',
    '',
    SPAM_NOTE_TEXT,
    '',
    'J Park Hotel, Chonburi',
  ];
  const letterhead = emailLetterhead();
  const text = lines.join('\n') + letterhead.text;
  const html =
    `<div style="font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;line-height:1.5">` +
    `<h2 style="color:#0f766e;margin:0 0 12px">Your reservation is confirmed</h2>` +
    `<p>Dear ${bk.guest_name || 'Guest'},</p>` +
    `<p>Thank you for choosing <strong>J Park Hotel, Chonburi</strong>. Your reservation is confirmed.</p>` +
    `<table style="border-collapse:collapse;margin:16px 0">` +
    `<tr><td style="padding:4px 12px 4px 0;color:#555">Confirmation</td><td style="padding:4px 0"><strong>${bk.ref}</strong></td></tr>` +
    `<tr><td style="padding:4px 12px 4px 0;color:#555">Room</td><td style="padding:4px 0">${bk.room || '—'}</td></tr>` +
    `<tr><td style="padding:4px 12px 4px 0;color:#555">Check-in</td><td style="padding:4px 0">${bk.check_in} ${CHECKIN_TIME_NOTE}</td></tr>` +
    `<tr><td style="padding:4px 12px 4px 0;color:#555">Check-out</td><td style="padding:4px 0">${bk.check_out} ${CHECKOUT_TIME_NOTE}</td></tr>` +
    `<tr><td style="padding:4px 12px 4px 0;color:#555">Nights</td><td style="padding:4px 0">${bk.nights}</td></tr>` +
    `<tr><td style="padding:4px 12px 4px 0;color:#555">Guests</td><td style="padding:4px 0">${bk.adults} adult(s), ${bk.children} child(ren)</td></tr>` +
    `<tr><td style="padding:4px 12px 4px 0;color:#555">Room preference</td><td style="padding:4px 0">${smokingLabel(bk)}</td></tr>` +
    `<tr><td style="padding:4px 12px 4px 0;color:#555">Breakfast</td><td style="padding:4px 0">${breakfastLabel(bk)}</td></tr>` +
    `<tr><td style="padding:4px 12px 4px 0;color:#555">Total</td><td style="padding:4px 0">${money}</td></tr>` +
    (payment ? `<tr><td style="padding:4px 12px 4px 0;color:#555">Payment</td><td style="padding:4px 0">${payment}</td></tr>` : '') +
    `</table>` +
    (balanceDue ? balanceDue.html : '') +
    DEPOSIT_NOTE_HTML +
    `<p>We look forward to welcoming you. Just reply to this email if you need anything before arrival.</p>` +
    SPAM_NOTE_HTML +
    `<p style="color:#0f766e;font-weight:bold;margin-top:24px">J Park Hotel, Chonburi</p>` +
    letterhead.html +
    `</div>`;
  return { text, html };
}

// Guest-facing cancellation notice. Deliberately generic — the staff-entered
// cancellation reason (if any) is internal shorthand for front-desk handoff,
// not guest-facing copy, so it is never included here.
function cancellationEmail(bk) {
  const lines = [
    `Dear ${bk.guest_name || 'Guest'},`,
    '',
    'This is to confirm that your reservation at J Park Hotel, Chonburi has been cancelled.',
    '',
    `Confirmation: ${bk.ref}`,
    `Room: ${bk.room || '—'}`,
    `Check-in: ${bk.check_in}`,
    `Check-out: ${bk.check_out}`,
    '',
    'No payment was taken online for this booking, so there is nothing to refund.',
    '',
    'If this cancellation was made in error, or you would like to make a new reservation, please reply to this email or call us.',
    '',
    'J Park Hotel, Chonburi',
  ];
  const letterhead = emailLetterhead();
  const text = lines.join('\n') + letterhead.text;
  const html =
    `<div style="font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;line-height:1.5">` +
    `<h2 style="color:#b45309;margin:0 0 12px">Your reservation has been cancelled</h2>` +
    `<p>Dear ${bk.guest_name || 'Guest'},</p>` +
    `<p>This is to confirm that your reservation at <strong>J Park Hotel, Chonburi</strong> has been cancelled.</p>` +
    `<table style="border-collapse:collapse;margin:16px 0">` +
    `<tr><td style="padding:4px 12px 4px 0;color:#555">Confirmation</td><td style="padding:4px 0"><strong>${bk.ref}</strong></td></tr>` +
    `<tr><td style="padding:4px 12px 4px 0;color:#555">Room</td><td style="padding:4px 0">${bk.room || '—'}</td></tr>` +
    `<tr><td style="padding:4px 12px 4px 0;color:#555">Check-in</td><td style="padding:4px 0">${bk.check_in}</td></tr>` +
    `<tr><td style="padding:4px 12px 4px 0;color:#555">Check-out</td><td style="padding:4px 0">${bk.check_out}</td></tr>` +
    `</table>` +
    `<p>No payment was taken online for this booking, so there is nothing to refund.</p>` +
    `<p>If this cancellation was made in error, or you would like to make a new reservation, please reply to this email or call us.</p>` +
    `<p style="color:#0f766e;font-weight:bold;margin-top:24px">J Park Hotel, Chonburi</p>` +
    letterhead.html +
    `</div>`;
  return { text, html };
}

// Drops a system-authored broadcast into the internal Messages inbox so a
// cancellation is visible to the whole team on shift handoff — same pattern
// routes/otaSync.js's alertStaff() already uses for its own booking events.
async function broadcastStaffMessage(subject, body) {
  await db.query(
    `INSERT INTO messages (from_id, from_name, from_role, subject, body, to_all)
     VALUES ('system', 'Booking System', 'system', $1, $2, TRUE)`,
    [subject, body]
  );
}

// Shared by POST /:id/cancel (staff-initiated) and ingestGuestBooking()'s
// auto-detect path (an OTA cancellation email arriving for a known ref).
// `actorName` is a staff member's name for a manual cancel, or null for an
// auto-detected one. `wasConfirmed` gates the guest email: only send it when
// the guest had previously been told "confirmed" — a booking that arrives
// already-cancelled (first email ever seen for that ref) never had anything
// to correct, so emailing a cancellation notice for it would just confuse.
function fireCancellationNotice(bk, { actorName, wasConfirmed } = {}) {
  const auto = !actorName;
  if (wasConfirmed && bk.guest_email) {
    const { text, html } = cancellationEmail(bk);
    sendEmail({
      to: bk.guest_email,
      subject: `J Park Hotel — booking cancelled (${bk.ref})`,
      text,
      html,
    }, {
      bookingId: bk.id, bookingRef: bk.ref, kind: 'cancellation',
      sentByName: actorName || 'System (auto-detected)',
    }).then((r) => {
      if (r.ok) console.log(`[guest-bookings] cancellation emailed to ${bk.guest_email} (${bk.ref})`);
      else if (!r.skipped) console.warn(`[guest-bookings] cancellation email failed (${bk.ref}): ${r.error}`);
    }).catch((err) => console.error('[guest-bookings] cancellation email error', err));
  }

  const via = bk.channel_name || bk.channel || 'Direct';
  const subject = auto
    ? `⚠ Booking auto-cancelled — ${via} (${bk.ref})`
    : `Booking cancelled by ${actorName} — ${bk.ref}`;
  const bodyLines = [
    auto
      ? `Detected from an incoming ${via} email — please verify.`
      : `Cancelled by ${actorName}.`,
    `Guest: ${bk.guest_name || '—'}`,
    `Room: ${bk.room || '—'}`,
    `Check-in: ${bk.check_in}`,
    `Check-out: ${bk.check_out}`,
    `Ref: ${bk.ref}`,
    ...(bk.cancellation_reason ? [`Reason: ${bk.cancellation_reason}`] : []),
  ];
  broadcastStaffMessage(subject, bodyLines.join('\n')).catch((err) =>
    console.error('[guest-bookings] cancellation broadcast error', err)
  );
}

function row2js(r) {
  return {
    id: r.id,
    ref: r.ref,
    channel: r.channel,
    channelName: r.channel_name,
    channelEmail: r.channel_email,
    guestName: r.guest_name,
    lastName: r.guest_last_name,
    guestEmail: r.guest_email,
    guestPhone: r.guest_phone,
    room: r.room,
    roomNumber: r.room_number,
    checkIn: r.check_in,
    checkOut: r.check_out,
    nights: r.nights,
    adults: r.adults,
    children: r.children,
    smokingPreference: r.smoking_preference || 'non_smoking',
    breakfast: !!r.breakfast,
    total: r.total ? Number(r.total) : null,
    currency: r.currency,
    status: r.status,
    lang: r.lang,
    confirmation: r.confirmation,
    paymentProvider: r.payment_provider,
    paymentMethod: r.payment_method,
    paymentStatus: r.payment_status,
    paymentChargeId: r.payment_charge_id,
    cancelledAt: r.cancelled_at ? new Date(r.cancelled_at).getTime() : null,
    cancelledById: r.cancelled_by_id,
    cancelledByName: r.cancelled_by_name,
    cancellationReason: r.cancellation_reason,
    previousStatus: r.previous_status,
    needsReview: !!r.needs_review,
    starred: !!r.starred,
    staffLabel: r.staff_label || null,
    readBy: r.read_by || [],
    createdAt: new Date(r.created_at).getTime(),
    updatedAt: r.updated_at ? new Date(r.updated_at).getTime() : null,
  };
}

/* GET /api/guest-bookings */
router.get('/', requireAuth, async (_req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM guest_bookings ORDER BY created_at DESC'
    );
    res.json(rows.map(row2js));
  } catch (e) {
    console.error('[guest-bookings] list', e);
    res.status(500).json({ error: 'Database error' });
  }
});

/* GET /api/guest-bookings/:id */
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM guest_bookings WHERE id = $1', [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(row2js(rows[0]));
  } catch (e) {
    console.error('[guest-bookings] get', e);
    res.status(500).json({ error: 'Database error' });
  }
});

/* Fire the hotel notice + guest confirmation for a freshly-inserted booking.
   Fire-and-forget: never awaited, never throws into the request path. Only runs
   for a genuinely new, confirmed booking so webhook / re-forward retries
   (ON CONFLICT updates, inserted=false) don't re-send. */
function fireBookingEmails(saved) {
  if (!saved || !saved.inserted || saved.status !== 'confirmed') return;

  // 1) Notify the hotel front desk (jparkhotel1@gmail.com) for EVERY booking,
  //    even when the OTA didn't pass a guest email. Mirrors the Guest Booking
  //    entry that staff also see in the console.
  const to = hotelRecipients();
  if (to.length) {
    const { text, html } = hotelNotice(saved);
    sendEmail({
      to,
      subject: `New booking — ${saved.channel_name || saved.channel || 'Direct'} (${saved.ref})`,
      text,
      html,
      replyTo: saved.guest_email || undefined,
    }).then((r) => {
      if (r.ok) console.log(`[guest-bookings] hotel notified at ${to.join(', ')} (${saved.ref})`);
      else if (!r.skipped) console.warn(`[guest-bookings] hotel notice failed (${saved.ref}): ${r.error}`);
    }).catch((err) => console.error('[guest-bookings] hotel notice error', err));
  }

  // 2) Send the guest their confirmation, when the booking carries a guest email.
  if (saved.guest_email) {
    sendGuestConfirmation(saved).catch((err) => console.error('[guest-bookings] email error', err));
  }
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Turns a staff-edited plain-text email body into simple HTML (one <p> per
// blank-line-separated paragraph, <br> for single line breaks within one).
// Used only for the resend-confirmation override path below — the
// auto-generated confirmationEmail()/hotelNotice() templates keep their own
// richer hand-built HTML untouched.
function textToHtml(text) {
  return String(text || '').split(/\n{2,}/).map((para) =>
    '<p>' + escapeHtml(para).replace(/\n/g, '<br>') + '</p>'
  ).join('');
}

// Guest confirmation send, factored out of fireBookingEmails() so the manual
// "Resend confirmation" staff action (POST /:id/resend-confirmation below)
// can reuse the exact same email content instead of duplicating it. Sets a
// Reply-To of the hotel's own inbox — previously unset, so a guest replying
// to their confirmation would silently go to the noreply@ sender address.
// `override` (optional) lets staff hand-edit the subject/body before it goes
// out — e.g. to correct a wrong price shown in the original auto-generated
// confirmation — instead of always re-sending the template verbatim.
// `actor` (optional) is the signed-in staff member manually triggering a
// resend (req.user); omitted for the automatic send on initial booking, so
// email_log can tell the two apart.
async function sendGuestConfirmation(saved, override, actor) {
  const auto = confirmationEmail(saved);
  const text = (override && override.text) ? override.text : auto.text;
  const html = (override && override.text) ? textToHtml(override.text) : auto.html;
  const subject = (override && override.subject) || `J Park Hotel — booking confirmed (${saved.ref})`;
  const to = hotelRecipients();
  const r = await sendEmail({
    to: saved.guest_email,
    subject,
    text,
    html,
    replyTo: to[0] || undefined,
  }, {
    bookingId: saved.id, bookingRef: saved.ref,
    kind: actor ? 'resend' : 'confirmation',
    sentById: actor ? actor.id : null,
    sentByName: actor ? actor.name : null,
  });
  if (r.ok) console.log(`[guest-bookings] confirmation emailed to ${saved.guest_email} (${saved.ref})`);
  else if (!r.skipped) console.warn(`[guest-bookings] confirmation email failed (${saved.ref}): ${r.error}`);
  return r;
}

/* Core ingest: upsert one booking (de-duped on `ref`) and fire its emails.
   Shared by the POST route below and the OTA email-forwarding bridge
   (routes/otaEmail.js) so both intake paths behave identically. Accepts both
   camelCase and snake_case field names. Returns the saved row (with an
   `inserted` flag). Throws on DB error. */
async function ingestGuestBooking(b) {
  b = b || {};
  const channel = normChannel(b.channel || b.source || 'direct');
  const ref = b.ref || b.bookingId || b.confirmationCode
    || ('GB-' + Date.now().toString(36).toUpperCase());
  const checkIn = b.checkIn || b.check_in;
  const checkOut = b.checkOut || b.check_out;
  if (!checkIn || !checkOut) {
    throw new Error('check_in and check_out are required');
  }
  const nights = b.nights || computeNights(checkIn, checkOut);

  // Looked up ahead of the upsert purely so ingestGuestBooking() can tell,
  // after the fact, whether THIS call is the one flipping the booking into
  // 'cancelled' (an OTA cancellation email arriving for a known ref) — see
  // the auto-cancel handling below. A plain SELECT (not FOR UPDATE) is fine
  // here: the worst case on a race is a missed/duplicate notification, never
  // a lost booking, since the upsert itself is still atomic.
  const { rows: existingRows } = await db.query(
    'SELECT status FROM guest_bookings WHERE ref = $1', [ref]
  );
  const prevStatus = existingRows.length ? existingRows[0].status : null;

  const { rows } = await db.query(
    `INSERT INTO guest_bookings
       (ref, channel, channel_name, channel_email, guest_name, guest_last_name,
        guest_email, guest_phone, room, check_in, check_out, nights, adults,
        children, total, currency, status, lang, confirmation,
        payment_provider, payment_method, payment_status, payment_charge_id,
        needs_review)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
     ON CONFLICT (ref) DO UPDATE SET
       status = EXCLUDED.status,
       -- Only stamp cancellation metadata when THIS update is the one moving
       -- the row into 'cancelled' — avoids clobbering a staff cancellation's
       -- reason/actor if the same OTA cancellation email is ever re-forwarded.
       cancelled_at = CASE WHEN EXCLUDED.status = 'cancelled' AND guest_bookings.status <> 'cancelled'
                            THEN NOW() ELSE guest_bookings.cancelled_at END,
       previous_status = CASE WHEN EXCLUDED.status = 'cancelled' AND guest_bookings.status <> 'cancelled'
                            THEN guest_bookings.status ELSE guest_bookings.previous_status END,
       -- Take the new value each time, not OR'd with the old one, so a
       -- corrected re-forward of a previously-flagged booking can clear it.
       needs_review = EXCLUDED.needs_review,
       updated_at = NOW()
     RETURNING *, (xmax = 0) AS inserted`,
    [
      ref,
      channel,
      b.channelName || b.channel_name || channel,
      b.channelEmail || b.channel_email || null,
      b.guestName || b.guest_name || 'Guest',
      (b.guestName || b.guest_name || '').split(' ').pop().toLowerCase() || null,
      b.guestEmail || b.guest_email || null,
      b.guestPhone || b.guest_phone || null,
      b.room || b.roomType || b.room_type || null,
      checkIn,
      checkOut,
      nights,
      b.adults != null ? b.adults : 1,
      b.children != null ? b.children : 0,
      b.total != null ? b.total : null,
      b.currency || 'THB',
      b.status || 'confirmed',
      b.lang || 'en',
      b.confirmation || b.body || null,
      b.paymentProvider || b.payment_provider || null,
      b.paymentMethod || b.payment_method || null,
      b.paymentStatus || b.payment_status || 'n/a',
      b.paymentChargeId || b.payment_charge_id || null,
      Boolean(b.needsReview || b.needs_review),
    ]
  );
  const saved = rows[0];
  fireBookingEmails(saved);

  const justCancelled = saved.status === 'cancelled' && prevStatus !== 'cancelled';
  if (justCancelled) {
    fireCancellationNotice(saved, { wasConfirmed: prevStatus === 'confirmed' });
  }
  return saved;
}

/* POST /api/guest-bookings — ingest from OTA bridge / channel manager.
   Protected by an optional X-API-Key (see ingestKeyOk): open when
   OTA_WEBHOOK_SECRET is unset, key-gated once it is. */
router.post('/', async (req, res) => {
  if (rateLimited(req.ip)) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }
  if (!ingestKeyOk(req.get('x-api-key'))) {
    return res.status(401).json({ error: 'Invalid or missing API key' });
  }
  try {
    const saved = await ingestGuestBooking(req.body || {});
    res.status(201).json(row2js(saved));
  } catch (e) {
    if (/check_in and check_out/.test(e.message)) {
      return res.status(400).json({ error: e.message });
    }
    console.error('[guest-bookings] create', e);
    res.status(500).json({ error: 'Database error' });
  }
});

// Staff can only ever move a payment forward to "paid" via this endpoint —
// never trust a client-supplied paymentMethod string beyond this allow-list.
const ALLOWED_PAYMENT_METHODS = ['cash', 'card', 'promptpay_instore'];

// The generic PATCH status field only ever confirms a pending day-use slot.
// 'cancelled' is deliberately excluded — see POST /:id/cancel below.
const ALLOWED_STATUS_PATCH = ['confirmed'];

/* PATCH /api/guest-bookings/:id — requires staff auth: beyond the original
   mark-read/status use, this now also assigns the physical room number and
   records in-person payment, both front-desk-only actions. */
router.patch('/:id', requireAuth, async (req, res) => {
  const { status, readBy, userId, roomNumber, paymentMethod, starred, staffLabel } = req.body || {};
  try {
    if (userId) {
      // mark read for this user
      await db.query(
        `UPDATE guest_bookings
            SET read_by = array_append(read_by, $1)
          WHERE id = $2 AND NOT ($1 = ANY(read_by))`,
        [userId, req.params.id]
      );
    }
    if (status) {
      // The only legitimate free-form transition left here is confirming a
      // pending day-use slot once front desk has checked the time works.
      // Cancelling must go through POST /:id/cancel (stamps actor/reason,
      // sends the guest a notice) — this endpoint used to accept ANY string,
      // which meant a typo silently broke the overlap/inventory accounting
      // in lib/availability.js (it only ever recognizes the exact strings
      // 'confirmed' / 'pending').
      if (!ALLOWED_STATUS_PATCH.includes(status)) {
        return res.status(400).json({ error: 'Invalid status. Use POST /:id/cancel to cancel a booking.' });
      }
      await db.query(
        `UPDATE guest_bookings SET status = $1 WHERE id = $2 AND status = 'pending'`,
        [status, req.params.id]
      );
    }
    if (roomNumber !== undefined) {
      const rn = String(roomNumber).trim().slice(0, 10);
      await db.query(
        'UPDATE guest_bookings SET room_number = $1 WHERE id = $2',
        [rn || null, req.params.id]
      );
    }
    if (paymentMethod !== undefined) {
      if (!ALLOWED_PAYMENT_METHODS.includes(paymentMethod)) {
        return res.status(400).json({ error: 'Invalid paymentMethod' });
      }
      await db.query(
        `UPDATE guest_bookings SET payment_method = $1, payment_status = 'paid' WHERE id = $2`,
        [paymentMethod, req.params.id]
      );
    }
    if (starred !== undefined) {
      await db.query(
        'UPDATE guest_bookings SET starred = $1 WHERE id = $2',
        [Boolean(starred), req.params.id]
      );
    }
    if (staffLabel !== undefined) {
      const label = String(staffLabel || '').trim().slice(0, 120);
      await db.query(
        'UPDATE guest_bookings SET staff_label = $1 WHERE id = $2',
        [label || null, req.params.id]
      );
    }
    const { rows } = await db.query('SELECT * FROM guest_bookings WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(row2js(rows[0]));
  } catch (e) {
    console.error('[guest-bookings] patch', e);
    res.status(500).json({ error: 'Database error' });
  }
});

/* GET /api/guest-bookings/:id/confirmation-preview — returns the exact
   subject/text the auto "Resend confirmation" would send, so the staff
   console's edit-before-sending panel can prefill from the real template
   instead of duplicating it client-side (which would drift out of sync). */
router.get('/:id/confirmation-preview', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM guest_bookings WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    const bk = rows[0];
    const { text } = confirmationEmail(bk);
    res.json({ subject: `J Park Hotel — booking confirmed (${bk.ref})`, text });
  } catch (e) {
    console.error('[guest-bookings] confirmation-preview', e);
    res.status(500).json({ error: 'Database error' });
  }
});

/* POST /api/guest-bookings/:id/resend-confirmation — lets staff manually
   re-send the guest-facing confirmation email on demand (e.g. a guest says
   they never got it — could be stuck in spam, mistyped address, etc. — or a
   real error like a wrong price was found after the fact). Reuses the exact
   same sendGuestConfirmation() used on initial booking, and surfaces the
   real Resend result to the console instead of it only ever being visible
   in server logs. Optional body `{ subject, text }` lets staff send an
   edited version instead of the auto-generated template verbatim — both
   must be non-empty strings to take effect; either one omitted/blank falls
   back to the template's own default for that part. */
router.post('/:id/resend-confirmation', requireAuth, async (req, res) => {
  if (rateLimited(req.ip || 'unknown')) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }
  try {
    const { rows } = await db.query('SELECT * FROM guest_bookings WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    const bk = rows[0];
    if (!bk.guest_email) return res.status(400).json({ error: 'This booking has no guest email on file' });

    const b = req.body || {};
    const override = {
      subject: typeof b.subject === 'string' && b.subject.trim() ? b.subject.trim() : null,
      text: typeof b.text === 'string' && b.text.trim() ? b.text : null,
    };

    const result = await sendGuestConfirmation(bk, override, req.user);
    if (!result.ok) {
      return res.status(result.skipped ? 503 : 502).json({ error: result.error || 'Send failed' });
    }
    res.json({ status: 'sent', to: bk.guest_email });
  } catch (e) {
    console.error('[guest-bookings] resend-confirmation', e);
    res.status(500).json({ error: 'Database error' });
  }
});

/* GET /api/guest-bookings/:id/email-log — every guest-facing email actually
   sent for this booking (confirmation, resend, cancellation notice, day-use
   request), most recent first. Powers the Staff Console's "Sent Emails"
   panel — see backend/mailer.js's sendEmail(msg, meta) for what gets logged
   and why (internal hotel-notice emails are deliberately excluded). */
router.get('/:id/email-log', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, to_address, subject, body, kind, status, error,
              sent_by_name, created_at
         FROM email_log
        WHERE booking_id = $1
        ORDER BY created_at DESC`,
      [req.params.id]
    );
    res.json(rows.map((r) => ({
      id: r.id,
      to: r.to_address,
      subject: r.subject,
      body: r.body,
      kind: r.kind,
      status: r.status,
      error: r.error,
      sentByName: r.sent_by_name,
      createdAt: new Date(r.created_at).getTime(),
    })));
  } catch (e) {
    console.error('[guest-bookings] email-log', e);
    res.status(500).json({ error: 'Database error' });
  }
});

/* POST /api/guest-bookings/:id/cancel — staff-mediated cancel (any signed-in
   employee, matching the existing PATCH/assign-room/mark-paid permission
   level). Idempotent: cancelling an already-cancelled booking is a no-op
   that still returns 200, mirroring routes/otaSync.js's own
   already_cancelled handling for its separate channel-manager booking
   system. */
router.post('/:id/cancel', requireAuth, async (req, res) => {
  const reason = typeof (req.body && req.body.reason) === 'string'
    ? (req.body.reason.trim().slice(0, 500) || null)
    : null;
  try {
    const { rows: found } = await db.query('SELECT * FROM guest_bookings WHERE id = $1', [req.params.id]);
    if (!found.length) return res.status(404).json({ error: 'Not found' });
    const bk = found[0];
    if (bk.status === 'cancelled') {
      return res.json({ status: 'already_cancelled', booking: row2js(bk) });
    }

    const { rows } = await db.query(
      `UPDATE guest_bookings
          SET status = 'cancelled',
              previous_status = status,
              cancelled_at = NOW(),
              cancelled_by_id = $1,
              cancelled_by_name = $2,
              cancellation_reason = $3
        WHERE id = $4
        RETURNING *`,
      [req.user.id, req.user.name, reason, req.params.id]
    );
    const saved = rows[0];
    fireCancellationNotice(saved, { actorName: req.user.name, wasConfirmed: bk.status === 'confirmed' });
    res.json(row2js(saved));
  } catch (e) {
    console.error('[guest-bookings] cancel', e);
    res.status(500).json({ error: 'Database error' });
  }
});

/* POST /api/guest-bookings/:id/reopen — restores a cancelled booking to its
   prior status. For a 'direct' overnight booking this re-runs the same
   advisory-lock + overlap guard routes/payments.js's POST /reservations
   uses, since the room may have been sold to someone else while this
   booking sat cancelled. The guard is scoped to channel==='direct' only:
   OTA-sourced bookings carry a free-text `room` string from the channel's
   own listing (extracted by lib/otaEmailParser.js) that was never validated
   against roomRates' inventory map and was never subject to this guard at
   creation time either (ingestGuestBooking() does a plain insert, no
   overlap check) — running the same guard on them would false-positive
   block almost every OTA reopen, since an unrecognized room name resolves
   to zero inventory. Day-use rows (check_in === check_out) never hold
   nightly inventory, matching how their original booking flow also skips
   this guard. */
router.post('/:id/reopen', requireAuth, async (req, res) => {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows: found } = await client.query(
      'SELECT * FROM guest_bookings WHERE id = $1 FOR UPDATE', [req.params.id]
    );
    if (!found.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Not found' });
    }
    const bk = found[0];
    if (bk.status !== 'cancelled') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Booking is not cancelled' });
    }

    const isOvernightDirect = bk.channel === 'direct' && bk.room && String(bk.check_in) !== String(bk.check_out);
    if (isOvernightDirect) {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1)::bigint)', [bk.room]);
      const cnt = await countOverlapping(client, bk.room, bk.check_in, bk.check_out);
      if (cnt >= roomRates.getInventory(bk.room)) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Sorry, this room type is no longer available for those dates.' });
      }
    }

    const restoredStatus = bk.previous_status || 'confirmed';
    const { rows } = await client.query(
      `UPDATE guest_bookings
          SET status = $1,
              previous_status = NULL,
              cancelled_at = NULL,
              cancelled_by_id = NULL,
              cancelled_by_name = NULL,
              cancellation_reason = NULL
        WHERE id = $2
        RETURNING *`,
      [restoredStatus, req.params.id]
    );
    await client.query('COMMIT');
    const saved = rows[0];
    broadcastStaffMessage(
      `Booking reopened by ${req.user.name} — ${saved.ref}`,
      `Guest: ${saved.guest_name || '—'}\nRoom: ${saved.room || '—'}\nCheck-in: ${saved.check_in}\nCheck-out: ${saved.check_out}\nRef: ${saved.ref}`
    ).catch((err) => console.error('[guest-bookings] reopen broadcast error', err));
    res.json(row2js(saved));
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error('[guest-bookings] reopen', e);
    res.status(500).json({ error: 'Database error' });
  } finally {
    client.release();
  }
});

/* DELETE /api/guest-bookings/:id (admin) */
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    await db.query('DELETE FROM guest_bookings WHERE id = $1', [req.params.id]);
    res.json({ deleted: true });
  } catch (e) {
    console.error('[guest-bookings] delete', e);
    res.status(500).json({ error: 'Database error' });
  }
});

function normChannel(raw) {
  const k = String(raw || '').toLowerCase();
  if (k.includes('agoda'))   return 'agoda';
  if (k.includes('booking')) return 'booking';
  if (k.includes('airbnb'))  return 'airbnb';
  if (k.includes('trip'))    return 'trip';
  if (k.includes('expedia')) return 'expedia';
  return 'direct';
}

function computeNights(ci, co) {
  if (!ci || !co) return 1;
  const n = Math.round((new Date(co) - new Date(ci)) / 86400000);
  return n > 0 ? n : 1;
}

module.exports = router;
// Shared with routes/otaEmail.js (the email-forwarding bridge) and
// routes/payments.js (the online booking + card/PromptPay flow), so every
// intake path renders identically in the staff console and sends the same
// hotel-notice / guest-confirmation emails (including the deposit note).
module.exports.ingestGuestBooking = ingestGuestBooking;
module.exports.row2js = row2js;
module.exports.fireBookingEmails = fireBookingEmails;
module.exports.hotelNotice = hotelNotice;
module.exports.hotelRecipients = hotelRecipients;
module.exports.confirmationEmail = confirmationEmail;
module.exports.computeNights = computeNights;
module.exports.emailLetterhead = emailLetterhead;
module.exports.SPAM_NOTE_TEXT = SPAM_NOTE_TEXT;
module.exports.SPAM_NOTE_HTML = SPAM_NOTE_HTML;
