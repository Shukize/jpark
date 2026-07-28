/* ============================================================
   J Park Hotel — email routes
   GET  /api/email/status    is the mail provider configured? (auth)
   POST /api/email           send a transactional email (ADMIN)

   POST used to be requireAuth with no limit of any kind: any one of the
   (up to 100) staff accounts — which are shared department logins,
   signed in on up to 20 devices each — could send unlimited arbitrary
   HTML to any address on earth, From: the hotel's own domain-verified
   Resend sender. That is a phishing cannon carrying the hotel's own
   DKIM signature, and it doubles as a way to burn the Resend quota that
   every real booking confirmation depends on. Nothing in the site calls
   it — every guest-facing send goes through the confirmation helpers in
   routes/guestBookings.js, which build their own copy — so tightening
   it costs no working feature.

   Now: admin-only, rate limited, recipient count capped. GET /status
   stays on requireAuth; the staff console reads it to show whether
   email is live, and it discloses nothing but a boolean.
   ============================================================ */
const express = require('express');
const { sendEmail, isConfigured } = require('../mailer');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { makeLimiter } = require('../lib/rateLimit');

const router = express.Router();

// Well above any plausible hand-driven use, far below "useful for spam".
const sendRateLimited = makeLimiter(20, 10 * 60 * 1000);
const MAX_RECIPIENTS = 10;

/* GET /api/email/status — lets the staff console show whether email is live */
router.get('/status', requireAuth, (_req, res) => {
  res.json({ configured: isConfigured() });
});

/* POST /api/email  { to, subject, html?, text?, replyTo? }  (admin only) */
router.post('/', requireAdmin, async (req, res) => {
  if (sendRateLimited(req.ip)) {
    return res.status(429).json({ error: 'Too many emails sent. Please try again later.' });
  }
  const { to, subject, html, text, replyTo } = req.body || {};
  if (!to || !subject || (!html && !text)) {
    return res.status(400).json({ error: 'to, subject and html|text are required' });
  }
  // One call must not fan out into a mailing list.
  if (Array.isArray(to) && to.length > MAX_RECIPIENTS) {
    return res.status(400).json({ error: `At most ${MAX_RECIPIENTS} recipients per email` });
  }
  const result = await sendEmail({ to, subject, html, text, replyTo });
  if (!result.ok) {
    // 503 when the provider just isn't configured yet; 502 for a real send failure.
    return res.status(result.skipped ? 503 : 502).json({ error: result.error });
  }
  res.status(201).json({ status: 'sent', id: result.id });
});

module.exports = router;
