# flow.md — Execution Trace (Part 1: Data Collection & Labeling)

This file tracks **what actually calls what, in what order** — not what the
code is supposed to do in theory. Update this whenever a call path changes,
not just when a new file is added.

Last updated: initial Part 1 scaffold.

---

## 1. App cold start

```
App.tsx (mount)
  └─ useEffect() runs once
       ├─ syncService.processQueue()
       │     ├─ storage.getQueue()                [AsyncStorage read]
       │     └─ for each queued record: attemptUpload(record)  (see §4)
       └─ network.subscribeToReconnect(callback)
             └─ NetInfo.addEventListener(...)      [stays active for app lifetime]
```

State: `App.tsx` renders `PoleIdScreen` first (no pole selected yet).

---

## 2. Selecting / creating a pole

```
PoleIdScreen.tsx (mount)
  └─ api.getPoles()
        └─ fetch GET {API_BASE_URL}/api/poles
              └─ backend: routes/poles.js  GET /
                    └─ db.prepare('SELECT ... FROM poles').all()
                    └─ res.json(poles)

User taps existing pole row OR "+ New Pole ID"
  └─ (new) generateNewPoleId()  — pure local function, no network call
  └─ onPoleSelected(poleId) prop callback
        └─ App.tsx: setSelectedPoleId(poleId)
              └─ re-render swaps PoleIdScreen -> CaptureScreen
```

Note: pole creation is **not** POSTed to the backend at this point if
generated offline. It's only persisted server-side implicitly, later, via
the `INSERT OR IGNORE INTO poles` inside `routes/inspections.js` when the
first inspection for that pole ID is uploaded (see §4). This is intentional
— see decisions.md "why we don't POST /api/poles at creation time".

---

## 3. Capturing photos

```
CaptureScreen.tsx
  └─ user taps "Capture Photo" -> handleCapture()
        ├─ Location.requestPermissions()          [location.ts]
        ├─ cameraRef.current.takePictureAsync()    [expo-camera]
        └─ Location.captureMetadata(shot.uri)      [location.ts]
              ├─ Location.getCurrentPositionAsync()
              ├─ readHeadingOnce()   -> Magnetometer.addListener (one-shot)
              └─ readOrientationOnce() -> DeviceMotion.addListener (one-shot)
        └─ setPhotos(prev => [...prev, meta])       [local component state]

  (repeats up to MAX_PHOTOS = 4, requires MIN_PHOTOS = 2 to proceed)
```

---

## 4. Finishing capture -> sync decision

```
CaptureScreen.tsx: handleFinish()
  └─ builds InspectionRecord { id, poleId, photos, status: 'draft', createdAt }
  └─ syncService.attemptUpload(record)
        ├─ network.isConnected()                   [network.ts -> NetInfo.fetch()]
        │
        ├─ IF false:
        │     └─ storage.enqueue(record)            [storage.ts -> AsyncStorage.setItem]
        │           └─ record now sits in local queue, status 'pending_sync'
        │
        └─ IF true:
              └─ api.uploadInspection(record)        [api.ts]
                    └─ fetch POST {API_BASE_URL}/api/inspections  (multipart/form-data)
                          └─ backend: routes/inspections.js  POST /
                                ├─ multer writes files to backend/uploads/
                                ├─ db: INSERT OR IGNORE INTO poles (...)
                                ├─ db: INSERT OR REPLACE INTO inspections (... status='pending_review')
                                └─ db: INSERT INTO photos (...) for each file
              ├─ on success: storage.removeFromQueue(record.id)
              └─ on thrown error (flaky connection):
                    ├─ storage.markAttempt(record.id)
                    └─ storage.enqueue(record)        [falls back to same path as offline]
  └─ CaptureScreen shows Alert with result, calls onDone()
        └─ App.tsx: setSelectedPoleId(null) -> back to PoleIdScreen
```

---

## 5. Reconnect -> queue drain

```
network.ts: NetInfo listener detects offline -> online transition
  └─ fires onReconnect callback registered in App.tsx
        └─ syncService.processQueue()   [same function as §1, cold-start path]
              └─ storage.getQueue() -> loop attemptUpload(record) for each
                    (each iteration follows the exact §4 "IF true" path,
                     since we're online by definition here)
```

---

## 6. Reviewer labeling (separate app — reviewer/index.html)

```
reviewer/index.html loads
  └─ loadInspections()
        └─ fetch GET {API_BASE}/api/inspections?status=pending_review
              └─ backend: routes/inspections.js  GET /
                    ├─ db: SELECT * FROM inspections WHERE status = 'pending_review'
                    └─ for each: db: SELECT * FROM photos WHERE inspection_id = ?
        └─ renderCard(insp) for each -> injects <img> tags pointing at
              {API_BASE}/uploads/<filename>  (served statically by server.js)

Reviewer checks fault boxes, clicks "Save Labels"
  └─ submitLabels(inspectionId)
        └─ fetch POST {API_BASE}/api/inspections/{id}/label
              └─ backend: routes/inspections.js  POST /:id/label
                    └─ db: UPDATE inspections SET status='labeled', labels_json=?
        └─ loadInspections() re-runs -> labeled item no longer in pending_review list
```

---

## 7. Dataset export ("Ready for ML Training")

```
GET {API_BASE}/api/inspections/export
  └─ backend: routes/inspections.js  GET /export
        ├─ db: SELECT * FROM inspections WHERE status = 'labeled'
        └─ for each: attach parsed labels_json + photos
  └─ returns JSON array — this IS the "Labeled Dataset" box, consumed
     by Part 2 (AI Model & Continuous Improvement) — not built yet.
```

---

## Files touched by current work vs. not yet built

**Built (this session):**
mobile/App.tsx, mobile/src/screens/*, mobile/src/services/*, mobile/src/types/index.ts,
backend/server.js, backend/db.js, backend/routes/*, reviewer/index.html

**Not built yet (deferred — see decisions.md):**
- 11-step guided checklist UI (currently flat 2-4 photo capture)
- On-device quality checks (blur, tilt-verticality gate, framing/object-in-frame)
- Real SharePoint integration (currently SQLite stand-in)
- Part 2 (AI Model training/inference/fine-tune loop)

---
---

# v2 — Execution Trace Additions (Auth, Guided Capture, Fraud Checks, In-App Review)

Everything in the "v1" sections above still applies for the parts that
didn't change (network.ts, storage.ts, syncService.ts core logic). This
section covers what's new/replaced.

## 8. Login

```
App.tsx (mount)
  └─ auth.getCurrentUser()
        ├─ SecureStore.getItemAsync('pole_inspection_jwt')
        └─ decodeBase64Url(token payload)   [manual, no atob dependency]
  IF no valid user:
    └─ renders LoginScreen
          └─ user submits -> auth.login(username, password)
                └─ fetch POST /api/auth/login
                      └─ backend: routes/auth.js
                            ├─ pool.query SELECT ... FROM users WHERE username = ?
                            ├─ bcrypt.compare(password, user.password_hash)
                            └─ jwt.sign({userId, username, role}, ...)
                └─ SecureStore.setItemAsync(token)
          └─ onLoggedIn(user) -> App.tsx: setUser(user)
```

## 9. Role-based routing (App.tsx, after login)

```
role === 'field'     -> PoleIdScreen -> CaptureScreen
role === 'reviewer'   -> ReviewerScreen
role === 'admin'        -> toggle between both (adminView state)
```

## 10. Pole registration (PoleIdScreen.tsx) — GPS hard-gate + hash + fraud check

```
PoleIdScreen (mount)
  └─ location.getFixOrThrow()
        ├─ ensureLocationPermission()  [throws if denied]
        └─ Location.getCurrentPositionAsync()
        (screen renders NOTHING interactive until this resolves — the
         "no GPS, no further process" gate)

User types pole name -> taps Continue -> handleContinue()
  └─ poleIdService.generatePoleId(lat, lon, name)
        └─ Crypto.digestStringAsync(SHA256, "lat:lon:name")
        └─ returns 'PL-<10 hex chars>'
  └─ api.registerCapturedPole({ id, enteredName, lat, lon })
        └─ fetch POST /api/poles
              └─ backend: routes/poles.js  POST /
                    ├─ SELECT FROM captured_poles WHERE id = ?
                    │     IF found: return { deduped: true }   [same physical pole, different worker]
                    │
                    └─ IF not found:
                          ├─ utils/geo.js: evaluateGeoFraud(id, lat, lon)
                          │     ├─ findNearestMasterPole(lat, lon)
                          │     │     └─ PostGIS: ORDER BY location <-> point LIMIT 1
                          │     └─ compare distance against MASTER_MATCH_TOLERANCE_M (25m)
                          │           and MIN_NEIGHBOR_SPACING_M (30m) -> flags[]
                          └─ INSERT INTO captured_poles (..., flagged = flags.length > 0)
  IF flags returned:
    └─ Alert shown to field worker NOW (not just at review time)
          -> "Re-check GPS" (retry) or "Continue anyway" (flagged=true carried forward)
  └─ onPoleReady(pole) -> App.tsx: setSelectedPole(pole) -> renders CaptureScreen
```

## 11. Guided capture (CaptureScreen.tsx) — per checklist item

```
CaptureScreen (mount)
  └─ quality.subscribeTilt(setTilt)
        └─ DeviceMotion.addListener (continuous, ~150ms interval)
              └─ every reading: onReading({pitchDeg, rollDeg, offVerticalDeg, ok})
                    └─ setTilt(reading) -> re-renders tiltMessage
                          ("Phone tilted 12° — please hold phone straight" when !ok)

Shutter button `disabled={!tilt?.ok}` — this IS the enforcement; there is
no path to capturing while tilt.ok is false.

User taps Capture -> handleCapture()   [only reachable when tilt.ok]
  ├─ cameraRef.current.takePictureAsync()
  ├─ location.getFixOrThrow()            [re-checked per photo, not just per pole]
  ├─ location.readHeadingOnce()
  ├─ dedup.hashPhotoFile(shot.uri)
  │     └─ FileSystem.readAsStringAsync(base64) -> Crypto.digestStringAsync(SHA256)
  ├─ dedup.isDuplicateInSession(hash, existingHashes)
  │     IF true: Alert shown, photo discarded, function returns early
  └─ setPhotos(prev => [...prev, meta])   [meta.checklistKey = current item's key]

User taps "Next Item" (enabled once photosForItem.length >= item.minPhotos)
  └─ setItemIndex(i => i + 1)   [re-renders with next CHECKLIST_ITEMS entry]

On last item, "Next Item" becomes "Finish & Save" -> handleFinish()
  └─ validates every CHECKLIST_ITEMS entry has enough photos
  └─ builds InspectionRecord { id, poleId, photos (flat, all items), ... }
  └─ syncService.attemptUpload(record)     [same function as v1 flow.md §4]
```

## 12. Upload -> folder storage + server-side fraud/quality recording

```
api.uploadInspection(record)
  └─ FormData: inspectionId, poleId, createdAt appended FIRST,
     then checklistKeys[] (one per photo, same order), then photoMeta JSON,
     then photos[] files LAST
     (ORDER MATTERS — see comment block at top of api.ts and routes/inspections.js)
  └─ fetch POST /api/inspections
        └─ backend: routes/inspections.js  POST /
              ├─ multer.diskStorage.destination()
              │     └─ mkdir uploads/{poleId}/{inspectionId}/  (recursive)
              ├─ multer.diskStorage.filename()
              │     └─ reads req.body.checklistKeys[req._photoIndex] -> `{key}_{timestamp}.jpg`
              ├─ SELECT FROM captured_poles WHERE id = poleId   [must already exist — see §10]
              ├─ INSERT INTO inspections (..., status='pending_review')
              └─ for each uploaded file:
                    ├─ utils/imageHash.js: computeAverageHash(file.path)   [server-computed, not trusted from client]
                    ├─ utils/imageHash.js: findDuplicate(pool, hash, excludeInspectionId)
                    │     └─ SELECT ... FROM photos WHERE avg_hash IS NOT NULL AND inspection_id != ?
                    │     └─ hammingDistance(newHash, each.avg_hash) <= 5 -> match found
                    │     IF match: pushed into fraudFlags[] for this inspection
                    └─ INSERT INTO photos (..., avg_hash, quality_flags)
              └─ IF fraudFlags.length > 0: UPDATE inspections SET fraud_flags = ...
```

## 13. In-app review (ReviewerScreen.tsx) — folder-wise

```
ReviewerScreen (mount) -> load()
  └─ api.getReviewQueue('pending_review')
        └─ fetch GET /api/inspections?status=pending_review  (Authorization header attached)
              └─ backend: routes/inspections.js  GET /
                    ├─ requireAuth, requireRole('reviewer','admin')   [403 for role='field']
                    ├─ SELECT i.*, cp.entered_name, cp.flagged, ... JOIN captured_poles
                    ├─ for each inspection: SELECT * FROM photos WHERE inspection_id = ?
                    └─ groups rows into { poleId, poleName, flagged, inspections: [...] }[]
  └─ setGroups(data) -> renders one "folder" per pole, expandable per inspection

User expands an inspection -> <PhotoGrid photos={insp.photos} />
  └─ for each photo: api.authorizedImageSource(photo.filepath)
        └─ returns { uri: '.../uploads/<relpath>', headers: { Authorization: 'Bearer ...' } }
        └─ <Image source={...}> fetches with that header
              └─ backend: server.js  '/uploads' route -> requireAuth -> express.static

User taps fault labels (toggleLabel) -> taps "Save Labels" -> saveLabels(id)
  └─ api.submitLabels(inspectionId, labels)
        └─ fetch POST /api/inspections/{id}/label
              └─ backend: UPDATE inspections SET status='labeled', labels_json=?,
                          reviewed_by=req.user.userId, reviewed_at=now()
  └─ load() re-runs -> labeled inspection no longer in pending_review results
```

---
---

# v3 — Execution Trace Additions

## 14. Startup permissions gate

```
App.tsx (mount, after session check)
  IF !permissionsGranted:
    └─ renders PermissionsGateScreen
          └─ user taps "Grant Permissions" -> requestAll()
                ├─ requestCameraPermission()      [expo-camera]
                └─ location.ensureLocationPermission()
          IF both granted -> onGranted() -> App.tsx: setPermissionsGranted(true)
          ELSE -> warning shown, button stays to retry
  (only after this -> proceeds to session/login check, as before)
```

## 15. Capture with angle guidance + real quality checks (replaces old §11)

```
CaptureScreen: handleCapture()
  ├─ cameraRef.current.takePictureAsync()
  ├─ location.getFixOrThrow()
  ├─ location.readHeadingOnce()
  ├─ angleGuidance(heading)
  │     └─ compares against photosForItem[last].headingDeg
  │           IF item.minAngleSeparationDeg set AND diff too small:
  │                 Alert shown, function returns — photo discarded
  ├─ dedup.hashPhotoFile() + isDuplicateInSession()  [same as v2]
  ├─ quality.checkBlur(uri)          [services/quality.ts]
  │     ├─ ImageManipulator.manipulateAsync (resize + base64)
  │     ├─ base64ToUint8Array()       [manual decode, no atob]
  │     ├─ jpeg.decode()              [jpeg-js, pure JS]
  │     └─ Laplacian variance over grayscale thumbnail
  ├─ quality.checkFraming(uri, item.fullPoleShot)
  │     └─ same decode, row-wise edge-energy analysis
  ├─ IF either check returns 'poor':
  │     └─ Alert with Retake / Keep anyway
  │           Retake -> function returns, photo discarded
  │           Keep anyway -> falls through to save
  └─ setPhotos(prev => [...prev, meta])   [meta.quality now carries real blur/framing results]
```

## 16. Upload with three-way fraud check (replaces old §12's validation step)

```
syncService.attemptUpload(record)
  ├─ network.isConnected()
  ├─ location.getFixOrThrow()   [FRESH fix, taken NOW at upload time]
  └─ api.uploadInspection(record, uploadFix)
        └─ fetch POST /api/inspections  (uploadLatitude/uploadLongitude included)
              └─ backend: routes/inspections.js  POST /
                    ├─ PHASE A — validate every photo, nothing written yet:
                    │     ├─ for each photo: computeAverageHash() -> findDuplicate()
                    │     │       MATCH -> push to rejected[]
                    │     └─ for each photo: distanceMeters(pole.location, photo.location)
                    │             > 50m -> push to rejected[]
                    │     IF rejected.length > 0:
                    │           ├─ delete all just-uploaded files for this request
                    │           └─ return 409 { rejected: [...] }   [NO db rows written]
                    ├─ compute upload-vs-capture GPS drift (soft)
                    │     large drift + upload <30min after capture -> fraud_flags[]
                    └─ PHASE B — only reached if Phase A passed:
                          ├─ INSERT inspections (fraud_flags included)
                          └─ INSERT photos (one row per file, distance_from_pole_m stored)
  IF 409:
    └─ api.ts throws UploadRejectedError(rejected)
          └─ syncService.attemptUpload: storage.removeFromQueue(), RETHROWS (not silently requeued)
                └─ CaptureScreen.handleFinish() catch block:
                      ├─ removes rejected checklistKeys' photos from local state
                      ├─ jumps itemIndex back to the first rejected item
                      └─ Alert lists exactly which items + why
```

## 17. Per-photo review labeling (replaces old §13's labeling steps)

```
ReviewerScreen: user taps a photo -> PhotoCell's onToggle -> panel opens

Path A — "Mark Healthy":
  └─ saveHealthy() -> api.labelPhoto(inspectionId, photoId, {status:'healthy', faults:[]})
        └─ backend: POST /:inspectionId/photos/:photoId/label
              └─ UPDATE photos SET label_status='healthy', label_faults='[]', labeled_by, labeled_at

Path B — fault chips (any of the 11) and/or "Other" + free text:
  └─ toggleFault() / setOtherText() update local component state only
  └─ user taps "Save Fault Label" -> saveFaulty()
        └─ api.labelPhoto(inspectionId, photoId, {status:'faulty', faults, otherText})
              └─ backend: same endpoint, UPDATE with label_status='faulty', label_faults=[...], label_other_text

Either path -> onSaved() -> ReviewerScreen.load() re-fetches
  -> that photo's label_status now shown as a colored tag on its thumbnail

Once every photo on an inspection has label_status != 'unreviewed':
  "Complete Review" button becomes enabled
  └─ handleComplete(inspectionId) -> api.completeInspection(inspectionId)
        └─ backend: POST /:id/complete
              ├─ SELECT label_status, label_faults, label_other_text FROM photos WHERE inspection_id=?
              ├─ IF any still 'unreviewed': 400, complete refused
              └─ ELSE: aggregate (union of faults, list of otherNotes) ->
                       UPDATE inspections SET status='labeled', labels_json=..., reviewed_by, reviewed_at
  -> inspection drops out of the pending_review queue on next load()
```

## Where uploaded images actually live (clarifying a question from testing)

`backend/uploads/{poleId}/{inspectionId}/{checklistKey}_{timestamp}.jpg` —
a plain folder at the TOP LEVEL of `backend/`, a sibling of `routes/`,
`middleware/`, and `utils/`, not inside any of them. `middleware/auth.js`
only contains the two auth-check functions (`requireAuth`, `requireRole`)
— it never touches image files. If images were found somewhere under
`middleware/` that would indicate a path bug; the `destination` function
in `routes/inspections.js` builds its path via
`path.join(__dirname, '..', 'uploads', poleId, inspectionId)`, where
`__dirname` there is `backend/routes`, so `..` correctly resolves to
`backend/`, landing in `backend/uploads/`, not `backend/routes/middleware/`
or anywhere else.
