/* ============================================================
   J Park Hotel — site content (CMS)
   GET /api/content     public: fetch current overrides/media/theme/images
   PUT /api/content     admin: save updated content (full replace)

   Everything the Site Editor's Content, Photos, Colours, Sections and
   Announcements tabs produce lands in this one row. It used to be written
   nowhere: the editor saved to the admin's own localStorage and no caller
   ever issued the PUT below, so a photo reorder, a reworded room
   description or a colour change was visible on exactly one machine and
   never reached a single guest. assets/js/content-sync.js is the client
   half that finally round-trips it.

   Egress note (see the 2026-07-13 Neon transfer outage): this row is read
   on EVERY public page load, so GET accepts `?since=<ms>` and answers
   `{ unchanged: true }` off a single timestamp column when the caller's
   cached copy is still current. Only a genuinely changed row pays for the
   full payload.
   ============================================================ */
const express = require('express');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

/* Hard ceiling on one stored content payload. The Photos tab can inline an
   uploaded image as a base64 data: URL (up to 4MB each, see server.js's
   bodyLarge), and this row is fetched by every guest on every page load —
   a few of those would put the whole site back into the Neon transfer
   outage that took it down on 2026-07-13. Refusing the save with a clear
   message is far kinder than accepting it and taking the site off the air. */
const MAX_CONTENT_BYTES = 1_500_000;

function jsonSize(...parts) {
  return parts.reduce((n, p) => n + Buffer.byteLength(JSON.stringify(p || null)), 0);
}

/* GET /api/content — no auth required (public site reads it) */
router.get('/', async (req, res) => {
  const since = Number(req.query.since);
  try {
    // Cheap freshness probe first: one timestamp, not the whole CMS row.
    if (Number.isFinite(since) && since > 0) {
      const { rows } = await db.query('SELECT updated_at FROM site_content WHERE id = 1');
      if (!rows.length) return res.json({});
      const updatedAt = new Date(rows[0].updated_at).getTime();
      // Equal counts as unchanged; the caller already holds this exact version.
      if (updatedAt <= since) return res.json({ unchanged: true, updatedAt });
    }

    const { rows } = await db.query(
      `SELECT overrides, images, theme, hidden, media, announcements, edit_log, updated_at
         FROM site_content WHERE id = 1`
    );
    if (!rows.length) return res.json({});
    const r = rows[0];
    res.json({
      overrides:     r.overrides     || {},
      images:        r.images        || {},
      theme:         r.theme         || {},
      hidden:        r.hidden        || [],
      media:         r.media         || {},
      announcements: r.announcements || [],
      editLog:       r.edit_log      || [],
      updatedAt: r.updated_at ? new Date(r.updated_at).getTime() : null,
    });
  } catch (e) {
    console.error('[content] get', e);
    res.status(500).json({ error: 'Database error' });
  }
});

/* Validates the Photos tab's payload: { setId: [{ src, video }] }. A bad
   shape here would render as broken <img>s across the public site, so it is
   rejected at the door rather than stored. */
function invalidMedia(media) {
  if (typeof media !== 'object' || Array.isArray(media)) return 'media must be an object';
  for (const [setId, list] of Object.entries(media)) {
    if (!Array.isArray(list)) return `media["${setId}"] must be an array`;
    for (const it of list) {
      if (!it || typeof it !== 'object' || typeof it.src !== 'string' || !it.src) {
        return `media["${setId}"] items must be { src, video }`;
      }
    }
  }
  return null;
}

/* PUT /api/content — admin only */
router.put('/', requireAdmin, async (req, res) => {
  const { overrides, images, theme, hidden, media, announcements, editLog } = req.body || {};
  // `hidden` binds to a TEXT[] column — a non-array (e.g. a string) would fail
  // the INSERT with a raw 500 instead of a clean validation error.
  if (hidden !== undefined && hidden !== null && !Array.isArray(hidden)) {
    return res.status(400).json({ error: 'hidden must be an array' });
  }
  if (announcements !== undefined && announcements !== null && !Array.isArray(announcements)) {
    return res.status(400).json({ error: 'announcements must be an array' });
  }
  if (media !== undefined && media !== null) {
    const bad = invalidMedia(media);
    if (bad) return res.status(400).json({ error: bad });
  }

  const size = jsonSize(overrides, images, theme, media, announcements, editLog);
  if (size > MAX_CONTENT_BYTES) {
    return res.status(413).json({
      error: 'Content too large to publish',
      code: 'CONTENT_TOO_LARGE',
      bytes: size,
      maxBytes: MAX_CONTENT_BYTES,
    });
  }

  try {
    const { rows } = await db.query(
      `INSERT INTO site_content (id, overrides, images, theme, hidden, media, announcements, edit_log, updated_at)
       VALUES (1, $1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (id) DO UPDATE
         SET overrides     = EXCLUDED.overrides,
             images        = EXCLUDED.images,
             theme         = EXCLUDED.theme,
             hidden        = EXCLUDED.hidden,
             media         = EXCLUDED.media,
             announcements = EXCLUDED.announcements,
             edit_log      = EXCLUDED.edit_log,
             updated_at    = NOW()
       RETURNING updated_at`,
      [
        JSON.stringify(overrides || {}),
        JSON.stringify(images    || {}),
        JSON.stringify(theme     || {}),
        hidden || [],
        JSON.stringify(media    || {}),
        JSON.stringify(announcements || []),
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
