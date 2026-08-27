/* Renders every guest- and hotel-facing email and checks the two things that
   are easy to get wrong and impossible to notice once sent.

   Run: node backend/test-emails.js   (also part of `npm test`)
   Add --write to also drop the rendered HTML into backend/.email-preview/ for
   opening in a browser. Nothing is written by default.

   1. ESCAPING. Guest name, email and phone come from the public booking form,
      and cleanField() (routes/payments.js) strips only control characters —
      angle brackets pass straight through. These templates used to
      interpolate those fields raw, so a booking made under a name containing
      markup rendered as live HTML inside the hotel's own notification email.
      That is a credible place to hide a link precisely because the message
      really did come from the hotel's system. Every test below books under a
      hostile name and asserts it comes out inert.

   2. EMAIL-CLIENT REALITY. Mail is not the web. rem units are dropped by
      several major clients, <style> blocks are stripped by Gmail's web
      client, and Outlook lays out tables far more reliably than divs. A
      template can look perfect in a browser and still arrive broken, so the
      structural rules are asserted rather than eyeballed. */
const path = require('path');
const fs = require('fs');
const ROOT = __dirname;

const WRITE = process.argv.includes('--write');
let failures = 0;
const results = [];
function check(name, cond, detail) {
  results.push({ name, ok: !!cond, detail: detail || '' });
  if (!cond) failures++;
}

// The database is never touched by a render; stub it so requiring the route
// module does not try to connect.
const fakeDb = { query: async () => ({ rows: [] }), connect: async () => ({ query: async () => ({ rows: [] }), release() {} }) };
const dbPath = require.resolve(path.join(ROOT, 'db.js'));
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fakeDb };

process.env.RESEND_API_KEY = '';
process.env.HOTEL_NOTIFY_EMAIL = 'desk@example.com';

const GB = require(path.join(ROOT, 'routes', 'guestBookings'));

/* A guest name that is also an attack. If any template renders this as markup,
   the hotel's own inbox contains a working link that appears to come from the
   booking system. */
const HOSTILE = '<a href="https://evil.example">Confirm your booking</a><script>alert(1)</script>';

function booking(over) {
  return Object.assign({
    id: '3f2a1b4c-5d6e-4f70-8a9b-000000000101',
    ref: 'JP-TEST-0001',
    channel: 'direct', channel_name: 'Direct (Website)',
    guest_name: HOSTILE, guest_last_name: 'Lee',
    guest_email: 'ann@example.com', guest_phone: '0812345678',
    room: 'Studio Single', check_in: '2026-12-01', check_out: '2026-12-03',
    nights: 2, adults: 2, children: 0, total: '1980.00', currency: 'THB',
    status: 'confirmed', lang: 'en',
    smoking_preference: 'non_smoking', breakfast: true, extra_bed: false,
    child_ages: [], special_requests: 'Late arrival, around 23:00',
    payment_provider: 'in_person', payment_method: 'pay_at_checkin',
    payment_status: 'pending', payment_charge_id: null, non_refundable: false,
  }, over || {});
}

const rendered = {};
function renderCase(name, obj) {
  rendered[name] = obj;
  return obj;
}

// ── Structural rules every HTML email must follow ─────────────────────────
function assertEmailShape(name, html) {
  check(`${name}: escapes a hostile guest name`,
    html.indexOf('<a href="https://evil.example"') === -1 && html.indexOf('<script>') === -1,
    'raw markup from guest input survived into the HTML');
  check(`${name}: the hostile name is still shown, inert`,
    html.indexOf('&lt;a href=&quot;https://evil.example&quot;&gt;') !== -1,
    'escaped form not found — was the name dropped instead of escaped?');
  // rem is silently ignored by several clients; px is the only safe unit.
  check(`${name}: no rem units`, !/font-size:\s*[\d.]+rem/.test(html), (html.match(/[\d.]+rem/) || [])[0] || '');
  check(`${name}: table-based layout for Outlook`, html.indexOf('<table') !== -1);
  check(`${name}: has a preheader for the inbox preview`,
    /display:none;font-size:1px/.test(html));
  check(`${name}: content column is width-limited`, html.indexOf('max-width:100%') !== -1 && html.indexOf('width:600px') !== -1);
  check(`${name}: carries the hotel address`, html.indexOf('Thanon Sukprayun') !== -1);
  // A <style> block would be stripped by Gmail's web client, taking the
  // design with it.
  check(`${name}: no <style> block to be stripped`, html.indexOf('<style') === -1);
  check(`${name}: declares a charset`, /charset=/i.test(html));

  /* Every cell carrying text must name its own font.

     The old templates set font-family once on an outer <div> and let
     everything inherit. The template sets it per element instead, which is what
     Outlook needs — but it means any cell left behind with no font of its own
     silently falls back to the client default, which is Times. That is exactly
     what happened to the per-room rows in the group confirmation: correct
     content, correct totals, rendered in serif in the middle of a sans-serif
     email. It looked like a design choice rather than a bug, so nothing would
     have flagged it. */
  const orphans = [];
  const cellRe = /<td([^>]*)>([\s\S]*?)<\/td>/g;
  let cm;
  while ((cm = cellRe.exec(html)) !== null) {
    const attrs = cm[1];
    const inner = cm[2];
    // Ignore spacer cells: no text of their own beyond entities/whitespace.
    const visible = inner.replace(/<[^>]*>/g, '').replace(/&[a-z]+;/gi, '').trim();
    if (!visible) continue;
    if (attrs.indexOf('font-family') !== -1) continue;
    if (inner.indexOf('font-family') !== -1) continue; // set on a child instead
    orphans.push(visible.slice(0, 40));
  }
  check(`${name}: every text cell names its own font (no serif fallback)`,
    orphans.length === 0, orphans.join(' | '));
}

/* Wording a hotel would not put in front of a guest. Totals arrive from
   Postgres NUMERIC as "1980.00", and the guest-count line was assembled from
   form-field phrasing — both were being shown verbatim. */
function assertPolish(name, body) {
  check(`${name}: no "adult(s) / child(ren)" form phrasing`,
    body.indexOf('adult(s)') === -1 && body.indexOf('child(ren)') === -1);
  check(`${name}: money has a thousands separator, not raw NUMERIC`,
    body.indexOf('1980.00') === -1 && body.indexOf('1,980') !== -1,
    (body.match(/[\d,.]*1980[\d,.]*/) || [])[0] || 'no total found');
  check(`${name}: no zero-children clause`, !/,\s*0 (child|children)/.test(body));
}

// A plain-text alternative is not optional: it is what screen readers and
// images-off clients get, and its absence is a spam signal.
function assertHasText(name, text) {
  check(`${name}: has a plain-text body`, typeof text === 'string' && text.length > 80, String(text || '').length + ' chars');
  check(`${name}: text body is not HTML`, String(text).indexOf('<table') === -1);
}

(async () => {
  // ── Guest confirmation, pay at check-in ────────────────────────────────
  let m = renderCase('guest-confirmation', GB.confirmationEmail(booking()));
  assertEmailShape('guest confirmation', m.html);
  assertHasText('guest confirmation', m.text);
  assertPolish('guest confirmation', m.html);
  assertPolish('guest confirmation (text)', m.text);
  check('guest confirmation: shows the confirmation number', m.html.indexOf('JP-TEST-0001') !== -1);
  check('guest confirmation: shows the balance-due note', /Balance due/i.test(m.html + m.text));
  check('guest confirmation: shows the key-card deposit note', /200 THB|200 บาท|200THB/.test(m.html));

  // ── Guest confirmation, paid online ────────────────────────────────────
  m = renderCase('guest-confirmation-paid', GB.confirmationEmail(booking({
    payment_provider: 'omise', payment_method: 'card', payment_status: 'paid',
    payment_charge_id: 'chrg_test_123',
  })));
  assertEmailShape('guest confirmation (paid)', m.html);
  check('guest confirmation (paid): says the payment was received', /Payment received|paid/i.test(m.html));
  check('guest confirmation (paid): does NOT show a balance due', !/Balance due/i.test(m.html));

  // ── Guest confirmation, non-refundable prepay ──────────────────────────
  m = renderCase('guest-confirmation-nonrefundable', GB.confirmationEmail(booking({
    payment_provider: 'omise', payment_method: 'card', payment_status: 'paid', non_refundable: true,
  })));
  assertEmailShape('guest confirmation (non-refundable)', m.html);
  check('guest confirmation (non-refundable): states the terms', /non-refundable/i.test(m.html));

  // ── Every language renders ─────────────────────────────────────────────
  ['th', 'ja', 'zh-Hans', 'zh-Hant'].forEach((lang) => {
    const r = renderCase(`guest-confirmation-${lang}`, GB.confirmationEmail(booking({ lang })));
    assertEmailShape(`guest confirmation (${lang})`, r.html);
    check(`guest confirmation (${lang}): not silently falling back to English`,
      r.html.indexOf('Dear ') === -1, 'English greeting found in a ' + lang + ' email');
  });

  // ── Hotel notice — the one an attacker actually targets ────────────────
  m = renderCase('hotel-notice', GB.hotelNotice(booking()));
  assertEmailShape('hotel notice', m.html);
  assertHasText('hotel notice', m.text);
  assertPolish('hotel notice', m.html);
  assertPolish('hotel notice (text)', m.text);
  check('hotel notice: shows the guest contact details', m.html.indexOf('ann@example.com') !== -1);
  check('hotel notice: points staff at the console', /Guest Booking/i.test(m.html));

  m = renderCase('hotel-notice-paid', GB.hotelNotice(booking({
    payment_provider: 'omise', payment_method: 'card', payment_status: 'paid', payment_charge_id: 'chrg_test_123',
  })));
  assertEmailShape('hotel notice (paid)', m.html);
  check('hotel notice (paid): flags the payment and its gateway reference',
    /PAID ONLINE/i.test(m.text) && m.text.indexOf('chrg_test_123') !== -1);

  // ── Cancellations ──────────────────────────────────────────────────────
  // The refund wording here is a written commitment to the guest, made at the
  // moment they are most likely to hold the hotel to it, so it has to match
  // the published policy exactly.
  m = renderCase('cancellation', GB.cancellationEmail(booking()));
  assertEmailShape('cancellation', m.html);
  assertHasText('cancellation', m.text);
  check('cancellation (unpaid): says there is nothing to refund', /nothing to refund/i.test(m.html));
  check('cancellation (unpaid): does not promise a refund', !/arrange a refund/i.test(m.html + m.text));

  m = renderCase('cancellation-paid', GB.cancellationEmail(booking({
    payment_provider: 'omise', payment_method: 'card', payment_status: 'paid',
  })));
  assertEmailShape('cancellation (paid online)', m.html);
  check('cancellation (paid): states the no-refund policy', /non-refundable/i.test(m.html));
  check('cancellation (paid): never offers to arrange a refund',
    !/arrange a refund/i.test(m.html + m.text), 'contradicts the published policy');
  check('cancellation (paid): still invites a billing-error correction',
    /charged in error|charged twice/i.test(m.html));

  // ── Payment receipts ───────────────────────────────────────────────────
  const paid = booking({ payment_provider: 'omise', payment_method: 'card', payment_status: 'paid', payment_charge_id: 'chrg_test_123' });
  m = renderCase('payment-confirmed', GB.paymentConfirmedEmail(paid));
  assertEmailShape('payment confirmed (guest)', m.html);
  assertHasText('payment confirmed (guest)', m.text);
  assertPolish('payment confirmed (guest)', m.html);

  m = renderCase('payment-confirmed-hotel', GB.paymentConfirmedHotelNotice(paid));
  assertEmailShape('payment confirmed (hotel)', m.html);
  check('payment confirmed (hotel): carries the gateway reference for reconciliation',
    m.html.indexOf('chrg_test_123') !== -1);

  // ── Group bookings ─────────────────────────────────────────────────────
  const groupRows = [
    booking({ ref: 'JP-GRP-0001-R1', group_ref: 'JP-GRP-0001', group_index: 1, group_size: 2, room: 'Studio Single', total: '1980.00' }),
    booking({ ref: 'JP-GRP-0001-R2', group_ref: 'JP-GRP-0001', group_index: 2, group_size: 2, room: 'Deluxe', total: '2220.00', children: 1, child_ages: [7] }),
  ];
  m = renderCase('group-confirmation', GB.groupConfirmationEmail(groupRows));
  assertEmailShape('group confirmation', m.html);
  assertHasText('group confirmation', m.text);
  check('group confirmation: shows every room', m.html.indexOf('Studio Single') !== -1 && m.html.indexOf('Deluxe') !== -1);
  check('group confirmation: shows a grand total of both rooms', m.html.indexOf('4,200') !== -1,
    (m.html.match(/[\d,]+ THB/g) || []).join(' | '));

  m = renderCase('group-hotel-notice', GB.groupHotelNotice(groupRows));
  assertEmailShape('group hotel notice', m.html);
  check('group hotel notice: totals both rooms', m.html.indexOf('4,200') !== -1);

  m = renderCase('group-cancellation', GB.groupCancellationEmail(groupRows));
  assertEmailShape('group cancellation', m.html);
  check('group cancellation: HTML agrees with the text about refunds',
    (/nothing to refund/i.test(m.html)) === (/nothing to refund/i.test(m.text)),
    'the group cancellation HTML used to hard-code "nothing to refund" regardless of payment');

  const paidGroup = groupRows.map((r) => Object.assign({}, r, {
    payment_provider: 'omise', payment_method: 'card', payment_status: 'paid', payment_charge_id: 'chrg_grp_1',
  }));
  m = renderCase('group-cancellation-paid', GB.groupCancellationEmail(paidGroup));
  check('group cancellation (paid): HTML does NOT claim nothing was paid',
    !/nothing to refund/i.test(m.html), 'the exact bug this replaced');
  m = renderCase('group-payment-confirmed', GB.groupPaymentConfirmedEmail(paidGroup));
  assertEmailShape('group payment confirmed', m.html);
  m = renderCase('group-payment-confirmed-hotel', GB.groupPaymentConfirmedHotelNotice(paidGroup));
  assertEmailShape('group payment confirmed (hotel)', m.html);

  // ── A hostile name must not escape through the plain-text side either ──
  check('plain-text bodies carry the name verbatim (no markup to execute there)',
    rendered['hotel-notice'].text.indexOf(HOSTILE) !== -1);

  if (WRITE) {
    const dir = path.join(ROOT, '.email-preview');
    fs.mkdirSync(dir, { recursive: true });
    Object.keys(rendered).forEach((k) => {
      fs.writeFileSync(path.join(dir, k + '.html'), rendered[k].html);
    });
    console.log(`\nwrote ${Object.keys(rendered).length} preview files to ${dir}`);
  }

  console.log('');
  results.forEach((r) => console.log((r.ok ? '  PASS  ' : '  FAIL  ') + r.name + (r.ok ? '' : '   << ' + r.detail)));
  console.log('\n' + (results.length - failures) + '/' + results.length + ' checks passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(2); });
