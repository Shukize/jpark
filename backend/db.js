const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Neon presents a publicly-trusted certificate chain, so verify it properly
  // in production instead of accepting any certificate.
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : false,
  // node-postgres's default is 0 — wait FOREVER to open a connection. Neon's
  // free/autosuspend compute goes to sleep after a quiet spell and has to
  // wake on the next query; with no cap here, that wake (or any other stalled
  // connection attempt) hangs the whole request. Live chat felt this worst:
  // every guest message is serialized through one queue (see postChain in
  // chat.js, kept in order on purpose), so ONE hung connection blocked every
  // message typed after it — reported as a 2-3 minute delay. 10s is well
  // above Neon's normal cold-start wake, so a real wake still succeeds; past
  // that, the request fails fast and the existing offline/retry UI takes
  // over instead of the guest and front desk both just staring at nothing.
  connectionTimeoutMillis: 10000,
});

module.exports = pool;
