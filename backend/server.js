require('dotenv').config();

if (!process.env.DATABASE_URL) {
  console.error('[startup] DATABASE_URL is not set. Set it in the Render dashboard under Environment.');
  process.exit(1);
}

// Fail closed: in production the JWT signing secret must be set and must not be
// the public placeholder, otherwise anyone could forge an admin token.
const DEMO_SECRET = 'jpark-demo-shared-secret';
if (process.env.NODE_ENV === 'production' &&
    (!process.env.AUTH_TOKEN_SECRET || process.env.AUTH_TOKEN_SECRET === DEMO_SECRET)) {
  console.error('[startup] AUTH_TOKEN_SECRET is missing or set to the public demo value. ' +
    'Set a long random AUTH_TOKEN_SECRET in the Render dashboard before serving production traffic.');
  process.exit(1);
}

// Fail closed: without this secret, POST /api/guest-bookings and
// POST /api/v1/ota-email accept unauthenticated requests (by design, for
// local dev only — see routes/guestBookings.js and routes/otaEmail.js).
if (process.env.NODE_ENV === 'production' && !process.env.OTA_WEBHOOK_SECRET) {
  console.error('[startup] OTA_WEBHOOK_SECRET is not set. Set it in the Render dashboard before ' +
    'serving production traffic — otherwise the OTA booking-ingest endpoints accept anyone.');
  process.exit(1);
}

const express = require('express');
const cors = require('cors');

const migrate = require('./migrate');
const db                    = require('./db');
const payments              = require('./lib/payments');
const paymentReconciler     = require('./paymentReconciler');
const sessionCache          = require('./lib/sessionCache');
const authRouter            = require('./routes/auth');
const sessionsRouter        = require('./routes/sessions');
const messagesRouter        = require('./routes/messages');
const serviceRequestsRouter = require('./routes/serviceRequests');
const otaSyncRouter         = require('./routes/otaSync');
const otaEmailRouter        = require('./routes/otaEmail');
const employeesRouter       = require('./routes/employees');
const guestBookingsRouter   = require('./routes/guestBookings');
const chatRouter            = require('./routes/chat');
const chatConfigRouter      = require('./routes/chatConfig');
const ordersRouter          = require('./routes/orders');
const contentRouter         = require('./routes/content');
const emailRouter           = require('./routes/email');
const paymentsRouter        = require('./routes/payments');
const maintenanceRouter     = require('./routes/maintenance');
const bookingPolicyRouter   = require('./routes/bookingPolicy');
const ratesRouter           = require('./routes/rates');
const availabilityRouter    = require('./routes/availability');
const hotelAdsRouter        = require('./routes/hotelAds');

const app = express();
const PORT = process.env.PORT || 3000;

// Render sits in front of this app as a SINGLE reverse-proxy hop — trust
// exactly one proxy so req.ip is the real client IP (the right-most entry the
// proxy appended), not a client-spoofable left-most X-Forwarded-For value.
// `true` would trust the whole chain and let a caller forge req.ip, defeating
// every rate limiter (makeLimiter) and the banned-IP list (sessionCache).
app.set('trust proxy', 1);

const allowedOrigins = (process.env.FRONTEND_ORIGIN || '*')
  .split(',').map((o) => o.trim()).filter(Boolean);

app.use(cors({
  origin: allowedOrigins.includes('*')
    ? '*'
    : (origin, cb) => cb(null, !origin || allowedOrigins.includes(origin)),
  credentials: true,
}));

// Per-route body-size tiers instead of one global limit — most routes are
// pure structured JSON, so they get a small cap; only the Site Editor's
// image-upload PUT actually needs megabytes.
const bodyLarge    = express.json({ limit: '4mb' });   // image data-URLs (content editor)
const bodyOta      = express.json({ limit: '1mb' });   // forwarded OTA HTML emails can be sizable
const bodyDefault  = express.json({ limit: '512kb' }); // comfortably covers the 350KB avatar upload

// Payments are structured JSON only, no images — but the webhook additionally
// needs the EXACT bytes it was sent. Omise signs `<timestamp>.<raw body>`, and
// a body that has been parsed and re-serialised no longer hashes to the same
// value (key order, whitespace and number formatting are all free to change),
// so the signature could never be checked from req.body.
//
// The raw copy is kept for the webhook path alone. Retaining a buffer on every
// booking POST would be a pointless per-request cost, and req.url here is
// already relative to this router's mount point.
const bodyPayments = express.json({
  limit: '256kb',
  verify: (req, _res, buf) => {
    if (req.url && req.url.indexOf('/payments/webhook') !== -1) req.rawBody = buf;
  },
});

// Which build is actually serving. Render exposes the deployed commit as
// RENDER_GIT_COMMIT at runtime; without it there is no way to tell from
// outside whether a push has finished rolling out, which turned "did the
// deploy land?" into guesswork. Short SHA only, and the repo is public, so
// this reveals nothing that isn't already on GitHub. Falls back to 'dev'
// when running locally.
const BUILD_COMMIT = (process.env.RENDER_GIT_COMMIT || 'dev').slice(0, 7);

app.get('/health', (_req, res) => res.json({ status: 'ok', commit: BUILD_COMMIT }));

// Deliberately separate from /health: Render's own deploy health check hits
// /health, and it must never fail on a transient DB hiccup mid-deploy. This
// one actually touches Postgres.
//
// It is pinged only a few times a day, NOT continuously. Waking the compute
// costs a full autosuspend window (~5 min) every time, and on Neon's Free
// plan the month's whole allowance is 100 CU-hours ≈ 400 hours at 0.25 CU —
// so a keep-warm ping every few minutes would spend the budget on an idle
// database and suspend the compute mid-month, which is the very outage it
// was meant to prevent. The database is therefore allowed to sleep, and
// backend/db.js's connectionTimeoutMillis bounds what a guest's first query
// pays to wake it (see chat.js's serialized postChain for why that mattered).
// See .github/workflows/health-check.yml for the two schedules.
app.get('/health/db', async (_req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch (err) {
    console.error('[health/db]', err);
    res.status(503).json({ status: 'error' });
  }
});

// Banned-IP check is scoped to the staff console only (/api/auth,
// /api/sessions) — never mounted globally — so a shared/NAT'd IP banned
// for staff-login abuse can never also block a real guest's booking or
// chat. See lib/sessionCache.js's blockBannedIp.
app.use('/api/auth',             bodyDefault,  sessionCache.blockBannedIp, authRouter);
app.use('/api/sessions',         bodyDefault,  sessionCache.blockBannedIp, sessionsRouter);
app.use('/api/messages',         bodyDefault,  messagesRouter);
app.use('/api/service-requests', bodyDefault,  serviceRequestsRouter);
app.use('/api/v1/ota-sync',      bodyDefault,  otaSyncRouter);
app.use('/api/v1/ota-email',     bodyOta,      otaEmailRouter);
app.use('/api/employees',        bodyDefault,  employeesRouter);
app.use('/api/guest-bookings',   bodyOta,      guestBookingsRouter);
app.use('/api/chat',             bodyDefault,  chatRouter);
app.use('/api/chat-config',      bodyDefault,  chatConfigRouter);
app.use('/api/orders',           bodyDefault,  ordersRouter);
app.use('/api/content',          bodyLarge,    contentRouter);
app.use('/api/email',            bodyDefault,  emailRouter);
app.use('/api/v1',               bodyPayments, paymentsRouter);
app.use('/api/maintenance',      bodyDefault,  maintenanceRouter);
app.use('/api/booking-policy',   bodyDefault,  bookingPolicyRouter);
app.use('/api/rates',            bodyDefault,  ratesRouter);
app.use('/api/availability',     bodyDefault,  availabilityRouter);
app.use('/api/v1/hotel-ads',                   hotelAdsRouter);   // GET-only feed, no body parser needed

/* Say out loud, once, which payment gateway is live and in which mode.

   Test keys and live keys are indistinguishable everywhere else — same API
   host, same code path, same "paid" banner for the guest — so a deployment
   can sit on test keys for weeks while appearing to take money. One
   unmissable startup line is the cheapest possible guard against that, in
   both directions: it also catches live keys left in a staging environment. */
function announcePayments() {
  const provider = payments.active();
  if (!provider || !provider.isConfigured()) {
    console.log('[payments] No gateway configured — the booking page offers pay-at-check-in only.');
    return;
  }
  const mode = payments.mode();
  if (mode === 'live') {
    console.log(`[payments] ${provider.label} is LIVE — real payments will be taken. Webhook: ${payments.webhookUrl() || '(no API URL set)'}`);
  } else {
    console.warn(`[payments] ${provider.label} is in TEST MODE — no real money will move. ` +
      'Swap in the live keys when you are ready to take real payments.');
  }
  if (!payments.siteBaseUrl()) {
    console.warn('[payments] PUBLIC_SITE_URL is not set — a guest returning from a 3-D Secure ' +
      'challenge cannot be sent back to the booking page.');
  }
}

migrate()
  .then(() => sessionCache.hydrate())
  .then(() => app.listen(PORT, () => {
    console.log(`J Park API listening on port ${PORT}`);
    announcePayments();
    // Recover any payment left in flight by a restart. See
    // backend/paymentReconciler.js — Omise does not retry failed webhook
    // deliveries, so a deploy timed badly against a guest's payment would
    // otherwise lose the confirmation permanently.
    paymentReconciler.start();
  }))
  .catch((err) => { console.error('[migrate] failed:', err); process.exit(1); });
