/* ============================================================
   J Park Hotel — Omise/Opn Payments adapter (card + PromptPay).

   Omise is the hotel's APPROVED, ACTIVE acquirer. It sits behind the shared
   provider interface described in lib/payments/index.js, so it and GB Prime
   Pay remain interchangeable through one env var — that seam is kept because
   it is what stopped the code from being the thing waiting on a merchant
   application, not because the choice is still open.

   All amounts are in THB satang (smallest unit): multiply THB by 100 before
   calling. This is the opposite of GB Prime Pay's plain-THB convention,
   which is why the conversion lives here rather than in the caller.

   Two documented Omise behaviours drive design decisions elsewhere in this
   codebase, and both are easy to get wrong by assumption:

     1. OMISE DOES NOT RETRY FAILED WEBHOOK DELIVERIES. "Omise does not
        currently guarantee automatic retries for failed deliveries" — so one
        missed delivery (a deploy restart, a DB blip, a network hiccup)
        permanently loses the only notification that a charge was paid.
        Omise's own documented fallback is to poll. That is why
        backend/paymentReconciler.js exists, and why it is not optional: it
        is the difference between "the guest paid" and "the hotel knows".

     2. Omise DOES sign webhook bodies (HMAC-SHA256), despite older
        integrations assuming otherwise — see verifySignature() below.

   Omise docs: https://docs.omise.co/api
   ============================================================ */

const crypto = require('crypto');

const API_BASE = 'https://api.omise.com';

function isConfigured() {
  return Boolean(process.env.OMISE_SECRET_KEY);
}

function publicKey() {
  return process.env.OMISE_PUBLIC_KEY || null;
}

function methods() {
  return isConfigured() ? ['card', 'promptpay'] : [];
}

/* Test keys are prefixed `skey_test_` / `pkey_test_`; live keys are the same
   without the `test_` segment. Nothing else distinguishes them — the API host
   is identical — which is exactly why a deployment can sit on test keys and
   look, to everyone including the guest, like it is taking real money. That
   state is surfaced at startup, on GET /payments/config, on the booking page
   and in the hotel notice email so it can never pass unnoticed. */
function isLive() {
  const key = String(process.env.OMISE_SECRET_KEY || '');
  return key.startsWith('skey_') && !key.startsWith('skey_test_');
}

// 'live' | 'test' | null (not configured). Distinct from isLive() so callers
// can tell "test mode" apart from "no gateway configured at all".
function mode() {
  if (!isConfigured()) return null;
  return isLive() ? 'live' : 'test';
}

function authHeader() {
  const key = process.env.OMISE_SECRET_KEY || '';
  return 'Basic ' + Buffer.from(key + ':').toString('base64');
}

async function omiseRequest(method, path, body) {
  const res = await fetch(API_BASE + path, {
    method,
    headers: {
      Authorization: authHeader(),
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const message = (json && (json.message || (json.object === 'error' && json.code))) || `Omise API error (${res.status})`;
    const err = new Error(message);
    err.omise = json;
    err.status = res.status;
    throw err;
  }
  return json;
}

// Omise mints its own charge id and that id is the reconciliation key, so
// unlike GB Prime Pay there is no merchant-side reference to pre-generate.
function newReference() {
  return null;
}

// Card is a two-part flow: the browser tokenizes the card via Omise.js
// (client-side, so the raw card number never reaches this server — only a
// tokn_... id does), then this creates a charge directly against that token.
//
// Most charges resolve SYNCHRONOUSLY — charge.status is 'successful' or
// 'failed' by the time this call returns. But if Omise or the issuing bank
// requires an offsite 3-D Secure challenge, the charge instead comes back
// 'pending' with an authorize_uri the guest must be sent to. The original
// integration did not handle that case at all (it was a documented known
// limitation) and simply read such a charge as declined, turning away a
// perfectly good card.
//
// It is now surfaced as a redirect outcome — the identical shape GB Prime
// Pay's 3-D Secure produces — so the booking page handles both providers, and
// both payment styles, through one code path.
//
// return_uri is where Omise sends the guest's browser after the challenge. It
// must be set at charge-creation time, which is why it is threaded all the
// way down from lib/payments/index.js rather than derived here.
async function chargeCard({ amountTHB, cardToken, description, metadata, returnUrl }) {
  const charge = await omiseRequest('POST', '/charges', {
    amount: Math.round(amountTHB * 100),
    currency: 'thb',
    card: cardToken,
    description,
    metadata,
    return_uri: returnUrl || undefined,
  });
  if (charge.status === 'successful') {
    return { ok: true, paid: true, chargeRef: charge.id, providerRef: charge.id };
  }
  if (charge.status === 'pending' && charge.authorize_uri) {
    return {
      ok: true,
      paid: false,
      chargeRef: charge.id,
      providerRef: charge.id,
      redirect: { url: charge.authorize_uri, method: 'GET', fields: {} },
    };
  }
  return { ok: false, status: 402, code: charge.failure_code || null, declined: true };
}

// PromptPay is a two-step flow: create a "source" (payment intent), then a
// charge against that source. The charge response carries the QR code image
// to show the guest and starts out `pending` until the guest scans and pays
// — confirmed via webhook.
async function chargePromptPay({ amountTHB, description, metadata }) {
  const amountSatang = Math.round(amountTHB * 100);
  const source = await omiseRequest('POST', '/sources', {
    type: 'promptpay',
    amount: amountSatang,
    currency: 'thb',
  });
  const charge = await omiseRequest('POST', '/charges', {
    amount: amountSatang,
    currency: 'thb',
    source: source.id,
    description,
    metadata,
  });
  const qrImage = (charge.source && charge.source.scannable_code
    && charge.source.scannable_code.image && charge.source.scannable_code.image.download_uri) || null;
  return {
    ok: true,
    paid: false,
    chargeRef: charge.id,
    providerRef: charge.id,
    qrImage,
    expiresAt: charge.expires_at || null,
  };
}

/* Maps Omise's charge.status onto the small vocabulary the reconciler needs.

   The distinction that matters is SETTLED vs STILL-MOVING: a reconciler that
   cannot tell "the guest hasn't scanned the QR yet" from "that QR expired an
   hour ago" would either give up on a live payment or re-poll a dead one
   forever. 'reversed' groups with failed — the money is not ours. */
function chargeState(status) {
  switch (String(status || '')) {
    case 'successful': return 'paid';
    case 'pending':    return 'pending';
    case 'failed':     return 'failed';
    case 'expired':    return 'expired';
    case 'reversed':   return 'failed';
    default:           return 'unknown';
  }
}

/* Authoritative re-check — the single source of truth for whether money
   actually moved. A webhook delivery is only ever a hint that something
   changed; the answer always comes from re-fetching the charge here. Used by
   the webhook (which never trusts its own body) and by
   backend/paymentReconciler.js (which has no body to trust at all). */
async function verify(chargeRef) {
  const charge = await omiseRequest('GET', `/charges/${encodeURIComponent(chargeRef)}`);
  const state = chargeState(charge && charge.status);
  return { paid: state === 'paid', state, raw: charge };
}

/* Webhook signature verification.

   Omise signs webhook bodies with HMAC-SHA256 when a webhook secret is set in
   the dashboard, sending two headers:

     Omise-Signature            hex-encoded HMAC-SHA256 digest
     Omise-Signature-Timestamp  unix seconds the signature was generated

   The signed payload is `<TIMESTAMP>.<RAW_BODY>` (UTF-8), and the dashboard's
   webhook secret is BASE64 — it must be decoded to raw bytes before being
   used as the HMAC key. Getting either detail wrong yields a signature that
   never matches, so both are spelled out here rather than inferred.

   Returns:
     null   no secret configured — checking is off, and the caller falls back
            to re-verifying against the API (which it does either way)
     true   signature present and valid
     false  signature missing, malformed, stale, or wrong

   This is defence in depth, not the safety net: every delivery is re-verified
   against Omise's API regardless. What it buys is rejecting forged deliveries
   BEFORE spending an API round trip on them. */
const SIGNATURE_MAX_AGE_SECONDS = 5 * 60; // a stale signature is a replayed one

function verifySignature(rawBody, headers) {
  const secret = String(process.env.OMISE_WEBHOOK_SIGNING_SECRET || '').trim();
  if (!secret) return null;

  const get = (name) => {
    if (!headers) return '';
    if (typeof headers.get === 'function') return headers.get(name) || '';
    return headers[name] || headers[name.toLowerCase()] || '';
  };
  const signature = String(get('Omise-Signature') || '').trim();
  const timestamp = String(get('Omise-Signature-Timestamp') || '').trim();
  if (!signature || !timestamp || !rawBody) return false;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - ts) > SIGNATURE_MAX_AGE_SECONDS) return false;

  const key = Buffer.from(secret, 'base64');
  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody), 'utf8');
  const signed = Buffer.concat([Buffer.from(timestamp + '.', 'utf8'), body]);
  const expected = crypto.createHmac('sha256', key).update(signed).digest('hex');

  // Omise sends two comma-separated signatures while a secret is being
  // rotated (one per secret), so any single match is a valid match.
  return signature.split(',').some((candidate) => {
    const a = Buffer.from(candidate.trim(), 'utf8');
    const b = Buffer.from(expected, 'utf8');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
}

// Omise posts an event envelope: { key: 'charge.complete', data: { ...the
// object... } }. Only CHARGE events are of interest — Omise also emits
// refund, transfer, dispute, customer and schedule events to the same URL,
// and their data.id (rfnd_…, trsf_…) is not a charge id. Passing one of those
// through would make verify() ask Omise for a charge that does not exist,
// which 404s, which returns a 500 to Omise, which makes Omise retry the same
// undeliverable event on a schedule. Filtering here keeps the webhook quiet
// and honest about what it can act on.
function parseWebhook(body) {
  if (!body || !body.data) return null;
  const isChargeEvent = String(body.key || '').startsWith('charge.') ||
    body.data.object === 'charge' ||
    String(body.data.id || '').startsWith('chrg_');
  if (!isChargeEvent) return null;
  const id = body.data.id;
  return id ? { chargeRef: String(id) } : null;
}

/* ── Account introspection (go-live diagnostics only) ────────────────────
   GET /account is what turns "I pasted the keys, I think it's working" into
   a checkable fact. It reports livemode, the account's country and currency,
   and — the one that actually bites — the webhook_uri Omise will really
   deliver to. An unregistered or mistyped webhook is completely invisible
   until a guest pays and the booking never flips to paid, so being able to
   read it back directly is worth the call.

   Used by GET /api/v1/payments/diagnostics and backend/check-payments.js. */
async function account() {
  return omiseRequest('GET', '/account');
}

// PATCH /account sets the account's webhook_uri. Deliberately never called
// implicitly: registering a webhook is an outward-facing change to the live
// merchant account that OVERWRITES whatever is already registered, so it only
// ever happens when a human explicitly asks for it.
async function setWebhookUri(uri) {
  return omiseRequest('PATCH', '/account', { webhook_uri: String(uri || '') });
}

module.exports = {
  id: 'omise',
  label: 'Omise / Opn Payments',
  isConfigured,
  publicKey,
  methods,
  newReference,
  chargeCard,
  chargePromptPay,
  verify,
  parseWebhook,
  verifySignature,
  tokenizeUrl: () => null, // Omise.js handles tokenization client-side
  isLive,
  mode,
  account,
  setWebhookUri,
  // Exported for the test suite, which asserts the status -> state mapping
  // directly rather than round-tripping every Omise status through a charge.
  chargeState,
};
