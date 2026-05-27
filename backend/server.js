require('dotenv').config();

if (!process.env.DATABASE_URL) {
  console.error('[startup] DATABASE_URL is not set. Set it in the Render dashboard under Environment.');
  process.exit(1);
}

const express = require('express');
const cors = require('cors');

const migrate = require('./migrate');
const messagesRouter = require('./routes/messages');
const serviceRequestsRouter = require('./routes/serviceRequests');
const otaSyncRouter = require('./routes/otaSync');
const employeesRouter = require('./routes/employees');

const app = express();
const PORT = process.env.PORT || 3000;

// FRONTEND_ORIGIN may be a comma-separated allowlist (the site is served from
// GitHub Pages and/or the Render static service, plus localhost in dev). When
// unset we fall back to '*' so a fresh deploy still answers.
const allowedOrigins = (process.env.FRONTEND_ORIGIN || '*')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
app.use(cors({
  origin: allowedOrigins.includes('*')
    ? '*'
    : (origin, cb) => cb(null, !origin || allowedOrigins.includes(origin)),
}));
app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/api/messages', messagesRouter);
app.use('/api/service-requests', serviceRequestsRouter);
app.use('/api/v1/ota-sync', otaSyncRouter);
app.use('/api/employees', employeesRouter);

migrate()
  .then(() => app.listen(PORT, () => console.log(`J Park API listening on port ${PORT}`)))
  .catch((err) => { console.error('[migrate] failed:', err); process.exit(1); });
