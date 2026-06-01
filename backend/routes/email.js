/* ============================================================
   J Park Hotel — email routes
   GET  /api/email/status    is the mail provider configured? (auth)
   POST /api/email           send a transactional email (auth)

   Guarded by requireAuth so only signed-in staff/admin can trigger
   sends — the public site never touches these. Used for booking
   confirmations, guest replies, and staff notifications.
   ============================================================ */
const express = require('express');
const { sendEmail, isConfigured } = require('../mailer');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

/* GET /api/email/status — lets the staff console show whether email is live */
router.get('/status', requireAuth, (_req, res) => {
  res.json({ configured: isConfigured() });
});

/* POST /api/email  { to, subject, html?, text?, replyTo? } */
router.post('/', requireAuth, async (req, res) => {
  const { to, subject, html, text, replyTo } = req.body || {};
  if (!to || !subject || (!html && !text)) {
    return res.status(400).json({ error: 'to, subject and html|text are required' });
  }
  const result = await sendEmail({ to, subject, html, text, replyTo });
  if (!result.ok) {
    // 503 when the provider just isn't configured yet; 502 for a real send failure.
    return res.status(result.skipped ? 503 : 502).json({ error: result.error });
  }
  res.status(201).json({ status: 'sent', id: result.id });
});

module.exports = router;
