// utils/geo.js
//
// Two jobs, both requested directly:
//   1. "coordinates of all poles already we have... apply checks" ->
//      findNearestMasterPole() answers "is this capture actually near a
//      real, known pole, or is someone uploading from an arbitrary
//      location / reusing old photos against the wrong pole ID?"
//   2. "max range for next pole should be 30-40m" -> checkNeighborSpacing()
//      flags captures that land implausibly close to a DIFFERENT master
//      pole than the one claimed — a common failure mode when a field
//      worker mislabels which pole they're standing at.
//
// Uses PostGIS's ST_Distance/ST_DWithin (in meters, via the geography
// type) rather than hand-rolled Haversine — more accurate and lets the
// database use its spatial index instead of scanning every row in JS.

const { pool } = require('../db');

const MASTER_MATCH_TOLERANCE_M = 25;   // how close a capture must be to a master pole to "match" it
const MIN_NEIGHBOR_SPACING_M = 30;     // your stated 30-40m rule, lower bound

async function findNearestMasterPole(lat, lon) {
  const { rows } = await pool.query(
    `SELECT pole_id, tl_line,
            ST_Distance(location, ST_MakePoint($1, $2)::geography) AS distance_m
     FROM master_poles
     ORDER BY location <-> ST_MakePoint($1, $2)::geography
     LIMIT 1`,
    [lon, lat]
  );
  if (rows.length === 0) return null;
  return rows[0];
}

// Returns fraud/sanity flags to attach to the inspection — empty array
// means "looks fine." This function never blocks the upload outright;
// it flags for reviewer attention. Hard-blocking on-device is a separate,
// earlier check (see mobile geoGuard.ts) — server-side we record rather
// than silently reject, because false positives (a slightly-off GPS fix)
// shouldn't destroy a real inspection.
async function evaluateGeoFraud(claimedPoleId, lat, lon) {
  const flags = [];
  const nearest = await findNearestMasterPole(lat, lon);

  if (!nearest || nearest.distance_m > MASTER_MATCH_TOLERANCE_M) {
    flags.push({
      type: 'gps_far_from_master',
      detail: nearest
        ? `Nearest known pole (${nearest.pole_id}) is ${Math.round(nearest.distance_m)}m away`
        : 'No master poles in database to compare against',
    });
  } else if (nearest.pole_id !== claimedPoleId && nearest.distance_m < MIN_NEIGHBOR_SPACING_M) {
    flags.push({
      type: 'closer_to_different_pole',
      detail: `${Math.round(nearest.distance_m)}m from ${nearest.pole_id}, but inspection claims ${claimedPoleId}`,
    });
  }

  return { flags, nearestMasterPole: nearest };
}

// Plain-JS Haversine, for comparing two already-in-hand coordinate pairs
// (e.g. one photo's GPS vs. the pole's own stored location). Deliberately
// NOT a DB query — per decisions.md D18, PostGIS earns its keep for
// indexed "nearest of many rows" lookups (findNearestMasterPole above);
// a single two-point distance doesn't benefit from that and a round trip
// would only add latency.
function distanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

module.exports = {
  findNearestMasterPole,
  evaluateGeoFraud,
  distanceMeters,
  MASTER_MATCH_TOLERANCE_M,
  MIN_NEIGHBOR_SPACING_M,
};
