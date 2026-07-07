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

module.exports = { makeLimiter };
