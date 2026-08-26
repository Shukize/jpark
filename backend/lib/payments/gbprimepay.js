/* ============================================================
   J Park Hotel — GB Prime Pay adapter (card + 3-D Secure, PromptPay QR).

   GB Prime Pay (Global Prime Corporation, Thailand) is the hotel's online
   card acquirer. It replaced Omise/Opn as the primary provider because
   Omise's merchant onboarding stalled — see docs/PAYMENTS_SETUP.md for the
   signup runbook. Omise remains available as an alternative provider
   (lib/payments/omise.js); which one is live is a pure env-var choice, see
   lib/payments/index.js.

   Uses the built-in fetch (Node >= 18), same convention as backend/mailer.js
   and the Omise adapter — no SDK dependency added.

   Three keys, three different jobs (all issued in the GB Prime Pay merchant
   dashboard, separately for the sandbox and production environments):
     - PUBLIC key  — safe in the browser. Authorizes card TOKENIZATION only
                     (POST /v2/tokens), so a raw card number goes straight
                     from the guest's browser to GB Prime Pay and never
                     touches this server. Also identifies us on the 3-D
                     Secure redirect form.
     - SECRET key  — server-side only. Authorizes the actual CHARGE
                     (POST /v2/tokens/charge) and the status inquiry
                     (POST /v1/check_status_txn).
     - TOKEN key   — server-side only. A separate "customer key" that
                     authorizes the QR Cash / PromptPay endpoints
                     (POST /v3/qrcode). GB Prime Pay does not accept the
                     secret key here; this is a genuinely different
                     credential, not an alias.

   Amounts are plain THB with 2 decimals (Number(10,2)) — NOT satang. This
   is the opposite convention from Omise, which is exactly why the amount
   conversion lives inside each adapter rather than in the caller.

   Docs: https://doc.gbprimepay.com
   ============================================================ */

const crypto = require('crypto');

// Sandbox and production are entirely separate hosts with separate keys.
// GB Prime Pay confusingly names the sandbox after their old brand
// ("globalprimepay"); it is the test environment, not a legacy production one.
const HOST_TEST = 'https://api.globalprimepay.com';
const HOST_LIVE = 'https://api.gbprimepay.com';

function isLive() {
  // Default to the SANDBOX. Going live is a deliberate, explicit flip, so a
  // half-finished deployment can never accidentally take real money.
  return String(process.env.GBPRIMEPAY_ENV || '').toLowerCase() === 'live';
}

function host() {
  return isLive() ? HOST_LIVE : HOST_TEST;
}

function publicKey() {
  return process.env.GBPRIMEPAY_PUBLIC_KEY || null;
}
function secretKey() {
  return process.env.GBPRIMEPAY_SECRET_KEY || '';
}
function tokenKey() {
  return process.env.GBPRIMEPAY_TOKEN_KEY || '';
}

// Card charging needs public + secret. The QR/PromptPay method additionally
// needs the token key, so it is advertised separately in methods() below —
// a merchant whose QR product isn't activated yet can still take cards.
function isConfigured() {
  return Boolean(publicKey() && secretKey());
}

function methods() {
  const list = [];
  if (isConfigured()) list.push('card');
  if (isConfigured() && tokenKey()) list.push('promptpay');
  return list;
}

// GB Prime Pay authenticates with HTTP Basic, key as the username and an
// EMPTY password — the same scheme Omise uses, so the header builder is
// identical apart from which key goes in.
function basic(key) {
  return 'Basic ' + Buffer.from(String(key) + ':').toString('base64');
}

// `referenceNo` is the merchant's own order id and GB Prime Pay caps it at
// String(15). The site's guest-facing booking ref (genRef() in
// routes/payments.js, e.g. "JP-MABCDEF-1A2B") is 16+ characters and a group
// booking appends "-R1" on top of that, so it does NOT fit — silently
// truncating it would collide two different bookings onto one payment.
//
// So a charge gets its own short, collision-free reference, and the human
// booking ref rides along in merchantDefined1 where the dashboard shows it
// for reconciliation. This value is what lands in
// guest_bookings.payment_charge_id and what the webhook below matches on.
function newReference() {
  // 8 chars of base36 milliseconds (unique per ms, and stays 8 chars until
  // year 2059) + 5 random base36 chars = 13 chars, comfortably under 15.
  const ms = Date.now().toString(36).toUpperCase();
  const rand = crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 5);
  return (ms + rand).slice(0, 15);
}

async function postJson(path, key, body) {
  const res = await fetch(host() + path, {
    method: 'POST',
    headers: {
      Authorization: basic(key),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error((json && (json.message || json.resultCode)) || `GB Prime Pay API error (${res.status})`);
    err.gbp = json;
    err.status = res.status;
    throw err;
  }
  return json;
}

// GB Prime Pay's result codes are strings; "00" is the only success value.
// Everything else is a decline or a validation failure, and the numeric code
// is what their support team asks for when a merchant reports a problem — so
// it is always logged, even though it is never shown to a guest.
function ok(json) {
  return json && String(json.resultCode) === '00';
}

/* ── Card ────────────────────────────────────────────────────────────────
   Two steps, split across the browser and this server:

   1. The BROWSER posts the raw card to POST /v2/tokens with the PUBLIC key
      (see assets/js/booking-payment.js) and gets back a single-use card
      token. The card number never reaches us, which is what keeps this
      integration out of PCI-DSS scope.
   2. This server posts that token to POST /v2/tokens/charge with the SECRET
      key, for the amount WE computed — never an amount the client sent.

   Whether step 2 settles immediately or needs a 3-D Secure challenge is the
   merchant's account setting, mirrored here by GBPRIMEPAY_3DS:
     - otp 'N' → charge resolves synchronously; resultCode "00" means paid.
     - otp 'Y' → charge returns a gbpReferenceNo and the guest must be sent
       to GB Prime Pay's 3-D Secure page (a FORM POST, not a plain link),
       after which GB Prime Pay calls backgroundUrl and returns the guest to
       responseUrl. Payment is confirmed by the webhook, exactly like QR.

   Most Thai acquirers now mandate 3-D Secure on e-commerce card payments, so
   'Y' is the default. */
async function chargeCard({ amountTHB, reference, cardToken, description, guest, bookingRef, returnUrl, notifyUrl }) {
  const use3ds = String(process.env.GBPRIMEPAY_3DS || 'true').toLowerCase() !== 'false';
  const json = await postJson('/v2/tokens/charge', secretKey(), {
    amount: Number(amountTHB.toFixed(2)),
    referenceNo: reference,
    detail: String(description || '').slice(0, 250),
    customerName: String(guest && guest.name ? guest.name : '').slice(0, 250),
    customerEmail: String(guest && guest.email ? guest.email : '').slice(0, 250),
    customerTelephone: String(guest && guest.phone ? guest.phone : '').slice(0, 250),
    card: { token: cardToken },
    otp: use3ds ? 'Y' : 'N',
    responseUrl: returnUrl,
    backgroundUrl: notifyUrl,
    // Shown against the transaction in the GB Prime Pay dashboard — this is
    // what lets the front desk tie a settlement line back to a reservation.
    merchantDefined1: String(bookingRef || '').slice(0, 250),
  });

  if (!ok(json)) {
    return { ok: false, status: 402, code: json && json.resultCode, declined: true };
  }

  if (!use3ds) {
    return { ok: true, paid: true, chargeRef: reference, providerRef: json.gbpReferenceNo || null };
  }

  // 3-D Secure: the guest's browser must POST publicKey + gbpReferenceNo to
  // this URL. Returned as a form spec rather than a URL because a GET
  // redirect is NOT accepted by that endpoint.
  return {
    ok: true,
    paid: false,
    chargeRef: reference,
    providerRef: json.gbpReferenceNo || null,
    redirect: {
      url: host() + '/v2/tokens/3d_secured',
      method: 'POST',
      fields: { publicKey: publicKey(), gbpReferenceNo: json.gbpReferenceNo },
    },
  };
}

/* ── PromptPay QR ("QR Cash") ────────────────────────────────────────────
   POST /v3/qrcode is form-encoded and answers with a raw PNG image rather
   than JSON. It is fetched here, server-side, and handed to the frontend as
   a data: URI so the booking page's existing <img src> QR rendering works
   unchanged — and so the token key never has to be exposed to the browser.

   Like Omise's PromptPay, this is asynchronous: the call below only creates
   the QR. The payment is not real until GB Prime Pay calls backgroundUrl and
   verify() below confirms it. */
async function chargePromptPay({ amountTHB, reference, description, guest, bookingRef, notifyUrl }) {
  const form = new URLSearchParams({
    token: tokenKey(),
    referenceNo: reference,
    amount: amountTHB.toFixed(2),
    backgroundUrl: notifyUrl,
    detail: String(description || '').slice(0, 250),
    customerName: String(guest && guest.name ? guest.name : '').slice(0, 250),
    customerEmail: String(guest && guest.email ? guest.email : '').slice(0, 250),
    merchantDefined1: String(bookingRef || '').slice(0, 250),
  });

  const res = await fetch(host() + '/v3/qrcode', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });

  const contentType = String(res.headers.get('content-type') || '');
  // A failure comes back as JSON even though the success path is an image,
  // so the content type is the discriminator, not the status code.
  if (!res.ok || !contentType.startsWith('image/')) {
    let detail = null;
    try { detail = await res.json(); } catch (_) { /* not JSON either */ }
    const err = new Error((detail && (detail.message || detail.resultCode)) || `GB Prime Pay QR error (${res.status})`);
    err.gbp = detail;
    err.status = res.status;
    throw err;
  }

  const png = Buffer.from(await res.arrayBuffer());
  return {
    ok: true,
    paid: false,
    chargeRef: reference,
    providerRef: null,
    qrImage: 'data:' + contentType.split(';')[0] + ';base64,' + png.toString('base64'),
  };
}

/* ── Authoritative status check ──────────────────────────────────────────
   POST /v1/check_status_txn, keyed on OUR referenceNo. This is what makes
   the webhook safe to trust: GB Prime Pay's backgroundUrl notification is an
   unauthenticated POST to a public URL, so its body is only ever treated as
   a hint that something changed — the answer always comes from here.

   Response shape: { resultCode: "00", txn: { status: "S", resultCode: "00", ... } }
   where txn.status "S" is a settled/successful payment. */
async function verify(chargeRef) {
  const json = await postJson('/v1/check_status_txn', secretKey(), { referenceNo: chargeRef });
  const txn = (json && json.txn) || null;
  const paid = Boolean(ok(json) && txn && String(txn.status).toUpperCase() === 'S');
  return { paid, state: txnState(json, txn), raw: json };
}

/* Same small vocabulary the Omise adapter reports, so
   backend/paymentReconciler.js can decide "keep watching" vs "this is over"
   without knowing which gateway it is talking to.

   GB Prime Pay's txn.status: S settled, P pending, F failed, C cancelled,
   E expired. A status inquiry that itself failed (a bad reference, a gateway
   error) is 'unknown' rather than 'failed' — the reconciler must retry that,
   not write the payment off. */
function txnState(json, txn) {
  if (!ok(json) || !txn) return 'unknown';
  switch (String(txn.status || '').toUpperCase()) {
    case 'S': return 'paid';
    case 'P': return 'pending';
    case 'F': return 'failed';
    case 'C': return 'failed';
    case 'E': return 'expired';
    default:  return 'unknown';
  }
}

// GB Prime Pay does not sign its notifications at all — its backgroundUrl
// callback is a plain unauthenticated POST. `null` means "no signature
// scheme here", which is the same answer Omise gives when no signing secret
// is configured, and leaves the API re-verification as the sole authority.
function verifySignature() {
  return null;
}

// GB Prime Pay posts the notification as either form-encoded or JSON
// depending on the product, so both shapes are accepted. Only the reference
// is taken from it — every other field in the body is ignored on purpose.
function parseWebhook(body) {
  if (!body) return null;
  const ref = body.referenceNo || body.referenceno || null;
  return ref ? { chargeRef: String(ref) } : null;
}

module.exports = {
  id: 'gbprimepay',
  label: 'GB Prime Pay',
  isConfigured,
  publicKey,
  methods,
  newReference,
  chargeCard,
  chargePromptPay,
  verify,
  parseWebhook,
  verifySignature,
  // Exposed so the booking page can tokenize against the right environment.
  tokenizeUrl: () => host() + '/v2/tokens',
  isLive,
  mode: () => (isConfigured() ? (isLive() ? 'live' : 'test') : null),
};
