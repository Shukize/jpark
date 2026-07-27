/* ============================================================
   J Park Hotel — Account Logs (session audit trail + IP bans)
   GET  /api/sessions                 list every session (admin)
   POST /api/sessions/:jti/revoke     sign out one session (admin)
   GET  /api/sessions/banned-ips      list banned IPs (admin)
   POST /api/sessions/ban             ban an IP, cascade-revoke it (admin)
   POST /api/sessions/unban           unban an IP (admin)

   Backs the staff console's admin-only "Account Logs" panel. Every
   route is admin-gated individually (matching routes/auth.js's
   existing per-route style, not a router-wide .use(requireAdmin)).
   Revocation/ban state is mirrored into lib/sessionCache.js's
   in-memory Sets in the same request that writes the DB row, so
   middleware/auth.js's per-request check has zero propagation delay.
   ============================================================ */
const express = require('express');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');
const sessionCache = require('../lib/sessionCache');
const { normalizeIp } = require('../lib/ip');

const router = express.Router();

// A session counts as "online" if it polled within the last 20 seconds —
// a bit more than 3x the staff console's 6-second poll interval, so one
// missed beat doesn't visibly flicker the dot to offline.
const ONLINE_WINDOW_SQL = "last_seen_at > NOW() - interval '20 seconds' AND revoked_at IS NULL";

function rowToJson(r, currentJti) {
  return {
    jti: r.jti,
    employeeId: r.employee_id,
    employeeName: r.employee_name,
    employeeUsername: r.employee_username,
    employeeRole: r.employee_role,
    ip: r.ip,
    deviceSummary: r.device_summary,
    city: r.city,
    country: r.country,
    countryCode: r.country_code,
    createdAt: r.created_at,
    lastSeenAt: r.last_seen_at,
    revokedAt: r.revoked_at,
    revokedReason: r.revoked_reason,
    revokedByName: r.revoked_by_name,
    online: !!r.online,
    isCurrent: r.jti === currentJti,
  };
}

/* ---- GET /api/sessions ----
   Bounded on purpose. This endpoint is re-polled every 10 seconds for as long
   as an admin leaves the Account Logs panel open, and it used to return every
   session row the hotel had ever created. That was affordable at 2 accounts ×
   6 devices; at 100 accounts × 20 devices it is thousands of rows every ten
   seconds, which is precisely the shape of the query that exhausted Neon's
   free-tier transfer allowance and took the whole API down on 2026-07-13.
   Live sessions are ordered ahead of retired ones so an admin always sees
   everything currently signed in — the rows the sign-out and ban actions act
   on — before any history is included in the remainder of the budget. */
const SESSION_PAGE = 400;

router.get('/', requireAdmin, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT s.jti, s.employee_id, e.name AS employee_name, e.username AS employee_username,
              e.role AS employee_role, s.ip, s.device_summary, s.city, s.country, s.country_code,
              s.created_at, s.last_seen_at, s.revoked_at, s.revoked_reason,
              rb.name AS revoked_by_name,
              (${ONLINE_WINDOW_SQL}) AS online
         FROM staff_sessions s
         JOIN employees e ON e.id = s.employee_id
         LEFT JOIN employees rb ON rb.id = s.revoked_by_id
        ORDER BY (s.revoked_at IS NULL) DESC, s.last_seen_at DESC
        LIMIT ${SESSION_PAGE}`
    );
    res.json(rows.map((r) => rowToJson(r, req.user.jti)));
  } catch (e) {
    console.error('[sessions] list', e);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ---- POST /api/sessions/:jti/revoke ----
   Self-revoke is allowed (mirrors what the existing Sign Out button
   already does to yourself) — the frontend flags "this is you" so it's
   not an accidental click, but nothing here blocks it. */
router.post('/:jti/revoke', requireAdmin, async (req, res) => {
  try {
    const { rows } = await db.query(
      `UPDATE staff_sessions
          SET revoked_at = NOW(), revoked_reason = 'admin_revoke', revoked_by_id = $1
        WHERE jti = $2 AND revoked_at IS NULL
        RETURNING jti`,
      [req.user.id, req.params.jti]
    );
    if (!rows.length) return res.status(404).json({ error: 'Session not found or already revoked' });
    sessionCache.markRevoked(req.params.jti);
    res.json({ ok: true });
  } catch (e) {
    console.error('[sessions] revoke', e);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ---- GET /api/sessions/banned-ips ---- */
router.get('/banned-ips', requireAdmin, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT b.ip, b.banned_at, b.reason, e.name AS banned_by_name
         FROM banned_ips b
         LEFT JOIN employees e ON e.id = b.banned_by_id
        ORDER BY b.banned_at DESC`
    );
    res.json(rows.map((r) => ({
      ip: r.ip,
      bannedAt: r.banned_at,
      reason: r.reason,
      bannedByName: r.banned_by_name,
    })));
  } catch (e) {
    console.error('[sessions] list-banned', e);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ---- POST /api/sessions/ban ----
   Bans an IP from the staff console (see lib/sessionCache.js's
   blockBannedIp — mounted only on /api/auth and /api/sessions, never
   guest-facing routes) and cascade-revokes every currently active
   session from that IP. Self-ban is allowed per the same reasoning as
   self-revoke above. */
router.post('/ban', requireAdmin, async (req, res) => {
  const ip = normalizeIp((req.body || {}).ip);
  const reason = (req.body || {}).reason || null;
  if (!ip) return res.status(400).json({ error: 'ip is required' });

  try {
    await db.query(
      `INSERT INTO banned_ips (ip, banned_by_id, reason) VALUES ($1, $2, $3)
       ON CONFLICT (ip) DO UPDATE SET reason = $3, banned_by_id = $2, banned_at = NOW()`,
      [ip, req.user.id, reason]
    );
    sessionCache.banIp(ip);

    const { rows: revoked } = await db.query(
      `UPDATE staff_sessions
          SET revoked_at = NOW(), revoked_reason = 'ip_ban', revoked_by_id = $1
        WHERE ip = $2 AND revoked_at IS NULL
        RETURNING jti`,
      [req.user.id, ip]
    );
    revoked.forEach((r) => sessionCache.markRevoked(r.jti));

    res.json({ ok: true, sessionsRevoked: revoked.length });
  } catch (e) {
    console.error('[sessions] ban', e);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ---- POST /api/sessions/unban ----
   Restores login ability for the IP. Does not un-revoke sessions that
   were already cascade-revoked by the ban — those devices simply log
   in again. */
router.post('/unban', requireAdmin, async (req, res) => {
  const ip = normalizeIp((req.body || {}).ip);
  if (!ip) return res.status(400).json({ error: 'ip is required' });

  try {
    const { rowCount } = await db.query('DELETE FROM banned_ips WHERE ip = $1', [ip]);
    sessionCache.unbanIp(ip);
    if (!rowCount) return res.status(404).json({ error: 'IP not banned' });
    res.json({ ok: true });
  } catch (e) {
    console.error('[sessions] unban', e);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
