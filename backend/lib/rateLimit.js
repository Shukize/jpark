/* ============================================================
   J Park Hotel — minimal in-memory sliding-window rate limiter
   ------------------------------------------------------------
   Per-IP request counting, no external store. Adequate for a
   single-instance Render deployment as a guard against basic
   abuse; resets on process restart and doesn't share state
   across multiple instances (fine at this scale).

   makeLimiter(max, windowMs) returns a `rateLimited(ip) -> bool`
   function backed by its own bucket, so independent limiters
   (payments vs. OTA ingest) never share a budget.
   ============================================================ */
function makeLimiter(max, windowMs) {
  const attemptsByIp = new Map();
  return function rateLimited(ip) {
    const now = Date.now();
    const key = ip || 'unknown';
    const attempts = (attemptsByIp.get(key) || []).filter((t) => now - t < windowMs);
    attempts.push(now);
    attemptsByIp.set(key, attempts);
    return attempts.length > max;
  };
}

/* Like makeLimiter, but the caller decides what counts. `blocked(key)` only
   READS the budget; `recordFailure(key)` spends one unit of it. That split is
   what lets a login limiter punish wrong passwords without punishing correct
   ones — a limiter that counts every request cannot tell twenty colleagues
   signing into the same shared account apart from one script guessing at it,
   so protecting against the second necessarily locks out the first. */
function makeFailureLimiter(max, windowMs) {
  const failuresByKey = new Map();

  function live(key) {
    const now = Date.now();
    const kept = (failuresByKey.get(key) || []).filter((t) => now - t < windowMs);
    if (kept.length) failuresByKey.set(key, kept); else failuresByKey.delete(key);
    return kept;
  }

  return {
    blocked: (key) => live(key || 'unknown').length >= max,
    recordFailure: (key) => {
      const k = key || 'unknown';
      const kept = live(k);
      kept.push(Date.now());
      failuresByKey.set(k, kept);
    },
    clear: (key) => failuresByKey.delete(key || 'unknown'),
  };
}

module.exports = { makeLimiter, makeFailureLimiter };
