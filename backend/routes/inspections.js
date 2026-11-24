// routes/inspections.js
//
// Storage layout on disk: uploads/{poleId}/{inspectionId}/{checklistKey}_{n}.jpg
// See flow.md for the exact request path through this file.
//
// v3 CHANGE — upload is now TWO-PHASE (decisions.md D20):
//   Phase A: save files to disk (multer does this before our handler
//            runs), then VALIDATE all of them — duplicate hash check +
//            distance-from-claimed-pole check — before writing anything
//            to the database.
//   Phase B: only if every photo passes, insert the inspection + photo
//            rows. If ANY photo fails, delete every file just written for
//            THIS request and return 409/400 with which item(s) need a
//            retake — nothing partial is ever left in the database.
// This matches "block there, asked to upload new image" literally: a
// rejected submission creates no inspection record at all.

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { pool } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { computeAverageHash, findDuplicate } = require('../utils/imageHash');
const { distanceMeters } = require('../utils/geo');

const router = express.Router();
const uploadRoot = path.join(__dirname, '..', 'uploads');

// How far a photo's own GPS may be from the pole it claims to be of.
// Looser than MASTER_MATCH_TOLERANCE_M (25m, pole-to-master-pole) because
// GPS drift while walking around a single pole taking 11+ shots is normal;
// this is catching "wrong pole entirely" / spoofed-location cases, not
// penalizing a worker for standing 15m from the base to fit a tall pole
// in frame.
const PHOTO_TO_POLE_TOLERANCE_M = 50;

// If the device's GPS at upload time is far from where the photos were
// captured, AND the upload happened soon after capture (not a delayed
// offline sync from somewhere else entirely), that's suspicious — flagged
// for reviewer attention, not hard-blocked, since "captured offline, sync
// later from a different place" is a legitimate normal case we don't want
// to punish.
const UPLOAD_DRIFT_FLAG_M = 300;
const QUICK_UPLOAD_WINDOW_MIN = 30;

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const poleId = req.body.poleId;
    const inspectionId = req.body.inspectionId;
    if (!poleId || !inspectionId) {
      return cb(new Error('poleId and inspectionId must be sent before photo files'));
    }
    const dir = path.join(uploadRoot, poleId, inspectionId);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    req._photoIndex = req._photoIndex || 0;
    const keys = Array.isArray(req.body.checklistKeys) ? req.body.checklistKeys : [req.body.checklistKeys];
    const key = keys[req._photoIndex] || `item_${req._photoIndex}`;
    req._photoIndex += 1;
    cb(null, `${key}_${Date.now()}_${req._photoIndex}.jpg`);
  },
});
const upload = multer({ storage });

function cleanupInspectionDir(poleId, inspectionId) {
  const dir = path.join(uploadRoot, poleId, inspectionId);
  fs.rmSync(dir, { recursive: true, force: true });
}

router.post('/', requireAuth, requireRole('field', 'admin'), upload.array('photos', 20), async (req, res) => {
  const { inspectionId, poleId, createdAt, photoMeta, uploadLatitude, uploadLongitude } = req.body;
  if (!inspectionId || !poleId) {
    return res.status(400).json({ error: 'inspectionId and poleId are required' });
  }

  const poleRow = await pool.query(
    `SELECT id, entered_name, flagged,
            ST_Y(location::geometry) AS latitude, ST_X(location::geometry) AS longitude
     FROM captured_poles WHERE id = $1`,
    [poleId]
  );
  if (poleRow.rows.length === 0) {
    cleanupInspectionDir(poleId, inspectionId);
    return res.status(400).json({ error: 'Unknown poleId — register the pole first via POST /api/poles' });
  }
  const pole = poleRow.rows[0];

  const meta = photoMeta ? JSON.parse(photoMeta) : [];
  const keys = Array.isArray(req.body.checklistKeys) ? req.body.checklistKeys : [req.body.checklistKeys];
  const files = req.files || [];

  // --- PHASE A: validate every photo before writing anything to the DB ---
  const rejected = []; // { checklistKey, reason, detail }
  const perPhotoDistance = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const m = meta[i] || {};
    const checklistKey = keys[i] || `item_${i}`;

    // 1) Duplicate / reused-image check (aHash, server-computed) — HARD BLOCK.
    const avgHash = await computeAverageHash(file.path);
    const duplicate = await findDuplicate(pool, avgHash, inspectionId);
    if (duplicate) {
      rejected.push({
        checklistKey,
        reason: 'duplicate_image',
        detail: `Matches an existing photo from inspection ${duplicate.inspection_id}. Capture a new photo.`,
      });
    }

    // 2) Photo GPS vs. the CLAIMED pole's own registered location — HARD BLOCK.
    // This is the "images surrounding of that pole only" enforcement.
    let distM = null;
    if (m.latitude != null && m.longitude != null) {
      distM = distanceMeters(pole.latitude, pole.longitude, m.latitude, m.longitude);
      if (distM > PHOTO_TO_POLE_TOLERANCE_M) {
        rejected.push({
          checklistKey,
          reason: 'location_mismatch',
          detail: `Photo GPS is ${Math.round(distM)}m from pole "${pole.entered_name}" (limit ${PHOTO_TO_POLE_TOLERANCE_M}m).`,
        });
      }
    }
    perPhotoDistance.push({ avgHash, distM, checklistKey, m, file });
  }

  if (rejected.length > 0) {
    for (const file of files) fs.unlinkSync(file.path);
    cleanupInspectionDir(poleId, inspectionId);
    return res.status(409).json({
      error: 'One or more photos were rejected — nothing was saved.',
      rejected,
    });
  }

  // 3) Upload-time GPS vs. capture-time GPS (average) — SOFT FLAG only.
  const fraudFlags = [];
  if (uploadLatitude != null && uploadLongitude != null && meta.length > 0) {
    const avgLat = meta.reduce((s, m) => s + (m.latitude || 0), 0) / meta.length;
    const avgLon = meta.reduce((s, m) => s + (m.longitude || 0), 0) / meta.length;
    const driftM = distanceMeters(avgLat, avgLon, parseFloat(uploadLatitude), parseFloat(uploadLongitude));
    const minutesSinceCapture = (Date.now() - new Date(createdAt || Date.now()).getTime()) / 60000;
    if (driftM > UPLOAD_DRIFT_FLAG_M && minutesSinceCapture < QUICK_UPLOAD_WINDOW_MIN) {
      fraudFlags.push({
        type: 'upload_location_drift',
        detail: `Uploaded ${Math.round(driftM)}m from where photos were captured, only ${Math.round(minutesSinceCapture)} min after capture.`,
      });
    }
  }

  // --- PHASE B: everything validated — now write to the database ---
  await pool.query(
    `INSERT INTO inspections (id, pole_id, status, submitted_by, created_at, upload_latitude, upload_longitude, fraud_flags)
     VALUES ($1, $2, 'pending_review', $3, $4, $5, $6, $7)
     ON CONFLICT (id) DO NOTHING`,
    [
      inspectionId,
      poleId,
      req.user.userId,
      createdAt || new Date().toISOString(),
      uploadLatitude ?? null,
      uploadLongitude ?? null,
      JSON.stringify(fraudFlags),
    ]
  );

  for (const p of perPhotoDistance) {
    const relPath = path.relative(uploadRoot, p.file.path);
    await pool.query(
      `INSERT INTO photos (inspection_id, checklist_key, filepath, timestamp, location, heading_deg, pitch_deg, roll_deg, avg_hash, quality_flags, distance_from_pole_m)
       VALUES ($1, $2, $3, $4, ST_MakePoint($5, $6)::geography, $7, $8, $9, $10, $11, $12)`,
      [
        inspectionId,
        p.checklistKey,
        relPath,
        p.m.timestamp || null,
        p.m.longitude ?? null,
        p.m.latitude ?? null,
        p.m.headingDeg ?? null,
        p.m.pitchDeg ?? null,
        p.m.rollDeg ?? null,
        p.avgHash,
        JSON.stringify(p.m.qualityFlags || []),
        p.distM,
      ]
    );
  }

  res.status(201).json({ id: inspectionId, status: 'pending_review', fraudFlags, poleFlagged: pole.flagged });
});

// --- Folder-wise list for the in-app reviewer: grouped by pole ---
router.get('/', requireAuth, requireRole('reviewer', 'admin'), async (req, res) => {
  const status = req.query.status || 'pending_review';

  const { rows: inspections } = await pool.query(
    `SELECT i.*, cp.entered_name, cp.flagged AS pole_flagged
     FROM inspections i
     JOIN captured_poles cp ON cp.id = i.pole_id
     WHERE i.status = $1
     ORDER BY cp.id, i.created_at DESC`,
    [status]
  );

  for (const insp of inspections) {
    const { rows: photos } = await pool.query(
      'SELECT * FROM photos WHERE inspection_id = $1 ORDER BY checklist_key',
      [insp.id]
    );
    insp.photos = photos;
  }

  const grouped = {};
  for (const insp of inspections) {
    if (!grouped[insp.pole_id]) {
      grouped[insp.pole_id] = { poleId: insp.pole_id, poleName: insp.entered_name, flagged: insp.pole_flagged, inspections: [] };
    }
    grouped[insp.pole_id].inspections.push(insp);
  }

  res.json(Object.values(grouped));
});

// --- Per-photo labeling: "open one image, mark it healthy, or one/more
// of the 11 faults, or 'other' with free text" ---
router.post('/:inspectionId/photos/:photoId/label', requireAuth, requireRole('reviewer', 'admin'), async (req, res) => {
  const { status, faults, otherText } = req.body; // status: 'healthy' | 'faulty'
  if (!['healthy', 'faulty'].includes(status)) {
    return res.status(400).json({ error: "status must be 'healthy' or 'faulty'" });
  }
  const { rows } = await pool.query(
    `UPDATE photos
     SET label_status = $1, label_faults = $2::jsonb, label_other_text = $3,
         labeled_by = $4, labeled_at = now()
     WHERE id = $5 AND inspection_id = $6
     RETURNING id`,
    [status, JSON.stringify(faults || []), otherText || null, req.user.userId, req.params.photoId, req.params.inspectionId]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Photo not found on this inspection' });
  res.json({ id: req.params.photoId, status });
});

// --- Finalize: server aggregates per-photo labels into the inspection's
// summary once every photo has been reviewed. ---
router.post('/:id/complete', requireAuth, requireRole('reviewer', 'admin'), async (req, res) => {
  const { rows: photos } = await pool.query(
    'SELECT label_status, label_faults, label_other_text FROM photos WHERE inspection_id = $1',
    [req.params.id]
  );

  const unreviewed = photos.filter((p) => p.label_status === 'unreviewed');
  if (unreviewed.length > 0) {
    return res.status(400).json({ error: `${unreviewed.length} photo(s) still unreviewed` });
  }

  const faultSet = new Set();
  const otherNotes = [];
  for (const p of photos) {
    (p.label_faults || []).forEach((f) => faultSet.add(f));
    if (p.label_other_text) otherNotes.push(p.label_other_text);
  }

  await pool.query(
    `UPDATE inspections SET status = 'labeled', labels_json = $1, reviewed_by = $2, reviewed_at = now() WHERE id = $3`,
    [JSON.stringify({ faults: Array.from(faultSet), otherNotes }), req.user.userId, req.params.id]
  );
  res.json({ id: req.params.id, status: 'labeled' });
});

router.get('/export', requireAuth, requireRole('admin'), async (req, res) => {
  const { rows: inspections } = await pool.query(
    `SELECT i.*, cp.entered_name FROM inspections i
     JOIN captured_poles cp ON cp.id = i.pole_id
     WHERE i.status = 'labeled' ORDER BY i.created_at DESC`
  );
  for (const insp of inspections) {
    const { rows: photos } = await pool.query('SELECT * FROM photos WHERE inspection_id = $1', [insp.id]);
    insp.photos = photos;
  }
  res.json(inspections);
});

module.exports = router;
