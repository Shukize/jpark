const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Neon presents a publicly-trusted certificate chain, so verify it properly
  // in production instead of accepting any certificate.
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : false,
});

module.exports = pool;
