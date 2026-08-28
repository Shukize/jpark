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
const D = require('./detail');

/* Omise's API host is api.omise.**co**, not .com.

   `api.omise.com` does not exist — it is not a typo that resolves somewhere
   harmless, it is NXDOMAIN — so every call made through it failed at DNS
   before a request was ever sent. That was the value here from the original
   integration onwards, which means online card payment could never have
   worked at any point: no charge, no source, no status check. It survived
   because the test suite rewrites this host to a local mock (so the literal
   is never exercised offline) and because no real payment had been attempted
   until the account went live.

   The value is asserted in backend/test-payments.js for that reason: a
   mocked HTTP client cannot catch a wrong hostname, so the hostname itself
   has to be checked as a fact. */
const API_BASE = 'https://api.omise.co';

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
    return { ok: true, paid: true, chargeRef: charge.id, providerRef: charge.id, detail: describeCharge(charge) };
  }
  if (charge.status === 'pending' && charge.authorize_uri) {
    return {
      ok: true,
      paid: false,
      chargeRef: charge.id,
      providerRef: charge.id,
      redirect: { url: charge.authorize_uri, method: 'GET', fields: {} },
      detail: describeCharge(charge),
    };
  }
  // A decline carries the full detail record too. The guest is still shown
  // only a kind sentence (lib/payments/index.js decides that), but the hotel
  // now keeps the card, the bank and the issuer's own reason — the difference
  // between "3 payments failed this week" and "these three guests were
  // refused by their banks, here is who to call".
  return {
    ok: false, status: 402, code: charge.failure_code || null, declined: true,
    detail: describeCharge(charge),
  };
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
    detail: describeCharge(charge),
  };
}

/* ── Reading everything a charge actually says ───────────────────────────
   The functions above used to return four fields off a response that carries
   forty. describeCharge() is where the rest is read, once, and translated
   into the provider-neutral record documented in ./detail.js.

   Omise's field names are worth stating explicitly, because three of them are
   near-misses for the obvious guess, and a wrong guess fails silently as an
   empty column rather than as an error:

     charge.card.last_digits        NOT last4
     charge.card.financing          NOT funding      ('credit'|'debit'|'prepaid')
     charge.card.expiration_month   NOT exp_month
     charge.transaction             the ledger entry id (trxn_...), which is the
                                    key linking a charge to the transfer that
                                    eventually pays it into the bank
     charge.fee / fee_vat / net     satang, like amount. Omise quotes its fee
                                    net of VAT with the VAT separate, so
                                    amount - fee - fee_vat = net

   3-D Secure is inferred rather than read: Omise exposes no single field for
   it. A charge that never had an authorize_uri was never challenged; one that
   has an authorize_uri and is still pending is mid-challenge; one that went on
   to succeed passed it. That is the difference between "the guest walked away
   from the bank's verification screen" and "the bank said no" — otherwise
   invisible, and exactly what staff need in order to know whether it is worth
   calling the guest back. */
function describeCharge(charge) {
  if (!charge || typeof charge !== 'object') return null;

  const card = charge.card && typeof charge.card === 'object' ? charge.card : null;
  const status = String(charge.status || '');
  const hadChallenge = Boolean(charge.authorize_uri);

  let threeDS = null;
  if (card) {
    if (!hadChallenge) threeDS = 'not_required';
    else if (status === 'successful') threeDS = 'passed';
    else if (status === 'pending') threeDS = 'pending';
    else threeDS = 'failed';
  }

  // Omise returns the country lowercase ('th'); it is an ISO-3166 alpha-2 code
  // and reads as one everywhere else, so it is upper-cased once, here.
  const country = card && card.country ? String(card.country).toUpperCase().slice(0, 2) : null;

  const flat = {
    object: charge.object, id: charge.id, status: charge.status,
    livemode: charge.livemode, currency: String(charge.currency || '').toUpperCase(),
    amount: D.fromMinorUnit(charge.amount),
    fee: D.fromMinorUnit(charge.fee),
    fee_vat: D.fromMinorUnit(charge.fee_vat),
    net: D.fromMinorUnit(charge.net),
    funding_amount: D.fromMinorUnit(charge.funding_amount),
    refunded_amount: D.fromMinorUnit(charge.refunded_amount),
    paid: charge.paid, paid_at: charge.paid_at, created_at: charge.created_at,
    expires_at: charge.expires_at,
    authorized: charge.authorized, captured: charge.captured,
    reversed: charge.reversed, disputed: charge.disputed,
    transaction: typeof charge.transaction === 'string' ? charge.transaction
      : (charge.transaction && charge.transaction.id) || null,
    description: charge.description,
    failure_code: charge.failure_code, failure_message: charge.failure_message,
    source_type: (charge.source && charge.source.type) || null,
    card_brand: card && card.brand, card_last_digits: card && card.last_digits,
    card_bank: card && card.bank, card_country: country,
    card_financing: card && card.financing, card_name: card && card.name,
    card_expiration_month: card && card.expiration_month,
    card_expiration_year: card && card.expiration_year,
  };

  return {
    provider: 'omise',
    chargeId: charge.id || null,
    transactionId: flat.transaction,
    status: charge.status || null,
    state: chargeState(charge.status),
    livemode: typeof charge.livemode === 'boolean' ? charge.livemode : null,
    method: card ? 'card' : (flat.source_type || null),
    amount: flat.amount,
    currency: flat.currency || null,
    fee: flat.fee,
    feeVat: flat.fee_vat,
    net: flat.net,
    refundedAmount: flat.refunded_amount,
    paidAt: charge.paid_at || null,
    createdAt: charge.created_at || null,
    expiresAt: charge.expires_at || null,
    card: card ? {
      brand: card.brand || null,
      last4: card.last_digits || null,
      expiry: D.formatExpiry(card.expiration_month, card.expiration_year),
      name: card.name || null,
      bank: card.bank || null,
      country,
      funding: card.financing || null,
    } : null,
    threeDS,
    failure: (charge.failure_code || charge.failure_message) ? {
      code: charge.failure_code || null,
      message: charge.failure_message || null,
      text: D.describeFailure(charge.failure_code, charge.failure_message),
    } : null,
    settlement: null, // resolved separately — see resolveSettlement() below
    snapshot: D.snapshotOf(flat),
  };
}

/* ── Following the money after the charge ────────────────────────────────
   "The guest paid" and "the hotel has the money" are different days, and the
   gap between them is the question an owner most often asks a payment
   dashboard. Omise models it in three objects:

     charge.transaction           the ledger entry the charge created (trxn_...)
     transaction.transferable_at  when that entry stops being "on hold" and
                                  becomes withdrawable — the settlement window
     transfer                     the payout that actually moves cleared money
                                  into the hotel's bank account, listing the
                                  transactions it covers, with sent_at/paid_at
                                  and the destination account

   So the chain is charge -> transaction -> transfer -> bank. Nothing here
   invents it; these are three plain GETs. */
async function listCharges({ limit = 50, offset = 0, from, to, order = 'reverse_chronological' } = {}) {
  const q = new URLSearchParams();
  q.set('limit', String(Math.min(Math.max(Number(limit) || 50, 1), 100)));
  q.set('offset', String(Math.max(Number(offset) || 0, 0)));
  q.set('order', order === 'chronological' ? 'chronological' : 'reverse_chronological');
  if (from) q.set('from', from);
  if (to) q.set('to', to);
  return omiseRequest('GET', '/charges?' + q.toString());
}

/* The dashboard's headline numbers. `on_hold` is absent on some API versions,
   so callers derive it as total - transferable - reserve when it is missing
   rather than reporting a blank where the owner expects a figure. */
async function balance() {
  return omiseRequest('GET', '/balance');
}

async function listTransfers({ limit = 30, offset = 0 } = {}) {
  const q = new URLSearchParams();
  q.set('limit', String(Math.min(Math.max(Number(limit) || 30, 1), 100)));
  q.set('offset', String(Math.max(Number(offset) || 0, 0)));
  q.set('order', 'reverse_chronological');
  return omiseRequest('GET', '/transfers?' + q.toString());
}

async function retrieveTransaction(id) {
  return omiseRequest('GET', '/transactions/' + encodeURIComponent(id));
}

/* Where one charge's money is, right now.

   Omise has no "which transfer paid transaction X" lookup, so the transfer is
   found by scanning a transfer list the CALLER has already fetched. That is
   the whole reason `transfers` is a parameter rather than something this
   function fetches: a ledger resolving forty charges makes one transfer call,
   not forty.

   Returns null when the charge has no transaction at all — nothing has
   settled — so "not settled yet" stays distinguishable from "settled to
   nothing". */
function resolveSettlement(transactionId, transaction, transfers) {
  if (!transactionId) return null;
  const out = {
    transactionId,
    transferableAt: (transaction && transaction.transferable_at) || null,
    transferId: null, sentAt: null, paidAt: null, bank: null, last4: null,
    state: 'on_hold',
  };
  const list = Array.isArray(transfers) ? transfers : [];
  const hit = list.find((t) => {
    const txns = (t && t.transactions && (t.transactions.data || t.transactions)) || [];
    return Array.isArray(txns) && txns.some((x) => (typeof x === 'string' ? x : x && x.id) === transactionId);
  });
  if (hit) {
    const acct = hit.bank_account || {};
    out.transferId = hit.id || null;
    out.sentAt = hit.sent_at || null;
    out.paidAt = hit.paid_at || null;
    out.bank = acct.bank_code || acct.brand || acct.name || null;
    out.last4 = acct.last_digits || null;
    out.state = hit.paid ? 'paid_out' : (hit.sent ? 'sent' : 'scheduled');
  } else if (out.transferableAt && new Date(out.transferableAt).getTime() <= Date.now()) {
    // Cleared the hold but no payout covers it yet — money the hotel could
    // withdraw today. Worth distinguishing: it is the state that means
    // "press Transfer in the dashboard", not "wait".
    out.state = 'transferable';
  }
  return out;
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
  return { paid: state === 'paid', state, raw: charge, detail: describeCharge(charge) };
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
  describeCharge,
  listCharges,
  balance,
  listTransfers,
  retrieveTransaction,
  resolveSettlement,
  // Exported for the test suite, which asserts the status -> state mapping
  // directly rather than round-tripping every Omise status through a charge.
  chargeState,
};
