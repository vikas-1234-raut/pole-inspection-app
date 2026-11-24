// db.js
//
// Replaces the SQLite version from the first pass (see decisions.md D9).
// Just a pg Pool + a one-time schema load — no ORM. At this stage the
// query set is small and explicit SQL in routes/*.js is easier to reason
// about (and easier for you, coming from a web/JS background, to read)
// than an ORM's abstraction layer. Revisit if the query surface grows
// large enough that hand-written SQL becomes the bottleneck.

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: process.env.PGPORT || 5432,
  user: process.env.PGUSER || 'pole_app',
  password: process.env.PGPASSWORD || 'pole_app_dev_password',
  database: process.env.PGDATABASE || 'pole_inspection',
});

async function initSchema() {
  const schemaSql = fs.readFileSync(path.join(__dirname, 'migrations', 'schema.sql'), 'utf8');
  await pool.query(schemaSql);
}

module.exports = { pool, initSchema };
