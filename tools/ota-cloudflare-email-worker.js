/**
 * J Park Hotel — OTA email → website bridge (Cloudflare Email Worker)
 * ----------------------------------------------------------------------------
 * The cheapest (free) production receiver, for use once jparkhotel.com is on
 * Cloudflare. Cloudflare Email Routing delivers inbound mail for an address on
 * your domain (e.g. ota@jparkhotel.com) to this Worker, which parses the email
 * and POSTs it to POST /api/v1/ota-email — landing the booking in the staff
 * Guest Booking inbox + firing the front-desk notice. Instant, no polling.
 *
 * SETUP (see docs/OTA_EMAIL_BRIDGE.md for the full walkthrough):
 *   1. Add jparkhotel.com to Cloudflare; enable Email → Email Routing.
 *   2. Create a Worker, add the parser dep:  npm i postal-mime
 *      Paste this file as the Worker code and deploy.
 *   3. Worker → Settings → Variables: add encrypted var OTA_WEBHOOK_SECRET
 *      (= the Render value).   [or: wrangler secret put OTA_WEBHOOK_SECRET]
 *   4. Email Routing → Routes: send ota@jparkhotel.com → "Send to a Worker".
 *   5. Auto-forward OTA confirmations to ota@jparkhotel.com (or, if the OTAs
 *      already email an @jparkhotel.com address, route that address here).
 *
 * Optionally override the API base with an API_BASE Worker var.
 */
import PostalMime from 'postal-mime';

export default {
  async email(message, env, ctx) {
    const base = env.API_BASE || 'https://jpark.onrender.com';
    const url = base.replace(/\/+$/, '') + '/api/v1/ota-email?key=' + encodeURIComponent(env.OTA_WEBHOOK_SECRET || '');

    let parsed = {};
    try {
      const raw = await new Response(message.raw).arrayBuffer();
      parsed = await new PostalMime().parse(raw);
    } catch (e) {
      // Fall back to headers only if MIME parsing fails — the endpoint still
      // stores whatever arrives, so the booking is never lost.
      parsed = {};
    }

    const payload = {
      subject: parsed.subject || message.headers.get('subject') || '',
      from: (parsed.from && parsed.from.address) || message.from || '',
      to: message.to || '',
      text: parsed.text || '',
      html: parsed.html || '',
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      // Surface failures in the Worker logs (wrangler tail) for debugging.
      console.log('ota-email POST failed', res.status, await res.text());
    }
  },
};
