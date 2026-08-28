/* ============================================================
   J Park Hotel — online payment provider registry.

   One seam between routes/payments.js and whichever payment gateway the
   hotel actually has an approved merchant account with. The gateway is a
   deployment choice (an env var), not a code choice: every adapter in
   ./ implements the same small interface, so switching providers is
   pasting a different set of keys into Render and redeploying.

   That indirection exists for a concrete reason. The hotel's Omise/Opn
   application sat unanswered for three weeks, which blocked online payment
   entirely because the integration was welded to Omise's API shape. Now the
   code is never the thing waiting on a merchant application — whichever
   account is approved first can go live the same hour.

   ── Adapter interface ───────────────────────────────────────────────────
     id, label            identity, stored in guest_bookings.payment_provider
     isConfigured()       are this provider's keys present?
     publicKey()          browser-safe key, or null
     methods()            subset of ['card', 'promptpay'] this account can take
     newReference()       merchant-side charge reference, or null if the
                          provider mints its own id
     chargeCard(args)     see the outcome shapes below
     chargePromptPay(args)
     verify(chargeRef)    -> { paid, state, raw } — AUTHORITATIVE. Always a
                          fresh call to the provider, never a cached status.
                          `state` is one of paid | pending | failed | expired
                          | unknown, and is what lets the reconciler tell a
                          payment still in flight from one that is over.
     parseWebhook(body)   -> { chargeRef } | null
     verifySignature(raw, headers)
                          -> true | false | null (no scheme, or no secret set)
     mode()               -> 'live' | 'test' | null (not configured)
     tokenizeUrl()        card-tokenization endpoint for the browser, or null

   ── The three charge outcomes ───────────────────────────────────────────
   Every provider's charge resolves to exactly one of these, and
   routes/payments.js handles the three uniformly:

     { ok:true,  paid:true,  chargeRef, detail }         settled synchronously
     { ok:true,  paid:false, chargeRef, qrImage, detail } guest scans, webhook confirms
     { ok:true,  paid:false, chargeRef, redirect, detail } guest authenticates, webhook confirms
     { ok:false, status, error, failure, detail }        declined / unavailable

   `detail` is the provider-neutral payment record described in ./detail.js —
   card, fee, net, settlement, failure reason. It rides on ALL FOUR outcomes,
   including the decline: a charge the bank refused is precisely the one whose
   detail somebody needs, because there is no booking row for it and the only
   other record of it is a percentage on the acquirer's dashboard.

   `failure` (declines only) is the STAFF-facing reason: { code, message,
   text }. It is deliberately NOT what goes back to the guest — `error` is
   that, and it is a kind sentence with no acquirer detail in it, because a
   public endpoint that echoes decline codes is a card-testing oracle.

   The two `paid:false` outcomes are the same state as far as the booking is
   concerned: the reservation is confirmed, payment_status is 'pending', and
   the webhook is what flips it to 'paid'. That machinery already existed for
   Omise PromptPay; 3-D Secure card payments simply reuse it.
   ============================================================ */

const omise = require('./omise');
const gbprimepay = require('./gbprimepay');

/* Omise is the hotel's approved and only acquirer. It is first here so that
   auto-detect prefers it, and render.yaml additionally pins
   PAYMENT_PROVIDER=omise so the choice is never left to whichever keys happen
   to be present.

   GB Prime Pay stays in the list, dormant and unreachable without its keys.
   That is deliberate rather than leftover: this seam exists precisely because
   the hotel's acquirer changed twice in a single day while Omise's
   application was stalled, and deleting the alternative would put the code
   back in the position of being the thing that blocks a switch. It costs
   nothing while its environment variables are unset. */
const PROVIDERS = [omise, gbprimepay];

/* Which provider is live. Explicit PAYMENT_PROVIDER wins so a hotel holding
   two approved accounts can choose deliberately; otherwise the first
   provider whose keys are actually present is used, which means pasting one
   set of keys into Render is the entire go-live step. */
function active() {
  const forced = String(process.env.PAYMENT_PROVIDER || '').trim().toLowerCase();
  if (forced) {
    const found = PROVIDERS.find((p) => p.id === forced);
    // A forced provider with missing keys is left to report itself as
    // unconfigured rather than silently falling through to the other one —
    // silently taking money through an unintended gateway would be worse
    // than online payment staying switched off.
    return found || null;
  }
  return PROVIDERS.find((p) => p.isConfigured()) || null;
}

function isConfigured() {
  const p = active();
  return Boolean(p && p.isConfigured());
}

/* Base URLs for the two callbacks a redirect/QR payment needs.

   - notifyUrl (server-to-server) must point at THIS API. On Render,
     RENDER_EXTERNAL_URL is injected automatically, so this normally needs no
     configuration at all.
   - returnUrl (the guest's browser) must point at the PUBLIC SITE, which is
     a different host — the site is static-hosted, the API is not. Falls back
     to the first configured CORS origin, which is by definition the site. */
function apiBaseUrl() {
  return String(process.env.PUBLIC_API_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/+$/, '');
}
function siteBaseUrl() {
  const explicit = String(process.env.PUBLIC_SITE_URL || '').trim();
  if (explicit) return explicit.replace(/\/+$/, '');
  const firstOrigin = String(process.env.FRONTEND_ORIGIN || '').split(',')[0].trim();
  return firstOrigin && firstOrigin !== '*' ? firstOrigin.replace(/\/+$/, '') : '';
}

function webhookUrl() {
  const base = apiBaseUrl();
  if (!base) return '';
  const secret = process.env.PAYMENT_WEBHOOK_SECRET || process.env.OMISE_WEBHOOK_SECRET || '';
  return base + '/api/v1/payments/webhook' + (secret ? '?key=' + encodeURIComponent(secret) : '');
}

/* Where the gateway sends the guest's BROWSER after a 3-D Secure challenge.

   This deliberately points at the API, not straight at the booking page,
   because GB Prime Pay returns the payer by POSTing to responseUrl — and the
   booking page is static-hosted, where a POST is answered with 405 Method
   Not Allowed. So the API absorbs the POST and 302s the guest onward to the
   booking page as an ordinary GET (see the /payments/return route).

   The charge reference travels in the query string because the booking row
   does not exist yet when this URL is built — the booking page uses it to
   resume polling for the payment result after the round trip. */
function returnUrl(chargeRef) {
  const base = apiBaseUrl();
  if (!base) return '';
  return base + '/api/v1/payments/return?ref=' + encodeURIComponent(chargeRef || '');
}

// The final hop of that round trip: the public booking page, which reopens
// the guest's confirmation and polls until the payment lands.
function bookingPageUrl(chargeRef) {
  const base = siteBaseUrl();
  if (!base) return '';
  return base + '/booking.html?jpPay=' + encodeURIComponent(chargeRef || '');
}

/* What GET /api/v1/payments/config reports to the booking page. Everything
   here is safe to expose: the public key is designed to be published, and
   the rest is UI state. */
function publicConfig() {
  const p = active();
  if (!p || !p.isConfigured()) {
    return { provider: null, paymentEnabled: false, publicKey: null, methods: [], testMode: false };
  }
  return {
    provider: p.id,
    paymentEnabled: true,
    publicKey: p.publicKey(),
    methods: p.methods(),
    tokenizeUrl: p.tokenizeUrl ? p.tokenizeUrl() : null,
    // Deliberately public. A booking page running against TEST keys looks
    // identical to one taking real money — same forms, same "paid" banner,
    // same confirmation email — so a guest could believe they had paid when
    // nothing was charged, and staff could believe a stay was settled. The
    // booking page turns this flag into an unmissable banner. It leaks
    // nothing: the test/live distinction is already visible in the public
    // key's own `pkey_test_` prefix sitting right next to it.
    testMode: mode() === 'test',
  };
}

// 'live' | 'test' | null. Read by the startup banner, GET /payments/config
// and the diagnostics route.
function mode() {
  const p = active();
  if (!p || !p.isConfigured()) return null;
  return p.mode ? p.mode() : (p.isLive && p.isLive() ? 'live' : 'test');
}

// Is this method actually offerable right now? Guards against a client
// asking for PromptPay on an account whose QR product isn't activated.
function supportsMethod(method) {
  const p = active();
  return Boolean(p && p.isConfigured() && p.methods().includes(method));
}

/* Charge one amount — a single room's total, or a whole group cart's grand
   total. `amountTHB` is ALWAYS the server-computed total; nothing here ever
   reads an amount from the client.

   Returns one of the four outcome shapes documented at the top of this file.
   Provider/network failures are converted to { ok:false } rather than thrown,
   so a gateway outage degrades a booking to "please pay at check-in" instead
   of a 500. */
async function charge({ method, amountTHB, cardToken, description, guest, bookingRef, metadata }) {
  const p = active();
  if (!p || !p.isConfigured()) {
    return { ok: false, status: 400, error: 'Online payment is not currently available. Please choose pay at check-in.' };
  }
  if (!p.methods().includes(method)) {
    return { ok: false, status: 400, error: 'That payment method is not available. Please choose another.' };
  }

  const reference = p.newReference();
  const notifyUrl = webhookUrl();
  // A provider that mints its own charge id (Omise) has no merchant-side
  // reference to put in the return URL — its id doesn't exist until the
  // charge call answers, which is after this URL has to be built. The
  // booking ref stands in, and the status lookup accepts either.
  const args = {
    amountTHB,
    reference,
    cardToken,
    description,
    guest,
    bookingRef,
    metadata,
    notifyUrl,
    returnUrl: returnUrl(reference || bookingRef),
  };

  try {
    const result = method === 'card' ? await p.chargeCard(args) : await p.chargePromptPay(args);
    if (!result.ok) {
      // A decline is the guest's problem to act on (try another card, or pay
      // at check-in); the provider's own code is logged for support but never
      // shown, since it means nothing to a guest and can leak acquirer detail.
      console.error(`[payments] ${p.id} declined`, result.code || '');
      return {
        ok: false,
        provider: p.id,
        status: result.status || 402,
        // What the GUEST reads. No acquirer code, no bank name, nothing that
        // tells a script whether a stolen card is live — see the docblock.
        error: result.declined
          ? 'Your card was declined. Please try a different card, or contact the hotel and we will help you complete your booking.'
          : 'Could not process online payment right now. Please try again, or contact the hotel and we will help you complete your booking.',
        // What STAFF read. Kept whole, verbatim from the gateway.
        failure: (result.detail && result.detail.failure) || {
          code: result.code || null, message: null,
          text: require('./detail').describeFailure(result.code, null),
        },
        detail: result.detail || null,
      };
    }
    return Object.assign({ provider: p.id }, result);
  } catch (e) {
    console.error(`[payments] ${p.id} charge error`, (e && (e.gbp || e.omise)) || (e && e.message) || e);
    // A gateway that could not be reached is NOT a card that was refused, and
    // recording it as one would put an innocent card in front of staff as a
    // decline. No detail, and a failure reason that says what actually
    // happened.
    return {
      ok: false, provider: p.id, status: 502,
      error: 'Could not process online payment right now. Please try again, or contact the hotel and we will help you complete your booking.',
      failure: { code: 'gateway_unreachable', message: (e && e.message) || null,
                 text: 'The payment gateway could not be reached. This is not a problem with the guest\'s card.' },
      detail: null,
    };
  }
}

// Authoritative confirmation, used by the webhook. Never trusts a webhook
// body — always asks the provider directly.
/* Authoritative confirmation, used by the webhook AND by
   backend/paymentReconciler.js. Never trusts a webhook body — always asks the
   provider directly.

   'unknown' rather than a hard false when no gateway is configured: the
   caller must be able to tell "the provider says this was not paid" from
   "nobody could be asked", because only the first of those is a reason to
   stop watching a charge. */
async function verify(chargeRef) {
  const p = active();
  if (!p || !p.isConfigured()) return { paid: false, state: 'unknown', raw: null, detail: null };
  const result = await p.verify(chargeRef);
  return Object.assign({ state: result.paid ? 'paid' : 'unknown', detail: null }, result);
}

function parseWebhook(body) {
  const p = active();
  return p ? p.parseWebhook(body) : null;
}

/* ── Read-only account introspection ─────────────────────────────────────
   The staff Payments ledger and the hotel's daily report read the acquirer
   directly rather than only trusting what this database happens to hold —
   that is the whole point of them, since the failure they exist to catch is
   the database being WRONG about a charge.

   Every one is optional on the adapter: a provider that cannot list charges
   simply reports nothing, and the ledger degrades to "we cannot ask right
   now" instead of throwing. GB Prime Pay has no equivalent API, and must
   stay a valid provider without one. */
function supportsLedger() {
  const p = active();
  return Boolean(p && p.isConfigured() && typeof p.listCharges === 'function');
}

async function listCharges(opts) {
  const p = active();
  if (!p || !p.isConfigured() || !p.listCharges) return null;
  return p.listCharges(opts);
}

async function balance() {
  const p = active();
  if (!p || !p.isConfigured() || !p.balance) return null;
  return p.balance();
}

async function listTransfers(opts) {
  const p = active();
  if (!p || !p.isConfigured() || !p.listTransfers) return null;
  return p.listTransfers(opts);
}

async function retrieveTransaction(id) {
  const p = active();
  if (!p || !p.isConfigured() || !p.retrieveTransaction || !id) return null;
  return p.retrieveTransaction(id);
}

function describeCharge(raw) {
  const p = active();
  return p && p.describeCharge ? p.describeCharge(raw) : null;
}

function resolveSettlement(transactionId, transaction, transfers) {
  const p = active();
  return p && p.resolveSettlement ? p.resolveSettlement(transactionId, transaction, transfers) : null;
}

/* Is this webhook delivery cryptographically genuine?
     true  — signed and valid
     false — signed badly: reject it outright
     null  — this provider has no signature scheme, or no secret is
             configured, so the caller falls through to API re-verification
   Never the sole gate; see routes/payments.js. */
function verifySignature(rawBody, headers) {
  const p = active();
  return p && p.verifySignature ? p.verifySignature(rawBody, headers) : null;
}

module.exports = {
  active,
  isConfigured,
  publicConfig,
  supportsMethod,
  mode,
  charge,
  verify,
  parseWebhook,
  verifySignature,
  webhookUrl,
  bookingPageUrl,
  supportsLedger,
  listCharges,
  balance,
  listTransfers,
  retrieveTransaction,
  describeCharge,
  resolveSettlement,
  siteBaseUrl,
  apiBaseUrl,
};
