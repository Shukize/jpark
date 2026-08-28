/* ============================================================
   J Park Hotel — the payments ledger.

   ── The question this answers ───────────────────────────────────────────
   "There was a payment today, I think. Where is it?"

   Until now the only honest answer was "log into the acquirer's dashboard and
   compare it against the booking board by eye". Two systems hold half the
   truth each: the gateway knows every charge that was ever attempted, and
   this database knows every booking — and the failure modes that matter all
   live in the gap between them.

     • A charge PAID at the gateway whose booking still says pending.
       This is the expensive one. Omise does not retry a failed webhook
       delivery, so one missed notification means the guest's money is gone,
       the gateway shows it as successful, and the front desk charges them a
       second time at check-in. paymentReconciler.js is the automatic guard;
       this is the one a human can look at.

     • A charge with NO booking at all. Either a decline (correct — the route
       rolls back so a refused card leaves nothing behind), or money taken
       against a reservation that failed to write, which is the worst
       possible state and previously invisible.

     • A booking whose payment detail was never captured — every booking made
       before those columns existed, including the ones already paid.

     • A FAILED charge nobody was told about. The hotel's dashboard read
       "100% payment rejected by issuer" for a week; the reason (a test card
       number used against live keys) took a gateway login to discover.

   ── Cost discipline ─────────────────────────────────────────────────────
   Reads the gateway freely — those calls are free and don't wake Postgres —
   but touches the database once per page, with one ANY($1) lookup for the
   whole batch rather than a query per charge. Nothing here runs on a timer.
   Neon bills compute time and any query wakes it for a full autosuspend
   window; a polling ledger would hold the database awake permanently, which
   is precisely the mistake that caused a real outage on this project.
   ============================================================ */

const db = require('../db');
const payments = require('./payments');
const PD = require('./payments/detail');
const reconciler = require('../paymentReconciler');

// A hard ceiling on one page, so neither a backlog nor a bug can turn into an
// unbounded burst of gateway calls or a giant response.
const MAX_PAGE = 100;
const DEFAULT_PAGE = 40;

/* Charges are matched to bookings by payment_charge_id, which is the only key
   both systems share. One charge may match SEVERAL booking rows — a multi-room
   group is N rows sharing one charge — so this returns a list per charge and
   the caller must never treat the count of rows as a count of payments. */
async function bookingsForCharges(chargeIds) {
  if (!chargeIds.length) return new Map();
  const { rows } = await db.query(
    `SELECT id, ref, group_ref, group_index, guest_name, guest_last_name, guest_email,
            room, room_number, check_in, check_out, total, currency, status,
            payment_charge_id, payment_status, payment_method, payment_provider,
            payment_amount, payment_net, payment_paid_at, payment_detail,
            payment_transfer_paid_at
       FROM guest_bookings
      WHERE payment_charge_id = ANY($1)`,
    [chargeIds]
  );
  const map = new Map();
  for (const r of rows) {
    const key = r.payment_charge_id;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(r);
  }
  return map;
}

/* Locally-recorded attempts for the same charges — including the declines
   that deliberately have no booking row, which is how a refused card gets a
   guest name and an email address attached to it here. */
async function attemptsForCharges(chargeIds) {
  if (!chargeIds.length) return new Map();
  const { rows } = await db.query(
    `SELECT charge_id, booking_ref, guest_name, guest_email, guest_phone,
            room, check_in, check_out, amount, outcome, failure_code, created_at
       FROM payment_attempts
      WHERE charge_id = ANY($1)`,
    [chargeIds]
  );
  const map = new Map();
  for (const r of rows) if (!map.has(r.charge_id)) map.set(r.charge_id, r);
  return map;
}

/* What is wrong with this charge, if anything. Ordered most-urgent first, and
   phrased as something a person can act on rather than as a status code. */
function flagsFor(detail, bookings, attempt) {
  const flags = [];
  const paidAtGateway = detail.state === 'paid';
  const rows = bookings || [];

  if (paidAtGateway && !rows.length && !attempt) {
    flags.push({
      level: 'alert',
      code: 'paid_no_booking',
      text: 'Paid at the gateway, but there is no booking for it. Money was taken and the reservation was not written — reconcile this first.',
    });
  } else if (paidAtGateway && rows.length && rows.some((r) => r.payment_status !== 'paid')) {
    flags.push({
      level: 'alert',
      code: 'paid_not_recorded',
      text: 'Paid at the gateway, but the booking is not marked paid. The webhook was probably missed — reconcile it, or the guest will be charged again at check-in.',
    });
  }

  if (paidAtGateway && rows.length && rows.every((r) => !r.payment_detail)) {
    flags.push({
      level: 'info',
      code: 'detail_missing',
      text: 'Paid, but the card and fee detail was never captured. Reconcile to fill it in.',
    });
  }

  if (detail.state === 'failed' || detail.state === 'expired') {
    flags.push({
      level: 'warn',
      code: 'failed',
      text: (detail.failure && detail.failure.text) ||
        (detail.state === 'expired' ? 'The PromptPay QR expired before it was scanned.' : 'The payment failed.'),
    });
  }

  if (detail.livemode === false) {
    flags.push({
      level: 'warn',
      code: 'test_mode',
      text: 'TEST MODE — no real money moved. Do not count this as income.',
    });
  }

  if (detail.state === 'pending') {
    flags.push({
      level: 'info',
      code: 'pending',
      text: 'Still in flight — the guest has not finished paying (an unscanned QR, or a bank verification they have not completed).',
    });
  }

  return flags;
}

/* Where the money is now, in words. The three states an owner actually cares
   about, kept distinct because the action differs: wait, withdraw, done. */
function settlementLabel(settlement) {
  if (!settlement) return null;
  switch (settlement.state) {
    case 'paid_out':     return 'Paid into the bank';
    case 'sent':         return 'Transfer sent to the bank';
    case 'scheduled':    return 'Transfer scheduled';
    case 'transferable': return 'Cleared — available to withdraw';
    default:             return 'On hold (still clearing)';
  }
}

/* One page of the ledger.

   `from`/`to` are ISO timestamps passed straight to the gateway. Omitting
   them lists the most recent charges, which is what "is there a payment
   today?" wants — and note that a gateway dashboard's own "last 7 days"
   summary may END yesterday, so a payment made today can be missing from it
   while being perfectly present here. */
async function buildLedger({ from, to, limit = DEFAULT_PAGE, offset = 0 } = {}) {
  if (!payments.supportsLedger()) {
    return {
      available: false,
      reason: payments.isConfigured()
        ? 'This payment provider cannot list charges.'
        : 'No payment gateway is configured, so there is nothing to list.',
      charges: [],
    };
  }

  const page = Math.min(Math.max(Number(limit) || DEFAULT_PAGE, 1), MAX_PAGE);
  const listed = await payments.listCharges({ limit: page, offset, from, to });
  const raw = (listed && (listed.data || listed)) || [];
  const charges = Array.isArray(raw) ? raw : [];

  // ONE transfer list for the whole page. Omise offers no "which transfer
  // paid this charge" lookup, so the join is done here — fetching per charge
  // would be forty calls to answer one screen.
  let transfers = [];
  try {
    const t = await payments.listTransfers({ limit: 30 });
    transfers = (t && (t.data || t)) || [];
  } catch (e) {
    // Settlement is extra information, never the point of the screen. A
    // transfer list that fails degrades every row to "on hold" rather than
    // failing the ledger.
    console.error('[ledger] transfer list failed', (e && e.message) || e);
  }

  const details = charges.map((c) => payments.describeCharge(c)).filter(Boolean);
  const ids = details.map((d) => d.chargeId).filter(Boolean);

  let bookingMap = new Map();
  let attemptMap = new Map();
  try {
    [bookingMap, attemptMap] = await Promise.all([
      bookingsForCharges(ids),
      attemptsForCharges(ids),
    ]);
  } catch (e) {
    // The gateway half is the half that cannot be reconstructed. Show it even
    // if Postgres is asleep or unhappy, and say so.
    console.error('[ledger] booking lookup failed', (e && e.message) || e);
  }

  const rows = details.map((detail) => {
    const bookings = bookingMap.get(detail.chargeId) || [];
    const attempt = attemptMap.get(detail.chargeId) || null;
    const settlement = payments.resolveSettlement(detail.transactionId, null, transfers);
    const first = bookings[0] || null;
    return {
      chargeId: detail.chargeId,
      state: detail.state,
      status: detail.status,
      livemode: detail.livemode,
      method: detail.method,
      amount: detail.amount,
      currency: detail.currency,
      fee: detail.fee,
      feeVat: detail.feeVat,
      net: detail.net,
      // The two dates the owner asked for, kept apart on purpose.
      paidAt: detail.paidAt,
      createdAt: detail.createdAt,
      settlement: settlement ? Object.assign({}, settlement, { label: settlementLabel(settlement) }) : null,
      card: detail.card,
      threeDS: detail.threeDS,
      failure: detail.failure,
      // Who this was. A charge with no booking still has a name, because the
      // attempt was recorded before the booking was rolled back.
      guest: first
        ? {
            name: [first.guest_name, first.guest_last_name].filter(Boolean).join(' '),
            email: first.guest_email,
            // The room TYPE. `room_number` is the physical room, assigned by
            // the front desk, and is often not set yet.
            roomType: first.room,
            roomNumber: first.room_number,
            checkIn: first.check_in,
            checkOut: first.check_out,
          }
        : attempt
          ? {
              name: attempt.guest_name, email: attempt.guest_email,
              roomType: attempt.room, roomNumber: null,
              checkIn: attempt.check_in, checkOut: attempt.check_out,
            }
          : null,
      bookings: bookings.map((b) => ({
        id: b.id, ref: b.ref, groupRef: b.group_ref,
        status: b.status, paymentStatus: b.payment_status,
        total: b.total == null ? null : Number(b.total),
        hasDetail: !!b.payment_detail,
      })),
      attemptOutcome: attempt ? attempt.outcome : null,
      flags: flagsFor(detail, bookings, attempt),
    };
  });

  return {
    available: true,
    mode: payments.mode(),
    charges: rows,
    // Whether another page exists. Omise reports a total; fall back to "a full
    // page came back, so probably yes" when it does not.
    hasMore: listed && typeof listed.total === 'number'
      ? offset + rows.length < listed.total
      : rows.length === page,
    offset,
  };
}

/* The hotel's money, as the gateway sees it — the four figures on its
   dashboard, so nobody has to log in to read them.

   `on_hold` is absent on some API versions; derived rather than left blank,
   because "on hold" is the number an owner is actually looking for when the
   transferable balance reads zero. */
async function accountBalance() {
  if (!payments.isConfigured()) return null;
  try {
    const b = await payments.balance();
    if (!b) return null;
    const total = PD.fromMinorUnit(b.total);
    const transferable = PD.fromMinorUnit(b.transferable);
    const reserve = PD.fromMinorUnit(b.reserve) || 0;
    const onHold = b.on_hold != null
      ? PD.fromMinorUnit(b.on_hold)
      : (total != null && transferable != null ? Number((total - transferable - reserve).toFixed(2)) : null);
    return {
      currency: String(b.currency || 'thb').toUpperCase(),
      livemode: typeof b.livemode === 'boolean' ? b.livemode : null,
      total, transferable, reserve, onHold,
    };
  } catch (e) {
    console.error('[ledger] balance failed', (e && e.message) || e);
    return null;
  }
}

/* Bring one charge into line with what the gateway says.

   Goes through payments.verify -> reconciler.settle, NOT through its own
   UPDATE. That matters: settle() owns the atomic `payment_status != 'paid'`
   flip that makes a webhook, a scheduled sweep and this button safe to race,
   and it owns the confirmation email. A second implementation here would be a
   second way to email a guest twice about one payment. */
async function reconcileCharge(chargeId) {
  if (!chargeId) return { ok: false, error: 'No charge id' };
  let verified;
  try {
    verified = await payments.verify(chargeId);
  } catch (e) {
    return { ok: false, error: 'Could not reach the payment gateway: ' + ((e && e.message) || 'unknown error') };
  }

  const detail = verified.detail || null;

  if (verified.paid) {
    const outcome = await reconciler.settle(chargeId, verified);
    if (outcome.settled) {
      return { ok: true, action: 'settled', rows: outcome.rows,
               message: `Recorded as paid (${outcome.rows} booking row(s)) and the confirmation email has been sent.` };
    }
    // Already paid here. Still worth writing the detail — this is the ordinary
    // case for a booking made before these columns existed.
    const wrote = await reconciler.recordDetail(chargeId, detail);
    return { ok: true, action: wrote ? 'detail' : 'noop', rows: wrote,
             message: wrote
               ? `Already recorded as paid; filled in the payment detail on ${wrote} booking row(s).`
               : 'Already recorded as paid, with its detail — nothing to do.' };
  }

  if (verified.state === 'failed' || verified.state === 'expired') {
    const n = await reconciler.markUnpaid(chargeId, verified.state, detail);
    return { ok: true, action: 'closed', rows: n,
             message: n
               ? `Closed out as unpaid on ${n} booking row(s); the front desk should collect at check-in.`
               : 'The gateway reports this as unpaid; no booking was waiting on it.' };
  }

  const wrote = await reconciler.recordDetail(chargeId, detail);
  // Hand it back to the timer chain so it keeps being watched rather than
  // waiting for the next sweep.
  reconciler.watch(chargeId);
  return { ok: true, action: 'pending', rows: wrote,
           message: 'Still in flight at the gateway — the guest has not finished paying. Now being watched.' };
}

/* Fill in the payment detail for bookings that never got it.

   Scans for the rows the partial index in schema.sql was built for — a charge
   id, but no detail — and asks the gateway about each. Sequential on purpose:
   a handful of charges at most, and this must never become a burst of
   parallel calls against the gateway or the connection pool. */
async function runBackfill({ limit = 50 } = {}) {
  if (!payments.isConfigured()) {
    return { ok: false, error: 'No payment gateway is configured.' };
  }
  const cap = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const { rows } = await db.query(
    `SELECT DISTINCT payment_charge_id
       FROM guest_bookings
      WHERE payment_charge_id IS NOT NULL
        AND payment_detail IS NULL
      ORDER BY payment_charge_id
      LIMIT $1`,
    [cap]
  );
  const refs = rows.map((r) => r.payment_charge_id).filter(Boolean);
  const results = { checked: 0, settled: 0, filled: 0, closed: 0, failed: 0, details: [] };
  for (const ref of refs) {
    results.checked += 1;
    try {
      const r = await reconcileCharge(ref);
      if (!r.ok) { results.failed += 1; results.details.push({ ref, error: r.error }); continue; }
      if (r.action === 'settled') results.settled += 1;
      else if (r.action === 'detail') results.filled += 1;
      else if (r.action === 'closed') results.closed += 1;
      results.details.push({ ref, action: r.action, message: r.message });
    } catch (e) {
      results.failed += 1;
      results.details.push({ ref, error: (e && e.message) || 'unknown error' });
    }
  }
  // Never silently truncate: a run that stopped at its ceiling must say so,
  // or "0 remaining" is read into it.
  results.hitCap = refs.length === cap;
  return Object.assign({ ok: true }, results);
}

/* Work out which bank transfer actually paid each recent charge out.

   Settlement is the half of a payment that only exists AFTER the charge:
   nothing about a transfer is knowable when the guest pays, so this cannot be
   captured at charge time and has to be resolved later. It answers the
   question a booking row alone never can — "the guest paid on the 28th, when
   does the hotel actually have the money?"

   One transfer list, one transaction lookup per unsettled charge, one UPDATE
   each. Bounded, and only ever run on demand or from the existing 4x/day
   schedule. */
async function refreshSettlement({ limit = 40 } = {}) {
  if (!payments.isConfigured() || !payments.listTransfers) {
    return { ok: false, error: 'No payment gateway is configured.' };
  }
  const cap = Math.min(Math.max(Number(limit) || 40, 1), 100);
  const { rows } = await db.query(
    `SELECT DISTINCT payment_charge_id, payment_transaction_id
       FROM guest_bookings
      WHERE payment_status = 'paid'
        AND payment_charge_id IS NOT NULL
        AND payment_transfer_paid_at IS NULL
      ORDER BY payment_charge_id
      LIMIT $1`,
    [cap]
  );
  if (!rows.length) return { ok: true, checked: 0, updated: 0 };

  let transfers = [];
  try {
    const t = await payments.listTransfers({ limit: 50 });
    transfers = (t && (t.data || t)) || [];
  } catch (e) {
    return { ok: false, error: 'Could not read transfers: ' + ((e && e.message) || 'unknown error') };
  }

  let updated = 0;
  for (const r of rows) {
    try {
      let txnId = r.payment_transaction_id;
      let txn = null;
      // A booking recorded before the detail columns existed has no
      // transaction id; re-ask the gateway for the charge to get one.
      if (!txnId) {
        const v = await payments.verify(r.payment_charge_id);
        txnId = v && v.detail && v.detail.transactionId;
        if (v && v.detail) await reconciler.recordDetail(r.payment_charge_id, v.detail);
      }
      if (!txnId) continue;
      try { txn = await payments.retrieveTransaction(txnId); } catch (_) { txn = null; }
      const settlement = payments.resolveSettlement(txnId, txn, transfers);
      if (!settlement) continue;
      const wrote = await reconciler.recordDetail(r.payment_charge_id, { settlement, transactionId: txnId });
      if (wrote) updated += 1;
    } catch (e) {
      console.error('[ledger] settlement refresh', r.payment_charge_id, (e && e.message) || e);
    }
  }
  return { ok: true, checked: rows.length, updated, hitCap: rows.length === cap };
}

module.exports = {
  buildLedger,
  accountBalance,
  reconcileCharge,
  runBackfill,
  refreshSettlement,
  settlementLabel,
  MAX_PAGE,
};
