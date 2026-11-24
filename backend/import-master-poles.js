// import-master-poles.js
//
// You said you already have coordinates for all poles — this loads that
// data into master_poles so utils/geo.js can validate captures against it.
// Run: `node import-master-poles.js path/to/your-poles.csv`
// Expected CSV columns: pole_id,tl_line,latitude,longitude

const fs = require('fs');
const readline = require('readline');
const { pool, initSchema } = require('./db');

async function importCsv(filePath) {
  await initSchema();
  const rl = readline.createInterface({ input: fs.createReadStream(filePath) });

  let isHeader = true;
  let count = 0;

  for await (const line of rl) {
    if (isHeader) { isHeader = false; continue; }
    if (!line.trim()) continue;

    const [poleId, tlLine, lat, lon] = line.split(',').map((s) => s.trim());
    await pool.query(
      `INSERT INTO master_poles (pole_id, tl_line, location)
       VALUES ($1, $2, ST_MakePoint($3, $4)::geography)
       ON CONFLICT (pole_id) DO UPDATE SET location = EXCLUDED.location, tl_line = EXCLUDED.tl_line`,
      [poleId, tlLine, parseFloat(lon), parseFloat(lat)]
    );
    count += 1;
  }

  console.log(`Imported ${count} master poles.`);
  await pool.end();
}

const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: node import-master-poles.js <path-to-csv>');
  process.exit(1);
}
importCsv(filePath).catch((err) => {
  console.error(err);
  process.exit(1);
});
