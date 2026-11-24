# decisions.md — Decision Log

Every entry: what was decided, why, what alternative was rejected, and what
tradeoff is being accepted. Newest entries at the bottom. This is a living
document — add to it, don't just rewrite it, so past reasoning stays visible.

---

### D1 — Framework: Expo (React Native), not bare RN or Flutter
**Decision:** Use Expo-managed React Native for the mobile app.
**Why:** You're a web developer with no native app experience. Expo gives
camera, GPS, sensors, and offline storage as documented JS APIs with no
native build configuration (no Xcode/Android Studio project surgery) and
lets you test on a real phone in minutes via a dev build.
**Rejected:** Bare React Native (same JS model, but you'd own native build
config from day one — unnecessary complexity before the app even works).
Flutter (excellent tooling, but Dart is a second new language on top of
learning mobile dev — steeper for a first app).
**Tradeoff accepted:** Expo abstracts some native-module access. If a very
specific native capability is ever needed that Expo doesn't wrap, we may
need `expo prebuild` to eject partially. Not a concern for anything in Part 1.

---

### D2 — Offline queue storage: AsyncStorage (JSON blob), not SQLite
**Decision:** Store the pending-sync queue as a single JSON array under one
AsyncStorage key.
**Why:** The queue holds a handful of records at a time (one field worker's
in-progress captures). AsyncStorage's get/set-a-blob model is the closest
thing to `localStorage`, which you already know, so no new mental model or
schema/migration management for an MVP-scale queue.
**Rejected:** expo-sqlite / WatermelonDB — better for querying and partial
updates, but adds schema design + migrations before we've even validated
the base capture flow.
**Tradeoff accepted:** No querying the queue (e.g., "all pending for pole
X"), and every write rewrites the whole array. Fine at current scale.
**Revisit when:** field workers routinely accumulate dozens+ of queued
records across multi-day offline stretches, or we need per-photo (not
per-inspection) retry granularity.

---

### D3 — Backend storage: Express + SQLite (better-sqlite3), not real SharePoint yet
**Decision:** Build our own lightweight backend as the "SharePoint / DB" box
from the diagram, instead of integrating actual SharePoint now.
**Why:** Real SharePoint integration needs Microsoft app registration,
OAuth setup, and Graph API permissions — organizational setup that
shouldn't block getting the capture-to-review loop running and testable
today. `api.ts` on the mobile side is the only file that knows the upload
destination's URL/shape, so swapping the backend for real SharePoint later
touches `api.ts` and nothing else in the mobile app.
**Rejected:** Wiring SharePoint immediately (blocks progress on
org/IT approval timelines); using a cloud DB (Postgres/Firebase) immediately
(real setup cost with no added value until we're past prototype stage).
**Tradeoff accepted:** Data currently lives in a local SQLite file — not
backed up, not multi-server. Acceptable for development/pilot; not for
production rollout across many sites (revisit before real deployment).

---

### D4 — Photo upload format: multipart/form-data, not base64-in-JSON
**Decision:** Photos are sent as actual file parts in a multipart request.
**Why:** Photos are binary blobs (hundreds of KB to a few MB each). Base64
encoding inflates payload size by roughly 33%, which matters directly for
field data plans — this app's whole context is workers on possibly weak/
metered mobile connections.
**Rejected:** Base64-in-JSON (simpler to log/debug, but meaningfully worse
for the actual constraint that matters here — data usage in the field).

---

### D5 — Reviewer UI: plain HTML/JS, not a React admin app
**Decision:** `reviewer/index.html` is a single static page with inline
JS, no build step, no framework.
**Why:** It's one internal page doing one job (list → view → label →
submit). A bundler/framework adds a second toolchain to maintain alongside
the mobile app and backend, for no capability gain at this scope.
**Rejected:** React/Vue admin app — the right call eventually, just not yet.
**Revisit when:** this grows into a multi-page tool — e.g. the GPS pole-
tracking dashboard from the earlier tilt-detection conversation, auth,
per-site filtering, etc. At that point the page count and state complexity
justify a framework.

---

### D6 — Pole ID generation happens on-device, not server-assigned
**Decision:** New pole IDs are generated locally (`timestamp + random
suffix`) rather than requested from the backend.
**Why:** The site worker may be capturing with zero signal. If ID
assignment required a server round-trip, capture would be blocked exactly
when the offline-first design is supposed to help most. The ID is
reconciled server-side automatically on first upload
(`INSERT OR IGNORE INTO poles` in `routes/inspections.js`).
**Tradeoff accepted:** Theoretical ID collision risk across devices is
non-zero (though astronomically unlikely at this ID length/format). Not
worth solving until multi-device concurrent field use is actually observed
as a problem.

---

### D7 — Scope cut: flat "2-4 photos" capture, not the full 11-item guided
checklist yet
**Decision:** `CaptureScreen.tsx` captures an undifferentiated set of 2-4
photos per pole, matching the diagram literally. The earlier-discussed
11-step guided checklist (per-defect shot types, framing guides) is NOT in
this build.
**Why:** Get the full pipeline — capture → offline queue → sync → backend
→ reviewer → labeled export — working end-to-end FIRST, on the simplest
possible capture step. The guided checklist is a richer version of exactly
one box ("Capture 2-4 Photos") and slots in at `handleCapture()` in
`CaptureScreen.tsx` without touching anything upstream (PoleIdScreen) or
downstream (syncService, backend, reviewer) of it.
**Revisit:** next iteration, once this base loop is confirmed working on a
real device against the real backend.

---

### D8 — Scope cut: no on-device quality checks (blur/tilt/framing) yet
**Decision:** No blur detection, verticality gate, or object-in-frame check
implemented in this pass.
**Why:** Same reasoning as D7 — prove the plumbing first. These checks are
additive at the same single point (`handleCapture()`), don't change any
data shapes (`PhotoMeta` already has room for pitch/roll to support a
verticality check later), and are meaningfully easier to get right once
there's a real corpus of field-captured photos to test thresholds against.
**Revisit:** immediately after D7, as the next feature pass.

---
---

# v2 — Scale, Fraud Defense, Guided Capture, Auth (this session)

Everything below extends the v1 decisions above; nothing above is retracted
unless explicitly noted.

### D9 — Storage: Postgres + PostGIS, replacing SQLite
**Decision:** Move the backend off SQLite onto Postgres with the PostGIS
extension.
**Why:** SQLite is a single file with effectively one writer at a time —
fine for prototyping, wrong once many field devices upload concurrently
and the photo/inspection archive grows into "large amount of data," as you
flagged. PostGIS additionally gives indexed geo queries (`ST_Distance`,
nearest-neighbor via `<->`) needed for the proximity/fraud checks below —
without it we'd be hand-rolling Haversine math and scanning every row.
**Rejected:** Staying on SQLite with manual sharding/rotation (delays the
real fix); a managed cloud DB immediately (real setup cost, and local
Postgres via Docker gets you the same schema/behavior for development).
**Tradeoff accepted:** Requires Docker (or a native Postgres install) for
local development instead of a zero-install file — worth it for the
correctness/scale this buys.

### D10 — Auth: username/password + JWT, admin-provisioned accounts only
**Decision:** Three roles (`field`, `reviewer`, `admin`). No self-service
signup — accounts are created via `seed-users.js` (or a future admin
panel), not from within the app.
**Why:** This is a workforce app, not a consumer app — you explicitly want
to "track people and viewer." Every photo and every review decision should
be attributable to a specific, known account, which self-registration
would undermine. JWT (not session cookies) fits a mobile client naturally
and lets the same token gate both API calls and (see D14) protected image
requests.
**Tradeoff accepted:** Provisioning is manual for now (admin runs a
script/adds a DB row). Fine at pilot scale; build a simple admin
user-management screen before wider rollout.

### D11 — Pole ID: hash of (rounded GPS + entered name), computed on-device
**Decision:** `services/poleId.ts` hashes `latitude.toFixed(5) + longitude.toFixed(5)
+ normalized(name)` into the pole id, entirely client-side.
**Why:** You were explicit: "Pole ID must be filled by person... id must
be hash key using location coordinates and name." Computing it on-device
means it works fully offline (no server round-trip needed to get an id),
and because the hash is deterministic, the SAME physical pole captured by
two different field workers on two different days collapses to the exact
same id — this IS the pole-level deduplication mechanism, not a separate
fuzzy-matching step.
**Rejected:** Server-assigned sequential IDs (breaks offline-first);
GPS-only hash without the name (would silently merge two different poles
that happen to be captured from very close by, e.g. across a road).
**Tradeoff accepted:** 5-decimal rounding (~1.1m precision) is a judgment
call between "same pole, different GPS noise" and "different but nearby
poles" — needs tuning against real field GPS accuracy once you have
data; documented as a known tuning knob, not a fixed constant.

### D12 — Two-tier pole table: `master_poles` (your existing survey data)
vs. `captured_poles` (what the app generates)
**Decision:** Don't force every capture to match a pre-existing master
pole. Instead, `captured_poles` is populated by the app itself (via the
hash in D11), and each row optionally links to its nearest `master_poles`
row plus the distance, with a `flagged` boolean if nothing matched closely.
**Why:** You said you already have coordinates for all poles — that's
`master_poles`, imported once via `import-master-poles.js` and treated as
ground truth for the fraud check. But the app still needs to function for
a pole a field worker is capturing right now, whether or not that exact
pole is already in your master list (incomplete survey data, new poles,
etc.) — `captured_poles` handles that without blocking capture.
**Tradeoff accepted:** Two tables to reason about instead of one; worth it
because it cleanly separates "ground truth we trust" from "what the field
actually reported," which is exactly the distinction the fraud check needs.

### D13 — Anti-fraud: two separate duplicate/reuse checks, not one
**Decision:** Client-side (`dedup.ts`, exact SHA-256, same-session only)
AND server-side (`utils/imageHash.js`, perceptual aHash, checked against
the ENTIRE historical photo archive) — two different mechanisms for two
different problems.
**Why:** "Contractor/vendor... may play with us by uploading healthy
images" is fundamentally a server-side trust problem — a dishonest client
could lie about or omit any client-computed signal, so the check that
actually matters for fraud MUST be computed from bytes the server itself
received (`utils/imageHash.js`'s explicit comment on this). The
client-side check exists for a different, honest-user problem: catching
an accidental double-tap or gallery mix-up immediately, before a slow
upload, as a UX courtesy — not a security boundary.
**Rejected:** Relying only on a client-reported hash (trivially spoofable);
only server-side (misses the chance to give instant feedback for the
common accidental-duplicate case).
**Tradeoff accepted:** Perceptual hashing (aHash) catches exact/near-exact
reuse, not a genuinely different photo of a different, healthier pole
taken in bad faith — that's a harder visual re-identification problem,
explicitly out of scope for this pass.

### D14 — `/uploads` requires auth; reviewer moved fully in-app
**Decision:** The standalone `reviewer/index.html` from v1 is removed.
Review happens inside the mobile app (`ReviewerScreen.tsx`), gated by role,
and `/uploads` on the backend now requires a valid JWT
(`server.js: app.use('/uploads', requireAuth, ...)`).
**Why:** You asked for review "inside this app," and once `/uploads` needs
auth, a plain `<img src="...">` in a browser page can't attach an
Authorization header anyway — React Native's `<Image source={{ uri, headers }}>`
can, which made "reviewer lives in the RN app" the natural conclusion, not
just the requested one.
**Tradeoff accepted:** Losing the "just open a webpage on any desktop
browser" convenience of the old reviewer page. If a desktop reviewer
workflow becomes important later, the right fix is a signed, time-limited
URL per image (common S3/CDN pattern) rather than reopening `/uploads`
publicly.

### D15 — Quality checks: tilt implemented now; blur/framing/distance
explicitly stubbed, not faked
**Decision:** `services/quality.ts` fully implements live tilt/verticality
detection (pure sensor math — real, no model needed) and returns an
explicit `{status:'skipped'}` for blur, object-in-frame, and
distance-to-subject.
**Why:** Tilt is the one check that's both cheap (no ML) and highest-value
(a tilted camera invalidates any later bend measurement — this is the
core reason the very first message in this whole thread came up). Blur
and framing genuinely need either a small on-device model (TFLite/ML Kit)
or native pixel access RN doesn't cheaply provide — faking a weak
heuristic (e.g. "file size as a blur proxy") would create false confidence
that's worse than an honest "not yet checked" badge.
**Concrete next step (not yet built):** bundle a small TFLite object
detector per checklist item (does the frame contain what this step needs?
crude bounding-box coverage doubles as the distance-to-subject signal),
and a lightweight blur classifier (many pre-trained tiny models exist for
this specifically). Both slot into the same `checkBlur`/`checkFraming`/
`checkDistance` function signatures already defined, so `CaptureScreen.tsx`
doesn't change shape when they're filled in — only their internals do.

### D16 — Guided 11-item checklist reinstated (v1's D7 scope-cut reversed)
**Decision:** `CaptureScreen.tsx` now steps through `CHECKLIST_ITEMS` one
at a time (with per-item shot guidance and a minimum photo count per item)
instead of a flat 2-4 photo capture.
**Why:** Explicitly requested this session, and the base pipeline (capture
→ queue → sync → backend → review → export) was already proven end-to-end
in v1, which was the stated precondition for adding this back.
**Note:** `CHECKLIST_ITEMS` is now a single shared constant
(`constants/checklist.ts`) used by BOTH capture and review — v1's reviewer
page duplicated this list inline in HTML; that duplication is now gone.

### D17 — Storage layout: folder-per-pole, folder-per-inspection on disk
**Decision:** `uploads/{poleId}/{inspectionId}/{checklistKey}_{n}.jpg`,
enforced by multer's `destination`/`filename` functions in
`routes/inspections.js`.
**Why:** Directly requested ("stored in structure format... folder open
and folder wise images must be review"). This also happens to make the
review UI's grouping (pole → inspections → photos-by-item) a direct
reflection of what's actually on disk, which makes manual/CLI inspection
of the raw files (e.g. during a data audit) match what the app shows.

### D18 — Geo proximity check uses PostGIS server-side, not a client
haversine
**Decision:** `findNearestMasterPole()`/`evaluateGeoFraud()` in
`utils/geo.js` run `ST_Distance`/nearest-neighbor queries against
`master_poles` in the database, not JS math on the client.
**Why:** The 30-40m spacing rule needs to be checked against ALL master
poles near a point, not just the one the worker claims — that's exactly
what a spatial index (`GIST` on the `location` column) is for, and it's
meaningfully faster than fetching every master pole to the client and
comparing there, especially as the master list grows to cover a whole
network of TL lines.

---
---

# v3 — Reviewer Fix, Three-Way Fraud Check, Angle Guidance, Real Quality Checks

### D19 — Reviewer bug: images/labeling missing was two separate gaps, not one
**Decision:** Confirmed the backend's GET /api/inspections (grouped-by-pole
query) and image-serving were structurally correct; the real gap was that
review UI only supported inspection-level labeling, not the per-photo
"open one image, mark it healthy or pick fault(s)" flow you actually
wanted. Rebuilt `ReviewerScreen.tsx` around per-photo labels.
**Why per-photo, not per-inspection:** A single inspection has 11+ photos
covering different things — "healthy" or "faulty" only makes sense
attached to a specific photo, not the whole batch. The inspection's
overall `labels_json` is now a SERVER-COMPUTED rollup (union of every
photo's fault tags) via `POST /:id/complete`, not something a reviewer
fills in directly.
**Tradeoff accepted:** More taps for the reviewer (label each photo) than
one form for the whole inspection — but a single combined form would have
forced faults to be inspection-level, losing which photo actually showed
which problem, which matters for later audit/training-data quality.

### D20 — Three-way fraud check, two hard-blocking, one soft-flagging
**Decision:** Combine (1) per-photo GPS vs. the CLAIMED pole's own
registered location — hard block (409) if >50m; (2) perceptual-hash
duplicate/reuse detection — hard block (409) on any match; (3) upload-time
device GPS vs. average capture-time GPS — soft flag only, and only when
the upload happens soon (<30 min) after capture.
**Why (1) and (2) block but (3) only flags:** (1) and (2) are close to
unambiguous — a photo 200m from the pole it claims to be of, or byte-
identical to a photo already in the archive, has no innocent everyday
explanation. (3) does: a field worker capturing offline and syncing hours
later from a different spot (back at the depot, home, wherever) is normal
and shouldn't be punished — but if someone claims to be AT a pole right
now, uploads immediately, and their live GPS is 300m from what the photos
say, that's worth a reviewer's attention.
**Why reject the WHOLE submission on a 409, not just the bad photo(s):**
Matches what you asked for literally ("block there, asked to upload new
image"), and it's simpler/safer than partial inserts — the mobile client
already keeps every captured photo in memory until a confirmed success, so
nothing is lost; the rejected item(s) are identified by checklist key and
the worker retakes just those before resubmitting the same session.
**Not implemented — EXIF GPS extraction:** You mentioned reading GPS "from
the photo" — worth clarifying why that's not how this works. Our photos
are captured live in-app (CameraView), and we tag GPS ourselves at that
moment rather than relying on EXIF the OS might or might not embed. EXIF
GPS extraction would only matter if a gallery-import path existed (letting
someone submit an old photo file directly) — the app has no such path
today (camera-only capture), which structurally closes that fraud vector
rather than needing to detect it after the fact.

### D21 — Blur + framing: real on-device heuristics, not a trained model
**Decision:** Implemented actual pixel-level checks (`quality.ts`):
Laplacian-variance blur detection, and a row/column edge-energy heuristic
for framing (full-pole-shot: checks edges present near both top and
bottom of frame; close-up shot: checks strong edge energy centrally).
**How, without a native module:** `expo-image-manipulator` shrinks the
photo to a small thumbnail; `jpeg-js` (pure JS, no native binary) decodes
it into raw pixels; the checks are plain arithmetic over that small array.
Keeping the thumbnail small (160px wide) keeps this fast enough to run
synchronously after every capture.
**Explicitly NOT solved by this:** these are heuristics, not object
detection — a sharp, well-framed photo of the WRONG thing (not the pole,
not the insulator) still passes. That needs a trained per-item object
detector (the TFLite plan from D15), which is still the correct long-term
answer; this pass replaces "not implemented" with "real signal, known
limits," which is a meaningfully better place to be without pulling in a
native ML runtime yet.
**Tradeoff accepted:** Threshold constants (`BLUR_VARIANCE_THRESHOLD`,
edge-energy cutoffs) are starting guesses, not calibrated against your
real field photos — expect to tune them once you have a corpus of
labeled-good vs. labeled-bad shots.

### D22 — Angle guidance via compass heading, NOT image histogram
**Decision:** For items needing multiple angles (pole_bend), the 2nd+ shot
is gated on the device's compass heading differing from the previous
shot's heading by at least `minAngleSeparationDeg` (80° for pole_bend) —
implemented as a live "Move around the pole — need ~40° more" message,
same disabled-shutter pattern as the tilt gate.
**Why not histogram-based angle detection from the image itself:** A
pixel-intensity histogram describes brightness/color DISTRIBUTION, not
geometric orientation — it has no way to recover "what angle was this shot
from relative to the pole" on its own. Two photos of the same pole from
90° apart can have very similar histograms if lighting is similar, and
two photos from the SAME angle can have very different histograms if a
cloud passed over. The sensor already on the phone (compass) directly
measures what a histogram can only indirectly and unreliably hint at.
**Tradeoff accepted:** Magnetometer-based heading is noisy indoors/near
metal structures (poles are exactly that) — expect some jitter; the ~80°
threshold has margin built in for that. A future upgrade could
cross-check with visual feature-matching (SfM-style, per the very first
conversation in this thread) as a second signal, not a replacement.

### D23 — Permissions requested once, upfront, before login
**Decision:** `PermissionsGateScreen.tsx` is now the very first thing the
app shows, requesting camera + location together, before the login form.
**Why before login, not after:** Permissions are a device-level concern,
not a user-level one — asking once at first launch (rather than
re-prompting every time a different person logs into the same device)
matches how a shared field device is actually used. Screens further down
the flow (PoleIdScreen, CaptureScreen) still independently verify
permissions before use — this screen is the first, friendliest ask, not
the only enforcement point.
