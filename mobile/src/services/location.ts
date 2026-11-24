// services/location.ts
//
// "Without GPS permission further process not be done" — getFixOrThrow()
// is the hard gate: it either returns a real GPS fix or throws.
//
// v4/v5 (GPS accuracy, decisions.md D24/D25):
//   When a screen is open, the shared tracker (services/gpsAccuracy.ts) is already
//   collecting readings and getFixOrThrow() returns the averaged fix instantly.
//   If the tracker reports a provider problem (permission / location off / GPS off)
//   it THROWS with that message — same "no GPS, no capture" rule as before.
//   With no screen open (e.g. syncService.processQueue after reconnect) it falls
//   back to one normal reading, like the original code.

import * as Location from 'expo-location';
import { Magnetometer, DeviceMotion } from 'expo-sensors';
import { gpsTracker, AccurateFix } from './gpsAccuracy';
import { PROVIDER_MESSAGES } from './locationProviders';

export async function ensureLocationPermission(): Promise<boolean> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === 'granted';
}

export interface GpsFix {
  latitude: number;
  longitude: number;
  /** Estimated error radius in metres (averaged estimate when source = 'tracker'). */
  accuracyM: number | null;
  /** 'tracker' = averaged from several readings, 'single' = one raw reading. */
  source: 'tracker' | 'single';
  samples: number;
  reachedTarget: boolean;
}

export interface GetFixOptions {
  /** If the tracker is running but has no fix yet, wait this long (ms). Default 10000. */
  waitForFixMs?: number;
}

export async function getFixOrThrow(opts: GetFixOptions = {}): Promise<GpsFix> {
  const { waitForFixMs = 10_000 } = opts;
  const snap = gpsTracker.getSnapshot();

  if (snap.running) {
    if (snap.status === 'error') throw new Error(snap.error ?? PROVIDER_MESSAGES.permission_denied);
    if (snap.fix) return fromTracker(snap.fix);
    try {
      return fromTracker(await gpsTracker.waitForLock({ timeoutMs: waitForFixMs }));
    } catch (e) {
      const s = gpsTracker.getSnapshot();
      if (s.status === 'error') throw new Error(s.error ?? (e as Error).message);
      // no usable sample in time -> fall through to one raw reading
    }
  }

  const granted = await ensureLocationPermission();
  if (!granted) throw new Error(PROVIDER_MESSAGES.permission_denied);
  const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracyM: position.coords.accuracy,
    source: 'single',
    samples: 1,
    reachedTarget: false,
  };
}

function fromTracker(f: AccurateFix): GpsFix {
  return {
    latitude: f.latitude,
    longitude: f.longitude,
    accuracyM: f.accuracy,
    source: 'tracker',
    samples: f.samples,
    reachedTarget: f.reachedTarget,
  };
}

export async function readHeadingOnce(): Promise<number | null> {
  return new Promise((resolve) => {
    const sub = Magnetometer.addListener((data) => {
      sub.remove();
      const angle = Math.atan2(data.y, data.x) * (180 / Math.PI);
      resolve((angle + 360) % 360);
    });
    setTimeout(() => {
      sub.remove();
      resolve(null);
    }, 500);
  });
}

export async function readOrientationOnce(): Promise<{ pitch: number | null; roll: number | null }> {
  return new Promise((resolve) => {
    const sub = DeviceMotion.addListener((data) => {
      sub.remove();
      resolve({
        pitch: data.rotation ? data.rotation.beta * (180 / Math.PI) : null,
        roll: data.rotation ? data.rotation.gamma * (180 / Math.PI) : null,
      });
    });
    setTimeout(() => {
      sub.remove();
      resolve({ pitch: null, roll: null });
    }, 500);
  });
}
