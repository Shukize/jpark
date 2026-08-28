/* ============================================================
   J Park Hotel — the payment detail record.

   ── What this is for ────────────────────────────────────────────────────
   Until this file existed, a charge told this system exactly one thing:
   whether it was paid. Everything else the gateway said — which card, whose
   bank, what the fee was, when the money actually moved, why a decline was a
   decline — was held in a local variable inside the adapter and then dropped
   on the floor.

   That is fine right up until somebody has to answer a real question:

     "A guest says they paid. Did they?"           -> paidAt, chargeId
     "Which card was this? They want a receipt."   -> card.brand + card.last4
     "The bank statement says 5,333.24, we
      charged 5,550. Where did 216.76 go?"         -> fee + feeVat + net
     "Why did this one fail?"                      -> failure.code/message
     "Is this real money or a test key?"           -> livemode
     "When does it reach our account?"             -> settlement (below)

   Every one of those answers already arrives in the charge object. This
   module is the single place that reads it, normalises it away from any one
   provider's spelling, and hands back a shape the database, the staff
   console, the receipt and the hotel's email all agree on.

   ── Why normalise at all ────────────────────────────────────────────────
   lib/payments/index.js exists so the acquirer is a deployment choice rather
   than a code choice. A detail object shaped like Omise's JSON would quietly
   undo that: every consumer would grow `charge.card.last_digits` and the seam
   would be decorative. So each adapter implements describeCharge() and
   answers in THIS vocabulary, and nothing downstream ever learns which
   gateway it is talking to.

   ── Two conventions that are easy to get wrong ──────────────────────────
   1. MONEY IS THB HERE, NOT SATANG. Omise's API talks in satang (1/100 THB),
      so `amount: 555000` is 5,550.00 THB. The division happens once, in the
      adapter, at the edge. Anything downstream that has to remember the unit
      is a future off-by-100 on a receipt.
   2. THE FULL CARD NUMBER DOES NOT EXIST HERE AND NEVER WILL. Omise.js
      tokenises in the guest's browser, so this server only ever sees a token
      and, afterwards, the last four digits. Brand + last 4 + expiry + issuing
      bank is the complete set any merchant is given; storing more would
      breach PCI-DSS even if the gateway offered it. See SNAPSHOT_ALLOWLIST.
   ============================================================ */

/* Fields copied verbatim into the stored JSONB snapshot.

   An ALLOWLIST, deliberately, not a denylist: a provider adding a field to
   its API response must not be able to add it to this hotel's database
   without somebody deciding to. The one that matters is card data — a
   denylist that forgot a newly-added `number` would silently start storing
   PANs.

   Excluded on purpose even though they are harmless-looking:
     authorize_uri  a live, single-use 3-D Secure URL — a credential, and it
                    would end up in an email and a staff console
     card.fingerprint  a stable cross-merchant identifier for one physical
                    card; nothing here needs it and it is a tracking vector
     source.scannable_code  a QR that authorises a payment
     customer / card.id  reusable payment instruments this hotel never uses */
const SNAPSHOT_ALLOWLIST = [
  'object', 'id', 'status', 'livemode', 'currency',
  'amount', 'fee', 'fee_vat', 'net', 'funding_amount', 'refunded_amount',
  'paid', 'paid_at', 'created_at', 'expires_at',
  'authorized', 'captured', 'reversed', 'disputed',
  'transaction', 'description',
  'failure_code', 'failure_message',
  'source_type', 'card_brand', 'card_last_digits', 'card_bank',
  'card_country', 'card_financing', 'card_name',
  'card_expiration_month', 'card_expiration_year',
];

/* Human sentences for the acquirer codes that actually happen.

   The guest is never shown any of this — a raw decline reason handed back
   over a public endpoint is an oracle for card testing, and "insufficient
   funds" told to the wrong person is a small cruelty. This is for STAFF, on
   the booking board and in the hotel's own inbox, so that "why did this
   fail?" has an answer that does not require logging into the gateway.

   The hotel's live dashboard read "100% payment rejected by issuer" for a
   week; it took a gateway login to discover that the one rejected attempt was
   a TEST card number used against live keys. That is the class of question
   this table is here to answer in place. */
const FAILURE_TEXT = {
  insufficient_fund: 'The card had insufficient funds.',
  stolen_or_lost_card: 'The bank reported the card as lost or stolen.',
  failed_processing: 'The bank could not process the card. The guest should try another card.',
  payment_rejected: 'The card’s own bank rejected the payment. This is usually a card that is not enabled for online or overseas use — the guest can normally switch that on in their banking app — or a test card number used against live keys.',
  invalid_security_code: 'The CVC / security code did not match.',
  invalid_account_number: 'The card number was not valid.',
  not_supported: 'The bank does not support this kind of payment.',
  failed_fraud_check: 'The payment was stopped by a fraud check.',
  expired_card: 'The card has expired.',
  confirmed_amount_mismatch: 'The amount confirmed by the guest did not match the charge.',
  invalid_card: 'The card details were not accepted.',
  card_rejected: 'The card was rejected.',
  timeout: 'The payment was not completed in time.',
  expired: 'The PromptPay QR code expired before it was scanned.',
};

/* Plain-language failure text for staff.

   Falls back to the gateway's own message, then to the raw code, rather than
   to a generic sentence: an unrecognised code is exactly the case where the
   verbatim value is the useful thing, and swallowing it would leave staff
   with less than the dashboard already shows them. */
function describeFailure(code, message) {
  const key = String(code || '').trim();
  if (key && FAILURE_TEXT[key]) return FAILURE_TEXT[key];
  const raw = String(message || '').trim();
  if (raw) return raw;
  if (key) return `The gateway reported "${key}".`;
  return '';
}

/* Satang -> THB. Returns null (not 0) for an absent value, because "no fee
   recorded" and "a fee of zero" are different facts on a receipt. */
function fromMinorUnit(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) / 100 : null;
}

// 'MM/YYYY', zero-padded, formatted once here so no consumer has to.
function formatExpiry(month, year) {
  const m = Number(month);
  const y = Number(year);
  if (!Number.isFinite(m) || !Number.isFinite(y) || m < 1 || m > 12) return null;
  return String(m).padStart(2, '0') + '/' + String(y);
}

/* The hotel reads times in Bangkok, always — staff, guests and the owner are
   all in ICT, and a receipt showing a 15:50 payment as 08:50 UTC is a support
   call. Fixed to Asia/Bangkok rather than the server's zone, because the
   server is in whichever region Render happens to run it.

   Returns '' for an absent/unparseable timestamp so a caller can print it
   directly next to a label without an undefined leaking into an email. */
function formatBangkok(value, opts) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return '';
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric', month: 'short', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
      ...(opts && opts.seconds ? { second: '2-digit' } : {}),
      hour12: false,
    }).format(d);
    return parts + ' ICT';
  } catch (_) {
    // Intl without full tz data (a stripped container) must not take an email
    // down; ISO is worse to read but never wrong.
    return d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  }
}

// Date only, Bangkok — for a report titled by day.
function bangkokDate(value) {
  const d = value ? new Date(value) : new Date();
  if (isNaN(d.getTime())) return null;
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(d);
  } catch (_) {
    return d.toISOString().slice(0, 10);
  }
}

/* A blank detail record. Every consumer can read every key without guarding,
   which is what keeps `undefined` out of emails and receipts. */
function emptyDetail() {
  return {
    provider: null, chargeId: null, transactionId: null,
    status: null, state: null, livemode: null,
    method: null,
    amount: null, currency: null, fee: null, feeVat: null, net: null,
    refundedAmount: null,
    paidAt: null, createdAt: null, expiresAt: null,
    card: null,
    threeDS: null,
    failure: null,
    settlement: null,
    snapshot: null,
  };
}

/* Flatten a detail record onto the guest_bookings payment_* columns.

   One function so the four write paths (the inline card charge, the group
   insert, the reconciler's settle, the ledger backfill) cannot drift into
   writing different subsets of the same fact. Keys are column names.

   Every value may be null: a PromptPay charge has no card, a pending charge
   has no fee, and writing those as zeroes would turn "not known yet" into
   "known to be nothing". */
function toColumns(detail) {
  const d = detail || emptyDetail();
  const c = d.card || {};
  const f = d.failure || {};
  const s = d.settlement || {};
  return {
    payment_amount: d.amount,
    payment_currency: d.currency,
    payment_fee: d.fee,
    payment_fee_vat: d.feeVat,
    payment_net: d.net,
    payment_refunded_amount: d.refundedAmount,
    payment_paid_at: d.paidAt,
    payment_transaction_id: d.transactionId,
    payment_card_brand: c.brand || null,
    payment_card_last4: c.last4 || null,
    payment_card_expiry: c.expiry || null,
    payment_card_bank: c.bank || null,
    payment_card_country: c.country || null,
    payment_card_funding: c.funding || null,
    payment_3ds: d.threeDS,
    payment_failure_code: f.code || null,
    payment_failure_message: f.message || null,
    payment_livemode: d.livemode,
    payment_transferable_at: s.transferableAt || null,
    payment_transfer_id: s.transferId || null,
    payment_transfer_sent_at: s.sentAt || null,
    payment_transfer_paid_at: s.paidAt || null,
    payment_transfer_bank: s.bank || null,
    payment_transfer_last4: s.last4 || null,
    payment_detail: d.snapshot ? JSON.stringify(d.snapshot) : null,
    payment_detail_at: d.snapshot ? new Date().toISOString() : null,
  };
}

/* The inverse of toColumns(): rebuild a detail record from a stored booking
   row.

   This is what lets a payment be described completely LONG after the gateway
   call that produced it — a receipt printed at check-in three weeks later, a
   confirmation email the reconciler sends when a webhook finally lands, a
   monthly report. Without it, only the code path holding the live charge
   object could render a full payment, and everything else would fall back to
   "paid, ref chrg_...".

   Reads the flat columns rather than the JSONB snapshot, because the columns
   are the fields with defined meaning; the snapshot is the archive. Returns
   null when the row carries no payment at all, so an OTA or pay-at-check-in
   booking stays distinguishable from an online one with missing detail. */
function fromColumns(row) {
  if (!row) return null;
  const num = (v) => (v == null || v === '' ? null : Number(v));
  const has = row.payment_charge_id || row.payment_amount != null ||
    row.payment_card_last4 || row.payment_failure_code || row.payment_paid_at;
  if (!has) return null;

  const card = (row.payment_card_brand || row.payment_card_last4 || row.payment_card_bank) ? {
    brand: row.payment_card_brand || null,
    last4: row.payment_card_last4 || null,
    expiry: row.payment_card_expiry || null,
    // The cardholder name is not given its own column — it is not something
    // this hotel filters or sums on — so it comes back out of the snapshot.
    name: (row.payment_detail && row.payment_detail.card_name) || null,
    bank: row.payment_card_bank || null,
    country: row.payment_card_country || null,
    funding: row.payment_card_funding || null,
  } : null;

  const settlement = (row.payment_transferable_at || row.payment_transfer_id) ? {
    transactionId: row.payment_transaction_id || null,
    transferableAt: row.payment_transferable_at || null,
    transferId: row.payment_transfer_id || null,
    sentAt: row.payment_transfer_sent_at || null,
    paidAt: row.payment_transfer_paid_at || null,
    bank: row.payment_transfer_bank || null,
    last4: row.payment_transfer_last4 || null,
    state: row.payment_transfer_paid_at ? 'paid_out'
      : row.payment_transfer_sent_at ? 'sent'
      : (row.payment_transferable_at && new Date(row.payment_transferable_at).getTime() <= Date.now())
        ? 'transferable' : 'on_hold',
  } : null;

  return {
    provider: row.payment_provider || null,
    chargeId: row.payment_charge_id || null,
    transactionId: row.payment_transaction_id || null,
    status: null,
    state: row.payment_status || null,
    livemode: typeof row.payment_livemode === 'boolean' ? row.payment_livemode : null,
    method: row.payment_method || null,
    // node-postgres hands NUMERIC back as a STRING, not a number, so every
    // money column has to be coerced here. Skipped, a receipt would print
    // "5550.00" where a total is summed and produce string concatenation
    // wherever one is added.
    amount: num(row.payment_amount),
    currency: row.payment_currency || row.currency || null,
    fee: num(row.payment_fee),
    feeVat: num(row.payment_fee_vat),
    net: num(row.payment_net),
    refundedAmount: num(row.payment_refunded_amount),
    paidAt: row.payment_paid_at || null,
    createdAt: row.created_at || null,
    expiresAt: null,
    card,
    threeDS: row.payment_3ds || null,
    failure: (row.payment_failure_code || row.payment_failure_message) ? {
      code: row.payment_failure_code || null,
      message: row.payment_failure_message || null,
      text: describeFailure(row.payment_failure_code, row.payment_failure_message),
    } : null,
    settlement,
    snapshot: row.payment_detail || null,
  };
}

/* Build the SET clause of an UPDATE from a detail record.

   COALESCE($n, column) on every field, deliberately: a later, thinner answer
   about the same charge must never blank a fact an earlier, richer one
   already recorded. The reconciler's verify() returns a full charge, but a
   webhook re-delivery or a partial gateway response can return less — and a
   settlement refresh knows about transfers while knowing nothing about the
   card. Under plain assignment, each of those would erase the others.

   `startAt` is the first placeholder number, so a caller can put its own
   parameters ahead of these. Returns { clause, values, nextIndex }. */
function updateSet(detail, startAt) {
  const cols = toColumns(detail);
  const clause = [];
  const values = [];
  let i = startAt || 1;
  for (const [col, val] of Object.entries(cols)) {
    // An entirely absent fact contributes no assignment at all, rather than a
    // COALESCE(NULL, col) no-op — it keeps the statement short and makes the
    // intent readable in a query log.
    if (val === undefined || val === null) continue;
    clause.push(`${col} = COALESCE($${i}, ${col})`);
    values.push(val);
    i += 1;
  }
  return { clause: clause.join(', '), values, nextIndex: i };
}

/* Is there anything worth writing? Used to skip a pointless UPDATE on a
   charge the gateway told us nothing new about. */
function hasDetail(detail) {
  if (!detail) return false;
  return Object.values(toColumns(detail)).some((v) => v !== null && v !== undefined);
}

/* Copy only allowlisted keys out of a flattened raw object. Adapters flatten
   their own nesting (card.brand -> card_brand) before calling this, so the
   allowlist stays a flat list of names rather than a path grammar. */
function snapshotOf(flat) {
  if (!flat || typeof flat !== 'object') return null;
  const out = {};
  for (const key of SNAPSHOT_ALLOWLIST) {
    if (flat[key] !== undefined && flat[key] !== null && flat[key] !== '') out[key] = flat[key];
  }
  return Object.keys(out).length ? out : null;
}

/* A one-line description of the card, for a list row or an email subject:
   "Visa •••• 4242". Returns '' rather than a placeholder when there is no
   card, so a PromptPay payment does not render as an empty card. */
function cardLabel(detail) {
  const c = (detail && detail.card) || null;
  if (!c || !c.last4) return '';
  return `${c.brand || 'Card'} •••• ${c.last4}`;
}

module.exports = {
  SNAPSHOT_ALLOWLIST,
  FAILURE_TEXT,
  describeFailure,
  fromMinorUnit,
  formatExpiry,
  formatBangkok,
  bangkokDate,
  emptyDetail,
  toColumns,
  fromColumns,
  updateSet,
  hasDetail,
  snapshotOf,
  cardLabel,
};
