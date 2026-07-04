/* ============================================================
   J Park Hotel — thin Omise/Opn Payments API wrapper.

   Uses the built-in fetch (Node >= 18), same convention as
   backend/mailer.js — no SDK dependency added. All amounts are in
   THB satang (smallest unit): multiply THB by 100 before calling.

   Omise docs: https://www.omise.co/api
   ============================================================ */

const API_BASE = 'https://api.omise.com';

function isConfigured() {
  return Boolean(process.env.OMISE_SECRET_KEY);
}

function publicKey() {
  return process.env.OMISE_PUBLIC_KEY || null;
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

// Card charge. `token` is the Omise.js-generated token (tokn_...), never a
// raw card number. `returnUri` is where Omise redirects the browser back to
// after a 3-D Secure challenge, if the issuing bank requires one — in that
// case the response's `authorize_uri` must be opened (full-page redirect)
// before the charge settles; the final result arrives via webhook.
async function createCardCharge({ amountSatang, currency, token, description, metadata, returnUri }) {
  return omiseRequest('POST', '/charges', {
    amount: amountSatang,
    currency: currency || 'thb',
    card: token,
    description,
    metadata,
    return_uri: returnUri,
  });
}

// PromptPay is a two-step flow: create a "source" (payment intent), then a
// charge against that source. The charge response carries the QR code image
// to show the guest (`source.scannable_code.image.download_uri`) and starts
// out `pending` until the guest scans and pays — confirmed via webhook.
async function createPromptPaySource({ amountSatang, currency }) {
  return omiseRequest('POST', '/sources', {
    type: 'promptpay',
    amount: amountSatang,
    currency: currency || 'thb',
  });
}

async function createChargeFromSource({ amountSatang, currency, sourceId, description, metadata }) {
  return omiseRequest('POST', '/charges', {
    amount: amountSatang,
    currency: currency || 'thb',
    source: sourceId,
    description,
    metadata,
  });
}

async function getCharge(chargeId) {
  return omiseRequest('GET', `/charges/${encodeURIComponent(chargeId)}`);
}

module.exports = {
  isConfigured,
  publicKey,
  createCardCharge,
  createPromptPaySource,
  createChargeFromSource,
  getCharge,
};
