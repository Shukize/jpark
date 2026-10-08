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
const PD = require('./lib/payments/detail');
const {
  sendPaymentConfirmedEmail,
  sendGroupPaymentConfirmedEmail,
  sendBookingReleasedEmails,
  sendLatePaymentAlert,
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

/* How long a booking holds its room while the online payment is open. A
   payment still unfinished at this point is given up on: the booking is
   cancelled and the room released (markUnpaid 'timeout'). Matches the last
   watch check above, so the release happens on that check. Omise does not
   promise to ever expire an abandoned 3-D Secure charge, so without this a
   walked-away guest could hold a room indefinitely. */
const PAYMENT_HOLD_MINUTES = 90;

// A sweep only looks at bookings this recent. Wide on purpose: a pending
// payment past the hold is now released on its first sweep, so it stops
// being 'pending' and is never re-asked about — the set stays tiny, and a
// long window is what reaches an abandoned booking left over from a restart.
const SWEEP_MAX_AGE_HOURS = 24 * 30;

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
  //
  // The payment DETAIL is folded into this same statement rather than written
  // by a follow-up UPDATE. Two reasons, both load-bearing: a second statement
  // could fail on its own and leave a booking marked paid with no record of
  // what paid it, and a second statement would be a second Neon round trip on
  // a path that runs for every payment.
  //
  // Every detail assignment is COALESCE($n, column), so a thinner later answer
  // about the same charge can never blank a richer earlier one — a webhook
  // re-delivery, a settlement refresh that knows about transfers but not
  // cards, or a manual re-run all add without erasing.
  const detail = (verified && verified.detail) || (result && result.detail) || null;
  const set = PD.updateSet(detail, 2);
  const { rows } = await db.query(
    `UPDATE guest_bookings SET payment_status = 'paid'${set.clause ? ', ' + set.clause : ''}
     WHERE payment_charge_id = $1 AND payment_status != 'paid'
     RETURNING *`,
    [chargeRef, ...set.values]
  );
  if (!rows.length) {
    // Somebody else already recorded this payment. The flip is theirs, but
    // the DETAIL may still be missing — this is the ordinary case where a
    // webhook wins the race and a later verify carries the richer object.
    if (detail) await recordDetail(chargeRef, detail);
    return { settled: false, state: 'paid', rows: 0 };
  }

  // Paid, but the booking had already been released (the hold ran out, or
  // staff cancelled it): the money is recorded above, but the guest is NOT
  // sent a confirmation for a room that may since have been resold — the
  // desk is alerted to Reopen it or refund.
  if (rows.some((r) => r.status === 'cancelled')) {
    const sorted = rows.slice().sort((a, b) => (a.group_index || 0) - (b.group_index || 0));
    log(`charge ${chargeRef} PAID AFTER RELEASE — ${rows.length} row(s); desk alerted`);
    try { sendLatePaymentAlert(sorted, detail); } catch (e) { console.error('[reconcile] late-payment alert', e); }
    return { settled: true, state: 'paid', rows: rows.length };
  }

  if (rows[0].group_ref) {
    const sorted = rows.slice().sort((a, b) => (a.group_index || 0) - (b.group_index || 0));
    sendGroupPaymentConfirmedEmail(sorted, detail).catch((err) => console.error('[reconcile] group email', err));
  } else {
    sendPaymentConfirmedEmail(rows[0], detail).catch((err) => console.error('[reconcile] email', err));
  }
  return { settled: true, state: 'paid', rows: rows.length };
}

/* Close out a charge that can no longer be paid — and RELEASE THE BOOKING.

   The owner's rule (2026-10-08): a booking that is not paid does not stand.
   An expired PromptPay QR, a failed 3-D Secure attempt, or a payment still
   unfinished when the hold runs out (`state === 'timeout'`, see
   PAYMENT_HOLD_MINUTES) therefore cancels the booking, which is what frees
   the room: availability only counts confirmed bookings (lib/availability.js).
   The guest is emailed that the booking was not completed, and the desk is
   told. (Before this, the booking stayed confirmed for collection at
   check-in.)

   One statement does it all, so a row can never be 'failed' yet still holding
   the room. It only matches rows still 'pending', so it never touches a
   booking that has been paid.

   The fee still comes off `total`: if the desk later Reopens the booking for
   a guest who will pay in person, the bill must not carry a card-processing
   fee for a payment that never happened online.

   A CTE so the PRIOR status comes back with the row (RETURNING gives the new
   one): a booking staff had already cancelled by hand is closed out quietly,
   without telling the guest a second time. */
async function markUnpaid(chargeRef, state, detail) {
  const set = PD.updateSet(detail, 2);
  const reasonParam = `$${2 + set.values.length}`;
  const { rows } = await db.query(
    `WITH before AS (
       SELECT id, status AS prior_status
         FROM guest_bookings
        WHERE payment_charge_id = $1 AND payment_status = 'pending'
     )
     UPDATE guest_bookings g
        SET payment_status = 'failed',
            total = COALESCE(g.room_total, g.total),
            payment_surcharge = 0,
            status = 'cancelled',
            previous_status = CASE WHEN g.status = 'cancelled' THEN g.previous_status ELSE g.status END,
            cancelled_at = COALESCE(g.cancelled_at, NOW()),
            cancelled_by_name = COALESCE(g.cancelled_by_name, 'System (payment not completed)'),
            cancellation_reason = COALESCE(g.cancellation_reason, ${reasonParam})${set.clause ? ', ' + set.clause : ''}
       FROM before b
      WHERE g.id = b.id
     RETURNING g.*, b.prior_status`,
    [chargeRef, ...set.values, RELEASE_REASON[state] || RELEASE_REASON.failed]
  );
  if (rows.length) {
    log(`charge ${chargeRef} ${state} — ${rows.length} row(s) cancelled, room released`);
    try {
      // One email of each kind per reservation: a group's rooms share this
      // charge and were all released together above.
      const ordered = rows.slice().sort((a, b) => (a.group_index || 0) - (b.group_index || 0));
      sendBookingReleasedEmails(ordered, detail || null, state, {
        notifyGuest: ordered.some((r) => r.prior_status !== 'cancelled'),
      });
    } catch (e) {
      console.error('[reconcile] booking-released notice', e);
    }
  }
  return rows.length;
}

// What the staff console shows as the cancellation reason.
const RELEASE_REASON = {
  expired: 'Online payment expired — room released automatically',
  failed: 'Online payment failed — room released automatically',
  timeout: `Online payment not completed within ${PAYMENT_HOLD_MINUTES} minutes — room released automatically`,
};

/* Record what the gateway said about a charge, without touching its status.

   Used where the money question is already settled but the RECORD is not: a
   webhook that won the race and wrote only a status, a booking made before
   any of these columns existed, and the settlement refresh, which learns
   weeks later which bank transfer actually paid a charge out.

   COALESCE throughout (see updateSet), so this can only ever add. */
async function recordDetail(chargeRef, detail) {
  if (!chargeRef || !PD.hasDetail(detail)) return 0;
  const set = PD.updateSet(detail, 2);
  if (!set.clause) return 0;
  try {
    const { rowCount } = await db.query(
      `UPDATE guest_bookings SET ${set.clause} WHERE payment_charge_id = $1`,
      [chargeRef, ...set.values]
    );
    return rowCount || 0;
  } catch (e) {
    // Bookkeeping must never break the path that recognises money.
    console.error('[reconcile] could not record payment detail for', chargeRef, (e && e.message) || e);
    return 0;
  }
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
    await markUnpaid(chargeRef, result.state, result.detail || null);
    return true;
  }
  // Still moving. Record whatever the gateway already knows — a pending
  // PromptPay charge has no card and no fee, but a pending 3-D Secure card
  // charge has both, and holding that until it settles means a guest mid-
  // challenge shows as a blank payment on the booking board.
  if (result.detail) await recordDetail(chargeRef, result.detail);
  return false; // still pending, or unknown — keep watching
}

/* The hold has run out. Asks the gateway one last time and releases the
   booking only on a definite "still pending" — a lookup that FAILED is not
   an unpaid charge, and releasing on a network blip would turn a paying
   guest away. Returns true when nothing further needs watching. */
async function releaseIfStillPending(chargeRef, verified) {
  let result = verified;
  if (!result) {
    try {
      result = await payments.verify(chargeRef);
    } catch (e) {
      console.error('[reconcile] hold-expiry verify failed for', chargeRef, (e && e.message) || e);
      return false; // the next sweep tries again
    }
  }
  if (result.paid) { await settle(chargeRef, result); return true; }
  if (result.state === 'expired' || result.state === 'failed') {
    await markUnpaid(chargeRef, result.state, result.detail || null);
    return true;
  }
  if (result.state === 'pending') {
    await markUnpaid(chargeRef, 'timeout', result.detail || null);
    return true;
  }
  return false;
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
    // The schedule is minutes after the charge was created, so each timer
    // waits only the gap since the previous check. (It used to wait the
    // full figure each time, which stretched the "90 minute" watch to ~2h45.)
    const delayMs = (WATCH_SCHEDULE_MINUTES[step] - (step ? WATCH_SCHEDULE_MINUTES[step - 1] : 0)) * 60 * 1000;
    step += 1;
    const isLast = step >= WATCH_SCHEDULE_MINUTES.length;
    const timer = setTimeout(async () => {
      let done = false;
      try {
        done = await checkOnce(chargeRef);
        // Still open at the end of the hold: give up on it, release the room.
        if (!done && isLast && WATCH_SCHEDULE_MINUTES[step - 1] >= PAYMENT_HOLD_MINUTES) {
          done = await releaseIfStillPending(chargeRef);
        }
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
      `SELECT payment_charge_id,
              EXTRACT(EPOCH FROM (NOW() - MIN(created_at))) / 60 AS age_minutes
         FROM guest_bookings
        WHERE payment_status = 'pending'
          AND payment_charge_id IS NOT NULL
          AND payment_provider IS NOT NULL
          AND created_at > NOW() - ($1 || ' hours')::interval
        GROUP BY payment_charge_id
        LIMIT $2`,
      [String(maxAgeHours), SWEEP_MAX_CHARGES]
    );
    refs = rows.filter((r) => r.payment_charge_id)
      .map((r) => ({ ref: r.payment_charge_id, ageMinutes: Number(r.age_minutes) || 0 }));
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
  for (const { ref, ageMinutes } of refs) {
    try {
      const before = await payments.verify(ref);
      if (before.paid) {
        const outcome = await settle(ref, before);
        if (outcome.settled) {
          recovered += 1;
          log(`RECOVERED ${ref} — paid at the gateway, never confirmed here (${outcome.rows} row(s))`);
        }
      } else if (before.state === 'expired' || before.state === 'failed') {
        if (await markUnpaid(ref, before.state, before.detail || null)) closed += 1;
      } else if (before.state === 'pending' && ageMinutes >= PAYMENT_HOLD_MINUTES) {
        // Past the hold — a watch lost to a restart would have released it.
        if (await markUnpaid(ref, 'timeout', before.detail || null)) closed += 1;
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

module.exports = {
  settle, watch, sweep, start, WATCH_SCHEDULE_MINUTES,
  // checkOnce is exported so the webhook can close out a FAILED charge
  // in seconds instead of waiting for a sweep, and so the ledger can
  // re-ask about one charge on demand.
  checkOnce, markUnpaid, recordDetail, releaseIfStillPending, PAYMENT_HOLD_MINUTES,
};
