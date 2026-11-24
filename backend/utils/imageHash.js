// utils/imageHash.js
//
// Directly answers: "contractor/vendor... may play with us by uploading
// healthy images so tackle this."
//
// Computes a perceptual "average hash" (aHash) per uploaded photo:
// shrink to 8x8 grayscale, compare each pixel to the mean brightness,
// producing a 64-bit fingerprint that's near-identical for the SAME or a
// lightly-edited/recompressed photo, even if the filename/EXIF changed.
// Comparing Hamming distance between hashes catches "this is the same
// photo as pole #412's inspection from last month, reused here."
//
// IMPORTANT — this is computed SERVER-SIDE from the uploaded file bytes,
// not trusted from the client, specifically because a dishonest
// contractor's app could fake or omit a client-computed hash. The
// server only trusts what it can independently verify from the file it
// actually received.
//
// aHash is intentionally simple (not a learned model) — it's cheap,
// dependency-light (uses `sharp`, already a common Node image lib), and
// good enough to catch exact/near-exact photo reuse, which is the
// realistic fraud pattern here. It will NOT catch someone photographing
// a different pole that happens to look similar — that's a different,
// harder problem (visual pole re-identification) and out of scope for
// this pass; see decisions.md D13.

const sharp = require('sharp');

async function computeAverageHash(filePath) {
  const { data } = await sharp(filePath)
    .resize(8, 8, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const mean = data.reduce((sum, v) => sum + v, 0) / data.length;
  let hash = '';
  for (const pixel of data) {
    hash += pixel >= mean ? '1' : '0';
  }
  return hash; // 64-character binary string
}

function hammingDistance(hashA, hashB) {
  if (!hashA || !hashB || hashA.length !== hashB.length) return Infinity;
  let dist = 0;
  for (let i = 0; i < hashA.length; i++) {
    if (hashA[i] !== hashB[i]) dist += 1;
  }
  return dist;
}

// Distance <= 5 out of 64 bits is a common "near-duplicate" threshold —
// tight enough to avoid flagging genuinely different photos of the same
// pole, loose enough to catch recompression/minor edits of a reused photo.
const DUPLICATE_THRESHOLD = 5;

async function findDuplicate(pool, newHash, excludeInspectionId) {
  const { rows } = await pool.query(
    `SELECT id, inspection_id, avg_hash FROM photos WHERE avg_hash IS NOT NULL AND inspection_id != $1`,
    [excludeInspectionId]
  );
  for (const row of rows) {
    if (hammingDistance(newHash, row.avg_hash) <= DUPLICATE_THRESHOLD) {
      return row; // the matching prior photo
    }
  }
  return null;
}

module.exports = { computeAverageHash, hammingDistance, findDuplicate, DUPLICATE_THRESHOLD };
