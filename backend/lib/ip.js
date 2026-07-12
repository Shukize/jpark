/* ============================================================
   J Park Hotel — IP address normalisation
   ------------------------------------------------------------
   Shared by routes/auth.js, routes/sessions.js and
   lib/sessionCache.js's ban check, so staff_sessions.ip,
   banned_ips.ip and every runtime comparison all use the exact
   same string form for the same underlying address.
   ============================================================ */
'use strict';

const PRIVATE_V4 = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
];

// Node/Express (behind Render's proxy) sometimes reports an IPv4 address as
// an IPv4-mapped IPv6 literal ("::ffff:1.2.3.4") — strip that prefix so the
// stored/compared form is always the plain address the OTA/geo services and
// a human admin would recognise.
function normalizeIp(ip) {
  if (!ip) return '';
  return String(ip).replace(/^::ffff:/i, '').trim();
}

function isPrivateOrLoopback(ip) {
  const n = normalizeIp(ip);
  if (!n) return true;
  if (n === '::1' || n === 'localhost') return true;
  return PRIVATE_V4.some((re) => re.test(n));
}

module.exports = { normalizeIp, isPrivateOrLoopback };
