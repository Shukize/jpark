/* ============================================================
   J Park Hotel — in-memory session revocation / IP-ban cache
   ------------------------------------------------------------
   Backs middleware/auth.js's per-request session checks with two
   Sets instead of a per-request DB query — same philosophy as
   lib/rateLimit.js's in-memory Map, and correctness-exact rather
   than eventually-consistent: every route that revokes a session
   or bans an IP updates these Sets in the same request that writes
   the DB row, so there is no propagation-delay window. Matches
   rateLimit.js's documented "single-instance Render deployment"
   assumption — would need a shared store (Redis, or a DB check)
   only if this app ever ran across multiple instances.

   hydrate() must run once at boot (after migrate() resolves) so a
   process restart never "un-revokes" a session or "un-bans" an IP
   that was only tracked in memory.
   ============================================================ */
'use strict';

const db = require('../db');
const { normalizeIp } = require('./ip');

const revokedJti = new Set();
const bannedIps = new Set();

function isRevoked(jti) {
  return !!jti && revokedJti.has(jti);
}
function markRevoked(jti) {
  if (jti) revokedJti.add(jti);
}

function isBanned(ip) {
  return bannedIps.has(normalizeIp(ip));
}
function banIp(ip) {
  const n = normalizeIp(ip);
  if (n) bannedIps.add(n);
}
function unbanIp(ip) {
  bannedIps.delete(normalizeIp(ip));
}

async function hydrate() {
  try {
    const { rows: revoked } = await db.query(
      'SELECT jti FROM staff_sessions WHERE revoked_at IS NOT NULL'
    );
    revoked.forEach((r) => revokedJti.add(r.jti));

    const { rows: banned } = await db.query('SELECT ip FROM banned_ips');
    banned.forEach((r) => bannedIps.add(normalizeIp(r.ip)));

    console.log(
      `[sessionCache] hydrated ${revokedJti.size} revoked session(s), ${bannedIps.size} banned IP(s)`
    );
  } catch (e) {
    console.error('[sessionCache] hydrate failed:', e);
  }
}

// Mounted only on /api/auth and /api/sessions (see server.js) — a banned IP
// is blocked from the staff console entirely, but never from guest-facing
// routes (booking, chat, OTA webhooks), so a shared/NAT'd IP banned for a
// bad staff-login attempt can never also block a real guest.
function blockBannedIp(req, res, next) {
  if (req.method === 'OPTIONS') return next(); // never block CORS preflight
  if (isBanned(req.ip)) return res.status(403).json({ error: 'Forbidden' });
  next();
}

module.exports = {
  isRevoked,
  markRevoked,
  isBanned,
  banIp,
  unbanIp,
  hydrate,
  blockBannedIp,
};
