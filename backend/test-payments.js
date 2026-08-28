/* Offline end-to-end test for the online payment integration.
   Run: node backend/test-payments.js   (also part of `npm test`)

   Needs no database, no network and no merchant account: it runs the REAL
   routes/payments.js + lib/payments against mock gateways and a stubbed
   database, covering the wire contract (which key signs which call, THB vs
   satang, the 15-char referenceNo cap, form-encoded webhooks), the full
   booking -> 3-D Secure -> webhook -> paid path, webhook signature
   verification, and the reconciler recovering a payment whose webhook never
   arrived.

   Two things this suite has learned the hard way, both worth keeping in mind
   before trusting a green run:

     1. A MOCK CANNOT CATCH A WRONG ADDRESS. The gateway host is rewritten to
        a local server here, so `https://api.omise.com` — a domain that does
        not exist — sat in the adapter unnoticed from the original
        integration until real keys went live. The hostname is now asserted
        as a literal instead of merely being exercised.
     2. A STUB MUST MATCH THE REAL COLUMN TYPES. The fake database handed out
        integer booking ids while production uses UUIDs, which hid a route
        that 404'd every real status poll. It now generates UUIDs. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = __dirname;

let failures = 0;
const results = [];
function check(name, cond, detail) {
  results.push({ name, ok: !!cond, detail: detail || '' });
  if (!cond) failures++;
}

// ── Mock GB Prime Pay ─────────────────────────────────────────────────────
const seen = { tokens: null, charge: null, qr: null, status: null, authHeaders: {} };
let paidRefs = new Set();

const gateway = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const auth = req.headers.authorization || '';
    const decoded = auth.startsWith('Basic ') ? Buffer.from(auth.slice(6), 'base64').toString() : '';
    seen.authHeaders[req.url] = decoded;
    const json = (o, code) => { res.writeHead(code || 200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };

    if (req.url === '/v2/tokens') {
      seen.tokens = JSON.parse(body);
      return json({ rememberCard: false, resultCode: '00', card: { token: 'tok-uuid-1234', number: '453501XXXXXX5741', cardType: 'VIS' } });
    }
    if (req.url === '/v2/tokens/charge') {
      seen.charge = JSON.parse(body);
      if (seen.charge.card && seen.charge.card.token === 'DECLINE') return json({ resultCode: '14' });
      if (seen.charge.otp === 'N') { paidRefs.add(seen.charge.referenceNo); return json({ resultCode: '00', gbpReferenceNo: 'gbp00099' }); }
      return json({ resultCode: '00', gbpReferenceNo: 'gbp00099' });
    }
    if (req.url === '/v3/qrcode') {
      seen.qr = Object.fromEntries(new URLSearchParams(body));
      // Real gateway answers with a raw PNG, not JSON.
      const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
      res.writeHead(200, { 'Content-Type': 'image/png' });
      return res.end(png);
    }
    if (req.url === '/v1/check_status_txn') {
      seen.status = JSON.parse(body);
      const ref = seen.status.referenceNo;
      if (!paidRefs.has(ref)) return json({ resultCode: '00', txn: { referenceNo: ref, status: 'P', resultCode: '00' } });
      return json({ resultCode: '00', txn: { referenceNo: ref, status: 'S', resultCode: '00', amount: '1490.00', gbpReferenceNo: 'gbp00099' } });
    }
    return json({ resultCode: '99' }, 404);
  });
});

// ── Mock Omise ────────────────────────────────────────────────────────────
const omiseSeen = { charge: null, source: null, lookups: [] };
const omisePaid = new Set();

/* A REAL Omise charge, not the three-field stub this mock used to answer with.

   The stub returned `{ object, id, status }`, which was enough to test the
   status machinery and nothing else — so every field the hotel actually needs
   off a charge (which card, whose bank, what fee, when it settled) could be
   read wrongly by the adapter and the suite would still be green. Card fields
   in particular are easy to guess wrong: Omise says `last_digits`, not
   `last4`, and `financing`, not `funding`.

   Money is in SATANG here, exactly as the real API sends it — this is what
   proves the adapter divides by 100 rather than reporting a 555,000 THB
   charge. The fee is Omise's real Thai card rate (3.65% + 7% VAT), which is
   what makes `amount - fee - fee_vat === net` a meaningful assertion. */
function omiseCharge(id, status, req) {
  const amount = (req && req.amount) || 100000;
  const fee = Math.round(amount * 0.0365);
  const feeVat = Math.round(fee * 0.07);
  const isCard = !(req && req.source);
  return {
    object: 'charge',
    id,
    status,
    livemode: false,
    amount,
    currency: 'thb',
    fee,
    fee_vat: feeVat,
    net: amount - fee - feeVat,
    refunded_amount: 0,
    paid: status === 'successful',
    paid_at: status === 'successful' ? '2026-08-28T08:50:24Z' : null,
    created_at: '2026-08-28T08:50:20Z',
    transaction: status === 'successful' ? 'trxn_test_' + id.slice(-4) : null,
    description: (req && req.description) || null,
    metadata: (req && req.metadata) || {},
    authorized: status !== 'failed',
    captured: status === 'successful',
    failure_code: null,
    failure_message: null,
    card: isCard ? {
      object: 'card',
      brand: 'Visa',
      last_digits: '4242',
      first_digits: null,
      name: 'SOMCHAI J',
      expiration_month: 9,
      expiration_year: 2029,
      bank: 'Kasikornbank Public Company Limited',
      country: 'th',
      financing: 'credit',
      fingerprint: 'fp_test_abc123',
      security_code_check: true,
    } : null,
    source: isCard ? null : {
      object: 'source',
      type: 'promptpay',
      scannable_code: { image: { download_uri: 'https://api.omise.co/qr/' + id + '.png' } },
    },
  };
}
// Mutable so the register-webhook test can observe the PATCH taking effect.
const omiseAccount = { webhook_uri: null };
let chargeSeq = 0;

const omiseApi = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const json = (o, code) => { res.writeHead(code || 200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };

    if (req.method === 'POST' && req.url === '/sources') {
      omiseSeen.source = JSON.parse(body);
      return json({ object: 'source', id: 'src_test_' + (++chargeSeq), type: 'promptpay' });
    }
    if (req.method === 'POST' && req.url === '/charges') {
      const b = JSON.parse(body);
      omiseSeen.charge = b;
      const id = 'chrg_test_' + (++chargeSeq);
      if (b.source) {
        // PromptPay: pending until scanned, carrying the scannable QR.
        return json({
          object: 'charge', id, status: 'pending', expires_at: '2026-12-31T00:00:00Z',
          source: { scannable_code: { image: { download_uri: 'https://api.omise.co/qr/' + id + '.png' } } },
        });
      }
      if (b.card === 'tokn_decline') {
        return json(Object.assign(omiseCharge(id, 'failed', b), {
          failure_code: 'insufficient_fund',
          failure_message: 'Insufficient funds in the account',
          paid: false, paid_at: null, transaction: null,
        }));
      }
      if (b.card === 'tokn_3ds') {
        return json(Object.assign(omiseCharge(id, 'pending', b), {
          authorize_uri: 'https://api.omise.co/authorize/' + id,
          paid: false, paid_at: null, transaction: null,
        }));
      }
      omisePaid.add(id);
      return json(omiseCharge(id, 'successful', b));
    }
    if (req.method === 'GET' && req.url.startsWith('/charges/')) {
      const id = decodeURIComponent(req.url.slice('/charges/'.length));
      omiseSeen.lookups.push(id);
      if (!/^chrg_/.test(id)) return json({ object: 'error', code: 'not_found' }, 404);
      const paid = omisePaid.has(id);
      return json(omiseCharge(id, paid ? 'successful' : 'pending', omiseSeen.charge || {}));
    }
    // Account API — what the go-live diagnostics reads. `webhook_uri: null`
    // is the interesting default: it is the real state of a fresh merchant
    // account, and the one that silently loses payments.
    if (req.method === 'GET' && req.url === '/account') {
      return json({
        object: 'account', id: 'acct_test_1', email: 'test@jparkhotel.com',
        country: 'TH', currency: 'thb', livemode: false,
        webhook_uri: omiseAccount.webhook_uri, api_version: '2019-05-29',
      });
    }
    if (req.method === 'PATCH' && req.url === '/account') {
      omiseAccount.webhook_uri = (JSON.parse(body || '{}') || {}).webhook_uri || null;
      return json({
        object: 'account', id: 'acct_test_1', email: 'test@jparkhotel.com',
        country: 'TH', currency: 'thb', livemode: false,
        webhook_uri: omiseAccount.webhook_uri, api_version: '2019-05-29',
      });
    }
    return json({ object: 'error', code: 'not_found' }, 404);
  });
});

// ── Stubbed database ──────────────────────────────────────────────────────
const inserted = [];
// Every recorded payment attempt, successful or declined. Separate from
// `inserted` because a declined charge deliberately writes NO booking row —
// the attempt is the only record that a guest tried at all.
const attempts = [];
let idSeq = 100;

/* Booking ids here must have the SAME SHAPE as production ids, and this is
   not a detail. guest_bookings.id is `TEXT PRIMARY KEY DEFAULT
   gen_random_uuid()::text` — a UUID string. This stub used to hand out
   integers, and that single mismatch hid a real, guest-visible bug for the
   entire life of the integration: the status route branched on /^\d+$/ to
   decide whether it had been given a booking id or a payment reference, so
   with a genuine UUID it took the reference branch, matched nothing and 404'd
   every poll. The booking page therefore never showed "paid" after a
   PromptPay scan or a 3-D Secure return. Every test passed throughout,
   because the fake ids were integers and the fake ids were the only ones the
   suite ever saw. */
function fakeUuid() {
  return `3f2a1b4c-5d6e-4f70-8a9b-${String(++idSeq).padStart(12, '0')}`;
}

function fakeQuery(sql, params) {
  const s = String(sql);
  if (/require_prepayment/.test(s)) return { rows: [{ require_prepayment: false }] };
  if (/pg_advisory_xact_lock|^\s*(BEGIN|COMMIT|ROLLBACK)/i.test(s)) return { rows: [] };
  if (/count\(\*\)|COUNT\(\*\)/i.test(s)) return { rows: [{ count: '0' }] };
  if (/INSERT INTO payment_attempts/i.test(s)) {
    const row = {
      id: attempts.length + 1,
      charge_id: params[0], provider: params[1], method: params[2], outcome: params[3],
      booking_ref: params[4], group_ref: params[5], booking_id: params[6],
      guest_name: params[7], guest_email: params[8], guest_phone: params[9],
      room: params[10], check_in: params[11], check_out: params[12],
      amount: params[13], currency: params[14],
      failure_code: params[15], failure_message: params[16],
      card_brand: params[17], card_last4: params[18], card_bank: params[19],
      card_country: params[20], livemode: params[21], detail: params[22],
    };
    attempts.push(row);
    return { rows: [row] };
  }
  if (/INSERT INTO guest_bookings/i.test(s)) {
    const row = {
      id: fakeUuid(), ref: params[0], guest_name: params[1], guest_last_name: params[2],
      guest_email: params[3], guest_phone: params[4], room: params[5],
      check_in: params[6], check_out: params[7], nights: params[8],
      adults: params[9], children: params[10], total: params[11], currency: 'THB',
      status: 'confirmed', lang: params[12],
      payment_provider: params[13], payment_method: params[14],
      payment_status: params[15], payment_charge_id: params[16],
      // insertBookingRow()'s params are, in order: ref, guestName,
      // guestLastName, guestEmail, guestPhone, room, checkIn, checkOut,
      // nights, adults, children, total, lang, paymentProvider,
      // paymentMethod, paymentStatus, paymentChargeId, smoking, breakfast,
      // childAges, specialRequests, groupRef, groupIndex, groupSize,
      // extraBed, nonRefundable — so the group columns are 21/22/23.
      // These read 22/23 for a while, which shifted every group row's
      // group_ref onto its group_index: a stub that silently disagrees
      // with the real column order tests the stub, not the code.
      group_ref: params[21] || null, group_index: params[22] || null,
      group_size: params[23] || null,
      payment_detail: params[26] || null,
    };
    inserted.push(row);
    return { rows: [row] };
  }
  if (/UPDATE guest_bookings SET payment_status = 'paid'/i.test(s)) {
    const hit = inserted.filter((r) => r.payment_charge_id === params[0] && r.payment_status !== 'paid');
    hit.forEach((r) => { r.payment_status = 'paid'; });
    return { rows: hit };
  }
  if (/UPDATE guest_bookings SET payment_status = 'failed'/i.test(s)) {
    const hit = inserted.filter((r) => r.payment_charge_id === params[0] && r.payment_status === 'pending');
    hit.forEach((r) => { r.payment_status = 'failed'; });
    return { rows: hit };
  }
  // The reconciler's sweep: every distinct charge still awaiting payment.
  // The real query also bounds by created_at and LIMIT; neither matters to a
  // handful of in-memory rows, and asserting them here would only pin the
  // stub to the SQL text rather than to the behaviour.
  if (/SELECT DISTINCT payment_charge_id/i.test(s)) {
    const refs = [...new Set(inserted
      .filter((r) => r.payment_status === 'pending' && r.payment_charge_id && r.payment_provider)
      .map((r) => r.payment_charge_id))];
    return { rows: refs.map((payment_charge_id) => ({ payment_charge_id })) };
  }
  if (/SELECT id, ref, status, payment_status FROM guest_bookings/i.test(s)) {
    // Mirrors the real route's single lookup: the booking's own id, or any of
    // the reference columns a gateway round trip might come back with.
    const rows = inserted.filter((r) =>
      String(r.id) === String(params[0]) ||
      r.payment_charge_id === params[0] ||
      r.ref === params[0] ||
      r.group_ref === params[0]);
    return { rows: rows.slice(0, 1) };
  }
  if (/site_content/i.test(s)) return { rows: [{}] };
  return { rows: [] };
}
const fakeDb = {
  query: async (sql, params) => fakeQuery(sql, params),
  connect: async () => ({
    query: async (sql, params) => fakeQuery(sql, params),
    release() {},
  }),
};

(async () => {
  await new Promise((r) => gateway.listen(4599, r));
  await new Promise((r) => omiseApi.listen(4601, r));

  // Route the adapter's calls to the mock, without adding any test-only hook
  // to the production code.
  const realFetch = globalThis.fetch;
  globalThis.fetch = (url, opts) =>
    realFetch(String(url)
      .replace('https://api.globalprimepay.com', 'http://127.0.0.1:4599')
      .replace('https://api.omise.co', 'http://127.0.0.1:4601'), opts);

  /* Start from a known-empty gateway configuration.

     This suite runs as part of `npm test`, which is the Render BUILD command
     — and Render injects the service's real environment into the build. So
     the hotel's live `PAYMENT_PROVIDER=omise` and `OMISE_SECRET_KEY` are
     present here, and without this the first section (which sets GB Prime Pay
     keys and expects the registry to select GB Prime Pay) would instead find
     Omise pinned, fail, and take the whole deploy down with it — a test
     asserting the wrong thing about a machine it was never describing.

     Ambient secrets also must not leak into assertions: the webhook-secret
     checks below rely on knowing exactly what is and isn't set. */
  [
    'PAYMENT_PROVIDER',
    'OMISE_PUBLIC_KEY', 'OMISE_SECRET_KEY',
    'OMISE_WEBHOOK_SECRET', 'OMISE_WEBHOOK_SIGNING_SECRET',
    'PAYMENT_WEBHOOK_SECRET',
    'GBPRIMEPAY_PUBLIC_KEY', 'GBPRIMEPAY_SECRET_KEY', 'GBPRIMEPAY_TOKEN_KEY',
    'PUBLIC_SITE_URL', 'PUBLIC_API_URL', 'RENDER_EXTERNAL_URL',
  ].forEach((k) => { delete process.env[k]; });

  process.env.GBPRIMEPAY_PUBLIC_KEY = 'PUBKEY';
  process.env.GBPRIMEPAY_SECRET_KEY = 'SECKEY';
  process.env.GBPRIMEPAY_TOKEN_KEY = 'TOKKEY';
  process.env.GBPRIMEPAY_ENV = 'sandbox';
  process.env.PUBLIC_API_URL = 'http://127.0.0.1:4600';
  process.env.PUBLIC_SITE_URL = 'https://jparkhotel.com';
  process.env.HOTEL_NOTIFY_EMAIL = '';
  process.env.RESEND_API_KEY = '';

  // Stub the db module before anything requires it.
  const dbPath = require.resolve(path.join(ROOT, 'db.js'));
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fakeDb };

  const payments = require(path.join(ROOT, 'lib', 'payments'));
  const gbp = require(path.join(ROOT, 'lib', 'payments', 'gbprimepay'));

  // ── 1. Adapter contract ────────────────────────────────────────────────
  const cardRes = await gbp.chargeCard({
    amountTHB: 1490, reference: gbp.newReference(), cardToken: 'tok-uuid-1234',
    description: 'J Park Hotel — Deluxe', guest: { name: 'Ann Lee', email: 'a@b.com', phone: '0812345678' },
    bookingRef: 'JP-TEST-0001', returnUrl: 'https://api/return', notifyUrl: 'https://api/webhook',
  });
  check('card charge -> 3DS redirect outcome', cardRes.ok && cardRes.paid === false && cardRes.redirect, JSON.stringify(cardRes.redirect));
  check('3DS redirect is a POST to /v2/tokens/3d_secured',
    cardRes.redirect && cardRes.redirect.method === 'POST' && /\/v2\/tokens\/3d_secured$/.test(cardRes.redirect.url), cardRes.redirect && cardRes.redirect.url);
  check('3DS form carries publicKey + gbpReferenceNo',
    cardRes.redirect && cardRes.redirect.fields.publicKey === 'PUBKEY' && cardRes.redirect.fields.gbpReferenceNo === 'gbp00099');
  check('charge authenticated with SECRET key', seen.authHeaders['/v2/tokens/charge'] === 'SECKEY:');
  check('charge amount is plain THB (not satang)', seen.charge.amount === 1490, String(seen.charge.amount));
  check('charge sends otp/responseUrl/backgroundUrl', seen.charge.otp === 'Y' && !!seen.charge.responseUrl && !!seen.charge.backgroundUrl);
  check('booking ref forwarded as merchantDefined1', seen.charge.merchantDefined1 === 'JP-TEST-0001');
  check('referenceNo within GB Prime Pay 15-char cap', seen.charge.referenceNo.length <= 15, seen.charge.referenceNo);

  const declined = await gbp.chargeCard({ amountTHB: 100, reference: gbp.newReference(), cardToken: 'DECLINE', guest: {}, returnUrl: '', notifyUrl: '' });
  check('declined card -> ok:false, declined', declined.ok === false && declined.declined === true);

  const qrRes = await gbp.chargePromptPay({
    amountTHB: 2980, reference: gbp.newReference(), description: 'group', guest: { name: 'Ann', email: 'a@b.com' },
    bookingRef: 'JP-TEST-0002', notifyUrl: 'https://api/webhook',
  });
  check('QR charge returns a data: URI image', /^data:image\/png;base64,/.test(qrRes.qrImage || ''), (qrRes.qrImage || '').slice(0, 30));
  check('QR authenticated with TOKEN key (not secret)', seen.qr.token === 'TOKKEY');
  check('QR amount formatted with 2 decimals', seen.qr.amount === '2980.00', seen.qr.amount);

  const notYet = await gbp.verify(seen.charge.referenceNo);
  check('verify() reports NOT paid while txn status is P', notYet.paid === false);
  paidRefs.add(seen.charge.referenceNo);
  const nowPaid = await gbp.verify(seen.charge.referenceNo);
  check('verify() reports paid once txn status is S', nowPaid.paid === true);
  check('status inquiry authenticated with SECRET key', seen.authHeaders['/v1/check_status_txn'] === 'SECKEY:');

  // ── 2. Full route flow ─────────────────────────────────────────────────
  const express = require('express');
  const app = express();
  app.use('/api/v1', express.json({ limit: '256kb' }), require(path.join(ROOT, 'routes', 'payments')));
  const server = app.listen(4600);
  const base = 'http://127.0.0.1:4600/api/v1';

  const cfg = await realFetch(base + '/payments/config').then((r) => r.json());
  check('config reports gbprimepay + both methods',
    cfg.provider === 'gbprimepay' && cfg.paymentEnabled && cfg.methods.join(',') === 'card,promptpay', JSON.stringify(cfg));
  check('config exposes the sandbox tokenize URL',
    cfg.tokenizeUrl === 'https://api.globalprimepay.com/v2/tokens', cfg.tokenizeUrl);

  const rooms = require(path.join(ROOT, 'lib', 'roomRates'));
  const roomKey = rooms.roomKeys()[0];
  const variant = rooms.getRoom(roomKey).variants[0].label;

  const resv = await realFetch(base + '/reservations', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      room: roomKey, variantLabel: variant, checkIn: '2026-12-01', checkOut: '2026-12-03',
      adults: 2, children: 0, breakfast: false, paymentMethod: 'card', cardToken: 'tok-uuid-1234',
      guest: { firstName: 'Ann', lastName: 'Lee', email: 'ann@example.com', phone: '0812345678' },
    }),
  });
  const resvJson = await resv.json();
  check('POST /reservations (card) -> 201', resv.status === 201, JSON.stringify(resvJson).slice(0, 200));
  check('response carries the 3DS redirect', resvJson.payment && resvJson.payment.redirect && resvJson.payment.paid === false);
  check('response names the provider', resvJson.payment && resvJson.payment.provider === 'gbprimepay');

  const row = inserted[inserted.length - 1];
  check('row stored with payment_provider=gbprimepay', row.payment_provider === 'gbprimepay', row.payment_provider);
  check('row stored pending until the webhook lands', row.payment_status === 'pending', row.payment_status);
  check('row payment_charge_id == gateway referenceNo', row.payment_charge_id === seen.charge.referenceNo);

  // Guest returns from the bank — gateway POSTs (form-encoded) to /payments/return.
  const ret = await realFetch(base + '/payments/return?ref=' + row.payment_charge_id, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'referenceNo=' + row.payment_charge_id + '&resultCode=00', redirect: 'manual',
  });
  check('POST /payments/return -> 302 (static host would 405)', ret.status === 302, String(ret.status));
  check('302 points at the booking page with the ref',
    (ret.headers.get('location') || '') === 'https://jparkhotel.com/booking.html?jpPay=' + row.payment_charge_id, ret.headers.get('location'));

  // Status poll before the gateway confirms.
  const pre = await realFetch(base + '/payments/status/' + row.payment_charge_id).then((r) => r.json());
  check('status by CHARGE REF resolves the booking', pre.ref === row.ref, JSON.stringify(pre));
  check('status still pending before webhook', pre.paymentStatus === 'pending');

  // Gateway's server-to-server notification, form-encoded (the shape express.json ignores).
  paidRefs.add(row.payment_charge_id);
  const hook = await realFetch(base + '/payments/webhook', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'referenceNo=' + row.payment_charge_id + '&resultCode=00&amount=1490.00',
  });
  check('form-encoded webhook accepted -> 200', hook.status === 200);
  check('webhook flipped the row to paid', row.payment_status === 'paid', row.payment_status);

  const post = await realFetch(base + '/payments/status/' + row.id).then((r) => r.json());
  check('status by BOOKING ID also works', post.paymentStatus === 'paid', JSON.stringify(post));

  // A webhook for a charge the gateway does NOT confirm must not mark paid.
  const bogus = await realFetch(base + '/payments/webhook', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'referenceNo=NEVERPAID123&resultCode=00',
  });
  check('unverified webhook is a no-op (never trusts the body)', bogus.status === 200 &&
    !inserted.some((r) => r.payment_charge_id === 'NEVERPAID123' && r.payment_status === 'paid'));

  // ── 3. Omise (the active gateway) ──────────────────────────────────────
  // Same booking machinery, a different acquirer. Switching is env only — no
  // module reloading below, because active() re-reads the environment on
  // every call, which is exactly the property that makes a live gateway swap
  // a Render environment change rather than a deploy.
  delete process.env.GBPRIMEPAY_PUBLIC_KEY;
  delete process.env.GBPRIMEPAY_SECRET_KEY;
  delete process.env.GBPRIMEPAY_TOKEN_KEY;
  process.env.OMISE_PUBLIC_KEY = 'pkey_test_abc';
  process.env.OMISE_SECRET_KEY = 'skey_test_abc';

  check('auto-detect switches to omise on keys alone', payments.active().id === 'omise', payments.active().id);
  const ocfg = await realFetch(base + '/payments/config').then((r) => r.json());
  check('config now reports omise + its public key',
    ocfg.provider === 'omise' && ocfg.publicKey === 'pkey_test_abc' && ocfg.paymentEnabled, JSON.stringify(ocfg));
  check('config offers card + promptpay for omise', ocfg.methods.join(',') === 'card,promptpay');
  check('omise needs no browser tokenize URL (Omise.js does it)', ocfg.tokenizeUrl === null);

  // Card that settles immediately.
  const oResv = await realFetch(base + '/reservations', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      room: roomKey, variantLabel: variant, checkIn: '2026-12-05', checkOut: '2026-12-07',
      adults: 2, children: 0, breakfast: false, paymentMethod: 'card', cardToken: 'tokn_ok',
      guest: { firstName: 'Bo', lastName: 'Tan', email: 'bo@example.com', phone: '0899999999' },
    }),
  });
  const oJson = await oResv.json();
  const oRow = inserted[inserted.length - 1];
  check('omise card charge -> 201 and paid immediately', oResv.status === 201 && oJson.payment.paid === true, JSON.stringify(oJson.payment));
  check('row stored payment_provider=omise / paid',
    oRow.payment_provider === 'omise' && oRow.payment_status === 'paid', oRow.payment_provider + '/' + oRow.payment_status);
  check('row stores the omise charge id', /^chrg_/.test(oRow.payment_charge_id || ''), oRow.payment_charge_id);
  check('omise charge amount converted to SATANG', omiseSeen.charge.amount === oRow.total * 100,
    omiseSeen.charge.amount + ' vs ' + oRow.total);
  check('omise charge carries return_uri for 3-D Secure', !!omiseSeen.charge.return_uri, omiseSeen.charge.return_uri);

  // Card that the bank sends to 3-D Secure — the case the ORIGINAL code
  // could not handle and read as a decline.
  const o3ds = await realFetch(base + '/reservations', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      room: roomKey, variantLabel: variant, checkIn: '2026-12-09', checkOut: '2026-12-11',
      adults: 2, children: 0, breakfast: false, paymentMethod: 'card', cardToken: 'tokn_3ds',
      guest: { firstName: 'Cha', lastName: 'Wong', email: 'cha@example.com', phone: '0877777777' },
    }),
  });
  const o3Json = await o3ds.json();
  const o3Row = inserted[inserted.length - 1];
  check('omise 3-D Secure -> redirect outcome, not a decline',
    o3ds.status === 201 && o3Json.payment.paid === false && !!o3Json.payment.redirect, JSON.stringify(o3Json.payment));
  check('omise 3-D Secure redirect is a plain GET',
    o3Json.payment.redirect.method === 'GET' && /authorize/.test(o3Json.payment.redirect.url));
  check('3-D Secure booking held pending, not paid', o3Row.payment_status === 'pending');

  // Omise's return URL cannot carry a charge id, so the booking ref is the
  // marker and the status endpoint must resolve it.
  const oRet = await realFetch(base + '/payments/status/' + o3Row.ref).then((r) => r.json());
  check('status resolves an omise booking by its REF', oRet.ref === o3Row.ref, JSON.stringify(oRet));

  omisePaid.add(o3Row.payment_charge_id);
  const oHook = await realFetch(base + '/payments/webhook', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: 'charge.complete', data: { object: 'charge', id: o3Row.payment_charge_id } }),
  });
  check('omise charge webhook -> 200', oHook.status === 200);
  check('omise webhook flipped 3-D Secure booking to paid', o3Row.payment_status === 'paid', o3Row.payment_status);

  // Omise emits refund/transfer/dispute events to the SAME url. Acting on one
  // would ask Omise for a charge that does not exist -> 404 -> 500 -> Omise
  // retries the undeliverable event forever.
  const before = omiseSeen.lookups.length;
  const nonCharge = await realFetch(base + '/payments/webhook', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: 'refund.create', data: { object: 'refund', id: 'rfnd_test_123' } }),
  });
  check('non-charge omise event ignored without an API lookup',
    nonCharge.status === 200 && omiseSeen.lookups.length === before, 'lookups grew by ' + (omiseSeen.lookups.length - before));

  // Captured BEFORE the request, not after it. This read `inserted.length`
  // once the POST had already resolved and then asserted the count equalled
  // itself, so it passed no matter what the route did — the one assertion
  // standing between a declined card and a phantom booking was vacuous.
  const countBefore = inserted.length;
  const attemptsBefore = attempts.length;
  const oDecline = await realFetch(base + '/reservations', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      room: roomKey, variantLabel: variant, checkIn: '2026-12-12', checkOut: '2026-12-13',
      adults: 1, children: 0, breakfast: false, paymentMethod: 'card', cardToken: 'tokn_decline',
      guest: { firstName: 'Dee', lastName: 'Ma', email: 'dee@example.com', phone: '0866666666' },
    }),
  });
  const oDeclineJson = await oDecline.json();
  check('declined omise card -> 402', oDecline.status === 402, String(oDecline.status));
  check('declined card leaves NO booking row behind', inserted.length === countBefore);

  // The decline is now RECORDED, because a booking row deliberately is not.
  // Without this the only trace of a guest whose bank refused them is a
  // percentage in the acquirer's dashboard.
  const declineAttempt = attempts[attempts.length - 1];
  check('declined card is recorded as a payment attempt', attempts.length === attemptsBefore + 1,
    'attempts grew by ' + (attempts.length - attemptsBefore));
  check('the recorded attempt keeps the gateway failure code verbatim',
    !!declineAttempt && declineAttempt.failure_code === 'insufficient_fund',
    declineAttempt && declineAttempt.failure_code);
  check('the recorded attempt keeps the issuer message',
    !!declineAttempt && /funds/i.test(declineAttempt.failure_message || ''),
    declineAttempt && declineAttempt.failure_message);
  check('the recorded attempt names the guest so staff can call back',
    !!declineAttempt && declineAttempt.guest_email === 'dee@example.com',
    declineAttempt && declineAttempt.guest_email);
  check('the recorded attempt carries the amount that was refused',
    !!declineAttempt && Number(declineAttempt.amount) > 0,
    declineAttempt && String(declineAttempt.amount));

  // The GUEST is told a kind sentence and nothing else. A raw acquirer code
  // in a public 402 body is an oracle for card testing.
  check('the declined guest response carries no gateway internals',
    Object.keys(oDeclineJson).join(',') === 'error' &&
    !/insufficient_fund/.test(JSON.stringify(oDeclineJson)),
    JSON.stringify(oDeclineJson));

  const oQr = await realFetch(base + '/reservations', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      room: roomKey, variantLabel: variant, checkIn: '2026-12-15', checkOut: '2026-12-16',
      adults: 1, children: 0, breakfast: false, paymentMethod: 'promptpay',
      guest: { firstName: 'Eve', lastName: 'Kim', email: 'eve@example.com', phone: '0855555555' },
    }),
  });
  const oQrJson = await oQr.json();
  check('omise promptpay -> QR image + pending', oQr.status === 201 &&
    oQrJson.payment.paid === false && /^https?:/.test(oQrJson.payment.qrImage || ''), JSON.stringify(oQrJson.payment));

  // The booking id the client actually polls on. This is the regression that
  // matters: production ids are UUIDs, and the status route used to decide
  // between "booking id" and "payment reference" with /^\d+$/, so a real id
  // never resolved and the guest's page never showed "paid".
  const qrBooking = oQrJson.booking;
  check('booking id is a UUID, not an integer', !/^\d+$/.test(String(qrBooking.id)), String(qrBooking.id));
  const byId = await realFetch(base + '/payments/status/' + qrBooking.id).then((r) => r.json());
  check('status by UUID BOOKING ID resolves (the poll the QR view uses)',
    byId.ref === qrBooking.ref, JSON.stringify(byId));

  // ── 4. Reconciler: recovering a payment whose webhook never arrived ─────
  // Omise does not retry failed webhook deliveries, so this is not a rare
  // edge case — it is the documented behaviour the design has to survive.
  const reconciler = require(path.join(ROOT, 'paymentReconciler'));
  const lostRow = inserted[inserted.length - 1];
  check('promptpay booking starts out pending', lostRow.payment_status === 'pending', lostRow.payment_status);

  // The guest scans and pays at Omise… and the webhook is simply never
  // delivered. Nothing in the booking system is told.
  omisePaid.add(lostRow.payment_charge_id);
  check('still pending — nothing told the hotel', lostRow.payment_status === 'pending');

  const swept = await reconciler.sweep({ reason: 'test' });
  check('sweep found and recovered the lost payment', swept.recovered === 1, JSON.stringify(swept));
  check('reconciler flipped the booking to paid', lostRow.payment_status === 'paid', lostRow.payment_status);

  // Running it again must be a no-op — otherwise a scheduled sweep would
  // re-send the guest a payment-confirmed email on every single run.
  const sweptAgain = await reconciler.sweep({ reason: 'test-idempotent' });
  check('a second sweep recovers nothing (no duplicate emails)', sweptAgain.recovered === 0, JSON.stringify(sweptAgain));

  // settle() is what both the webhook and the reconciler call, so the two
  // racing on one charge must settle exactly once between them.
  const raceRef = lostRow.payment_charge_id;
  const [a, b] = await Promise.all([reconciler.settle(raceRef), reconciler.settle(raceRef)]);
  check('webhook and reconciler racing settle at most once',
    Number(a.settled) + Number(b.settled) === 0, JSON.stringify([a.settled, b.settled]));

  // ── 5. Webhook signature verification ──────────────────────────────────
  const omiseAdapter = require(path.join(ROOT, 'lib', 'payments', 'omise'));

  /* The API hostname, asserted as a literal.

     This suite rewrites Omise's host to a local mock, so the real hostname is
     never exercised offline — which is precisely how `https://api.omise.com`
     survived in this adapter from the original integration until the account
     went live. That domain does not exist (NXDOMAIN), so every charge, source
     and status check failed at DNS resolution before a request left the
     server. Every test passed throughout, because the mock answered.
     The correct host is api.omise.co; see https://docs.omise.co/api. */
  const omiseSrc = fs.readFileSync(path.join(ROOT, 'lib', 'payments', 'omise.js'), 'utf8');
  const apiBaseLiteral = (omiseSrc.match(/const API_BASE = '([^']+)'/) || [])[1];
  check('Omise API host is api.omise.co (api.omise.com does not exist)',
    apiBaseLiteral === 'https://api.omise.co', String(apiBaseLiteral));

  check('no signing secret -> checking is off (null, not false)',
    omiseAdapter.verifySignature('{}', {}) === null);

  const signingSecret = Buffer.from('super-secret-bytes').toString('base64');
  process.env.OMISE_WEBHOOK_SIGNING_SECRET = signingSecret;
  const sigBody = JSON.stringify({ key: 'charge.complete', data: { object: 'charge', id: 'chrg_test_sig' } });
  const sigTs = String(Math.floor(Date.now() / 1000));
  const goodSig = require('crypto')
    .createHmac('sha256', Buffer.from(signingSecret, 'base64'))
    .update(sigTs + '.' + sigBody).digest('hex');

  check('valid signature accepted', omiseAdapter.verifySignature(sigBody, {
    'omise-signature': goodSig, 'omise-signature-timestamp': sigTs,
  }) === true);
  check('tampered body rejected', omiseAdapter.verifySignature(sigBody + ' ', {
    'omise-signature': goodSig, 'omise-signature-timestamp': sigTs,
  }) === false);
  check('missing signature rejected once a secret is set',
    omiseAdapter.verifySignature(sigBody, {}) === false);
  // A replayed delivery carries a signature that was valid when it was made.
  const staleTs = String(Math.floor(Date.now() / 1000) - 3600);
  const staleSig = require('crypto')
    .createHmac('sha256', Buffer.from(signingSecret, 'base64'))
    .update(staleTs + '.' + sigBody).digest('hex');
  check('stale (replayed) signature rejected', omiseAdapter.verifySignature(sigBody, {
    'omise-signature': staleSig, 'omise-signature-timestamp': staleTs,
  }) === false);
  // Omise sends two comma-separated signatures while a secret is rotating.
  check('rotation: one of two comma-separated signatures matches',
    omiseAdapter.verifySignature(sigBody, {
      'omise-signature': 'deadbeef,' + goodSig, 'omise-signature-timestamp': sigTs,
    }) === true);

  const badSigResp = await realFetch(base + '/payments/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Omise-Signature': 'nope', 'Omise-Signature-Timestamp': sigTs },
    body: sigBody,
  });
  check('route rejects a badly signed webhook with 401', badSigResp.status === 401, String(badSigResp.status));
  delete process.env.OMISE_WEBHOOK_SIGNING_SECRET;

  /* ── Online payment is the rule ────────────────────────────────────────
     Bookings made on the website are paid on the website. The one exception
     is a gateway that cannot be reached at all, which must fall back rather
     than turning the booking form into a dead end — so both halves are
     asserted here, because only testing the rule would let a regression in
     the fallback go unnoticed until the acquirer had a bad afternoon. */
  const payAtDeskBody = {
    room: roomKey, variantLabel: variant, checkIn: '2026-12-20', checkOut: '2026-12-21',
    adults: 1, children: 0, breakfast: false, paymentMethod: 'pay_at_checkin',
    guest: { firstName: 'Ola', lastName: 'Ng', email: 'ola@example.com', phone: '0844444444' },
  };
  const refusedAtDesk = await realFetch(base + '/reservations', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payAtDeskBody),
  });
  const refusedJson = await refusedAtDesk.json();
  check('a live gateway refuses pay-at-check-in', refusedAtDesk.status === 400, String(refusedAtDesk.status));
  check('the refusal carries a code the booking page can recover from',
    refusedJson.code === 'ONLINE_PAYMENT_REQUIRED', JSON.stringify(refusedJson));
  check('the refusal tells the guest how to book anyway',
    /call the hotel/i.test(refusedJson.error || ''), refusedJson.error);

  // Omitting paymentMethod entirely is the same request as asking to pay at
  // the desk, and must be answered the same way rather than defaulting.
  const noMethod = await realFetch(base + '/reservations', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(Object.assign({}, payAtDeskBody, { paymentMethod: undefined, checkIn: '2026-12-22', checkOut: '2026-12-23' })),
  });
  check('omitting paymentMethod is refused too, not defaulted', noMethod.status === 400, String(noMethod.status));

  const cfgOnline = await realFetch(base + '/payments/config').then((r) => r.json());
  check('config tells the page pay-at-check-in is off', cfgOnline.payAtCheckinAllowed === false,
    JSON.stringify(cfgOnline));

  // The escape hatch, for a phone booking taken through the same form.
  process.env.ALLOW_PAY_AT_CHECKIN = 'true';
  const allowed = await realFetch(base + '/reservations', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(Object.assign({}, payAtDeskBody, { checkIn: '2026-12-24', checkOut: '2026-12-25' })),
  });
  check('ALLOW_PAY_AT_CHECKIN re-opens it deliberately', allowed.status === 201, String(allowed.status));
  delete process.env.ALLOW_PAY_AT_CHECKIN;

  /* THE FALLBACK. With no gateway keys at all there is no way to pay online,
     so refusing pay-at-check-in would refuse every direct booking on the site
     — silently, at the last step of the funnel. */
  const savedKey = process.env.OMISE_SECRET_KEY;
  delete process.env.OMISE_SECRET_KEY;
  const gatewayDown = await realFetch(base + '/reservations', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(Object.assign({}, payAtDeskBody, { checkIn: '2026-12-26', checkOut: '2026-12-27' })),
  });
  check('no gateway -> pay-at-check-in still works (never dead-end a guest)',
    gatewayDown.status === 201, String(gatewayDown.status));
  const cfgDown = await realFetch(base + '/payments/config').then((r) => r.json());
  check('config re-opens pay-at-check-in while the gateway is unreachable',
    cfgDown.payAtCheckinAllowed === true, JSON.stringify(cfgDown));
  process.env.OMISE_SECRET_KEY = savedKey;

  // ── 6. Charge-state vocabulary + test/live mode ─────────────────────────
  check('successful -> paid', omiseAdapter.chargeState('successful') === 'paid');
  check('pending -> pending (keep watching)', omiseAdapter.chargeState('pending') === 'pending');
  check('expired -> expired (stop watching)', omiseAdapter.chargeState('expired') === 'expired');
  check('reversed -> failed (money is not ours)', omiseAdapter.chargeState('reversed') === 'failed');
  check('unrecognised status -> unknown (never assume failure)',
    omiseAdapter.chargeState('something_new') === 'unknown');

  check('test keys report test mode', omiseAdapter.mode() === 'test', String(omiseAdapter.mode()));
  const cfgTest = await realFetch(base + '/payments/config').then((r) => r.json());
  check('config exposes testMode so the page can warn the guest', cfgTest.testMode === true, JSON.stringify(cfgTest));
  process.env.OMISE_SECRET_KEY = 'skey_live_pretend';
  check('live keys report live mode', omiseAdapter.mode() === 'live', String(omiseAdapter.mode()));
  const cfgLive = await realFetch(base + '/payments/config').then((r) => r.json());
  check('config drops the test-mode flag on live keys', cfgLive.testMode === false, JSON.stringify(cfgLive));
  process.env.OMISE_SECRET_KEY = 'skey_test_123';

  // ── 7. Gating on the go-live endpoints ─────────────────────────────────
  // These report merchant-account details and drive an outward-facing write
  // to the Omise account, so who can reach them matters as much as what they
  // say.
  delete process.env.PAYMENT_WEBHOOK_SECRET;
  delete process.env.OMISE_WEBHOOK_SECRET;
  // With no shared secret configured the webhook deliberately accepts
  // unauthenticated posts (local/dev). That leniency must NOT extend to
  // diagnostics, or an unset variable would silently publish the account.
  let diag = await realFetch(base + '/payments/diagnostics?key=anything');
  check('diagnostics: no secret configured -> admin auth required (401)', diag.status === 401, String(diag.status));

  process.env.PAYMENT_WEBHOOK_SECRET = 'sekrit-value';
  diag = await realFetch(base + '/payments/diagnostics?key=sekrit-value');
  check('diagnostics: correct key -> 200', diag.status === 200, String(diag.status));
  const diagBody = await diag.json();
  check('diagnostics names the live provider and mode',
    diagBody.provider === 'omise' && diagBody.mode === 'test', JSON.stringify(diagBody).slice(0, 140));
  // webhookUrl() embeds the shared secret as ?key=…; the response must not.
  check('diagnostics never echoes the webhook secret',
    !JSON.stringify(diagBody).includes('sekrit-value'), diagBody.expectedWebhookUrl);
  check('diagnostics still shows the webhook address, redacted',
    /key=\*\*\*/.test(diagBody.expectedWebhookUrl || ''), diagBody.expectedWebhookUrl);

  check('diagnostics: wrong key -> 401',
    (await realFetch(base + '/payments/diagnostics?key=wrong')).status === 401);
  check('diagnostics: no key -> 401',
    (await realFetch(base + '/payments/diagnostics')).status === 401);
  check('reconcile: wrong key -> 401',
    (await realFetch(base + '/payments/reconcile?key=wrong', { method: 'POST' })).status === 401);
  check('register-webhook: wrong key -> 401',
    (await realFetch(base + '/payments/diagnostics/register-webhook?key=wrong', { method: 'POST' })).status === 401);

  /* The email-preview endpoint must not become what the last audit found on
     POST /api/email: a relay that will send hotel-signed mail anywhere. The
     recipient comes from HOTEL_NOTIFY_EMAIL, never from the request. */
  check('email-preview: wrong key -> 401',
    (await realFetch(base + '/payments/email-preview?key=wrong', { method: 'POST' })).status === 401);
  process.env.HOTEL_NOTIFY_EMAIL = 'desk@jparkhotel.example';
  const preview = await realFetch(base + '/payments/email-preview?key=sekrit-value', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: 'attacker@evil.example', subject: 'Your account', html: '<b>pay here</b>' }),
  });
  const previewBody = await preview.json();
  check('email-preview: sends only to the hotel address',
    JSON.stringify(previewBody.to) === JSON.stringify(['desk@jparkhotel.example']),
    JSON.stringify(previewBody.to));
  check('email-preview: a caller-supplied recipient is ignored',
    JSON.stringify(previewBody).indexOf('attacker@evil.example') === -1);
  check('email-preview: renders the real templates, not caller content',
    Array.isArray(previewBody.sent) && previewBody.sent.length === 3,
    JSON.stringify(previewBody.sent));

  // Registering the webhook by API, which is what turns the failing check
  // above into a passing one without anyone touching the dashboard.
  const reg = await realFetch(base + '/payments/diagnostics/register-webhook?key=sekrit-value', { method: 'POST' });
  const regBody = await reg.json();
  check('register-webhook: registers this API address', reg.status === 200 &&
    /\/api\/v1\/payments\/webhook/.test(regBody.webhookUri || ''), JSON.stringify(regBody));
  check('register-webhook: the registered URL carries the shared secret',
    /key=sekrit-value/.test(regBody.webhookUri || ''), 'registered URL missing ?key=');
  const afterReg = await realFetch(base + '/payments/diagnostics?key=sekrit-value').then((r) => r.json());
  const regCheck = afterReg.checks.find((c) => c.name.indexOf('Webhook is registered') === 0);
  const pointsHere = afterReg.checks.find((c) => c.name.indexOf('Registered webhook points at this API') === 0);
  check('diagnostics now sees the webhook registered', regCheck && regCheck.ok === true, JSON.stringify(regCheck));
  check('diagnostics confirms it points at this API', pointsHere && pointsHere.ok === true, JSON.stringify(pointsHere));
  check('the registered-webhook detail is redacted too',
    !JSON.stringify(afterReg).includes('sekrit-value'), 'secret leaked into diagnostics after registering');

  // A browser asking for the checklist should get a readable page, not JSON.
  const diagHtml = await realFetch(base + '/payments/diagnostics?key=sekrit-value', {
    headers: { Accept: 'text/html' },
  });
  const diagHtmlBody = await diagHtml.text();
  check('diagnostics renders HTML for a browser',
    diagHtml.status === 200 && /^text\/html/.test(diagHtml.headers.get('content-type') || ''),
    diagHtml.headers.get('content-type'));
  check('diagnostics HTML says which mode it is in', /TEST MODE/.test(diagHtmlBody));
  check('diagnostics HTML never echoes the webhook secret', !diagHtmlBody.includes('sekrit-value'));
  // The account lookup really ran against the mock, so the account-derived
  // checks are exercised rather than skipped.
  const named = (n) => (diagBody.checks || []).find((c) => c.name.indexOf(n) === 0);
  check('diagnostics reads the account back', diagBody.account &&
    diagBody.account.country === 'TH' && diagBody.account.currency === 'thb',
    JSON.stringify(diagBody.account));
  check('diagnostics passes THB / Thailand',
    named('Account currency is THB').ok && named('Account country is Thailand').ok);
  // The check that actually matters: an unregistered webhook is invisible
  // until a guest pays and the booking never flips.
  check('diagnostics flags an unregistered webhook',
    named('Webhook is registered with the gateway').ok === false,
    JSON.stringify(named('Webhook is registered with the gateway')));

  // An advisory item is a recommendation, not a fault. If one could fail the
  // report, a correct setup would still show red — which teaches whoever runs
  // this to ignore red, defeating the point of a go-live check.
  const advisory = (diagBody.checks || []).filter((c) => c.advisory);
  check('optional items are marked advisory', advisory.length > 0,
    JSON.stringify((diagBody.checks || []).map((c) => c.name)));
  check('the report ignores advisory items when deciding pass/fail',
    diagBody.ok === diagBody.checks.every((c) => c.ok || c.advisory),
    'ok=' + diagBody.ok);
  delete process.env.PAYMENT_WEBHOOK_SECRET;

  // ── 8. Opening the webhook URL in a browser ────────────────────────────
  // The webhook is POST-only, so a GET used to hit Express's bare
  // "Cannot GET /api/v1/payments/webhook" — which reads as a broken endpoint
  // at precisely the moment someone is checking they set it up right.
  const hookGet = await realFetch(base + '/payments/webhook', { headers: { Accept: 'text/html' } });
  const hookBody = await hookGet.text();
  check('GET webhook -> 200, not "Cannot GET"', hookGet.status === 200, String(hookGet.status));
  check('GET webhook explains itself and points at diagnostics',
    /POST/.test(hookBody) && /diagnostics/.test(hookBody));
  const hookJson = await realFetch(base + '/payments/webhook').then((r) => r.json());
  check('GET webhook answers JSON for non-browsers', hookJson.ok === true && hookJson.accepts === 'POST',
    JSON.stringify(hookJson).slice(0, 90));

  /* Enforcing signatures can silently kill the webhook: a signing secret that
     does not match the gateway rejects every genuine delivery as a forgery,
     and because the reconciler still recovers the payments, nothing breaks
     loudly. Diagnostics has to be able to say so. */
  process.env.PAYMENT_WEBHOOK_SECRET = 'sekrit-value';
  process.env.OMISE_WEBHOOK_SIGNING_SECRET = Buffer.from('a-different-secret').toString('base64');
  const forged = await realFetch(base + '/payments/webhook?key=sekrit-value', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Omise-Signature': 'ffff', 'Omise-Signature-Timestamp': String(Math.floor(Date.now() / 1000)),
    },
    body: JSON.stringify({ key: 'charge.complete', data: { object: 'charge', id: 'chrg_sigfail' } }),
  });
  check('a mis-signed delivery is rejected', forged.status === 401, String(forged.status));
  const sigDiag = await realFetch(base + '/payments/diagnostics?key=sekrit-value').then((r) => r.json());
  check('diagnostics counts the rejected delivery',
    sigDiag.webhookDeliveries && sigDiag.webhookDeliveries.badSignature > 0,
    JSON.stringify(sigDiag.webhookDeliveries));
  const acceptCheck = (sigDiag.checks || []).find((c) => c.name.indexOf('Webhook deliveries are being accepted') === 0);
  /* The rule, asserted as a rule rather than as one hard-coded outcome: the
     alarm fires only when deliveries are rejected AND none are getting
     through. By this point the suite has already posted webhooks that were
     accepted, so what is exercised here is the OTHER half — rejections
     alongside successes must be reported as harmless probing, because an
     endpoint on the public internet will be probed, and an alarm that cries
     wolf at that is worse than no alarm. */
  const d = sigDiag.webhookDeliveries;
  const shouldAlarm = d.badSignature > 0 && d.accepted === 0;
  check('the accepted-deliveries check follows its documented rule',
    acceptCheck && acceptCheck.ok === !shouldAlarm,
    JSON.stringify({ counters: d, check: acceptCheck }));
  check('rejections alongside accepted deliveries are treated as harmless probing',
    d.accepted > 0 && acceptCheck.ok === true && /probing/.test(acceptCheck.detail),
    JSON.stringify(acceptCheck));
  check('the report is not failed by probing alone', sigDiag.ok === true, 'ok=' + sigDiag.ok);
  delete process.env.OMISE_WEBHOOK_SIGNING_SECRET;
  delete process.env.PAYMENT_WEBHOOK_SECRET;
  // It must stay silent about whether a key was right: no public oracle to
  // guess the webhook secret against.
  process.env.PAYMENT_WEBHOOK_SECRET = 'sekrit-value';
  const hookGood = await realFetch(base + '/payments/webhook?key=sekrit-value').then((r) => r.text());
  const hookBad = await realFetch(base + '/payments/webhook?key=wrong').then((r) => r.text());
  check('GET webhook gives no key-guessing oracle', hookGood === hookBad);
  delete process.env.PAYMENT_WEBHOOK_SECRET;

  // The POST path must be untouched by any of that.
  const stillPosts = await realFetch(base + '/payments/webhook', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: 'charge.complete', data: { object: 'charge', id: 'chrg_nope' } }),
  });
  check('POST webhook still works after adding the GET', stillPosts.status === 200, String(stillPosts.status));

  server.close();
  gateway.close();
  omiseApi.close();

  console.log('');
  results.forEach((r) => console.log((r.ok ? '  PASS  ' : '  FAIL  ') + r.name + (r.ok ? '' : '   << ' + r.detail)));
  console.log('\n' + (results.length - failures) + '/' + results.length + ' checks passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(2); });
