// Shared types for the mobile app. One definition per shape, imported
// everywhere else, so a field added here (e.g. tiltOkAtCapture) can't
// silently drift between what CaptureScreen builds and what api.ts sends.

export type UserRole = 'field' | 'reviewer' | 'admin';

export interface AuthUser {
  id: string;
  username: string;
  role: UserRole;
  fullName?: string;
}

export interface ChecklistItem {
  key: string;               // e.g. 'pole_bend' — used as filename prefix + DB column value
  label: string;
  priority: 'High' | 'Medium' | 'Low';
  shotGuidance: string;      // shown to the field worker on the capture screen for this step
  minPhotos: number;         // some items (pole bend) need >1 angle
  maxPhotos: number;         // caps how many shots can be taken for one item before moving on
  minAngleSeparationDeg?: number; // if set, the Nth photo must differ in compass heading from the (N-1)th by at least this much
  fullPoleShot: boolean;     // true for items needing the whole pole top-to-bottom in frame (drives the framing heuristic)
}

export interface CapturedPole {
  id: string;                 // hash of (rounded GPS + entered name) — see services/poleId.ts
  enteredName: string;
  latitude: number;
  longitude: number;
  flagged?: boolean;          // true if the backend found no nearby master pole (see routes/poles.js)
  nearestMasterPoleId?: string | null;
  nearestMasterDistanceM?: number | null;
}

export interface PhotoQualityFlags {
  tiltOk: boolean;
  tiltOffVerticalDeg: number;
  // v3: blur + framing are now REAL on-device heuristics, not stubs — see
  // decisions.md D21. Still heuristics, not a trained model, hence
  // 'status' rather than a plain boolean: 'ok' | 'poor' | 'skipped'
  // (skipped = the check itself failed to run, e.g. decode error).
  blurStatus: 'ok' | 'poor' | 'skipped';
  blurScore: number | null;      // Laplacian variance — higher = sharper
  framingStatus: 'ok' | 'poor' | 'skipped';
  framingDetail: string | null;
}

export interface PhotoMeta {
  uri: string;
  checklistKey: string;
  timestamp: string;
  latitude: number;
  longitude: number;
  headingDeg: number | null;
  pitchDeg: number | null;
  rollDeg: number | null;
  localHash: string;          // client-computed SHA-256, for immediate same-session dedup
  quality: PhotoQualityFlags;
  gpsAccuracyM: number | null;  // estimated error radius (averaged if tracker was running)
  gpsSamples?: number;           // how many readings were averaged (1 if tracker was not running)
}

export type InspectionStatus = 'draft' | 'pending_sync' | 'uploaded' | 'labeled';

export interface InspectionRecord {
  id: string;
  poleId: string;
  photos: PhotoMeta[];
  status: InspectionStatus;
  createdAt: string;
  lastAttemptAt?: string;
}
