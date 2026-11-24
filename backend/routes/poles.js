// routes/poles.js
//
// "Pole ID must be filled by person who upload images... id must be hash
// key using location coordinates and name filled by person."
//
// The HASH ITSELF is computed on-device (mobile/src/services/poleId.ts)
// so the same physical pole, entered by two different field workers,
// produces the identical id and naturally collapses into one row here via
// ON CONFLICT — that's the deduplication mechanism, not a server-side
// fuzzy-match. This route's job is: receive that id, validate it against
// the master pole list (fraud/sanity check), and store it.

const express = require('express');
const { pool } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { evaluateGeoFraud, findNearestMasterPole } = require('../utils/geo');

const router = express.Router();

// Field app can call this BEFORE submitting a full inspection, to warn
// the worker immediately ("this doesn't match any known pole — check
// your GPS / re-enter the name") rather than only finding out at review.
router.get('/master/nearest', requireAuth, async (req, res) => {
  const { lat, lon } = req.query;
  if (!lat || !lon) return res.status(400).json({ error: 'lat and lon required' });
  const nearest = await findNearestMasterPole(parseFloat(lat), parseFloat(lon));
  res.json(nearest || null);
});

router.post('/', requireAuth, requireRole('field', 'admin'), async (req, res) => {
  const { id, enteredName, lat, lon } = req.body;
  if (!id || !enteredName || lat == null || lon == null) {
    return res.status(400).json({ error: 'id, enteredName, lat, lon are required' });
  }

  const existing = await pool.query('SELECT id FROM captured_poles WHERE id = $1', [id]);
  if (existing.rows.length > 0) {
    // Same hash = same physical pole already registered — this IS the
    // dedup path, not an error. Field worker just continues to capture.
    return res.json({ id, deduped: true });
  }

  const { flags, nearestMasterPole } = await evaluateGeoFraud(id, lat, lon);

  await pool.query(
    `INSERT INTO captured_poles (id, entered_name, location, matched_master_id, match_distance_m, flagged, created_by)
     VALUES ($1, $2, ST_MakePoint($3, $4)::geography, $5, $6, $7, $8)`,
    [
      id,
      enteredName,
      lon,
      lat,
      nearestMasterPole && flags.length === 0 ? nearestMasterPole.pole_id : null,
      nearestMasterPole ? nearestMasterPole.distance_m : null,
      flags.length > 0,
      req.user.userId,
    ]
  );

  res.status(201).json({ id, deduped: false, flags, nearestMasterPole });
});

router.get('/:id', requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, entered_name, matched_master_id, match_distance_m, flagged,
            ST_Y(location::geometry) AS latitude, ST_X(location::geometry) AS longitude
     FROM captured_poles WHERE id = $1`,
    [req.params.id]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

module.exports = router;
