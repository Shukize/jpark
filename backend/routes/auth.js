/* ============================================================
   J Park Hotel — authentication routes
   POST /api/auth/login          staff login (bcrypt, returns JWT)
   POST /api/auth/refresh        silently renew a session's access token
   POST /api/auth/guest-login    guest portal login (name+room or ref)
   POST /api/auth/change-password change own password (authenticated)
   POST /api/auth/register       create staff account (admin only)
   DELETE /api/auth/staff/:id    deactivate account (admin only)

   Session model: a login creates one staff_sessions row (jti) capturing
   IP/device/geo, and mints a SHORT-lived access token (15 min) carrying
   that `jti` plus `absExp` (the session's 7-day absolute cap). The client
   silently calls POST /refresh well before the access token expires (see
   assets/js/api.js) to mint a fresh one for the SAME session — this is
   what replaced the old 12-hour token + broken client-side "recovery"
   that used to silently freeze the whole staff console once expired.
   Concurrency is capped at 6 active sessions per employee (oldest evicted
   on the 7th login); see lib/sessionCache.js for revocation/ban state.
   ============================================================ */
const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { requireAuth, requireAdmin, verifyTokenIgnoringExpiry } = require('../middleware/auth');
const sessionCache = require('../lib/sessionCache');
const { normalizeIp } = require('../lib/ip');
const { lookupGeo } = require('../lib/geoIp');
const { parseUserAgent } = require('../lib/deviceInfo');
const { makeLimiter } = require('../lib/rateLimit');
const { findBooking } = require('../lib/guestLookup');
const { buildingForBooking } = require('../lib/buildings');

let bcrypt;
try { bcrypt = require('bcrypt'); } catch (_) { bcrypt = null; }

const router = express.Router();
const SECRET = process.env.AUTH_TOKEN_SECRET || 'jpark-demo-shared-secret';
const TTL = 15 * 60; // 15-minute access token — silently refreshed, see POST /refresh
const ABSOLUTE_SESSION_DAYS = 7;
const MAX_SESSIONS_PER_EMPLOYEE = 6;
const refreshRateLimited = makeLimiter(30, 60 * 1000);     // 30/min per IP
const loginRateLimited = makeLimiter(10, 10 * 60 * 1000);  // 10 staff-login attempts / 10min per IP
// Guest-portal sign-in. A tight per-IP budget is wrong here for the same
// reason it was wrong on POST /api/chat/identify (see the note there): every
// guest on the hotel's own Wi-Fi shares ONE public IP, so a 20/10min ceiling
// locked out real guests as soon as a few arrivals had signed in — and now
// that OTA and walk-in guests use this door too, that is most of the house.
// So: a per-IP ceiling loose enough for a whole floor, plus a tight per-device
// budget that makes scripted guessing from one browser pointless.
const guestLoginRateLimited = makeLimiter(60, 10 * 60 * 1000);
const guestLoginDeviceRateLimited = makeLimiter(8, 10 * 60 * 1000);

// A random, unambiguous temporary password for admin-triggered resets. Returned
// ONCE to the admin (the DB only ever keeps the bcrypt hash) — this replaces the
// old fixed 'jparkhotel', which was a known password on any just-reset account.
// Alphabet omits easily-confused characters (0/O, 1/l/I).
function genTempPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(10);
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

function nameToEmail(name) {
  const parts = (name || 'staff').toLowerCase().trim().split(/\s+/);
  return (parts.length > 1 ? parts[0][0] + parts[parts.length - 1] : parts[0]) + '@jpark.hotel';
}

/* ---- JWT helpers (mirror of middleware/auth.js) ---- */
function b64url(str) {
  return Buffer.from(str).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// `session` carries the two session-scoped claims that stay IDENTICAL
// across every refresh of the same login: `jti` (staff_sessions.jti) and
// `absExp` (that row's absolute_expires_at, as a unix timestamp). Only
// `iat`/`exp` change on each mint.
function mintToken(emp, session) {
  const perms = emp.role === 'admin' ? ['admin', 'staff'] : ['staff'];
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({
    sub: emp.id,
    name: emp.name,
    username: emp.username,
    email: emp.email || nameToEmail(emp.name),
    role: emp.role,
    perms,
    jti: session.jti,
    absExp: session.absExp,
    iat: now,
    exp: now + TTL,
  }));
  const sig = crypto.createHmac('sha256', SECRET)
    .update(header + '.' + payload).digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return header + '.' + payload + '.' + sig;
}

/* Creates a new staff_sessions row for a just-authenticated employee:
   enforces the 6-concurrent-sessions-per-employee cap (evicting the
   single oldest active session first, FIFO, if already at the cap),
   captures IP/device/geo (geo never blocks login — see lib/geoIp.js),
   and returns the { jti, absExp } claims mintToken() embeds. */
async function createSession(req, employeeId) {
  const ip = normalizeIp(req.ip);
  const ua = req.get('user-agent') || '';
  const { summary } = parseUserAgent(ua);

  const { rows: active } = await db.query(
    `SELECT jti FROM staff_sessions WHERE employee_id = $1 AND revoked_at IS NULL
      ORDER BY created_at ASC`,
    [employeeId]
  );
  if (active.length >= MAX_SESSIONS_PER_EMPLOYEE) {
    const oldestJti = active[0].jti;
    await db.query(
      `UPDATE staff_sessions SET revoked_at = NOW(), revoked_reason = 'concurrency_cap'
        WHERE jti = $1`,
      [oldestJti]
    );
    sessionCache.markRevoked(oldestJti);
  }

  const geo = await lookupGeo(ip); // never throws, 2s worst case

  const jti = crypto.randomUUID();
  const { rows } = await db.query(
    `INSERT INTO staff_sessions
       (jti, employee_id, ip, user_agent, device_summary, city, country, country_code,
        expires_at, absolute_expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8, NOW() + interval '20 minutes',
             NOW() + interval '${ABSOLUTE_SESSION_DAYS} days')
     RETURNING absolute_expires_at`,
    [jti, employeeId, ip, ua, summary, geo.city, geo.country, geo.countryCode]
  );

  return { jti, absExp: Math.floor(new Date(rows[0].absolute_expires_at).getTime() / 1000) };
}

/* ---- POST /api/auth/login ---- */
router.post('/login', async (req, res) => {
  if (loginRateLimited(normalizeIp(req.ip))) {
    return res.status(429).json({ error: 'Too many login attempts. Please try again later.' });
  }
  const { username, password } = req.body || {};
  if (!username || !password)
    return res.status(400).json({ error: 'username and password required' });

  try {
    const { rows } = await db.query(
      `SELECT id, name, email, username, role, password_hash, active, must_change_password
         FROM employees WHERE username = $1`,
      [username.trim().toLowerCase()]
    );
    const emp = rows[0];

    if (!emp || !emp.active)
      return res.status(401).json({ error: 'Invalid credentials' });

    // migrate.js's seedAuth() always ensures a real bcrypt hash exists before
    // the server starts accepting traffic — a null hash here means the
    // account hasn't been provisioned yet, not "use the default password".
    if (!emp.password_hash) return res.status(401).json({ error: 'Invalid credentials' });
    if (!bcrypt) return res.status(500).json({ error: 'bcrypt not available' });
    const ok = await bcrypt.compare(password, emp.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    const session = await createSession(req, emp.id);
    const token = mintToken(emp, session);
    res.json({
      token,
      user: { id: emp.id, name: emp.name, role: emp.role, username: emp.username },
      must_change_password: !!emp.must_change_password,
    });
  } catch (e) {
    console.error('[auth] login', e);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ---- POST /api/auth/refresh ----
   Silently mints a fresh short-lived access token for the SAME session
   (same jti/absExp), as long as: the signature is valid (exp is NOT
   checked — see verifyTokenIgnoringExpiry), the session hasn't been
   revoked/banned, and the session is within its 7-day absolute cap.
   `forceLogout: true` on any rejection tells the client to stop retrying
   and send the user back to the login screen (see assets/js/api.js) —
   this is what fixes the old silent-401-freeze bug: a genuinely dead
   session now surfaces to the UI instead of failing forever in silence. */
router.post('/refresh', async (req, res) => {
  const ip = normalizeIp(req.ip);
  if (refreshRateLimited(ip)) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }

  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  const payload = verifyTokenIgnoringExpiry(token);
  if (!payload) return res.status(401).json({ error: 'Invalid bearer token' });

  if (!payload.jti) {
    // Pre-session-model token (shouldn't happen once this deploy is live,
    // but fail closed rather than refreshing a token with no session record).
    return res.status(401).json({ error: 'Session not recognised', forceLogout: true });
  }
  if (sessionCache.isRevoked(payload.jti)) {
    return res.status(403).json({ error: 'Session revoked', forceLogout: true });
  }
  if (sessionCache.isBanned(ip)) {
    return res.status(403).json({ error: 'IP banned', forceLogout: true });
  }
  if (payload.absExp && Date.now() / 1000 > payload.absExp) {
    sessionCache.markRevoked(payload.jti);
    db.query(
      `UPDATE staff_sessions SET revoked_at = NOW(), revoked_reason = 'absolute_expiry'
        WHERE jti = $1 AND revoked_at IS NULL`,
      [payload.jti]
    ).catch((e) => console.error('[auth] refresh absolute-expiry revoke', e));
    return res.status(403).json({ error: 'Session expired', forceLogout: true });
  }

  try {
    const { rows } = await db.query(
      `SELECT id, name, email, username, role, active FROM employees WHERE id = $1`,
      [payload.sub]
    );
    const emp = rows[0];
    if (!emp || !emp.active) {
      sessionCache.markRevoked(payload.jti);
      return res.status(403).json({ error: 'Account no longer active', forceLogout: true });
    }

    // Enforce the 20-minute idle timeout that expires_at has always encoded but
    // nothing previously checked: slide the window ONLY if the session is still
    // live (not revoked) and hasn't already idled out. If the guarded UPDATE
    // matches no row, the session lapsed — revoke it and force a re-login. An
    // open staff console polls every few seconds, so it always refreshes well
    // within 20 min; only a tab left closed/idle past the window is logged out.
    const { rows: bumped } = await db.query(
      `UPDATE staff_sessions SET last_seen_at = NOW(), expires_at = NOW() + interval '20 minutes'
        WHERE jti = $1 AND revoked_at IS NULL AND expires_at > NOW()
        RETURNING jti`,
      [payload.jti]
    );
    if (!bumped.length) {
      sessionCache.markRevoked(payload.jti);
      db.query(
        `UPDATE staff_sessions SET revoked_at = NOW(), revoked_reason = 'idle_timeout'
          WHERE jti = $1 AND revoked_at IS NULL`,
        [payload.jti]
      ).catch((e) => console.error('[auth] refresh idle-timeout revoke', e));
      return res.status(403).json({ error: 'Session timed out', forceLogout: true });
    }

    const token2 = mintToken(emp, { jti: payload.jti, absExp: payload.absExp });
    res.json({ token: token2 });
  } catch (e) {
    console.error('[auth] refresh', e);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ---- POST /api/auth/guest-login ---- */
router.post('/guest-login', async (req, res) => {
  const { lastName, room, ref, guestId } = req.body || {};
  // guestId is the id the portal issued this browser; it is client-chosen, so
  // it proves nothing on its own — it just stops one widget grinding through
  // guesses without punishing the rest of the hotel behind the same NAT.
  //
  // The fallback must stay DISTINCT per caller. It used to end in the literal
  // string 'unknown', which put every guest who signed in with a booking
  // reference (no guestId, no room — exactly what the confirmation email tells
  // them to use) into ONE shared 8-per-10-minutes bucket for the whole
  // property. Eight reference sign-ins and the ninth guest was refused, and so
  // was everyone after them, on any device, from any network, until the window
  // rolled. Proven with ten different guests on ten different IPs: all ten
  // refused. Falling back to the reference and then the IP keeps the per-caller
  // ceiling meaningful without ever pooling strangers together.
  const deviceKey = String(guestId || room || ref || normalizeIp(req.ip) || 'unknown');
  if (guestLoginRateLimited(normalizeIp(req.ip))
      || guestLoginDeviceRateLimited(deviceKey)) {
    return res.status(429).json({ error: 'Too many attempts. Please try again later.' });
  }
  if (!(ref && ref.trim()) && !(lastName && room)) {
    return res.status(400).json({ error: 'Provide lastName + room, or ref' });
  }
  try {
    // Shared with the live-chat sign-in (POST /api/chat/identify) so both
    // accept the same details. NB the room field now matches the physical
    // room_number as well as the room type — see lib/guestLookup.js.
    const bk = await findBooking({ ref, lastName, room });
    if (bk) {
      return res.json({
        verified: true,
        bookingId: bk.id,
        ref: bk.ref,
        name: bk.guest_name,
        lastName: bk.guest_last_name,
        room: bk.room,
        roomNumber: bk.room_number,
        // `room` is the room TYPE; surfaced explicitly so the portal can show
        // the guest "Room 407 · Building 4 · Studio B4" without guessing which
        // of the two "room" fields it's holding.
        roomType: bk.room || null,
        building: buildingForBooking(bk),
        checkIn: bk.check_in,
        checkOut: bk.check_out,
      });
    }

    /* No booking matched — but "no row in guest_bookings" does NOT mean "not
       a guest of this hotel". Anyone who booked through an OTA is absent by
       design (OTA intake is off, see routes/guestBookings.js), as is every
       walk-in, and as is anyone whose booking predates that switch. Turning
       those people away meant the guest in room 407 could not ask for a towel.

       So they're let in UNCONFIRMED: the portal works, and every request they
       file is flagged for the front desk to check against the register. It is
       deliberately not a security boundary — the portal orders towels, it
       does not spend money or expose anyone else's data — but it does need a
       room to deliver to, so a plausible room is still required. */
    const roomStr = String(room || '').trim();
    if (!lastName || !String(lastName).trim() || !/^[A-Za-z0-9-]{1,10}$/.test(roomStr)) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    return res.json({
      verified: false,
      bookingId: null,
      ref: null,
      name: String(lastName).trim().slice(0, 60),
      lastName: String(lastName).trim().slice(0, 60),
      room: roomStr,
      roomNumber: roomStr,
      // Unknown, and deliberately not guessed: there is no room-number →
      // building rule at this property (see lib/buildings.js).
      roomType: null,
      building: null,
    });
  } catch (e) {
    console.error('[auth] guest-login', e);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ---- POST /api/auth/change-password ---- */
router.post('/change-password', requireAuth, async (req, res) => {
  if (!bcrypt) return res.status(500).json({ error: 'bcrypt not available' });
  const { currentPassword, newPassword } = req.body || {};
  if (!newPassword || newPassword.length < 6)
    return res.status(400).json({ error: 'New password must be at least 6 characters' });

  try {
    const { rows } = await db.query(
      'SELECT password_hash FROM employees WHERE id = $1',
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Employee not found' });

    if (rows[0].password_hash && currentPassword) {
      const ok = await bcrypt.compare(currentPassword, rows[0].password_hash);
      if (!ok) return res.status(401).json({ error: 'Current password incorrect' });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await db.query('UPDATE employees SET password_hash = $1, must_change_password = FALSE WHERE id = $2', [hash, req.user.id]);
    res.json({ ok: true });
  } catch (e) {
    console.error('[auth] change-password', e);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ---- POST /api/auth/register (admin) ---- */
router.post('/register', requireAdmin, async (req, res) => {
  if (!bcrypt) return res.status(500).json({ error: 'bcrypt not available' });
  const { password, name, role, phone, shift } = req.body || {};
  if (!password || !name)
    return res.status(400).json({ error: 'password and name required' });
  if (String(password).length < 6)
    return res.status(400).json({ error: 'Password must be at least 6 characters' });

  // Username and email are always derived from the name so the whole system
  // stays on the single "initiallastname" convention.
  const parts = String(name).toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return res.status(400).json({ error: 'name is required' });
  const username = (parts.length > 1 ? parts[0][0] + parts[parts.length - 1] : parts[0]);
  const email = nameToEmail(name);

  const id = 'u_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const hash = await bcrypt.hash(password, 10);
  const validRole = ['admin', 'frontdesk'].includes(role) ? role : 'frontdesk';

  try {
    const { rows } = await db.query(
      `INSERT INTO employees (id, username, password_hash, name, email, role, phone, shift, active, must_change_password)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,TRUE,TRUE)
       RETURNING id, username, name, email, role, phone, shift, status, active`,
      [id, username, hash, name, email, validRole, phone || null, shift || null]
    );
    res.status(201).json({ user: rows[0] });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Username already taken' });
    console.error('[auth] register', e);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ---- PATCH /api/auth/staff/:id (admin — toggle active / update) ---- */
router.patch('/staff/:id', requireAdmin, async (req, res) => {
  const { active, name, email, role, phone, shift } = req.body || {};
  const fields = [], vals = [];

  if (active !== undefined) { fields.push(`active = $${fields.length + 1}`); vals.push(!!active); }
  if (name)  {
    fields.push(`name  = $${fields.length + 1}`); vals.push(name);
    // Keep the email alias in sync with the name (initiallastname@jpark.hotel).
    if (!email) { fields.push(`email = $${fields.length + 1}`); vals.push(nameToEmail(name)); }
  }
  if (email) { fields.push(`email = $${fields.length + 1}`); vals.push(email); }
  if (role && ['admin','frontdesk'].includes(role)) {
    fields.push(`role  = $${fields.length + 1}`); vals.push(role);
  }
  if (phone) { fields.push(`phone = $${fields.length + 1}`); vals.push(phone); }
  if (shift) { fields.push(`shift = $${fields.length + 1}`); vals.push(shift); }

  if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });
  vals.push(req.params.id);

  try {
    const { rows } = await db.query(
      `UPDATE employees SET ${fields.join(', ')} WHERE id = $${vals.length}
       RETURNING id, username, name, email, role, phone, shift, status, active`,
      vals
    );
    if (!rows.length) return res.status(404).json({ error: 'Employee not found' });
    res.json(rows[0]);
  } catch (e) {
    console.error('[auth] patch-staff', e);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ---- POST /api/auth/staff/:id/reset-password (admin) ----
   Sets the account to a fresh RANDOM temporary password (returned once, in the
   response — the DB only stores its bcrypt hash) and flags must_change_password
   so the employee is forced to choose a new one on next login. Previously this
   used a fixed, publicly-known 'jparkhotel', which left every just-reset account
   guessable. */
router.post('/staff/:id/reset-password', requireAdmin, async (req, res) => {
  if (!bcrypt) return res.status(500).json({ error: 'bcrypt not available' });
  const temp = genTempPassword();
  try {
    const hash = await bcrypt.hash(temp, 10);
    const { rowCount } = await db.query(
      `UPDATE employees
          SET password_hash = $1, must_change_password = TRUE
        WHERE id = $2`,
      [hash, req.params.id]
    );
    if (!rowCount) return res.status(404).json({ error: 'Employee not found' });
    res.json({ ok: true, tempPassword: temp });
  } catch (e) {
    console.error('[auth] reset-password', e);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ---- DELETE /api/auth/staff/:id (admin — hard remove) ----
   Frees the username for re-use and drops the row from the Team Status board.
   Admins cannot delete themselves. */
router.delete('/staff/:id', requireAdmin, async (req, res) => {
  const id = req.params.id;
  if (req.user && req.user.id === id) {
    return res.status(400).json({ error: 'Cannot delete the signed-in account' });
  }
  try {
    const { rowCount } = await db.query('DELETE FROM employees WHERE id = $1', [id]);
    if (!rowCount) return res.status(404).json({ error: 'Employee not found' });
    res.json({ ok: true, id });
  } catch (e) {
    console.error('[auth] delete-staff', e);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ---- GET /api/auth/staff ----
   Any authenticated employee gets the directory (needed for the messaging
   compose autocomplete). Admins additionally see contact / shift details.
   `avatar_updated_at` lets the client decide when to lazy-fetch the photo. */
router.get('/staff', requireAuth, async (req, res) => {
  const admin = req.user && Array.isArray(req.user.perms) && req.user.perms.includes('admin');
  const cols = admin
    ? 'id, username, name, email, role, phone, shift, status, active, created_at, avatar_updated_at'
    : 'id, username, name, role, active, avatar_updated_at';
  try {
    const { rows } = await db.query(
      `SELECT ${cols}
         FROM employees
        WHERE active = true OR $1 = true
        ORDER BY CASE role WHEN 'admin' THEN 0 WHEN 'frontdesk' THEN 1 ELSE 2 END, name`,
      [admin]
    );
    res.json(rows);
  } catch (e) {
    console.error('[auth] list-staff', e);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ---- GET /api/auth/avatar/:id ----
   Returns one employee's avatar as a data URL. The directory only exposes a
   version timestamp, so this endpoint is only hit when the cached version is
   stale or missing — keeps polling traffic cheap. */
router.get('/avatar/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT avatar, avatar_updated_at FROM employees WHERE id = $1',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Employee not found' });
    res.json({
      id: req.params.id,
      avatar: rows[0].avatar || null,
      avatar_updated_at: rows[0].avatar_updated_at,
    });
  } catch (e) {
    console.error('[auth] get-avatar', e);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ---- POST /api/auth/avatar ----
   Current user uploads their photo (data URL). Capped at ~350KB of base64
   (≈ a 256×256 JPEG at quality 0.82) to keep the row small. */
router.post('/avatar', requireAuth, async (req, res) => {
  const { avatar } = req.body || {};
  if (typeof avatar !== 'string' || !avatar.startsWith('data:image/')) {
    return res.status(400).json({ error: 'avatar must be a data URL' });
  }
  if (avatar.length > 350000) {
    return res.status(413).json({ error: 'avatar too large — please downscale before upload' });
  }
  try {
    const { rows } = await db.query(
      `UPDATE employees
          SET avatar = $1, avatar_updated_at = NOW()
        WHERE id = $2
        RETURNING id, avatar_updated_at`,
      [avatar, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Employee not found' });
    res.json({ ok: true, avatar_updated_at: rows[0].avatar_updated_at });
  } catch (e) {
    console.error('[auth] post-avatar', e);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ---- DELETE /api/auth/avatar (current user removes their photo) ---- */
router.delete('/avatar', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `UPDATE employees
          SET avatar = NULL, avatar_updated_at = NOW()
        WHERE id = $1
        RETURNING id, avatar_updated_at`,
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Employee not found' });
    res.json({ ok: true, avatar_updated_at: rows[0].avatar_updated_at });
  } catch (e) {
    console.error('[auth] delete-avatar', e);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
