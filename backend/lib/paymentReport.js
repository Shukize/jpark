/* ============================================================
   J Park Hotel — the daily payments report.

   One email a day to the hotel's own inbox: what was taken, what it cost,
   what will actually reach the bank, what failed and why, and anything the
   gateway knows about that this database does not.

   ── Why a report at all, when every payment already emails ──────────────
   The per-payment notices answer "did this one work?". They cannot answer
   "how did yesterday go?", and they are silent about the thing that matters
   most — a charge the gateway has that the booking board does not, which by
   definition produces no notice here because nothing here knows about it.

   ── Why it does not run on a timer ──────────────────────────────────────
   Neon bills compute time, and any query wakes the database for a full
   autosuspend window; a once-a-minute scheduler would hold it awake
   permanently and burn the monthly allowance on an idle hotel. That exact
   mistake caused a real outage on this project.

   So this is triggered by the EXISTING 4x/day health workflow, which already
   wakes the database at those moments — the report rides along for free. It
   is called four times and sends once, because the first call of each Bangkok
   day claims the date with an INSERT ... ON CONFLICT DO NOTHING. Postgres
   arbitrates, not application-level locking, the same way the payment
   reconciler makes a webhook and a sweep safe together.
   ============================================================ */

const db = require('../db');
const payments = require('./payments');
const PD = require('./payments/detail');
const ledger = require('./paymentsLedger');
const T = require('./emailTemplate');
const { sendEmail } = require('../mailer');

function hotelRecipients() {
  return (process.env.HOTEL_NOTIFY_EMAIL || 'jparkhotel1@gmail.com')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function money(v, cur) {
  if (v == null) return '—';
  return (cur || 'THB') + ' ' + Number(v).toLocaleString('en-US', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
}

/* Claim today, in Bangkok. Returns false if somebody already has it.

   Done BEFORE any gateway call on purpose: two overlapping runs must not both
   spend a minute talking to the acquirer and then both discover they were the
   loser. The cheap, decisive step goes first. */
async function claimToday(dateStr) {
  const { rowCount } = await db.query(
    `INSERT INTO payment_report_log (report_date) VALUES ($1)
     ON CONFLICT (report_date) DO NOTHING`,
    [dateStr]
  );
  return rowCount === 1;
}

/* Everything that happened to a payment yesterday, from THIS database.

   Grouped by payment_charge_id rather than by row: a multi-room booking is N
   rows sharing one charge, and counting rows would report one guest's single
   payment as several. */
async function gatherLocal(since) {
  const { rows: paid } = await db.query(
    `SELECT payment_charge_id,
            MIN(payment_paid_at)   AS paid_at,
            MAX(payment_amount)    AS amount,
            MAX(payment_fee)       AS fee,
            MAX(payment_fee_vat)   AS fee_vat,
            MAX(payment_net)       AS net,
            MAX(payment_currency)  AS currency,
            MAX(payment_card_brand) AS card_brand,
            MAX(payment_card_last4) AS card_last4,
            MAX(payment_livemode)  AS livemode,
            MIN(guest_name)        AS guest_name,
            MIN(COALESCE(group_ref, ref)) AS booking_ref,
            COUNT(*)::int          AS rooms
       FROM guest_bookings
      WHERE payment_status = 'paid'
        AND payment_charge_id IS NOT NULL
        AND payment_paid_at >= $1
      GROUP BY payment_charge_id
      ORDER BY MIN(payment_paid_at)`,
    [since]
  );

  const { rows: attempts } = await db.query(
    `SELECT charge_id, guest_name, guest_email, guest_phone, room, amount,
            outcome, failure_code, failure_message, card_brand, card_last4, created_at
       FROM payment_attempts
      WHERE created_at >= $1 AND outcome IN ('declined', 'error')
      ORDER BY created_at`,
    [since]
  );

  const { rows: unpaid } = await db.query(
    `SELECT ref, guest_name, room, check_in, total, currency, payment_charge_id
       FROM guest_bookings
      WHERE payment_status IN ('pending', 'failed')
        AND payment_provider IS NOT NULL
        AND payment_provider <> 'in_person'
        AND created_at >= $1
      ORDER BY created_at`,
    [since]
  );

  return { paid, attempts, unpaid };
}

function buildReport({ dateStr, local, gatewayProblems, balance, mode }) {
  const cur = (local.paid[0] && local.paid[0].currency) || 'THB';
  const takings = local.paid.reduce((s, r) => s + Number(r.amount || 0), 0);
  const fees = local.paid.reduce((s, r) => s + Number(r.fee || 0) + Number(r.fee_vat || 0), 0);
  const net = local.paid.reduce((s, r) => s + Number(r.net || 0), 0);

  const headline = local.paid.length
    ? `${local.paid.length} payment${local.paid.length === 1 ? '' : 's'} · ${money(takings, cur)} taken · ${money(net, cur)} to the bank`
    : 'No online payments yesterday.';

  const lines = [
    `J Park Hotel — payments for ${dateStr}`,
    '',
    headline,
  ];
  if (mode === 'test') {
    lines.push('', 'TEST MODE — the gateway is running on test keys. None of the figures below are real money.');
  }

  let html =
    T.heading(`Payments — ${dateStr}`) +
    (mode === 'test'
      ? T.notice('alert', 'TEST MODE — the gateway is running on test keys. None of the figures below are real money.', { strong: true })
      : '') +
    T.notice(local.paid.length ? 'paid' : 'info', headline, { strong: true });

  if (local.paid.length) {
    lines.push('', '— Payments taken —');
    let rows = '';
    for (const r of local.paid) {
      const card = r.card_last4 ? `${r.card_brand || 'Card'} ••••${r.card_last4}` : 'PromptPay';
      const label = `${r.guest_name || '—'} · ${r.booking_ref || '—'}${r.rooms > 1 ? ` (${r.rooms} rooms)` : ''}`;
      lines.push(`  ${PD.formatBangkok(r.paid_at)} · ${money(r.amount, r.currency)} · ${card} · ${label}`);
      rows += T.row(label, `${money(r.amount, r.currency)} · ${card} · ${PD.formatBangkok(r.paid_at)}`);
    }
    lines.push('', `  Taken:      ${money(takings, cur)}`);
    lines.push(`  Gateway fee: ${money(fees, cur)}`);
    lines.push(`  Net to bank: ${money(net, cur)}`);
    html += T.table(rows) +
      T.table(
        T.row('Taken', money(takings, cur), { strong: true }) +
        T.row('Gateway fee', money(fees, cur)) +
        // The figure that will appear on the bank statement.
        T.row('Net to the bank', money(net, cur), { strong: true })
      );
  }

  /* Failed attempts are the part of this report that only exists because a
     decline now gets recorded at all. Each line is a guest who wanted to book
     and could not — somebody can call them. */
  if (local.attempts.length) {
    lines.push('', `— ${local.attempts.length} payment(s) refused —`);
    let rows = '';
    for (const a of local.attempts) {
      const reason = PD.describeFailure(a.failure_code, a.failure_message);
      const who = [a.guest_name, a.guest_email, a.guest_phone].filter(Boolean).join(' · ');
      lines.push(`  ${who || '—'} · ${money(a.amount, 'THB')} · ${reason}`);
      rows += T.row(who || '—', `${money(a.amount, 'THB')} — ${reason}`);
    }
    html += T.divider() +
      T.heading('Payments that were refused') +
      T.paragraph('These guests tried to book and their bank declined the card. No booking was created and they were not charged — most are fixed by the guest enabling online payments in their banking app, or by taking the booking over the phone.', { small: true, muted: true }) +
      T.table(rows);
  }

  if (local.unpaid.length) {
    lines.push('', `— ${local.unpaid.length} booking(s) still unpaid —`);
    let rows = '';
    for (const u of local.unpaid) {
      lines.push(`  ${u.ref} · ${u.guest_name || '—'} · ${u.room || '—'} · arriving ${String(u.check_in).slice(0, 10)} · ${money(u.total, u.currency)}`);
      rows += T.row(`${u.ref} · ${u.guest_name || '—'}`,
        `${u.room || '—'} · arriving ${String(u.check_in).slice(0, 10)} · ${money(u.total, u.currency)}`);
    }
    html += T.divider() +
      T.heading('Bookings still awaiting payment') +
      T.paragraph('The reservation stands and the room is held — collect at check-in.', { small: true, muted: true }) +
      T.table(rows);
  }

  /* The most important section, and the one nothing else can produce: charges
     the GATEWAY has that this database disagrees about. */
  if (gatewayProblems && gatewayProblems.length) {
    lines.push('', `— ${gatewayProblems.length} charge(s) need attention —`);
    let rows = '';
    for (const c of gatewayProblems) {
      const flag = (c.flags.find((f) => f.level === 'alert') || c.flags[0] || {}).text || '';
      lines.push(`  ${c.chargeId} · ${money(c.amount, c.currency)} · ${flag}`);
      rows += T.row(`${money(c.amount, c.currency)} · ${(c.guest && c.guest.name) || '—'}`, flag);
    }
    html += T.divider() +
      T.heading('Needs attention') +
      T.notice('alert', 'The payment gateway and the booking board disagree about these charges. Open the staff console → Payments and press Reconcile.', { strong: true }) +
      T.table(rows);
  }

  if (balance) {
    lines.push('', '— Gateway balance —',
      `  Total:        ${money(balance.total, balance.currency)}`,
      `  On hold:      ${money(balance.onHold, balance.currency)} (captured, still clearing)`,
      `  Transferable: ${money(balance.transferable, balance.currency)} (can be withdrawn)`,
      `  Reserve:      ${money(balance.reserve, balance.currency)}`);
    html += T.divider() +
      T.heading('Gateway balance') +
      T.table(
        T.row('Total balance', money(balance.total, balance.currency)) +
        T.row('On hold', `${money(balance.onHold, balance.currency)} — captured, still clearing`) +
        T.row('Available to withdraw', money(balance.transferable, balance.currency), { strong: true }) +
        T.row('Reserve', money(balance.reserve, balance.currency))
      );
  }

  return {
    subject: `Payments ${dateStr} — ${local.paid.length} paid, ${money(takings, cur)}`,
    text: lines.join('\n'),
    html: T.wrap({
      preheader: headline,
      accent: T.BRAND.gold,
      body: html,
    }),
    summary: {
      payments: local.paid.length, takings, fees, net,
      declines: local.attempts.length,
      unpaid: local.unpaid.length,
      needsAttention: (gatewayProblems || []).length,
    },
  };
}

/* Send yesterday's report, once per Bangkok day.

   `force` skips the once-a-day claim, for a human asking for it on demand. */
async function sendDailyReport({ force = false, date } = {}) {
  const dateStr = date || PD.bangkokDate(Date.now() - 24 * 60 * 60 * 1000);
  if (!force) {
    const mine = await claimToday(dateStr);
    if (!mine) return { sent: false, reason: 'already sent for ' + dateStr };
  }

  // Bangkok is UTC+7, so "yesterday in Bangkok" starts 31 hours before now at
  // the earliest. Using the date string directly keeps the boundary honest
  // rather than approximating with a rolling 24 hours.
  const since = new Date(dateStr + 'T00:00:00+07:00').toISOString();

  const local = await gatherLocal(since);

  let gatewayProblems = [];
  let balance = null;
  if (payments.supportsLedger()) {
    try {
      const view = await ledger.buildLedger({ limit: 50 });
      if (view.available) {
        gatewayProblems = view.charges.filter((c) => c.flags.some((f) => f.level === 'alert'));
      }
    } catch (e) {
      // A gateway that could not be reached must not stop the report the
      // hotel's own records can still produce.
      console.error('[payment-report] gateway comparison failed', (e && e.message) || e);
    }
    balance = await ledger.accountBalance();
  }

  const report = buildReport({ dateStr, local, gatewayProblems, balance, mode: payments.mode() });

  const to = hotelRecipients();
  if (!to.length) return { sent: false, reason: 'no recipients configured' };
  await sendEmail({ to, subject: report.subject, text: report.text, html: report.html });

  try {
    await db.query(
      `UPDATE payment_report_log SET summary = $2 WHERE report_date = $1`,
      [dateStr, JSON.stringify(report.summary)]
    );
  } catch (_) { /* the report went out; the bookkeeping is not worth failing for */ }

  return { sent: true, date: dateStr, summary: report.summary };
}

module.exports = { sendDailyReport, buildReport, claimToday };
