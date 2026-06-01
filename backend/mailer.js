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

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

function isConfigured() {
  return Boolean(process.env.RESEND_API_KEY);
}

/**
 * Send one email.
 * @param {{to:string|string[], subject:string, html?:string, text?:string, from?:string, replyTo?:string}} msg
 * @returns {Promise<{ok:boolean, id?:string, error?:string, skipped?:boolean}>}
 */
async function sendEmail(msg) {
  if (!isConfigured()) {
    // Soft no-op so local dev / unconfigured deploys don't throw.
    console.warn('[mailer] RESEND_API_KEY not set — email skipped:', msg && msg.subject);
    return { ok: false, skipped: true, error: 'Email not configured' };
  }
  if (!msg || !msg.to || !msg.subject || (!msg.html && !msg.text)) {
    return { ok: false, error: 'to, subject and html|text are required' };
  }

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
      return { ok: false, error };
    }
    return { ok: true, id: data.id };
  } catch (e) {
    console.error('[mailer] network error:', e);
    return { ok: false, error: 'Network error reaching email provider' };
  }
}

module.exports = { sendEmail, isConfigured };
