// Database connection (Model layer uses this).
// We connect straight to the Supabase PostgreSQL database with "pg".
// A Pool keeps a few connections open and shares them between requests.
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is missing. Copy .env.example to .env and fill it in.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Supabase only accepts encrypted (SSL) connections.
  // Set DATABASE_SSL=false only when testing with a local database.
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
  // On Vercel many small copies of the server can run at once, so each keeps
  // fewer connections (Supabase allows a limited number in total).
  max: process.env.VERCEL ? 2 : 5,
  // Give up after 10 seconds instead of waiting forever if the database is down.
  connectionTimeoutMillis: 10000,
});

// If an idle connection is dropped (Supabase does this sometimes), just log it.
// Without this handler the whole server would crash.
pool.on('error', (err) => {
  console.error('Database connection lost (it will reconnect):', err.message);
});

module.exports = {
  // Run one SQL query. Always pass values in "params" (never join them
  // into the SQL text) so the database is safe from SQL injection.
  query: (text, params) => pool.query(text, params),

  // Get one connection for a transaction (several queries that must
  // all succeed or all fail, e.g. "save approval + change status").
  getClient: () => pool.connect(),

  pool,
};
