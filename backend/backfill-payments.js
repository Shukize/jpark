#!/usr/bin/env node
/* ============================================================
   J Park Hotel — fill in the payment record for bookings that never got one.

   Run it:
       node backend/backfill-payments.js
       npm run backfill:payments          (from backend/)

   On Render: Dashboard -> the API service -> Shell, then run the line above.
   It needs exactly the environment the API already has — DATABASE_URL and the
   gateway keys — so there is nothing to configure.

   ── What it does ────────────────────────────────────────────────────────
   For every booking that has a gateway charge id but no captured detail, it
   asks the gateway what actually happened to that charge and writes the
   answer back: the card, the fee, the net, when the guest paid, and — for a
   charge the gateway says was paid but this database does not — it records
   the payment properly and sends the confirmation email that was missed.

   Then it resolves settlement: which bank transfer paid each charge out, and
   when the money landed.

   ── What it will NOT do ─────────────────────────────────────────────────
   • It never marks a booking paid on its own authority. Every "paid" comes
     from re-asking the gateway, and is written through the same atomic path
     the webhook and the reconciler use — so running this twice, or running it
     while a webhook arrives, cannot pay a booking twice or send a guest two
     confirmation emails.
   • It never touches a booking that already has its detail. Safe to re-run.
   • It never invents a booking for a charge that has none. A charge with no
     reservation is REPORTED, loudly, because that is a human problem: either
     a declined card (correct — a refused charge deliberately leaves no row)
     or money taken against a reservation that failed to write.
   ============================================================ */
require('dotenv').config();

const db = require('./db');
const payments = require('./lib/payments');
const ledger = require('./lib/paymentsLedger');
const PD = require('./lib/payments/detail');

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : fallback;
};
const limit = Number(arg('limit', 100));
const dryRun = process.argv.includes('--dry-run');

function money(v, currency) {
  if (v == null) return '—';
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .format(v) + ' ' + (currency || 'THB');
}

async function main() {
  /* The mode banner is not decoration. A test-key charge is identical to a
     real one in every field a person looks at, and a backfill run against
     test keys would quietly write play money into the hotel's books. */
  const mode = payments.mode();
  console.log('');
  console.log('  J Park Hotel — payment backfill');
  console.log('  ' + '-'.repeat(58));
  if (!payments.isConfigured()) {
    console.error('  No payment gateway is configured (no keys in the environment).');
    console.error('  Nothing to do. Set OMISE_SECRET_KEY and try again.');
    process.exitCode = 1;
    return;
  }
  const provider = payments.active();
  console.log(`  Gateway : ${provider.label} (${provider.id})`);
  console.log(`  Mode    : ${mode === 'live' ? 'LIVE — real money' : 'TEST — no real money moves'}`);
  if (mode !== 'live') {
    console.log('');
    console.log('  ⚠  Running against TEST keys. Anything written will be test data.');
  }
  console.log('');

  // ── 1. What is missing ────────────────────────────────────────────────
  const { rows: missing } = await db.query(
    `SELECT COUNT(*)::int AS n
       FROM guest_bookings
      WHERE payment_charge_id IS NOT NULL AND payment_detail IS NULL`
  );
  const { rows: unsettled } = await db.query(
    `SELECT COUNT(*)::int AS n
       FROM guest_bookings
      WHERE payment_status = 'paid'
        AND payment_charge_id IS NOT NULL
        AND payment_transfer_paid_at IS NULL`
  );
  console.log(`  Bookings with a charge but no payment record : ${missing[0].n}`);
  console.log(`  Paid bookings whose settlement is unresolved  : ${unsettled[0].n}`);
  console.log('');

  if (dryRun) {
    console.log('  --dry-run: stopping here without writing anything.');
    return;
  }

  // ── 2. Fill in the detail ─────────────────────────────────────────────
  if (missing[0].n) {
    console.log('  Asking the gateway about each charge...');
    const r = await ledger.runBackfill({ limit });
    if (!r.ok) {
      console.error('  Backfill could not run: ' + r.error);
    } else {
      console.log(`  Checked ${r.checked} · newly recorded as paid ${r.settled} · detail filled ${r.filled} · closed out ${r.closed} · errors ${r.failed}`);
      for (const d of r.details) {
        if (d.error) console.log(`    ! ${d.ref}: ${d.error}`);
        else if (d.action !== 'noop') console.log(`    · ${d.ref}: ${d.message}`);
      }
      // Never let a ceiling read as "nothing left".
      if (r.hitCap) console.log(`  NOTE: stopped at the ${limit} charge ceiling — run again to continue.`);
    }
    console.log('');
  }

  // ── 3. Where the money is ─────────────────────────────────────────────
  console.log('  Resolving settlement (which bank transfer paid each charge)...');
  const s = await ledger.refreshSettlement({ limit: Math.min(limit, 100) });
  if (!s.ok) console.error('  Could not resolve settlement: ' + s.error);
  else console.log(`  Checked ${s.checked} · updated ${s.updated}`);
  console.log('');

  // ── 4. Anything the gateway has that this database does not ───────────
  console.log('  Comparing recent gateway charges against the booking board...');
  const view = await ledger.buildLedger({ limit: 50 });
  if (!view.available) {
    console.log('  ' + view.reason);
  } else {
    const problems = view.charges.filter((c) => c.flags.some((f) => f.level === 'alert'));
    if (!problems.length) {
      console.log('  Every recent charge lines up with a booking. Nothing outstanding.');
    } else {
      console.log('');
      console.log(`  ${problems.length} charge(s) need a human:`);
      for (const c of problems) {
        console.log('');
        console.log(`    ${c.chargeId}  ${money(c.amount, c.currency)}  ${c.state}`);
        console.log(`      paid at : ${PD.formatBangkok(c.paidAt, { seconds: true }) || '—'}`);
        if (c.guest) console.log(`      guest   : ${c.guest.name || '—'} <${c.guest.email || '—'}>`);
        for (const f of c.flags) console.log(`      ${f.level === 'alert' ? '!!' : ' ·'} ${f.text}`);
      }
    }
  }

  // ── 5. The gateway's own balance ──────────────────────────────────────
  const bal = await ledger.accountBalance();
  if (bal) {
    console.log('');
    console.log('  Gateway balance');
    console.log(`    Total        : ${money(bal.total, bal.currency)}`);
    console.log(`    On hold      : ${money(bal.onHold, bal.currency)}   (captured, still clearing)`);
    console.log(`    Transferable : ${money(bal.transferable, bal.currency)}   (cleared — can be withdrawn)`);
    console.log(`    Reserve      : ${money(bal.reserve, bal.currency)}`);
  }
  console.log('');
}

main()
  .catch((e) => {
    console.error('');
    console.error('  Backfill failed:', (e && e.message) || e);
    process.exitCode = 1;
  })
  .finally(async () => {
    // Without this the pool keeps the process alive and the script never
    // exits — which on a Render shell looks like a hang, not a finished run.
    try { await db.end(); } catch (_) { /* already closed */ }
  });
