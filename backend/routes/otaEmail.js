/* ============================================================
   J Park Hotel — OTA email-forwarding bridge
   ------------------------------------------------------------
   POST /api/v1/ota-email

   Receives a FORWARDED OTA confirmation email and turns it into a
   booking in the Guest Booking inbox (+ the hotel-notice email),
   so reservations from Agoda / Booking.com / Airbnb / Trip.com /
   Expedia flow into the website's integrated mail automatically.

   How the email reaches this endpoint (pick one — all free/low cost):
     • Cloudflare Email Routing + an Email Worker that POSTs the
       message here (recommended once the domain is on Cloudflare).
     • A no-code inbound parser (Email Parser by Zapier, Make,
       Mailparser, SendGrid/Mailgun Inbound Parse) that forwards the
       parsed email as JSON to this URL.
     • A Gmail/Outlook auto-forward rule into any of the above.

   Auth: shared secret OTA_WEBHOOK_SECRET, sent as the `X-API-Key`
   header OR a `?key=` query param (some forwarders can't set custom
   headers). When OTA_WEBHOOK_SECRET is unset the endpoint is open
   (local dev only — always set it in production).

   Accepted body (field names from the common inbound services are all
   tolerated): { subject, from, to, text, html }.

   Robustness: field extraction is best-effort, but the FULL raw email
   is always stored on the booking, so the front desk never loses a
   reservation even if a field can't be read. When the dates can't be
   parsed the booking is still created (flagged "needs review") rather
   than dropped.
   ============================================================ */
const express = require('express');
const crypto = require('crypto');
const { ingestGuestBooking } = require('./guestBookings');
const { parseOtaEmail } = require('../lib/otaEmailParser');

const router = express.Router();

function keyOk(req) {
  const expected = process.env.OTA_WEBHOOK_SECRET || '';
  if (!expected) return true; // no secret configured → open (local dev)
  const provided = req.get('x-api-key') || req.query.key || '';
  if (!provided) return false;
  const a = Buffer.from(String(provided));
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// Pull the email parts out of whatever the inbound service named them.
function readEmail(body) {
  const b = body || {};
  const subject = b.subject || b.Subject || b['subject'] || '';
  const from = b.from || b.From || b.sender || b['from'] || '';
  const to = b.to || b.To || b.recipient || '';
  const text =
    b.text || b.plain || b['body-plain'] || b.TextBody || b['stripped-text'] || '';
  const html = b.html || b.HtmlBody || b['body-html'] || b['stripped-html'] || '';
  return { subject, from, to, text, html };
}

function todayISO(offsetDays = 0) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

router.post('/', async (req, res) => {
  if (!keyOk(req)) {
    return res.status(401).json({ error: 'Invalid or missing API key' });
  }

  const email = readEmail(req.body);
  if (!email.subject && !email.text && !email.html) {
    return res.status(400).json({
      error: 'Provide the email as { subject, from, text, html }.',
    });
  }

  const parsed = parseOtaEmail(email);

  // Never drop a booking: if the dates couldn't be read, keep it but flag it
  // for the front desk and use placeholder dates so it still lands in the inbox.
  let needsReview = false;
  if (!parsed.checkIn || !parsed.checkOut) {
    needsReview = true;
    parsed.checkIn = parsed.checkIn || todayISO(0);
    parsed.checkOut = parsed.checkOut || todayISO(1);
    parsed.confirmation =
      '⚠ Auto-import could not read the check-in/check-out dates — please verify ' +
      'against the original email below and correct this booking.\n\n' +
      (parsed.confirmation || '');
  }
  if (!parsed.guestName) parsed.guestName = 'Guest (see email)';

  try {
    const saved = await ingestGuestBooking(parsed);
    return res.status(201).json({
      status: saved.inserted ? 'ingested' : 'duplicate',
      needsReview,
      ref: saved.ref,
      channel: saved.channel,
      parsed: {
        guestName: parsed.guestName,
        room: parsed.room,
        checkIn: parsed.checkIn,
        checkOut: parsed.checkOut,
        total: parsed.total,
        currency: parsed.currency,
        guestEmail: parsed.guestEmail,
        status: parsed.status,
      },
    });
  } catch (e) {
    console.error('[ota-email] ingest failed', e);
    return res.status(500).json({ error: 'Could not store the booking' });
  }
});

module.exports = router;
