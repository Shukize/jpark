/* ============================================================
   J Park Hotel — payment reconciliation: the safety net under the webhook.

   ── Why this file exists ────────────────────────────────────────────────
   Omise's own documentation is explicit: "Omise does not currently guarantee
   automatic retries for failed deliveries", and its recommended fallback is
   to poll. So the webhook is a fast path, not a guarantee. If a single
   delivery is missed — a Render deploy restarting the process mid-flight, a
   Neon cold start timing out the DB write, a transient network fault, a
   webhook URL that was never registered in the first place — then nothing
   else in the system would ever learn that the guest paid.

   The failure is silent and it is the worst kind: the guest's money is gone,
   Omise shows the charge as successful, and the hotel's own booking board
   still says "awaiting payment" — so the front desk charges them a second
   time at check-in. Nobody finds out until a guest disputes it.

   Every asynchronous payment is therefore watched from two directions:

     1. WEBHOOK (fast)   routes/payments.js — usually lands within seconds.
     2. RECONCILER (sure) this file — re-asks Omise directly, on a schedule,
                          until the charge reaches a settled state.

   Whichever gets there first wins, and the loser is a harmless no-op: the
   flip to 'paid' is a single atomic UPDATE guarded by `payment_status !=
   'paid'`, so exactly one of the two can ever match a row and send an email.
   Postgres does that arbitration, not application-level locking.

   ── Why it is not simply a timer ────────────────────────────────────────
   The obvious implementation — poll the database every minute for pending
   payments — is the wrong one HERE, and expensively so. Neon's Free plan
   bills compute time, and any query wakes the compute for a full ~5-minute
   autosuspend window. A once-a-minute sweep would hold the database awake
   permanently and burn the entire monthly allowance on an idle hotel; that
   exact mistake already caused a real outage on this project (see the
   /health/db split in .github/workflows/health-check.yml).

   So the reconciler is EVENT-DRIVEN and costs nothing at rest:

     • watch(chargeRef) is called only when an asynchronous charge is actually
       created, and schedules in-process re-checks on a backoff. No bookings,
       no timers, no database traffic.
     • Those re-checks hit OMISE first and only touch Postgres once a charge
       has actually settled — so a guest who walks away from a QR code costs
       one Omise API call per attempt and zero database wakes.
     • sweep() is the backstop for the one case timers cannot cover — the
       process restarting and forgetting them. It runs once at startup and is
       otherwise driven by the existing 4×/day health workflow, which already
       wakes Neon at those moments, so it rides along for free.
   ============================================================ */

const db = require('./db');
const payments = require('./lib/payments');
const {
  sendPaymentConfirmedEmail,
  sendGroupPaymentConfirmedEmail,
} = require('./routes/guestBookings');

/* When to re-ask Omise about a charge nobody has confirmed yet, in minutes
   after it was created.

   Front-loaded because that is where the real traffic is: a 3-D Secure card
   challenge finishes in well under a minute, so the first check catches a
   lost webhook almost as fast as the webhook itself would have. The tail is
   long and sparse because PromptPay is the slow case — a guest may leave the
   QR open while they find their banking app — and Omise's PromptPay charges
   stay valid for roughly an hour, so watching for ~90 minutes covers the
   whole life of the charge without polling through it. */
const WATCH_SCHEDULE_MINUTES = [1, 3, 8, 20, 45, 90];

// A sweep only looks at recent bookings. Anything older than this either
// settled long ago or is a charge that will never complete, and re-asking
// Omise about it forever would be pure noise.
const SWEEP_MAX_AGE_HOURS = 48;

// Hard ceiling on how many charges one sweep will verify, so a backlog (or a
// bug) can never turn into an unbounded burst of outbound API calls.
const SWEEP_MAX_CHARGES = 50;

// Charge refs currently being watched in this process, so two callers (a
// booking's own watch and a sweep that picked up the same row) don't schedule
// duplicate timer chains for one charge.
const watching = new Set();

function log(...args) {
  console.log('[reconcile]', ...args);
}

/* ── The single path a booking takes to 'paid' ───────────────────────────
   Shared by the webhook and by every reconciler check, so there is exactly
   one place where money is recognised and exactly one place a confirmation
   email can be sent from. Before this existed the webhook owned that logic
   inline, and any second confirmation route would have had to reimplement
   the group-email fan-out and the duplicate-delivery guard identically.

   `verified` lets a caller that has ALREADY asked the provider (the webhook
   does, before it gets here) skip a redundant second API round trip.

   Returns { settled, state, rows } where `settled` means this call is the one
   that flipped the booking — false covers both "not paid yet" and "somebody
   else already recorded it", which are the same thing to a caller. */
async function settle(chargeRef, verified) {
  if (!chargeRef) return { settled: false, state: 'unknown', rows: 0 };

  let result = verified;
  if (!result) {
    try {
      result = await payments.verify(chargeRef);
    } catch (e) {
      // A lookup that FAILED is not a charge that failed. Report it as
      // unknown so the caller keeps watching rather than writing the payment
      // off on a network blip.
      console.error('[reconcile] verify failed for', chargeRef, (e && e.message) || e);
      return { settled: false, state: 'unknown', rows: 0 };
    }
  }

  const state = result.state || (result.paid ? 'paid' : 'unknown');
  if (!result.paid) return { settled: false, state, rows: 0 };

  // The atomic bit. `payment_status != 'paid'` is what makes a duplicate
  // webhook, a racing reconciler check and a manual re-run all safe: only the
  // first one to arrive matches any rows, so only it sends the email. For a
  // group booking every room shares one payment_charge_id, so one statement
  // flips the whole reservation.
  const { rows } = await db.query(
    `UPDATE guest_bookings SET payment_status = 'paid'
     WHERE payment_charge_id = $1 AND payment_status != 'paid'
     RETURNING *`,
    [chargeRef]
  );
  if (!rows.length) return { settled: false, state: 'paid', rows: 0 };

  if (rows[0].group_ref) {
    const sorted = rows.slice().sort((a, b) => (a.group_index || 0) - (b.group_index || 0));
    sendGroupPaymentConfirmedEmail(sorted).catch((err) => console.error('[reconcile] group email', err));
  } else {
    sendPaymentConfirmedEmail(rows[0]).catch((err) => console.error('[reconcile] email', err));
  }
  return { settled: true, state: 'paid', rows: rows.length };
}

/* Mark a charge that can no longer be paid.

   An expired PromptPay QR or a failed 3-D Secure attempt would otherwise sit
   at 'pending' forever, which reads on the booking board as "money is on its
   way" when it never is. The RESERVATION is untouched and stays confirmed —
   only the payment leg is closed out, so the front desk knows to collect at
   check-in instead of waiting. Never overwrites a row already marked paid. */
async function markUnpaid(chargeRef, state) {
  const { rows } = await db.query(
    `UPDATE guest_bookings SET payment_status = 'failed'
     WHERE payment_charge_id = $1 AND payment_status = 'pending'
     RETURNING id, ref`,
    [chargeRef]
  );
  if (rows.length) {
    log(`charge ${chargeRef} ${state} — ${rows.length} row(s) marked unpaid; guest pays at check-in`);
  }
  return rows.length;
}

/* One reconciliation attempt. Returns true when the charge has reached a
   final state and needs no further watching. */
async function checkOnce(chargeRef) {
  let result;
  try {
    result = await payments.verify(chargeRef);
  } catch (e) {
    console.error('[reconcile] verify failed for', chargeRef, (e && e.message) || e);
    return false; // transient — keep watching
  }

  if (result.paid) {
    const outcome = await settle(chargeRef, result);
    if (outcome.settled) {
      log(`RECOVERED ${chargeRef} — paid at Omise but never confirmed here (${outcome.rows} row(s)). ` +
          'The webhook did not land; this is exactly the case this reconciler exists for.');
    }
    return true;
  }

  if (result.state === 'expired' || result.state === 'failed') {
    await markUnpaid(chargeRef, result.state);
    return true;
  }
  return false; // still pending, or unknown — keep watching
}

/* Watch one charge until it settles. In-process timers only: nothing is
   persisted, because the sweep below is what covers a restart. Unref'd so a
   pending watch can never hold the process open during a shutdown. */
function watch(chargeRef) {
  if (!chargeRef || watching.has(chargeRef)) return;
  watching.add(chargeRef);

  let step = 0;
  const next = () => {
    if (step >= WATCH_SCHEDULE_MINUTES.length) {
      watching.delete(chargeRef);
      return;
    }
    const delayMs = WATCH_SCHEDULE_MINUTES[step] * 60 * 1000;
    step += 1;
    const timer = setTimeout(async () => {
      let done = false;
      try {
        done = await checkOnce(chargeRef);
      } catch (e) {
        console.error('[reconcile] watch', chargeRef, e);
      }
      if (done) watching.delete(chargeRef);
      else next();
    }, delayMs);
    if (typeof timer.unref === 'function') timer.unref();
  };
  next();
}

/* ── The restart backstop ────────────────────────────────────────────────
   watch()'s timers live only in this process, so a deploy mid-payment loses
   them. This finds any recent booking still waiting on an online payment and
   re-checks it.

   One narrow query, bounded two ways (age and count), and only ever run at
   startup or from the 4×/day health workflow — never on a short interval,
   for the Neon-compute reason in this file's header. */
async function sweep({ maxAgeHours = SWEEP_MAX_AGE_HOURS, reason = 'manual' } = {}) {
  let refs;
  try {
    const { rows } = await db.query(
      `SELECT DISTINCT payment_charge_id
         FROM guest_bookings
        WHERE payment_status = 'pending'
          AND payment_charge_id IS NOT NULL
          AND payment_provider IS NOT NULL
          AND created_at > NOW() - ($1 || ' hours')::interval
        LIMIT $2`,
      [String(maxAgeHours), SWEEP_MAX_CHARGES]
    );
    refs = rows.map((r) => r.payment_charge_id).filter(Boolean);
  } catch (e) {
    console.error('[reconcile] sweep query failed', e);
    return { checked: 0, recovered: 0, closed: 0, error: true };
  }

  if (!refs.length) return { checked: 0, recovered: 0, closed: 0 };
  log(`sweep (${reason}): ${refs.length} charge(s) still pending — re-asking the gateway`);

  let recovered = 0;
  let closed = 0;
  // Sequential on purpose: a handful of charges at most, and this must never
  // become a burst of parallel calls against the gateway or the DB pool.
  for (const ref of refs) {
    try {
      const before = await payments.verify(ref);
      if (before.paid) {
        const outcome = await settle(ref, before);
        if (outcome.settled) {
          recovered += 1;
          log(`RECOVERED ${ref} — paid at the gateway, never confirmed here (${outcome.rows} row(s))`);
        }
      } else if (before.state === 'expired' || before.state === 'failed') {
        if (await markUnpaid(ref, before.state)) closed += 1;
      } else {
        // Genuinely still in flight — hand it back to the timer chain so it
        // keeps being watched without waiting for the next sweep.
        watch(ref);
      }
    } catch (e) {
      console.error('[reconcile] sweep check', ref, (e && e.message) || e);
    }
  }
  log(`sweep (${reason}) done: ${refs.length} checked, ${recovered} recovered, ${closed} closed out`);
  return { checked: refs.length, recovered, closed };
}

/* Called once from server.js after migrations. Deliberately delayed: a
   restart's first job is to start serving traffic, and a Neon cold start can
   make this query slow. Skipped entirely when no gateway is configured, so
   nothing here touches the database until the hotel is actually taking
   payments. */
function start() {
  if (!payments.isConfigured()) return;
  const timer = setTimeout(() => {
    sweep({ reason: 'startup' }).catch((e) => console.error('[reconcile] startup sweep', e));
  }, 30 * 1000);
  if (typeof timer.unref === 'function') timer.unref();
}

module.exports = { settle, watch, sweep, start, WATCH_SCHEDULE_MINUTES };
