-- migrations/schema.sql
--
-- WHY Postgres (+ PostGIS) replacing SQLite — see decisions.md D9.
-- Short version: SQLite is a single file with a single writer at a time —
-- fine for a prototype, wrong once you have many field devices uploading
-- concurrently and a growing photo archive. Postgres gives us real
-- concurrent writes, and PostGIS gives us proper geo functions
-- (ST_DWithin, distance-in-meters) for the fraud/sanity checks below,
-- instead of hand-rolled Haversine math everywhere.

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto; -- for gen_random_uuid()

-- ---------------------------------------------------------------------
-- USERS / AUTH
-- Three roles: 'field' (captures photos), 'reviewer' (labels faults),
-- 'admin' (both + manages master pole list / user accounts).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('field', 'reviewer', 'admin')),
  full_name     TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- MASTER POLES — your existing, already-surveyed pole coordinates.
-- This is the ground truth used to catch fraud/mislabeling: a captured
-- inspection's GPS must land near ONE of these, and no two master poles
-- should be closer than your known line spacing (used to flag captures
-- that ambiguously sit between two poles).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS master_poles (
  pole_id     TEXT PRIMARY KEY,        -- your existing TL line pole naming (imported)
  tl_line     TEXT,                    -- which line/feeder this pole belongs to
  location    GEOGRAPHY(Point, 4326) NOT NULL,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_master_poles_location ON master_poles USING GIST (location);

-- ---------------------------------------------------------------------
-- CAPTURED POLES — what a field worker actually types + geotags on-site.
-- id is a HASH of (typed name + rounded GPS) so the same physical pole,
-- captured twice by two different workers, collapses to the same row
-- instead of creating duplicates (see decisions.md D11 for the hash spec).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS captured_poles (
  id                TEXT PRIMARY KEY,   -- the hash-derived pole key
  entered_name      TEXT NOT NULL,       -- exactly what the field worker typed
  location          GEOGRAPHY(Point, 4326) NOT NULL,
  matched_master_id TEXT REFERENCES master_poles(pole_id), -- nearest master pole, if within tolerance
  match_distance_m  DOUBLE PRECISION,     -- distance to that matched master pole
  flagged           BOOLEAN NOT NULL DEFAULT false, -- true if no master pole within tolerance
  created_by        UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_captured_poles_location ON captured_poles USING GIST (location);

-- ---------------------------------------------------------------------
-- INSPECTIONS — one capture session for one pole.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inspections (
  id           TEXT PRIMARY KEY,
  pole_id      TEXT NOT NULL REFERENCES captured_poles(id),
  status       TEXT NOT NULL DEFAULT 'pending_review'
                 CHECK (status IN ('pending_review', 'labeled', 'rejected')),
  labels_json  JSONB,
  submitted_by UUID REFERENCES users(id),
  reviewed_by  UUID REFERENCES users(id),
  fraud_flags  JSONB DEFAULT '[]'::jsonb, -- e.g. ["gps_far_from_master","duplicate_image"]
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at  TIMESTAMPTZ
);

-- ---------------------------------------------------------------------
-- PHOTOS — one row per photo, tagged to a specific checklist item
-- (pole_bend, earthing, insulator, ... — the 11 items), stored on disk
-- in a FOLDER STRUCTURE the reviewer UI reads directly:
--   uploads/{pole_id}/{inspection_id}/{checklist_key}_{n}.jpg
-- filepath here stores that relative path, not just a filename.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS photos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id   TEXT NOT NULL REFERENCES inspections(id),
  checklist_key   TEXT NOT NULL,     -- 'pole_bend' | 'earthing' | ... (see checklist.ts on mobile)
  filepath        TEXT NOT NULL,
  timestamp       TIMESTAMPTZ,
  location        GEOGRAPHY(Point, 4326),
  heading_deg     DOUBLE PRECISION,
  pitch_deg       DOUBLE PRECISION,
  roll_deg        DOUBLE PRECISION,
  avg_hash        TEXT,               -- perceptual hash, for duplicate/reuse detection
  quality_flags   JSONB DEFAULT '[]'::jsonb -- ["blurry","tilted","object_not_detected"] from on-device checks, re-verified server-side
);
CREATE INDEX IF NOT EXISTS idx_photos_avg_hash ON photos (avg_hash);
CREATE INDEX IF NOT EXISTS idx_photos_inspection ON photos (inspection_id);

-- ---------------------------------------------------------------------
-- v3 additions (idempotent — safe to re-run on an existing database,
-- which is why these are ALTER ... IF NOT EXISTS rather than a separate
-- migration runner). See decisions.md D19+ for the reasoning behind each.
-- ---------------------------------------------------------------------

-- Per-photo review labels. Reviewing happens photo-by-photo, not just
-- once per whole inspection — a reviewer opens ONE image and marks it
-- healthy, tags it with one or more of the 11 fault types, or picks
-- "other" and writes free text. inspections.labels_json (existing column)
-- becomes a SERVER-COMPUTED ROLLUP of these once every photo is reviewed
-- (see POST /:id/complete in routes/inspections.js) — reviewers never
-- fill that JSON in by hand.
ALTER TABLE photos ADD COLUMN IF NOT EXISTS label_status TEXT NOT NULL DEFAULT 'unreviewed'
  CHECK (label_status IN ('unreviewed', 'healthy', 'faulty'));
ALTER TABLE photos ADD COLUMN IF NOT EXISTS label_faults JSONB DEFAULT '[]'::jsonb; -- e.g. ["pole_bend","earthing"]
ALTER TABLE photos ADD COLUMN IF NOT EXISTS label_other_text TEXT;
ALTER TABLE photos ADD COLUMN IF NOT EXISTS labeled_by UUID REFERENCES users(id);
ALTER TABLE photos ADD COLUMN IF NOT EXISTS labeled_at TIMESTAMPTZ;

-- Per-photo distance from the CLAIMED pole's own registered location —
-- different from match_distance_m on captured_poles (which is distance to
-- the nearest MASTER pole). This one enforces "every photo must actually
-- be of the pole it says it's of" (see decisions.md D20).
ALTER TABLE photos ADD COLUMN IF NOT EXISTS distance_from_pole_m DOUBLE PRECISION;

-- Upload-time device GPS, captured fresh at the moment of submission —
-- compared against each photo's capture-time GPS as the second leg of the
-- three-way fraud check (decisions.md D20). Stored on the inspection
-- because it's one reading per submission, not per photo.
ALTER TABLE inspections ADD COLUMN IF NOT EXISTS upload_latitude DOUBLE PRECISION;
ALTER TABLE inspections ADD COLUMN IF NOT EXISTS upload_longitude DOUBLE PRECISION;
