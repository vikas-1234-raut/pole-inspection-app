// seed-users.js
// Run once: `node seed-users.js` — creates starter accounts for testing.
// Change these passwords before any real use; this is a dev convenience only.

const bcrypt = require('bcryptjs');
const { pool, initSchema } = require('./db');

async function seed() {
  await initSchema();

  const users = [
    { username: 'field1', password: 'field1pass', role: 'field', fullName: 'Site Worker One' },
    { username: 'reviewer1', password: 'reviewer1pass', role: 'reviewer', fullName: 'Reviewer One' },
    { username: 'admin', password: 'adminpass', role: 'admin', fullName: 'Admin' },
  ];

  for (const u of users) {
    const hash = await bcrypt.hash(u.password, 10);
    await pool.query(
      `INSERT INTO users (username, password_hash, role, full_name)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (username) DO NOTHING`,
      [u.username, hash, u.role, u.fullName]
    );
    console.log(`Seeded ${u.role}: ${u.username} / ${u.password}`);
  }

  await pool.end();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
