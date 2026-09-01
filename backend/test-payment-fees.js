/* Offline tests for the online payment fee passed on to the guest.
   Run: node backend/test-payment-fees.js   (also part of `npm test`)

   Needs no database and no network: everything here is the pure arithmetic in
   lib/paymentFees.js, plus the parity between that file and the copy of the
   same schedule the browser paints from.

   What these assertions are actually protecting:

     1. THE HOTEL RECEIVES THE ROOM RATE. Every gross-up is checked by
        simulating the acquirer's own deduction on the grossed amount and
        asserting the remainder is not less than the room total. A fee
        computed as a percentage OF the room total passes a naive "the fee is
        3.65%" test and still leaves the hotel short — this is the test that
        tells those two apart.
     2. A GROUP'S ROWS ADD UP. One cart is one charge, but N stored rows. If
        the split does not sum to the charge exactly, the receipt prints a
        grand total the card was never charged.
     3. THE SWITCH REALLY SWITCHES IT OFF. With the schedule disabled the
        quote must be byte-identical to no feature at all.
     4. THE BROWSER AND THE SERVER AGREE. assets/js/booking-page.js carries a
        hand-mirror of the schedule so the booking page can quote a fee before
        any API call resolves. Nothing but a test stops those two drifting —
        and a drift here means a guest is shown one price and charged another.
*/
'use strict';

const fs = require('fs');
const path = require('path');
const fees = require('./lib/paymentFees');

let passed = 0;
let failed = 0;

function check(label, cond, detail) {
  if (cond) { passed++; console.log(`  ok   ${label}`); }
  else { failed++; console.log(`  FAIL ${label}${detail ? ': ' + detail : ''}`); }
}
function eq(label, actual, expected) {
  check(label, actual === expected, `got ${JSON.stringify(actual)} want ${JSON.stringify(expected)}`);
}
// Money comparison with a satang of slack, for sums of allocated shares.
function near(label, actual, expected, tol) {
  const t = tol == null ? 0.005 : tol;
  check(label, Math.abs(Number(actual) - Number(expected)) <= t,
    `got ${actual} want ${expected} (±${t})`);
}

const SCHEDULE = { enabled: true, vatRate: 0.07, rates: { card: 0.0365, promptpay: 0.0265 } };

/* The acquirer's side of the transaction, simulated exactly as Omise does it:
   in satang, fee rounded to the satang, VAT rounded on the rounded fee. This
   is the whole point of the suite — the hotel's takings are whatever comes
   back from HERE, not whatever the quote hoped for. */
function acquirerNet(grossTHB, rate, vatRate) {
  const satang = Math.round(grossTHB * 100);
  const fee = Math.round(satang * rate);
  const feeVat = Math.round(fee * vatRate);
  return (satang - fee - feeVat) / 100;
}

console.log('\n# The gross-up leaves the hotel whole');

/* Real room totals from the rate card: one night of the cheapest room, the
   worked example from the hotel's own Omise dashboard, a long stay, and the
   awkward small amounts where rounding has the most leverage. */
[1, 7, 99, 100, 990, 1110, 1490, 2980, 5550, 12345, 99999].forEach((roomTotal) => {
  ['card', 'promptpay'].forEach((method) => {
    const q = fees.quote(roomTotal, method, SCHEDULE);
    const net = acquirerNet(q.total, SCHEDULE.rates[method], SCHEDULE.vatRate);
    check(`${method} ${roomTotal}: hotel nets ${net} >= ${roomTotal}`,
      net >= roomTotal, `gross ${q.total}, net ${net}`);
    // And not absurdly more — the whole-Baht rounding is the only surplus
    // allowed, so a bug that doubled the fee would fail here even though it
    // passes the "not short" check above.
    check(`${method} ${roomTotal}: surplus is under one Baht`,
      net - roomTotal < 1, `net ${net} vs room ${roomTotal}`);
    eq(`${method} ${roomTotal}: total = room + surcharge`,
      Math.round((q.roomTotal + q.surcharge) * 100), Math.round(q.total * 100));
    check(`${method} ${roomTotal}: charged more than the room`, q.total >= roomTotal);
  });
});

console.log('\n# The worked example the hotel already has a bank statement for');
{
  // 5,550 charged, 202.58 fee + 14.18 VAT = 216.76 kept, 5,333.24 banked.
  // Passed on, the guest pays 5,776 and the hotel banks 5,550.42.
  const q = fees.quote(5550, 'card', SCHEDULE);
  eq('5,550 room -> 5,776 charged', q.total, 5776);
  eq('surcharge is 226', q.surcharge, 226);
  eq('effective rate is 3.9055%, not 10.65%', Number((q.effectiveRate * 100).toFixed(4)), 3.9055);
  near('expected net covers the room rate', q.expectedNet, 5550.42);
  near('the acquirer really would leave 5,550.42', acquirerNet(5776, 0.0365, 0.07), 5550.42);
}

console.log('\n# The mistake this replaces: a flat percentage of the room total');
{
  // What "add 3.9055%" would have done — the naive version that looks right
  // and quietly under-recovers on every single booking.
  const naiveGross = Math.ceil(5550 * 1.039055);
  const naiveNet = acquirerNet(naiveGross, 0.0365, 0.07);
  check('a flat percentage leaves the hotel SHORT (which is why we solve for it)',
    naiveNet < 5550, `naive net ${naiveNet}`);
  check('solving for it does not', acquirerNet(fees.quote(5550, 'card', SCHEDULE).total, 0.0365, 0.07) >= 5550);
}

console.log('\n# Switched off, and methods that carry no fee');
{
  const off = { ...SCHEDULE, enabled: false };
  const q = fees.quote(5550, 'card', off);
  eq('disabled: nothing added', q.total, 5550);
  eq('disabled: no surcharge', q.surcharge, 0);
  eq('disabled: applied is false', q.applied, false);

  ['pay_at_checkin', 'in_person', 'cash'].forEach((m) => {
    const r = fees.quote(5550, m, SCHEDULE);
    eq(`${m}: no fee is passed on`, r.total, 5550);
    eq(`${m}: surcharge is zero`, r.surcharge, 0);
  });

  eq('an unknown method adds nothing', fees.quote(5550, 'bitcoin', SCHEDULE).total, 5550);
  eq('no method adds nothing', fees.quote(5550, null, SCHEDULE).total, 5550);
  eq('a zero total stays zero', fees.quote(0, 'card', SCHEDULE).total, 0);
  // A room priced at exactly a whole Baht after the gross-up must not be
  // rounded up another Baht by float noise (5550/0.960945 can land on
  // 5775.000000000001 for some inputs).
  const exact = fees.quote(5550 * (1 - 0.039055), 'card', SCHEDULE);
  eq('an exactly-dividing total is not nudged up a Baht', exact.total, 5550);
}

console.log('\n# A rate the Site Editor should never have accepted');
{
  // 3.65 meant as "3.65%". Honoured, it would take 365% of the booking.
  const typo = fees.mergeFees({ rates: { card: 3.65 } });
  eq('a percentage typed as a whole number is rejected', typo.rates.card, 0.0365);
  eq('a negative rate is rejected', fees.mergeFees({ rates: { card: -0.1 } }).rates.card, 0.0365);
  eq('a string rate is rejected', fees.mergeFees({ rates: { card: '0.02' } }).rates.card, 0.0365);
  eq('an out-of-range VAT is rejected', fees.mergeFees({ vatRate: 7 }).vatRate, 0.07);
  eq('a valid rate IS honoured', fees.mergeFees({ rates: { card: 0.029 } }).rates.card, 0.029);
  eq('zero is a valid rate (a gateway that charges nothing)', fees.mergeFees({ rates: { card: 0 } }).rates.card, 0);
  eq('the off switch is honoured', fees.mergeFees({ enabled: false }).enabled, false);
  eq('a partial save keeps the other method', fees.mergeFees({ rates: { card: 0.03 } }).rates.promptpay, 0.0265);
  eq('a stored blob with no vatRate keeps VAT', fees.mergeFees({ rates: { card: 0.03 } }).vatRate, 0.07);
  eq('null override -> defaults', fees.mergeFees(null).rates.card, 0.0365);
}

console.log('\n# One charge, N rows: the split must be exact');
[
  [990, 1110],
  [990, 1110, 1490],
  [1, 1, 1],
  [5550],
  [990.5, 1200.25, 800],          // an admin who saved a fractional rate
  [100, 100, 100, 100, 100, 100], // an even split with a remainder to hand out
  [3000, 1, 1],                   // wildly uneven
].forEach((roomTotals) => {
  const grand = roomTotals.reduce((s, n) => s + n, 0);
  const q = fees.quote(grand, 'card', SCHEDULE);
  const shares = fees.allocateSurcharge(q.surcharge, roomTotals);
  const label = `[${roomTotals.join('+')}]`;

  eq(`${label}: one share per room`, shares.length, roomTotals.length);
  near(`${label}: shares sum to the surcharge`, shares.reduce((s, n) => s + n, 0), q.surcharge);
  const rowSum = roomTotals.reduce((s, n, i) => s + n + shares[i], 0);
  near(`${label}: the stored rows sum to the amount charged`, rowSum, q.total);
  check(`${label}: no room gets a negative share`, shares.every((n) => n >= 0), JSON.stringify(shares));
  // Grossing up per room and summing would round up once per room — the bug
  // this shape of allocation exists to avoid.
  const perRoom = roomTotals.reduce((s, n) => s + fees.quote(n, 'card', SCHEDULE).total, 0);
  check(`${label}: one gross-up never costs more than N gross-ups`, q.total <= perRoom,
    `cart ${q.total} vs per-room ${perRoom}`);
});

console.log('\n# Allocation edge cases');
{
  eq('no rooms -> no shares', fees.allocateSurcharge(226, []).length, 0);
  const zeroCart = fees.allocateSurcharge(10, [0, 0]);
  near('a zero-total cart splits evenly rather than dividing by zero',
    zeroCart.reduce((s, n) => s + n, 0), 10);
  check('a zero surcharge allocates zeros', fees.allocateSurcharge(0, [990, 1110]).every((n) => n === 0));
  // Deterministic: a reprint of the same booking must be the same document.
  const a = fees.allocateSurcharge(101, [100, 100, 100]);
  const b = fees.allocateSurcharge(101, [100, 100, 100]);
  eq('the split is deterministic', JSON.stringify(a), JSON.stringify(b));
}

/* ── Parity with the browser's copy ──────────────────────────────────────
   assets/js/booking-page.js hand-mirrors this schedule so the booking page
   can quote a fee immediately, before GET /api/rates resolves — the same
   pattern (and the same drift risk) as the ROOMS/DAYUSE/SURCHARGES mirrors
   guarded by test-rate-parity.js. A mismatch here means the page quotes one
   fee and the server charges another. */
console.log('\n# Browser mirror parity (assets/js/booking-page.js)');
{
  const src = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'booking-page.js'), 'utf8');
  const m = src.match(/var PAYMENT_FEES = (\{[\s\S]*?\n\s*\});/);
  if (!m) {
    check('PAYMENT_FEES table found in booking-page.js', false, 'literal not found');
  } else {
    // eslint-disable-next-line no-new-func
    const client = new Function(`return ${m[1]}`)();
    const server = fees.DEFAULT_PAYMENT_FEES;
    eq('enabled matches', client.enabled, server.enabled);
    eq('vatRate matches', client.vatRate, server.vatRate);
    Object.keys(server.rates).forEach((method) => {
      eq(`rate "${method}" matches`, client.rates[method], server.rates[method]);
    });
    Object.keys(client.rates).forEach((method) => {
      check(`client method "${method}" exists server-side`,
        Object.prototype.hasOwnProperty.call(server.rates, method), method);
    });
  }

  const nf = src.match(/var NO_FEE_METHODS = (\[[\s\S]*?\]);/);
  if (!nf) {
    check('NO_FEE_METHODS found in booking-page.js', false, 'literal not found');
  } else {
    // eslint-disable-next-line no-new-func
    const clientNoFee = new Function(`return ${nf[1]}`)();
    eq('the no-fee method list matches', clientNoFee.join(','), fees.NO_FEE_METHODS.join(','));
  }

  /* The formula itself, not just the numbers. The browser has its own copy of
     the gross-up (it cannot require this module), so the literal expression
     is checked to be the one that SOLVES for the fee rather than adding a
     percentage — the difference between the hotel being made whole and being
     short on every booking. */
  check('the browser solves for the fee (net / (1 - k)), not net * (1 + k)',
    /net \/ \(1 - k\)/.test(src), 'gross-up expression not found in booking-page.js');
  check('the browser ceilings to whole Baht like the server does',
    /Math\.ceil\(Number\(\(net \/ \(1 - k\)\)\.toFixed\(6\)\)\)/.test(src),
    'rounding expression not found in booking-page.js');
  check('the browser multiplies VAT onto the fee, not onto the sale',
    /var k = rate \* \(1 \+ vat\);/.test(src), 'k expression not found in booking-page.js');
}

console.log(`\n${passed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
