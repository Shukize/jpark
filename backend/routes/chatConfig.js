/* ============================================================
   J Park Hotel — Live Chat settings (Site Editor "Live Chat" tab)
   GET /api/chat-config   public: the hotel's chat wording/topics
   PUT /api/chat-config   admin: save chat wording/topics

   The live-chat assistant ships with sensible default wording in
   assets/js/chat.js. This lets an administrator rewrite what the bot
   says, retune which keywords trigger which answer, turn answers on or
   off, and add brand-new answers — in all five languages — without a
   code change, and have it reach every guest device (the plain text
   CMS in routes/content.js is browser-local and never syncs, so chat
   wording gets its own persisted, validated store instead).

   Everything here is sparse: the client sends only what an admin has
   actually changed, and assets/js/chat.js falls back to the shipped
   default for anything absent. So an empty config === today's behaviour.

   Security posture: this text is only ever rendered to guests as
   textContent (never innerHTML — see assets/js/chat.js render()), and it
   touches nothing in the pricing/auth/booking paths. The write is still
   admin-only and every field is validated for type, length and count
   here so a malformed or oversized payload can't bloat the row that the
   public GET returns to every guest.
   ============================================================ */
const express = require('express');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Must match assets/js/i18n.js SUPPORTED.
const LANGS = ['th', 'en', 'ja', 'zh-Hans', 'zh-Hant'];
// Must match the system-message keys assets/js/chat.js knows how to place.
const SYSTEM_KEYS = ['greeting', 'subtitle', 'connecting', 'waitTime', 'notUnderstood', 'hello', 'thanks'];

const MAX_TEXT = 2000;       // one localized string (answer / label / system msg)
const MAX_TOPICS = 60;       // total answers (builtin + custom)
const MAX_KEYWORDS = 60;     // trigger words per answer
const MAX_KEYWORD_LEN = 80;
const MAX_ID_LEN = 40;
const MAX_JSON_BYTES = 200 * 1024; // whole-config ceiling (guest GET payload guard)
const ID_RE = /^[a-z0-9][a-z0-9_-]*$/i;

/* A per-language { lang: string } bag (used by answers, labels and system
   messages). Unknown languages and non-strings are rejected; over-long
   strings too. Returns a cleaned copy so nothing extra is ever stored. */
function cleanLangMap(val, where, violations) {
  if (val == null) return undefined;
  if (typeof val !== 'object' || Array.isArray(val)) {
    violations.push(`${where} must be an object of language → text`);
    return undefined;
  }
  const out = {};
  Object.keys(val).forEach((lang) => {
    if (!LANGS.includes(lang)) { violations.push(`${where}: unknown language "${lang}"`); return; }
    const s = val[lang];
    if (s == null || s === '') return; // sparse: empty means "use the default"
    if (typeof s !== 'string') { violations.push(`${where}.${lang} must be text`); return; }
    if (s.length > MAX_TEXT) { violations.push(`${where}.${lang} is too long (max ${MAX_TEXT})`); return; }
    out[lang] = s;
  });
  return Object.keys(out).length ? out : undefined;
}

function cleanSystem(system, violations) {
  if (system == null) return undefined;
  if (typeof system !== 'object' || Array.isArray(system)) {
    violations.push('system must be an object');
    return undefined;
  }
  const out = {};
  Object.keys(system).forEach((key) => {
    if (!SYSTEM_KEYS.includes(key)) { violations.push(`system: unknown message "${key}"`); return; }
    const map = cleanLangMap(system[key], `system.${key}`, violations);
    if (map) out[key] = map;
  });
  return Object.keys(out).length ? out : undefined;
}

function cleanTopics(topics, violations) {
  if (topics == null) return undefined;
  if (!Array.isArray(topics)) { violations.push('topics must be an array'); return undefined; }
  if (topics.length > MAX_TOPICS) { violations.push(`too many answers (max ${MAX_TOPICS})`); return undefined; }
  const seen = new Set();
  const out = [];
  topics.forEach((tRaw, i) => {
    const where = `topic #${i + 1}`;
    if (!tRaw || typeof tRaw !== 'object' || Array.isArray(tRaw)) { violations.push(`${where} must be an object`); return; }
    const id = tRaw.id;
    if (typeof id !== 'string' || !ID_RE.test(id) || id.length > MAX_ID_LEN) {
      violations.push(`${where}: invalid id`);
      return;
    }
    if (seen.has(id)) { violations.push(`duplicate answer id "${id}"`); return; }
    seen.add(id);

    const topic = { id: id, builtin: !!tRaw.builtin };
    if (tRaw.enabled != null) topic.enabled = !!tRaw.enabled;
    if (tRaw.quick != null) topic.quick = !!tRaw.quick;

    if (tRaw.keywords != null) {
      if (!Array.isArray(tRaw.keywords)) { violations.push(`${where}.keywords must be an array`); return; }
      if (tRaw.keywords.length > MAX_KEYWORDS) { violations.push(`${where}: too many keywords (max ${MAX_KEYWORDS})`); return; }
      const kws = [];
      tRaw.keywords.forEach((k) => {
        if (typeof k !== 'string') { violations.push(`${where}: each keyword must be text`); return; }
        const kw = k.trim();
        if (!kw) return;
        if (kw.length > MAX_KEYWORD_LEN) { violations.push(`${where}: a keyword is too long (max ${MAX_KEYWORD_LEN})`); return; }
        kws.push(kw);
      });
      topic.keywords = kws;
    }

    const label = cleanLangMap(tRaw.label, `${where}.label`, violations);
    if (label) topic.label = label;
    const answer = cleanLangMap(tRaw.answer, `${where}.answer`, violations);
    if (answer) topic.answer = answer;

    out.push(topic);
  });
  return out;
}

/* GET — no auth (the guest chat widget reads it on every public page).
   Fails open to an empty config so a read error can never break the chat. */
router.get('/', async (_req, res) => {
  try {
    const { rows } = await db.query('SELECT chat_config, updated_at FROM site_content WHERE id = 1');
    const cfg = rows.length && rows[0].chat_config && typeof rows[0].chat_config === 'object'
      ? rows[0].chat_config : {};
    res.json({
      config: cfg,
      updatedAt: rows.length && rows[0].updated_at ? new Date(rows[0].updated_at).getTime() : null,
    });
  } catch (e) {
    console.error('[chat-config] get', e);
    res.json({ config: {}, updatedAt: null });
  }
});

/* PUT — admin only. Validates the whole payload, then stores a cleaned,
   sparse copy (only recognised keys/languages, within limits). */
router.put('/', requireAdmin, async (req, res) => {
  const body = (req.body && req.body.config) || {};
  if (typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({ error: 'config must be an object' });
  }

  const violations = [];
  const cleaned = {};
  const system = cleanSystem(body.system, violations);
  if (system) cleaned.system = system;
  const topics = cleanTopics(body.topics, violations);
  if (topics) cleaned.topics = topics;

  if (violations.length) {
    return res.status(400).json({ error: 'Invalid chat settings', details: violations });
  }

  const json = JSON.stringify(cleaned);
  if (Buffer.byteLength(json, 'utf8') > MAX_JSON_BYTES) {
    return res.status(400).json({ error: 'Chat settings are too large. Please shorten some answers.' });
  }

  try {
    await db.query(
      `INSERT INTO site_content (id, chat_config, updated_at)
       VALUES (1, $1, NOW())
       ON CONFLICT (id) DO UPDATE SET chat_config = EXCLUDED.chat_config, updated_at = NOW()`,
      [json]
    );
    res.json({ ok: true, config: cleaned });
  } catch (e) {
    console.error('[chat-config] put', e);
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;
