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
const bodyPayments = express.json({ limit: '256kb' }); // structured JSON only, no images
const bodyDefault  = express.json({ limit: '512kb' }); // comfortably covers the 350KB avatar upload

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// Deliberately separate from /health: Render's own deploy health check hits
// /health, and it must never fail on a transient DB hiccup mid-deploy. This
// one actually touches Postgres — see .github/workflows/health-check.yml,
// which pings it every few minutes so Neon's autosuspend compute never goes
// idle long enough to sleep. Left to sleep, the next real query (very often
// a guest's chat message — see chat.js's serialized postChain) pays the full
// wake cost; see backend/db.js's connectionTimeoutMillis for the other half
// of this fix, which bounds that cost instead of letting it hang forever.
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
app.use('/api/orders',           bodyDefault,  ordersRouter);
app.use('/api/content',          bodyLarge,    contentRouter);
app.use('/api/email',            bodyDefault,  emailRouter);
app.use('/api/v1',               bodyPayments, paymentsRouter);
app.use('/api/maintenance',      bodyDefault,  maintenanceRouter);
app.use('/api/booking-policy',   bodyDefault,  bookingPolicyRouter);
app.use('/api/rates',            bodyDefault,  ratesRouter);
app.use('/api/availability',     bodyDefault,  availabilityRouter);
app.use('/api/v1/hotel-ads',                   hotelAdsRouter);   // GET-only feed, no body parser needed

migrate()
  .then(() => sessionCache.hydrate())
  .then(() => app.listen(PORT, () => console.log(`J Park API listening on port ${PORT}`)))
  .catch((err) => { console.error('[migrate] failed:', err); process.exit(1); });
