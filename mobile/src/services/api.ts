// services/api.ts
//
// Single point of contact with the backend. Every call attaches the JWT
// (see authHeaders()) so role checks on the server (middleware/auth.js)
// are enforced no matter which screen is calling — the mobile UI hiding
// a button is a convenience, not the security boundary.

import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system/legacy';
import { CapturedPole, InspectionRecord } from '../types';

const API_BASE_URL = 'http://192.168.11.76:4000'; // set to your machine's LAN IP for a real device

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// Is OUR server reachable? Times out quickly so the field worker isn't kept waiting.
export async function pingServer(timeoutMs = 4000): Promise<boolean> {
  console.log('[ping]', `${API_BASE_URL}/api/health`);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE_URL}/api/health`, { signal: ctrl.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await SecureStore.getItemAsync('pole_inspection_jwt');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Used by ReviewerScreen's <Image> components — RN's Image accepts
// { uri, headers }, which is how we view protected /uploads images
// without exposing them as a public static folder.
export async function authorizedImageSource(
  relativePath: string
): Promise<{ uri: string; headers: Record<string, string> }> {
  const headers = await authHeaders();
  return { uri: `${API_BASE_URL}/uploads/${relativePath}`, headers };
}

// --- Poles ---

export async function findNearestMasterPole(
  lat: number,
  lon: number
): Promise<{ pole_id: string; tl_line: string; distance_m: number } | null> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE_URL}/api/poles/master/nearest?lat=${lat}&lon=${lon}`, { headers });
  if (!res.ok) throw new Error(`findNearestMasterPole failed: ${res.status}`);
  return res.json();
}

// Registers (or, if the hash already exists, silently confirms) the
// captured pole. Returns fraud flags from the geo check so the UI can
// warn the field worker immediately.
export async function registerCapturedPole(pole: CapturedPole): Promise<{
  id: string;
  deduped: boolean;
  flags?: { type: string; detail: string }[];
}> {
  const headers = { 'Content-Type': 'application/json', ...(await authHeaders()) };
  const res = await fetch(`${API_BASE_URL}/api/poles`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      id: pole.id,
      enteredName: pole.enteredName,
      lat: pole.latitude,
      lon: pole.longitude,
    }),
  });
  if (!res.ok) throw new Error(`registerCapturedPole failed: ${res.status}`);
  return res.json();
}

// --- Inspections ---

// Thrown when the backend hard-rejects the upload (duplicate photo, or a
// photo whose GPS doesn't match the claimed pole). Carries the specific
// checklist items that need to be retaken.
export class UploadRejectedError extends Error {
  rejected: { checklistKey: string; reason: string; detail: string }[];
  constructor(rejected: { checklistKey: string; reason: string; detail: string }[]) {
    super('One or more photos were rejected');
    this.rejected = rejected;
  }
}

function postMultipart(url: string, form: FormData, headers: Record<string, string>) {
  return new Promise<{ status: number; body: any }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
    xhr.timeout = 180000;
    xhr.onload = () => {
      let body: any = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {}
      resolve({ status: xhr.status, body });
    };
    xhr.onerror = () => reject(new Error('Network request failed'));
    xhr.ontimeout = () => reject(new Error('Upload timed out'));
    xhr.send(form);
  });
}

// IMPORTANT: poleId/inspectionId/checklistKeys must be appended to the
// FormData BEFORE the photo files — multer's disk-storage destination
// function on the backend reads them from req.body while parsing the
// stream. See the matching comment in backend/routes/inspections.js.
export async function uploadInspection(
  record: InspectionRecord,
  uploadFix: { latitude: number; longitude: number } | null
) {
  // Debug check (was the broken duplicate function): make sure every photo file still exists.
  console.log('[upload] photos:', record.photos.length);
  for (const p of record.photos) {
    const fileUri = p.uri.startsWith('file://') ? p.uri : `file://${p.uri}`;
    const info = await FileSystem.getInfoAsync(fileUri);
    console.log('[upload] file', p.checklistKey, info.exists, (info as any).size, fileUri);
    if (!info.exists) throw new Error(`Photo file missing: ${p.checklistKey}`);
  }

  const form = new FormData();
  form.append('inspectionId', record.id);
  form.append('poleId', record.poleId);
  form.append('createdAt', record.createdAt);
  if (uploadFix) {
    form.append('uploadLatitude', String(uploadFix.latitude));
    form.append('uploadLongitude', String(uploadFix.longitude));
  }

  record.photos.forEach((p) => form.append('checklistKeys', p.checklistKey));
  form.append(
    'photoMeta',
    JSON.stringify(
      record.photos.map((p) => ({
        timestamp: p.timestamp,
        latitude: p.latitude,
        longitude: p.longitude,
        gpsAccuracyM: p.gpsAccuracyM ?? null,
        gpsSamples: p.gpsSamples ?? null,
        headingDeg: p.headingDeg,
        pitchDeg: p.pitchDeg,
        rollDeg: p.rollDeg,
        qualityFlags: [
          p.quality?.tiltOk === false ? 'tilted' : null,
          p.quality?.blurStatus === 'poor' ? 'blurry' : null,
          p.quality?.blurStatus === 'skipped' ? 'blur_check_skipped' : null,
          p.quality?.framingStatus === 'poor' ? 'poor_framing' : null,
          p.quality?.framingStatus === 'skipped' ? 'framing_check_skipped' : null,
        ].filter(Boolean),
      }))
    )
  );

  record.photos.forEach((photo, index) => {
    const uri = photo.uri.startsWith('file://') ? photo.uri : `file://${photo.uri}`;
    form.append('photos', { uri, name: `${photo.checklistKey}_${index}.jpg`, type: 'image/jpeg' } as any);
  });

  const headers = await authHeaders(); // don't set Content-Type; XHR sets the boundary
  const { status, body } = await postMultipart(`${API_BASE_URL}/api/inspections`, form, headers);

  if (status === 401) {
    await SecureStore.deleteItemAsync('pole_inspection_jwt');
    throw new HttpError(401, 'Session expired. Please log in again.');
  }
  if (status === 409) throw new UploadRejectedError(body.rejected || []);
  if (status < 200 || status >= 300) {
    throw new HttpError(status, body.error || `uploadInspection failed: ${status}`);
  }
  return body;
}

// --- Reviewer (role-gated server-side; UI also hides these for non-reviewers) ---

export async function getReviewQueue(status = 'pending_review'): Promise<any[]> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE_URL}/api/inspections?status=${status}`, { headers });
  if (!res.ok) throw new HttpError(res.status, `getReviewQueue failed: ${res.status}`);
  return res.json();
}

// Per-photo label: "healthy", or "faulty" with one-or-more of the 11
// checklist keys plus optional free text for anything not on that list.
export async function labelPhoto(
  inspectionId: string,
  photoId: string,
  payload: { status: 'healthy' | 'faulty'; faults: string[]; otherText?: string }
): Promise<void> {
  const headers = { 'Content-Type': 'application/json', ...(await authHeaders()) };
  const res = await fetch(`${API_BASE_URL}/api/inspections/${inspectionId}/photos/${photoId}/label`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`labelPhoto failed: ${res.status}`);
}

// Finalizes the inspection once every photo has a label — server
// aggregates per-photo labels into the inspection's summary.
export async function completeInspection(inspectionId: string): Promise<void> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE_URL}/api/inspections/${inspectionId}/complete`, {
    method: 'POST',
    headers,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `completeInspection failed: ${res.status}`);
  }
}