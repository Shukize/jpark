/* ============================================================
   J Park Hotel — room-rate overrides (Site Editor "Rates" tab)
   GET /api/rates    public: current effective (base + override) rates + surcharges
   PUT /api/rates    admin: save rate overrides + surcharges

   Deliberately a dedicated route rather than folded into the generic
   content.js PUT (which does a blind full-replace with no shape
   validation) — this endpoint drives real guest charges, so every
   submitted number is validated against the known room/variant list and
   a sane price range before anything is written. See backend/lib/
   rateOverrides.js for the read-time merge + re-validation logic that
   backend/routes/payments.js actually charges from — including the two
   flat `surcharges` (extra bed, extra breakfast guest) applied on top of
   a variant's rate based on guest count.

   It also owns the ONLINE PAYMENT FEE schedule (site_content.payment_fees):
   the acquirer's percentage and the VAT on it, which the booking flow adds
   to a guest's bill so the hotel receives the room rate in full. That belongs
   here rather than in a settings endpoint of its own because it is a price
   the guest pays, validated by the same rules as every other price, and read
   by the same GET the booking page already makes. See
   backend/lib/paymentFees.js.
   ============================================================ */
const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const roomRates = require('../lib/roomRates');
const rateOverrides = require('../lib/rateOverrides');
const paymentFees = require('../lib/paymentFees');

const router = express.Router();

/* GET /api/rates — no auth required (booking.html + Site Editor both read it) */
router.get('/', async (_req, res) => {
  try {
    const [rooms, surcharges, dayUse, fees] = await Promise.all([
      rateOverrides.getAllEffectiveRooms(),
      rateOverrides.getEffectiveSurcharges(),
      rateOverrides.getEffectiveDayUseRates(),
      paymentFees.getEffectiveFees(),
    ]);
    const { rows } = await db.query('SELECT updated_at FROM site_content WHERE id = 1');
    res.json({
      rooms,
      surcharges,
      dayUse,
      // Public on purpose: it is a charge the guest is about to be shown and
      // asked to agree to, and the booking page needs the live numbers to
      // quote it before the form is submitted. Nothing here is a secret — a
      // guest reads the same figure on their own receipt.
      paymentFees: fees,
      updatedAt: rows.length && rows[0].updated_at ? new Date(rows[0].updated_at).getTime() : null,
    });
  } catch (e) {
    console.error('[rates] get', e);
    /* Fail open on reads: never block booking.html from showing the static
       defaults just because a lookup failed.

       The fee schedule is the exception, and deliberately so. Publishing the
       STATIC default here would republish `enabled: true` over an admin who
       has switched the pass-through OFF — the booking page would start
       quoting a fee the server has stopped charging, and the one screen an
       owner would check to confirm it was off would show it on.
       getEffectiveFees() cannot throw (it serves the last schedule this
       process read; see lib/paymentFees.js), so it is safe to await here. */
    let fees;
    try { fees = await paymentFees.getEffectiveFees(); }
    catch (_) { fees = paymentFees.mergeFees(null); }
    res.json({
      rooms: {},
      surcharges: { ...roomRates.DEFAULT_SURCHARGES },
      dayUse: { ...roomRates.DAYUSE },
      paymentFees: fees,
      updatedAt: null,
    });
  }
});

/* PUT /api/rates — admin only, body:
     { rates: { [room]: { [variant]: { room, bf } } }, surcharges: { extraBed, extraBreakfastGuest },
       dayUse: { [room]: number },
       paymentFees: { enabled, vatRate, rates: { card, promptpay } } }
   Validates the ENTIRE payload before writing anything: unknown room/variant
   keys or out-of-range numbers reject the whole batch with every violation
   listed, so an admin never has a partial save. */
router.put('/', requireAdmin, async (req, res) => {
  const submitted = (req.body && req.body.rates) || {};
  const submittedSurcharges = (req.body && req.body.surcharges) || {};
  const submittedDayUse = (req.body && req.body.dayUse) || {};
  const submittedFees = (req.body && req.body.paymentFees) || null;
  if (typeof submitted !== 'object' || Array.isArray(submitted)) {
    return res.status(400).json({ error: 'rates must be an object' });
  }
  if (typeof submittedSurcharges !== 'object' || Array.isArray(submittedSurcharges)) {
    return res.status(400).json({ error: 'surcharges must be an object' });
  }
  if (typeof submittedDayUse !== 'object' || Array.isArray(submittedDayUse)) {
    return res.status(400).json({ error: 'dayUse must be an object' });
  }

  const violations = [];
  Object.keys(submitted).forEach((roomName) => {
    const room = roomRates.getRoom(roomName);
    if (!room) {
      violations.push(`Unknown room: "${roomName}"`);
      return;
    }
    const variantsForRoom = submitted[roomName];
    if (!variantsForRoom || typeof variantsForRoom !== 'object') {
      violations.push(`Invalid variants payload for "${roomName}"`);
      return;
    }
    Object.keys(variantsForRoom).forEach((variantLabel) => {
      const variant = roomRates.getVariant(roomName, variantLabel);
      if (!variant) {
        violations.push(`Unknown variant "${variantLabel}" for "${roomName}"`);
        return;
      }
      const ov = variantsForRoom[variantLabel] || {};
      if (!rateOverrides.isValidRate(ov.room)) {
        violations.push(`"${roomName}" — ${variantLabel}: room-only rate must be a number between ${rateOverrides.MIN_RATE} and ${rateOverrides.MAX_RATE}`);
      }
      if (!rateOverrides.isValidRate(ov.bf)) {
        violations.push(`"${roomName}" — ${variantLabel}: room+breakfast rate must be a number between ${rateOverrides.MIN_RATE} and ${rateOverrides.MAX_RATE}`);
      }
    });
  });

  const surchargeKeys = Object.keys(roomRates.DEFAULT_SURCHARGES);
  Object.keys(submittedSurcharges).forEach((key) => {
    if (!surchargeKeys.includes(key)) {
      violations.push(`Unknown surcharge: "${key}"`);
      return;
    }
    if (!rateOverrides.isValidRate(submittedSurcharges[key])) {
      violations.push(`Surcharge "${key}" must be a number between ${rateOverrides.MIN_RATE} and ${rateOverrides.MAX_RATE}`);
    }
  });

  Object.keys(submittedDayUse).forEach((roomName) => {
    if (roomRates.getDayUsePrice(roomName) == null) {
      violations.push(`Unknown day-use room: "${roomName}"`);
      return;
    }
    if (!rateOverrides.isValidRate(submittedDayUse[roomName])) {
      violations.push(`"${roomName}" day-use rate must be a number between ${rateOverrides.MIN_RATE} and ${rateOverrides.MAX_RATE}`);
    }
  });

  /* The payment-fee schedule. Rates are PROPORTIONS here (0.0365), never
     percentages (3.65) — the Site Editor converts, because a 3.65 accepted at
     this layer would try to add 365% to every booking. The bound below is
     what makes that typo a rejection instead of a catastrophe. */
  if (submittedFees != null) {
    if (typeof submittedFees !== 'object' || Array.isArray(submittedFees)) {
      violations.push('paymentFees must be an object');
    } else {
      const pctMax = (paymentFees.MAX_FEE_RATE * 100).toFixed(0);
      if (submittedFees.enabled != null && typeof submittedFees.enabled !== 'boolean') {
        violations.push('paymentFees.enabled must be true or false');
      }
      if (submittedFees.vatRate != null && !paymentFees.isValidVatRate(submittedFees.vatRate)) {
        violations.push(`paymentFees.vatRate must be a proportion between 0 and ${paymentFees.MAX_VAT_RATE} (7% is 0.07)`);
      }
      const feeRates = submittedFees.rates;
      if (feeRates != null) {
        if (typeof feeRates !== 'object' || Array.isArray(feeRates)) {
          violations.push('paymentFees.rates must be an object');
        } else {
          const known = Object.keys(paymentFees.DEFAULT_PAYMENT_FEES.rates);
          Object.keys(feeRates).forEach((method) => {
            if (!known.includes(method)) {
              violations.push(`Unknown payment method in paymentFees.rates: "${method}"`);
              return;
            }
            if (feeRates[method] != null && !paymentFees.isValidFeeRate(feeRates[method])) {
              violations.push(`paymentFees.rates.${method} must be a proportion between 0 and ${paymentFees.MAX_FEE_RATE} (${pctMax}%) — 3.65% is 0.0365`);
            }
          });
        }
      }
    }
  }

  if (violations.length) {
    return res.status(400).json({ error: 'Invalid rates', details: violations });
  }

  try {
    // Merge onto the current effective surcharges/day-use rates rather than
    // a blind replace, so a partial submission (e.g. only extraBed, or only
    // one day-use room) never silently resets the others to their default.
    const mergedSurcharges = { ...(await rateOverrides.getEffectiveSurcharges()), ...submittedSurcharges };
    const mergedDayUse = { ...(await rateOverrides.getEffectiveDayUseRates()), ...submittedDayUse };
    // Same merge-don't-replace rule, one level deeper: `rates` is nested, so
    // a submission carrying only the card rate must not wipe PromptPay's, and
    // a submission that omits paymentFees entirely (every Rates-tab save
    // before this feature existed) must leave the schedule exactly as it was.
    const currentFees = await paymentFees.getEffectiveFees();
    const mergedFees = submittedFees
      ? {
          ...currentFees,
          ...submittedFees,
          rates: { ...currentFees.rates, ...(submittedFees.rates || {}) },
        }
      : currentFees;
    await db.query(
      `INSERT INTO site_content (id, rates, surcharges, day_use_rates, payment_fees, updated_at)
       VALUES (1, $1, $2, $3, $4, NOW())
       ON CONFLICT (id) DO UPDATE SET rates = EXCLUDED.rates, surcharges = EXCLUDED.surcharges,
         day_use_rates = EXCLUDED.day_use_rates, payment_fees = EXCLUDED.payment_fees, updated_at = NOW()`,
      [JSON.stringify(submitted), JSON.stringify(mergedSurcharges), JSON.stringify(mergedDayUse), JSON.stringify(mergedFees)]
    );
    const [rooms, surcharges, dayUse, fees] = await Promise.all([
      rateOverrides.getAllEffectiveRooms(),
      rateOverrides.getEffectiveSurcharges(),
      rateOverrides.getEffectiveDayUseRates(),
      paymentFees.getEffectiveFees(),
    ]);
    res.json({ ok: true, rooms, surcharges, dayUse, paymentFees: fees });
  } catch (e) {
    console.error('[rates] put', e);
    res.status(500).json({ error: 'Database error' });
  }
});

/* GET /api/rates/observed-fees — what the acquirer has ACTUALLY been
   deducting, derived from settled charges.

   The fee schedule above is what the hotel BELIEVES its rate is. This is the
   evidence. It exists because the single most likely way this feature fails
   is silently: the acquirer moves its rate, the configured number does not,
   and the hotel goes back to absorbing the difference on every booking with
   nothing anywhere to say so.

   requireAuth rather than requireAdmin, matching the rest of the payments
   surface (the owner's explicit call, 2026-08-28) — but NOT public: it is a
   summary of the hotel's own takings. */
router.get('/observed-fees', requireAuth, async (req, res) => {
  const days = Number(req.query.days) || 180;
  const [observed, configured] = await Promise.all([
    paymentFees.observedRates(days),
    paymentFees.getEffectiveFees(),
  ]);
  // `null` means the query itself failed — a different answer from "no
  // charges yet", which is an empty object. The console says so rather than
  // showing a confident zero.
  res.json({ observed, configured, days });
});

module.exports = router;
