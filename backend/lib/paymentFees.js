/* ============================================================
   J Park Hotel — the online payment fee, passed on to the guest.

   ── What this is ────────────────────────────────────────────────────────
   The acquirer keeps a percentage of every online payment, plus VAT on that
   percentage. Until now the hotel absorbed it: a 5,550 THB room charge
   arrived in the bank as 5,333.24, and the 216.76 difference was silently a
   discount nobody had agreed to give.

   This module computes a PROCESSING FEE added to the guest's bill so the
   hotel receives the room rate in full. Room rates themselves are untouched;
   the fee is its own line, named, on every screen, email and receipt.

   ── The arithmetic, and the mistake it exists to prevent ────────────────
   The gateway's cut is charged on the amount it actually processes — which,
   once a fee is added, is bigger than the room total. So the fee cannot be a
   percentage OF the room total; it has to be solved for.

     Wrong:  gross = net × (1 + k)      → the hotel still comes up short,
                                          because k is then charged on gross.
     Right:  gross = net ÷ (1 − k)      → gross − (gross × k) = net exactly.

   where k is the total proportion the acquirer deducts:

     k = feeRate × (1 + vatRate)

   The VAT is charged ON THE FEE, not on the sale. This is the single thing
   everyone gets wrong here — the hotel's own staff read "3.65% + VAT 7%" as
   a 10.65% deduction and said so in writing. It is 3.65% × 1.07 = 3.9055%.
   On 5,550 that is 216.76, not 591. Every number this module produces is
   built from that one multiplication, in one place, so the misreading has
   nowhere to live.

   ── Rounding is deliberately in the hotel's favour, by pennies ──────────
   `gross` is rounded UP to a whole Baht. Two reasons, in order:

     1. Rounding DOWN, or to the nearest, can leave the hotel a few satang
        short of the room rate — which is the exact failure this whole
        feature exists to fix. Up is the only direction that cannot
        under-recover.
     2. Every other price on this site is a whole number of Baht. A guest
        quoted "฿5,775.55" would be the only decimal on the page, and the
        front desk would have to handle satang it has no way to take in cash.

   The over-recovery is bounded by one Baht per booking — on the worked
   example the hotel nets 5,550.42 against a 5,550.00 room rate. That
   surplus is shown to staff on the internal receipt rather than hidden, so
   nobody has to wonder whether the maths drifted.

   ── The rates are configuration, never a constant ───────────────────────
   An acquirer's rate is negotiable, differs per payment method (a PromptPay
   QR is cheaper to accept than a card), and changes without asking. A
   hard-coded 3.65% would quietly become a lie the day it moved, and the
   hotel would be back to absorbing the difference without anyone noticing.

   So the numbers below are FALLBACK defaults, merged at read time with
   whatever an admin has saved from the Site Editor's Rates tab
   (site_content.payment_fees, written by backend/routes/rates.js) — exactly
   the same base+override pattern backend/lib/rateOverrides.js uses for room
   rates. And because "what rate are we actually paying?" is answerable from
   evidence rather than memory, observedRates() below derives the real
   effective rate from settled charges, so the setting can be checked against
   what the acquirer has genuinely been deducting.

   ── One switch turns the whole thing off ────────────────────────────────
   `enabled: false` makes every function here return a zero surcharge and a
   gross equal to the net, so the booking flow prices exactly as it did
   before this file existed — no redeploy, no code path removed, one tick in
   the Site Editor.

   That switch is not decoration. Passing a card fee to the cardholder is a
   commercial decision with rules around it (card schemes discourage or
   forbid surcharging in several markets, and Thai regulators have said the
   same), and it is the hotel's decision to make and to reverse. What this
   code guarantees is that reversing it is instant and total.
   ============================================================ */
const db = require('../db');

/* The acquirer's cut, per payment method, as a proportion of the amount
   processed. Omise Thailand's published card rate is 3.65%; the 202.58 fee
   on the hotel's own 5,550 charge confirms it to the satang. PromptPay is
   cheaper to accept and is quoted separately.

   VAT is Thailand's standard 7%, charged on the fee. */
const DEFAULT_PAYMENT_FEES = {
  // ON: the hotel's standing instruction is that the guest covers the cost
  // of taking their payment. Reversing that is one tick in the Site Editor
  // (see the docblock) — no deployment, no code change.
  enabled: true,
  vatRate: 0.07,
  rates: {
    card: 0.0365,
    promptpay: 0.0265,
  },
};

// A method that isn't billed a percentage at all — nothing is passed on for
// a booking settled at the front desk.
const NO_FEE_METHODS = ['pay_at_checkin', 'in_person', 'cash'];

// Sanity bounds. A "rate" outside these is a typo (a 3.65 meant as 3.65%, a
// negative, a string), and honouring it would either give the room away or
// double the guest's bill. Rejected values fall back to the default for that
// one field, never for the whole schedule.
const MAX_FEE_RATE = 0.2;   // 20% — far above any real card rate
const MAX_VAT_RATE = 0.3;

function isValidRate(n, max) {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= max;
}
function isValidFeeRate(n) { return isValidRate(n, MAX_FEE_RATE); }
function isValidVatRate(n) { return isValidRate(n, MAX_VAT_RATE); }

/* Merge a stored override object onto the defaults, field by field.

   Deliberately per-field rather than a whole-object replace: a stored blob
   missing `vatRate` (an older save, a hand-edited row) must not silently
   drop VAT out of the calculation and start under-recovering. Anything
   invalid is logged and ignored — defense in depth, since routes/rates.js
   validates on the way in too. */
function mergeFees(override) {
  const merged = {
    enabled: DEFAULT_PAYMENT_FEES.enabled,
    vatRate: DEFAULT_PAYMENT_FEES.vatRate,
    rates: { ...DEFAULT_PAYMENT_FEES.rates },
  };
  if (!override || typeof override !== 'object') return merged;

  if (typeof override.enabled === 'boolean') merged.enabled = override.enabled;

  if (override.vatRate != null) {
    if (isValidVatRate(override.vatRate)) merged.vatRate = override.vatRate;
    else console.warn('[paymentFees] invalid vatRate, ignoring', override.vatRate);
  }

  const rates = override.rates;
  if (rates && typeof rates === 'object') {
    Object.keys(merged.rates).forEach((method) => {
      const v = rates[method];
      if (v == null) return;
      if (isValidFeeRate(v)) merged.rates[method] = v;
      else console.warn(`[paymentFees] invalid rate for "${method}", ignoring`, v);
    });
  }
  return merged;
}

/* The last schedule this process actually read from the database.

   A transient database error must not be able to CHANGE THE PRICE. Falling
   back to the static defaults would do exactly that: an admin who has
   switched the pass-through off would have it switched back on for the
   duration of the hiccup, and — worse — the booking page would have quoted
   the guest one number from a healthy /api/rates while the booking POST
   charged another from an unhealthy one.

   So a failed read serves the last good answer instead. Only a process that
   has never once succeeded falls all the way back to the defaults. */
let lastGoodFees = null;

async function loadRawFees() {
  try {
    const { rows } = await db.query('SELECT payment_fees FROM site_content WHERE id = 1');
    const fees = rows.length ? rows[0].payment_fees : null;
    lastGoodFees = fees && typeof fees === 'object' ? fees : {};
    return lastGoodFees;
  } catch (e) {
    console.error('[paymentFees] DB read failed, serving the last known schedule', e);
    // Never throws into the booking path: a reservation must not be blocked
    // by a settings lookup.
    return lastGoodFees || {};
  }
}

// The live fee schedule: defaults merged with the admin's saved edits.
async function getEffectiveFees() {
  return mergeFees(await loadRawFees());
}

/* The proportion of a charge the acquirer keeps, all in: fee + VAT on fee.
   This is `k` in the docblock, and the only place the two rates are ever
   multiplied together. */
function deductionRate(fees, method) {
  if (!fees || !fees.enabled) return 0;
  if (!method || NO_FEE_METHODS.includes(method)) return 0;
  const rate = fees.rates[method];
  if (!isValidFeeRate(rate) || rate === 0) return 0;
  const vat = isValidVatRate(fees.vatRate) ? fees.vatRate : 0;
  return rate * (1 + vat);
}

// Whole Baht, always upward. See the rounding note in the docblock.
function ceilBaht(n) {
  // Nudge away from binary-float noise before ceiling: 5550 / 0.960945 can
  // land on 5775.000000000001 for a net that divides exactly, which would
  // round a clean 5,775 up to 5,776 and charge a guest a Baht for nothing.
  return Math.ceil(Number((n).toFixed(6)));
}

// Two decimal places, for money we report rather than charge (the realised
// fee, the surplus). Charged amounts are always whole Baht.
function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

/* ── The one public calculation ──────────────────────────────────────────
   Given what the hotel must receive (`netTHB` — the room total) and how the
   guest is paying, returns the whole picture:

     roomTotal   what the stay costs; unchanged by any of this
     surcharge   the processing fee added to the guest's bill
     total       what the guest is charged, and what reaches the gateway
     feeRate     the acquirer's percentage used
     vatRate     VAT applied to that fee
     effectiveRate  feeRate × (1 + vatRate) — the honest single number
     expectedFee / expectedFeeVat / expectedNet
                 what the gateway should deduct from `total`, so the realised
                 charge can be checked against the intention afterwards

   A disabled schedule, an unknown method, or a pay-at-check-in booking all
   return surcharge 0 and total === roomTotal, so callers never need to
   branch on whether the feature is on. */
function quote(netTHB, method, fees) {
  const roomTotal = Number(netTHB) || 0;
  const k = deductionRate(fees, method);
  const rate = (fees && fees.rates && fees.rates[method]) || 0;
  const vatRate = (fees && isValidVatRate(fees.vatRate)) ? fees.vatRate : 0;

  if (!(k > 0) || roomTotal <= 0) {
    return {
      roomTotal,
      surcharge: 0,
      total: roomTotal,
      feeRate: 0,
      vatRate: 0,
      effectiveRate: 0,
      expectedFee: 0,
      expectedFeeVat: 0,
      expectedNet: roomTotal,
      applied: false,
    };
  }

  const total = ceilBaht(roomTotal / (1 - k));
  const expectedFee = round2(total * rate);
  const expectedFeeVat = round2(expectedFee * vatRate);

  return {
    roomTotal,
    surcharge: round2(total - roomTotal),
    total,
    feeRate: rate,
    vatRate,
    effectiveRate: k,
    expectedFee,
    expectedFeeVat,
    expectedNet: round2(total - expectedFee - expectedFeeVat),
    applied: true,
  };
}

// Convenience for callers that have no fee schedule in hand yet.
async function quoteFor(netTHB, method) {
  return quote(netTHB, method, await getEffectiveFees());
}

/* ── Splitting one surcharge across a multi-room booking ─────────────────
   A cart is charged ONCE, for the whole grand total, so the gross-up happens
   once on that grand total — never per room and summed, which would round up
   several times over and overcharge by a Baht per extra room.

   But each room is stored as its own guest_bookings row with its own `total`,
   and the sum of those rows is what the receipt, the group email and every
   report add up. So the single surcharge has to be divided among the rows in
   a way whose sum is EXACTLY the surcharge — not approximately.

   Largest-remainder: give every room its proportional share floored to whole
   Baht, then hand the leftover Baht out one at a time, biggest fractional
   part first. Ties go to the earlier room, so the split is deterministic and
   a reprint of the same booking is the same document. */
function allocateSurcharge(surchargeTHB, roomTotals) {
  const totals = (roomTotals || []).map((n) => Number(n) || 0);
  /* Allocated in SATANG, not Baht.

     Rounding the surcharge to a whole Baht first looks harmless because every
     rate on this site is a whole number — but an admin may save 990.50 from
     the Rates tab, and then the surcharge is fractional too. Rounded to Baht,
     the shares would sum to something the card was never charged, and the
     rows of a group booking would stop adding up to their own receipt. The
     amount is exact to the satang, so the split is done there. */
  const surchargeSatang = Math.round((Number(surchargeTHB) || 0) * 100);
  if (!totals.length || surchargeSatang <= 0) return totals.map(() => 0);

  /* The unit the split is done in.

     A whole-Baht surcharge — which is every real one, because gross and net
     are both whole Baht — is split into whole BAHT, so each room's stored
     total stays an integer like every other price in this system. Splitting a
     165 THB fee in satang would give rooms 80.46 and 84.54, and those figures
     then appear on the booking board, in a single-room cancellation email and
     in any sum of the group.

     Satang is the fallback for the only case that needs it: an admin who
     saved a fractional room rate, where a Baht-granular split could not sum
     to the fee exactly. */
  const unit = surchargeSatang % 100 === 0 ? 100 : 1;
  const units = surchargeSatang / unit;

  const sum = totals.reduce((s, n) => s + n, 0);
  // Every room free (or a zero-total cart): spread it evenly rather than
  // dividing by zero.
  const shares = totals.map((n) => (sum > 0 ? (n / sum) * units : units / totals.length));

  const floors = shares.map((s) => Math.floor(s));
  let remainder = units - floors.reduce((s, n) => s + n, 0);

  const order = shares
    .map((s, i) => ({ i, frac: s - Math.floor(s) }))
    .sort((a, b) => (b.frac - a.frac) || (a.i - b.i));

  const out = floors.slice();
  for (let k = 0; k < order.length && remainder > 0; k++, remainder--) {
    out[order[k].i] += 1;
  }
  return out.map((u) => (u * unit) / 100);
}

/* ── What rate are we ACTUALLY paying? ───────────────────────────────────
   The setting above is what the hotel believes; this is what the acquirer
   has really been deducting, derived from settled charges the same way the
   receipt derives it — fee ÷ amount, from the money itself, never from a
   remembered percentage.

   This is what makes the configured rate checkable. An acquirer that moves
   its rate, or a method quoted at one number and billed at another, shows up
   here as a difference an admin can see and correct, instead of as a slow
   shortfall nobody attributes to anything.

   Reads only paid charges with a recorded fee, grouped by method. Returns
   null for a method with no evidence — "we do not know" is a different
   answer from "zero". */
async function observedRates(days = 180) {
  const since = Number.isFinite(Number(days)) ? Math.max(1, Math.min(3650, Number(days))) : 180;
  try {
    const { rows } = await db.query(
      `SELECT payment_method AS method,
              COUNT(*)                       AS charges,
              SUM(payment_amount)            AS amount,
              SUM(payment_fee)               AS fee,
              SUM(payment_fee_vat)           AS fee_vat
         FROM guest_bookings
        WHERE payment_status = 'paid'
          AND payment_amount > 0
          AND payment_fee IS NOT NULL
          AND payment_livemode IS NOT FALSE
          AND payment_paid_at >= NOW() - ($1 || ' days')::interval
          -- One charge can back several rows of a group booking; counting
          -- each row would multiply one fee by the number of rooms.
          AND (group_ref IS NULL OR group_index = 1)
        GROUP BY payment_method`,
      [String(since)]
    );

    const out = {};
    rows.forEach((r) => {
      const amount = Number(r.amount) || 0;
      const fee = Number(r.fee) || 0;
      const feeVat = Number(r.fee_vat) || 0;
      if (!amount) return;
      out[r.method] = {
        charges: Number(r.charges) || 0,
        amount: round2(amount),
        fee: round2(fee),
        feeVat: round2(feeVat),
        // The acquirer's headline rate, and the all-in proportion. Both are
        // derived; neither is read from configuration.
        feeRate: round2((fee / amount) * 10000) / 10000,
        effectiveRate: round2(((fee + feeVat) / amount) * 10000) / 10000,
        vatRate: fee > 0 ? round2((feeVat / fee) * 10000) / 10000 : null,
      };
    });
    return out;
  } catch (e) {
    // A reporting nicety. It must never take down the page that shows it.
    console.error('[paymentFees] observedRates failed', (e && e.message) || e);
    return null;
  }
}

module.exports = {
  DEFAULT_PAYMENT_FEES,
  NO_FEE_METHODS,
  MAX_FEE_RATE,
  MAX_VAT_RATE,
  isValidFeeRate,
  isValidVatRate,
  mergeFees,
  getEffectiveFees,
  deductionRate,
  quote,
  quoteFor,
  allocateSurcharge,
  observedRates,
  round2,
  ceilBaht,
};
