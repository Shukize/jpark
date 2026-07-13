/* ============================================================
   J Park Hotel — site content (CMS)
   GET /api/content     public: fetch current overrides/theme/images
   PUT /api/content     admin: save updated content (full replace)
   ============================================================ */
const express = require('express');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

/* GET /api/content — no auth required (public site reads it) */
router.get('/', async (_req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT overrides, images, theme, hidden, edit_log, updated_at FROM site_content WHERE id = 1'
    );
    if (!rows.length) return res.json({});
    const r = rows[0];
    res.json({
      overrides: r.overrides || {},
      images:    r.images    || {},
      theme:     r.theme     || {},
      hidden:    r.hidden    || [],
      editLog:   r.edit_log  || [],
      updatedAt: r.updated_at ? new Date(r.updated_at).getTime() : null,
    });
  } catch (e) {
    console.error('[content] get', e);
    res.status(500).json({ error: 'Database error' });
  }
});

/* PUT /api/content — admin only */
router.put('/', requireAdmin, async (req, res) => {
  const { overrides, images, theme, hidden, editLog } = req.body || {};
  // `hidden` binds to a TEXT[] column — a non-array (e.g. a string) would fail
  // the INSERT with a raw 500 instead of a clean validation error.
  if (hidden !== undefined && hidden !== null && !Array.isArray(hidden)) {
    return res.status(400).json({ error: 'hidden must be an array' });
  }
  try {
    const { rows } = await db.query(
      `INSERT INTO site_content (id, overrides, images, theme, hidden, edit_log, updated_at)
       VALUES (1, $1, $2, $3, $4, $5, NOW())
       ON CONFLICT (id) DO UPDATE
         SET overrides  = EXCLUDED.overrides,
             images     = EXCLUDED.images,
             theme      = EXCLUDED.theme,
             hidden     = EXCLUDED.hidden,
             edit_log   = EXCLUDED.edit_log,
             updated_at = NOW()
       RETURNING updated_at`,
      [
        JSON.stringify(overrides || {}),
        JSON.stringify(images    || {}),
        JSON.stringify(theme     || {}),
        hidden || [],
        JSON.stringify(editLog   || []),
      ]
    );
    res.json({ ok: true, updatedAt: new Date(rows[0].updated_at).getTime() });
  } catch (e) {
    console.error('[content] put', e);
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;
