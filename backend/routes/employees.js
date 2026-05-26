const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const router = express.Router();

const ROLES = ['admin', 'frontdesk', 'housekeeping'];
const STATUSES = ['on_shift', 'on_break', 'off_shift'];

// GET /api/employees   (any authenticated employee)
// Returns the full team roster for the staff console's Team Status board.
router.get('/', requireAuth, async (_req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, name, email, role, status, shift, phone, updated_at
         FROM employees
        ORDER BY CASE role WHEN 'admin' THEN 0 WHEN 'frontdesk' THEN 1 ELSE 2 END, name`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// PATCH /api/employees/:id   (admin only)
// Body: { name, email, role, status, shift, phone } — any subset.
router.patch('/:id', requireAdmin, async (req, res) => {
  const { name, email, role, status, shift, phone } = req.body || {};
  if (role && !ROLES.includes(role)) {
    return res.status(400).json({ error: `role must be one of: ${ROLES.join(', ')}` });
  }
  if (status && !STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${STATUSES.join(', ')}` });
  }

  try {
    const { rows } = await db.query(
      `UPDATE employees
          SET name   = COALESCE($1, name),
              email  = COALESCE($2, email),
              role   = COALESCE($3, role),
              status = COALESCE($4, status),
              shift  = COALESCE($5, shift),
              phone  = COALESCE($6, phone)
        WHERE id = $7
        RETURNING id, name, email, role, status, shift, phone, updated_at`,
      [name || null, email || null, role || null, status || null, shift || null, phone || null, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Employee not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;
