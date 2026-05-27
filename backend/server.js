require('dotenv').config();

if (!process.env.DATABASE_URL) {
  console.error('[startup] DATABASE_URL is not set. Set it in the Render dashboard under Environment.');
  process.exit(1);
}

const express = require('express');
const cors = require('cors');

const migrate = require('./migrate');
const authRouter            = require('./routes/auth');
const messagesRouter        = require('./routes/messages');
const serviceRequestsRouter = require('./routes/serviceRequests');
const otaSyncRouter         = require('./routes/otaSync');
const employeesRouter       = require('./routes/employees');
const guestBookingsRouter   = require('./routes/guestBookings');
const chatRouter            = require('./routes/chat');
const ordersRouter          = require('./routes/orders');
const contentRouter         = require('./routes/content');

const app = express();
const PORT = process.env.PORT || 3000;

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
app.use('/api/employees',        employeesRouter);
app.use('/api/guest-bookings',   guestBookingsRouter);
app.use('/api/chat',             chatRouter);
app.use('/api/orders',           ordersRouter);
app.use('/api/content',          contentRouter);

migrate()
  .then(() => app.listen(PORT, () => console.log(`J Park API listening on port ${PORT}`)))
  .catch((err) => { console.error('[migrate] failed:', err); process.exit(1); });
