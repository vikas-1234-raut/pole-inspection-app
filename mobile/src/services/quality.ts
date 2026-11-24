// services/quality.ts
//
// v3: blur and framing/coverage checks are now REAL on-device heuristics
// (decisions.md D21), replacing the honest "skipped" stubs from v2.
//
// HOW, without a native module or ML model: expo-image-manipulator shrinks
// the photo to a small thumbnail (fast — analysis cost scales with pixel
// count), then `jpeg-js` (a pure-JS JPEG decoder, no native binary) decodes
// it into raw pixels we can run plain arithmetic on:
//   - Blur: variance of the Laplacian (a standard, well-known blur metric)
//     over the grayscale thumbnail. Low variance = few sharp edges = blurry.
//   - Framing/coverage: for "full pole" shots (pole_bend, painting,
//     vegetation_clearance), sum vertical edge energy per image ROW and
//     check that a tall vertical structure's edges are present near both
//     the top and bottom of the frame — a proxy for "pole runs top to
//     bottom," not object recognition. For close-up shots, it instead
//     checks that SOME strong edge energy exists in the central region
//     (a proxy for "subject is close/filling the frame," not empty
//     background).
//
// These are genuinely useful signals, not fakes — but they are heuristics,
// not a trained detector, and can be fooled (e.g. a sharp photo of the
// wrong thing still "passes"). The proper next step (small on-device
// TFLite object detector per checklist item) is still the plan for a
// later pass — this is the honest, complete version of what's feasible
// without pulling in a native ML runtime.

import { DeviceMotion } from 'expo-sensors';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';
import jpeg from 'jpeg-js';

export const TILT_THRESHOLD_DEG = 90;

export interface TiltReading {
  pitchDeg: number;
  rollDeg: number;
  offVerticalDeg: number;
  ok: boolean;
}

export function subscribeTilt(onReading: (reading: TiltReading) => void): () => void {
  DeviceMotion.setUpdateInterval(150);
  const sub = DeviceMotion.addListener((data) => {
    if (!data.rotation) return;
    const pitchDeg = data.rotation.beta * (180 / Math.PI);
    const rollDeg = data.rotation.gamma * (180 / Math.PI);
    const offVerticalDeg = Math.sqrt(pitchDeg ** 2 + rollDeg ** 2);
    onReading({ pitchDeg, rollDeg, offVerticalDeg, ok: offVerticalDeg <= TILT_THRESHOLD_DEG });
  });
  return () => sub.remove();
}

// --- Shared: decode a small grayscale thumbnail for analysis ---

const ANALYSIS_WIDTH = 160; // small enough to decode/process in well under a second

async function decodeGrayThumbnail(photoUri: string): Promise<{ width: number; height: number; gray: Float32Array } | null> {
  try {
    const resized = await ImageManipulator.manipulateAsync(
      photoUri,
      [{ resize: { width: ANALYSIS_WIDTH } }],
      { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
    );
    if (!resized.base64) return null;

    const binary = base64ToUint8Array(resized.base64);
    const decoded = jpeg.decode(binary, { useTArray: true });
    const { width, height, data } = decoded; // RGBA

    const gray = new Float32Array(width * height);
    for (let i = 0; i < width * height; i++) {
      const r = data[i * 4];
      const g = data[i * 4 + 1];
      const b = data[i * 4 + 2];
      gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    }
    return { width, height, gray };
  } catch {
    return null;
  }
}

function base64ToUint8Array(base64: string): Uint8Array {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const clean = base64.replace(/[^A-Za-z0-9+/]/g, '');
  const bytes = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let byteIndex = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const b0 = chars.indexOf(clean[i]);
    const b1 = chars.indexOf(clean[i + 1]);
    const b2 = i + 2 < clean.length ? chars.indexOf(clean[i + 2]) : -1;
    const b3 = i + 3 < clean.length ? chars.indexOf(clean[i + 3]) : -1;
    bytes[byteIndex++] = (b0 << 2) | (b1 >> 4);
    if (b2 >= 0) bytes[byteIndex++] = ((b1 & 0xf) << 4) | (b2 >> 2);
    if (b3 >= 0) bytes[byteIndex++] = ((b2 & 0x3) << 6) | b3;
  }
  return bytes;
}

export type QualityCheckResult = { status: 'ok' | 'poor' | 'skipped'; score?: number | null; detail?: string };

// Blur: variance of the Laplacian over the grayscale thumbnail.
const BLUR_VARIANCE_THRESHOLD = 45; // tune against real field photos — see decisions.md D21

export async function checkBlur(photoUri: string): Promise<QualityCheckResult> {
  const decoded = await decodeGrayThumbnail(photoUri);
  if (!decoded) return { status: 'skipped', detail: 'Could not decode image for analysis' };
  const { width, height, gray } = decoded;

  const laplacian: number[] = [];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const value =
        4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - width] - gray[i + width];
      laplacian.push(value);
    }
  }
  const mean = laplacian.reduce((s, v) => s + v, 0) / laplacian.length;
  const variance = laplacian.reduce((s, v) => s + (v - mean) ** 2, 0) / laplacian.length;

  return {
    status: variance < BLUR_VARIANCE_THRESHOLD ? 'poor' : 'ok',
    score: Math.round(variance),
    detail: variance < BLUR_VARIANCE_THRESHOLD ? 'Image appears blurry' : undefined,
  };
}

// Framing/coverage heuristic — different check depending on shot type.
export async function checkFraming(photoUri: string, fullPoleShot: boolean): Promise<QualityCheckResult> {
  const decoded = await decodeGrayThumbnail(photoUri);
  if (!decoded) return { status: 'skipped', detail: 'Could not decode image for analysis' };
  const { width, height, gray } = decoded;

  // Row-wise vertical edge energy (sum of |gradient| along y for each row).
  const rowEnergy: number[] = new Array(height).fill(0);
  for (let y = 1; y < height - 1; y++) {
    let energy = 0;
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      energy += Math.abs(gray[i + width] - gray[i - width]);
    }
    rowEnergy[y] = energy;
  }
  const maxEnergy = Math.max(...rowEnergy, 1);
  const normalized = rowEnergy.map((e) => e / maxEnergy);

  const topBand = normalized.slice(0, Math.floor(height * 0.15));
  const bottomBand = normalized.slice(Math.floor(height * 0.85));
  const centerBand = normalized.slice(Math.floor(height * 0.35), Math.floor(height * 0.65));

  const hasEdges = (band: number[], thresh = 0.25) => band.some((v) => v > thresh);

  if (fullPoleShot) {
    const topOk = hasEdges(topBand);
    const bottomOk = hasEdges(bottomBand);
    if (topOk && bottomOk) return { status: 'ok' };
    return {
      status: 'poor',
      detail: !topOk && !bottomOk
        ? 'Pole top and base both look cut off — step back or reframe'
        : !topOk
          ? 'Pole top looks cut off — tilt up or step back'
          : 'Pole base looks cut off — tilt down or step back',
    };
  }

  // Close-up shot: expect strong edge energy centrally (subject fills frame).
  return {
    status: hasEdges(centerBand, 0.3) ? 'ok' : 'poor',
    detail: hasEdges(centerBand, 0.3) ? undefined : 'Subject may be too small/far — move closer',
  };
}
