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

const express = require('express');
const cors = require('cors');

const migrate = require('./migrate');
const authRouter            = require('./routes/auth');
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
const ratesRouter           = require('./routes/rates');

const app = express();
const PORT = process.env.PORT || 3000;

// Render always sits in front of this app as a reverse proxy — trust its
// X-Forwarded-For so req.ip reflects the real guest IP (used by the
// payments rate limiter).
app.set('trust proxy', true);

const allowedOrigins = (process.env.FRONTEND_ORIGIN || '*')
  .split(',').map((o) => o.trim()).filter(Boolean);

app.use(cors({
  origin: allowedOrigins.includes('*')
    ? '*'
    : (origin, cb) => cb(null, !origin || allowedOrigins.includes(origin)),
  credentials: true,
}));
app.use(express.json({ limit: '4mb' })); // allow image data-URLs in content PUT

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/api/auth',             authRouter);
app.use('/api/messages',         messagesRouter);
app.use('/api/service-requests', serviceRequestsRouter);
app.use('/api/v1/ota-sync',      otaSyncRouter);
app.use('/api/v1/ota-email',     otaEmailRouter);
app.use('/api/employees',        employeesRouter);
app.use('/api/guest-bookings',   guestBookingsRouter);
app.use('/api/chat',             chatRouter);
app.use('/api/orders',           ordersRouter);
app.use('/api/content',          contentRouter);
app.use('/api/email',            emailRouter);
app.use('/api/v1',               paymentsRouter);
app.use('/api/maintenance',      maintenanceRouter);
app.use('/api/rates',            ratesRouter);

migrate()
  .then(() => app.listen(PORT, () => console.log(`J Park API listening on port ${PORT}`)))
  .catch((err) => { console.error('[migrate] failed:', err); process.exit(1); });
