/* ============================================================
   J Park Hotel — authentication routes
   POST /api/auth/login          staff login (bcrypt, returns JWT)
   POST /api/auth/guest-login    guest portal login (name+room or ref)
   POST /api/auth/change-password change own password (authenticated)
   POST /api/auth/register       create staff account (admin only)
   DELETE /api/auth/staff/:id    deactivate account (admin only)
   ============================================================ */
const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

let bcrypt;
try { bcrypt = require('bcrypt'); } catch (_) { bcrypt = null; }

const router = express.Router();
const SECRET = process.env.AUTH_TOKEN_SECRET || 'jpark-demo-shared-secret';
const TTL = 12 * 60 * 60; // 12-hour shift token

function nameToEmail(name) {
  const parts = (name || 'staff').toLowerCase().trim().split(/\s+/);
  return (parts.length > 1 ? parts[0][0] + parts[parts.length - 1] : parts[0]) + '@jpark.hotel';
}

/* ---- JWT helpers (mirror of middleware/auth.js) ---- */
function b64url(str) {
  return Buffer.from(str).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function mintToken(emp) {
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
    iat: now,
    exp: now + TTL,
  }));
  const sig = crypto.createHmac('sha256', SECRET)
    .update(header + '.' + payload).digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return header + '.' + payload + '.' + sig;
}

/* ---- POST /api/auth/login ---- */
router.post('/login', async (req, res) => {
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

    if (!emp.password_hash) {
      // Account exists but no password hash yet — fall back to demo plaintext
      // comparison so the system remains functional before bcrypt is seeded.
      const fallback = password === 'admin123' && emp.role === 'admin'
        || password === 'staff123';
      if (!fallback) return res.status(401).json({ error: 'Invalid credentials' });
    } else {
      if (!bcrypt) return res.status(500).json({ error: 'bcrypt not available' });
      const ok = await bcrypt.compare(password, emp.password_hash);
      if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = mintToken(emp);
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

/* ---- POST /api/auth/guest-login ---- */
router.post('/guest-login', async (req, res) => {
  const { lastName, room, ref } = req.body || {};
  try {
    let rows;
    if (ref && ref.trim()) {
      ({ rows } = await db.query(
        `SELECT id, ref, guest_name, guest_last_name, room, check_in, check_out, status
           FROM guest_bookings WHERE ref ILIKE $1 AND status != 'cancelled' LIMIT 1`,
        [ref.trim()]
      ));
    } else if (lastName && room) {
      ({ rows } = await db.query(
        `SELECT id, ref, guest_name, guest_last_name, room, check_in, check_out, status
           FROM guest_bookings
          WHERE guest_last_name ILIKE $1 AND room = $2 AND status != 'cancelled'
          ORDER BY check_in DESC LIMIT 1`,
        [lastName.trim(), room.trim()]
      ));
    } else {
      return res.status(400).json({ error: 'Provide lastName + room, or ref' });
    }

    if (!rows || !rows.length)
      return res.status(404).json({ error: 'Booking not found' });

    const bk = rows[0];
    res.json({
      bookingId: bk.id,
      ref: bk.ref,
      name: bk.guest_name,
      lastName: bk.guest_last_name,
      room: bk.room,
      checkIn: bk.check_in,
      checkOut: bk.check_out,
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
  const { username, password, name, email, role, phone, shift } = req.body || {};
  if (!username || !password || !name)
    return res.status(400).json({ error: 'username, password, name required' });

  const id = 'u_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const hash = await bcrypt.hash(password, 10);
  const validRole = ['admin', 'frontdesk'].includes(role) ? role : 'frontdesk';

  try {
    const { rows } = await db.query(
      `INSERT INTO employees (id, username, password_hash, name, email, role, phone, shift, active, must_change_password)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,TRUE,TRUE)
       RETURNING id, username, name, email, role, phone, shift, status, active`,
      [id, username.trim().toLowerCase(), hash, name, email || nameToEmail(name), validRole, phone || null, shift || null]
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
  if (name)  { fields.push(`name  = $${fields.length + 1}`); vals.push(name); }
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

/* ---- GET /api/auth/staff (admin — list all accounts) ---- */
router.get('/staff', requireAdmin, async (_req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, username, name, email, role, phone, shift, status, active, created_at
         FROM employees ORDER BY CASE role WHEN 'admin' THEN 0 WHEN 'frontdesk' THEN 1 ELSE 2 END, name`
    );
    res.json(rows);
  } catch (e) {
    console.error('[auth] list-staff', e);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
