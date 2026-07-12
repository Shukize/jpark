/* ============================================================
   J Park Hotel — transactional email (Resend)
   ------------------------------------------------------------
   Sends mail through Resend's HTTP API (https://resend.com).
   We use the built-in fetch (Node >= 18) so no SDK dependency is
   added. The API key lives ONLY in the server env (RESEND_API_KEY)
   and is never shipped to the browser.

   Free tier: ~3,000 emails/month, 100/day — ample for a single
   property's booking confirmations and staff notifications.

   Env:
     RESEND_API_KEY   re_...           (required to actually send)
     EMAIL_FROM       "J Park Hotel <noreply@yourdomain.com>"
                      Until you verify a domain in Resend, use the
                      sandbox sender: "onboarding@resend.dev".
   ============================================================ */
'use strict';

const db = require('./db');

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

function isConfigured() {
  return Boolean(process.env.RESEND_API_KEY);
}

// Records a guest-facing send in email_log so staff can see what a guest was
// actually told (see schema.sql's email_log comment). Only called when the
// caller passes `meta.bookingId` — internal hotel-notice sends don't, so they
// never show up here. Never throws into the caller; a logging failure must
// not affect whether the email itself was considered sent.
async function logSend(meta, msg, result) {
  if (!meta || !meta.bookingId) return;
  try {
    await db.query(
      `INSERT INTO email_log
         (booking_id, booking_ref, to_address, subject, body, kind, status, error, sent_by_id, sent_by_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        meta.bookingId,
        meta.bookingRef || null,
        Array.isArray(msg.to) ? msg.to.join(', ') : msg.to,
        msg.subject,
        msg.text || null,
        meta.kind || 'other',
        result.ok ? 'sent' : (result.skipped ? 'skipped' : 'failed'),
        result.error || null,
        meta.sentById || null,
        meta.sentByName || null,
      ]
    );
  } catch (e) {
    console.error('[mailer] email_log insert failed:', e);
  }
}

/**
 * Send one email.
 * @param {{to:string|string[], subject:string, html?:string, text?:string, from?:string, replyTo?:string}} msg
 * @param {{bookingId?:string, bookingRef?:string, kind?:string, sentById?:string, sentByName?:string}} [meta]
 *   When bookingId is given, the send attempt (sent/failed/skipped) is
 *   recorded in email_log for the Staff Console's "Sent Emails" view.
 * @returns {Promise<{ok:boolean, id?:string, error?:string, skipped?:boolean}>}
 */
async function sendEmail(msg, meta) {
  let result;
  if (!isConfigured()) {
    // Soft no-op so local dev / unconfigured deploys don't throw.
    console.warn('[mailer] RESEND_API_KEY not set — email skipped:', msg && msg.subject);
    result = { ok: false, skipped: true, error: 'Email not configured' };
  } else if (!msg || !msg.to || !msg.subject || (!msg.html && !msg.text)) {
    result = { ok: false, error: 'to, subject and html|text are required' };
  } else {
    const from =
      msg.from ||
      process.env.EMAIL_FROM ||
      'J Park Hotel <onboarding@resend.dev>';

    const body = {
      from,
      to: Array.isArray(msg.to) ? msg.to : [msg.to],
      subject: msg.subject,
    };
    if (msg.html) body.html = msg.html;
    if (msg.text) body.text = msg.text;
    if (msg.replyTo) body.reply_to = msg.replyTo;

    try {
      const res = await fetch(RESEND_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      let data = {};
      try { data = await res.json(); } catch (_) { /* empty body */ }
      if (!res.ok) {
        const error = (data && (data.message || data.error)) || `HTTP ${res.status}`;
        console.error('[mailer] send failed:', error);
        result = { ok: false, error };
      } else {
        result = { ok: true, id: data.id };
      }
    } catch (e) {
      console.error('[mailer] network error:', e);
      result = { ok: false, error: 'Network error reaching email provider' };
    }
  }

  if (msg && meta) await logSend(meta, msg, result);
  return result;
}

module.exports = { sendEmail, isConfigured };
