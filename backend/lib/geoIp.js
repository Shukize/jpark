/* ============================================================
   J Park Hotel — IP geolocation (staff login audit trail)
   ------------------------------------------------------------
   Free-tier lookup via ip-api.com's JSON endpoint, called once at
   staff login time (see routes/auth.js) so Account Logs can show a
   city/country per session without a repeat lookup on every request.
   HTTP-only on the free plan — fine, since this is a server-side
   call, not a browser mixed-content issue.

   Never blocks a login: a 2s timeout and any failure (network,
   rate limit, private/loopback IP) resolve to nulls rather than
   throwing, mirroring mailer.js's soft-fail-on-error convention.
   ============================================================ */
'use strict';

const { normalizeIp, isPrivateOrLoopback } = require('./ip');

const EMPTY = { city: null, country: null, countryCode: null };

async function lookupGeo(ip) {
  const clean = normalizeIp(ip);
  if (!clean || isPrivateOrLoopback(clean)) return { ...EMPTY };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 2000);
  try {
    const res = await fetch(
      'http://ip-api.com/json/' + encodeURIComponent(clean) + '?fields=status,country,countryCode,city',
      { signal: ctrl.signal }
    );
    const data = await res.json();
    if (!data || data.status !== 'success') return { ...EMPTY };
    return {
      city: data.city || null,
      country: data.country || null,
      countryCode: data.countryCode || null,
    };
  } catch (e) {
    console.warn('[geoIp] lookup failed (non-fatal):', e && e.message);
    return { ...EMPTY };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { lookupGeo };
