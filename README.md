# Pole Inspection App — Part 1 (v2: scale, fraud defense, auth, guided capture)

Implements the diagram's "Part 1 — No AI" flow, hardened per your
second round of requirements: Postgres+PostGIS (not SQLite), folder-
structured storage, login/role-based access, a guided 11-item checklist
with a live tilt gate, GPS-hard-gated capture, hash-based pole IDs,
proximity/spacing fraud checks against your existing pole coordinates,
duplicate/reused-photo detection, and an in-app (not standalone) reviewer.

Read **docs/flow.md** for exactly what calls what, and **docs/decisions.md**
for why each choice was made (D1-D8 = first pass, D9-D18 = this pass).

## Project layout

```
backend/
  migrations/schema.sql   Postgres + PostGIS schema (users, master_poles,
                           captured_poles, inspections, photos)
  db.js                   pg Pool + schema loader
  middleware/auth.js       JWT verify + role check
  routes/auth.js           POST /api/auth/login
  routes/poles.js          nearest-master lookup, register/dedupe a captured pole
  routes/inspections.js    folder-structured upload, review queue, labeling, export
  utils/geo.js             PostGIS proximity/spacing fraud checks
  utils/imageHash.js       server-side perceptual-hash duplicate/reuse detection
  seed-users.js            creates starter field/reviewer/admin accounts
  import-master-poles.js   bulk-load your existing pole coordinates (CSV)
  docker-compose.yml       local Postgres+PostGIS, zero manual install

mobile/                    Expo (React Native + TypeScript)
  src/screens/              LoginScreen, PoleIdScreen, CaptureScreen, ReviewerScreen
  src/services/              auth, api, location, quality (tilt), poleId (hash), dedup, sync, storage, network
  src/constants/checklist.ts the 11-item checklist — shared by capture AND review
  src/components/PhotoThumbnail.tsx

docs/                       flow.md and decisions.md — keep both updated as the app grows
```

## Running it

### 1. Database
```
cd backend
docker compose up -d
```
Starts Postgres+PostGIS on `localhost:5432` with the credentials already
wired into `db.js` (override via `PGHOST`/`PGUSER`/`PGPASSWORD`/`PGDATABASE`
env vars for anything beyond local dev). No manual `psql` needed — the
schema is applied automatically on backend startup (`db.js: initSchema()`).

### 2. Backend
```
npm install
npm run seed-users
npm start
```
`seed-users` creates three test accounts — **change these before any real
use**:
| username   | password       | role     |
|------------|----------------|----------|
| field1     | field1pass     | field    |
| reviewer1  | reviewer1pass  | reviewer |
| admin      | adminpass      | admin    |

If you already have pole coordinates, load them so the fraud/proximity
checks have something to compare against:
```
npm run import-master-poles -- path/to/your-poles.csv
```
Expected CSV columns: `pole_id,tl_line,latitude,longitude`.

### 3. Mobile app
```
cd mobile
npm install
npx expo start
```
Edit `API_BASE_URL` in **both** `mobile/src/services/api.ts` and
`mobile/src/services/auth.ts` to your computer's LAN IP (e.g.
`http://192.168.1.42:4000`) — a phone can't reach your dev machine via
`localhost`.

Log in as `field1` to capture, `reviewer1` to review, or `admin` for both
(a toggle button appears in the top bar for admin).

## What's new in v3
- **Database, no Docker needed:** works with any Postgres+PostGIS,
  local or cloud — see decisions.md D9/D18 and ask if you need native-
  install steps for your OS.
- **Real on-device quality checks:** blur (Laplacian variance) and framing/
  coverage (edge-energy heuristic) now actually run after every capture —
  see decisions.md D21 for exactly how and their known limits.
- **Angle guidance:** multi-angle items (pole bend) now require the phone's
  compass heading to differ enough between shots, with a live "move
  around the pole" prompt — decisions.md D22 explains why this uses the
  compass, not image analysis.
- **Zoom control**, and a **max photos per item** cap so capture doesn't
  wander indefinitely.
- **Upfront permissions screen** at first launch (decisions.md D23).
- **Three-way anti-fraud check** on upload: duplicate/reused photo (hard
  block), photo GPS vs. claimed pole location (hard block), upload-time
  vs. capture-time GPS drift (soft flag) — decisions.md D20.
- **Per-photo reviewer labeling** (Healthy / any of the 11 faults / Other
  with free text), fixing the "reviewer shows no images/labels" issue
  found in testing — decisions.md D19.

## What's still not built
Object detection (is the CORRECT subject in frame, not just "is there a
strong edge somewhere") needs a trained per-item model — the blur/framing
checks in v3 are real heuristics, not that. See decisions.md D21's "not
solved by this" note, and D15 for the original plan.
