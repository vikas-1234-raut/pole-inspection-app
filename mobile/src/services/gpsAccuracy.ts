// services/gpsAccuracy.ts
//
// Shared GPS tracker. Two layers:
//
//  LAYER 1 - "AngleCam-style" acquisition (matches the reverse-engineering notes)
//    * Check providers first (locationProviders.ts): permission / location switch / GPS.
//    * Continuous updates, not one-shot (AngleCam requests 0 ms / 0 m; we use 1000 ms,
//      which is what Android actually delivers for GPS anyway).
//    * Selectable mode, like AngleCam's 4 request configs (high / balanced / low / passive).
//    * Optional last-known position as a quick preview only.
//    * Keep the newest raw reading (AngleCam forwards the LAST location of each result)
//      -> exposed as `latest`, shown live on screen.
//
//  LAYER 2 - accuracy logic (AngleCam does NOT do this, per the notes: it never calls
//            getAccuracy(), never waits, never averages, never rejects by accuracy)
//    * Reject stale / mocked / too-inaccurate readings.
//    * Accelerometer stillness: never average readings from different spots.
//    * Remove outliers, weighted average (1/accuracy^2), conservative accuracy estimate.
//    * Lock only when accuracy <= target with >= minSamples readings.
//
// Needs:  npx expo install expo-location expo-sensors

import * as Location from 'expo-location';
import { Accelerometer } from 'expo-sensors';
import { checkProviders, getQuickPreview, ProviderErrorCode, PROVIDER_MESSAGES } from './locationProviders';

// ---------------------------------------------------------------- Types

export type GpsMode = 'high' | 'balanced' | 'low' | 'passive';

// Mapping to Android fused-location priorities (the 100/102/104/105 values in the notes):
//   100 HIGH_ACCURACY, 102 BALANCED_POWER_ACCURACY, 104 LOW_POWER, 105 PASSIVE.
// Expo picks the Android priority from its Accuracy enum, so we map to that.
const MODE_TO_ACCURACY: Record<GpsMode, Location.Accuracy> = {
  high: Location.Accuracy.BestForNavigation,
  balanced: Location.Accuracy.Balanced,
  low: Location.Accuracy.Low,
  passive: Location.Accuracy.Lowest,
};

export interface RawReading {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  timestamp: number;
}

export interface AccurateFix {
  latitude: number;
  longitude: number;
  altitude: number | null;
  /** Estimated horizontal error radius in metres (smaller = better). */
  accuracy: number;
  samples: number;
  timeToFixMs: number;
  reachedTarget: boolean;
  timestamp: number;
}

export interface LockProgress {
  latestAccuracy: number | null;
  averagedAccuracy: number | null;
  samples: number;
  isStill: boolean;
  elapsedMs: number;
}

export type LockStatus = 'idle' | 'locking' | 'locked' | 'timeout' | 'error';
export type GpsErrorCode = ProviderErrorCode | 'unknown';

export interface TrackerOptions {
  /** Request mode, like AngleCam's request configs. Use 'high' for inspection. Default 'high'. */
  mode?: GpsMode;
  /** Lock when estimated accuracy <= this (metres). Default 5. */
  targetAccuracyM?: number;
  /** After this long without a lock, status becomes 'timeout'. Default 30000. */
  maxWaitMs?: number;
  /** Minimum samples before a lock is allowed. Default 4. */
  minSamples?: number;
  /** Ignore single readings worse than this (m). Default 30. */
  maxSampleAccuracyM?: number;
  /** Ignore readings older than this (ms). Default 5000. */
  maxSampleAgeMs?: number;
  /** Drop samples older than this (ms). Default 60000. */
  maxSampleLifeMs?: number;
  /** Use the accelerometer to detect movement. Default true. */
  requireStill?: boolean;
  /** 'clear' = restart averaging on movement, 'ignore' = pause adding. Default 'clear'. */
  onMove?: 'clear' | 'ignore';
  /** Show a cached last-known position until the first live reading. Default true. */
  useLastKnownPreview?: boolean;
}

export interface TrackerSnapshot {
  status: LockStatus;
  running: boolean;
  progress: LockProgress;
  /** Averaged, filtered fix - the one to SAVE. */
  fix: AccurateFix | null;
  /** Newest raw reading, unfiltered - for live DISPLAY only (AngleCam-style). */
  latest: RawReading | null;
  /** Cached last-known position before live GPS arrives - DISPLAY only. */
  preview: RawReading | null;
  error: string | null;
  errorCode: GpsErrorCode | null;
}

// ---------------------------------------------------------------- Math helpers

interface Sample {
  lat: number;
  lon: number;
  alt: number | null;
  acc: number;
  ts: number;
}

const M_PER_DEG = 111_320;

export function distanceM(aLat: number, aLon: number, bLat: number, bLon: number) {
  const dLat = (aLat - bLat) * M_PER_DEG;
  const dLon = (aLon - bLon) * M_PER_DEG * Math.cos((aLat * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLon * dLon);
}

function median(values: number[]) {
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function rejectOutliers(samples: Sample[]): Sample[] {
  if (samples.length < 4) return samples;
  const medLat = median(samples.map((s) => s.lat));
  const medLon = median(samples.map((s) => s.lon));
  const kept = samples.filter((s) => distanceM(s.lat, s.lon, medLat, medLon) <= 2 * s.acc + 3);
  return kept.length >= 3 ? kept : samples;
}

function combine(samples: Sample[]) {
  let sumW = 0, lat = 0, lon = 0, altW = 0, alt = 0;
  let best = Infinity;
  for (const s of samples) {
    const w = 1 / (s.acc * s.acc);
    sumW += w;
    lat += s.lat * w;
    lon += s.lon * w;
    if (s.alt != null) {
      alt += s.alt * w;
      altW += w;
    }
    best = Math.min(best, s.acc);
  }
  const accuracy = Math.max(1 / Math.sqrt(sumW), best * 0.8);
  return { latitude: lat / sumW, longitude: lon / sumW, altitude: altW > 0 ? alt / altW : null, accuracy };
}

// ---------------------------------------------------------------- Stillness (accelerometer)

function createStillnessMonitor(thresholdG = 0.04, windowSize = 10) {
  const mags: number[] = [];
  let still = true;
  Accelerometer.setUpdateInterval(100);
  const sub = Accelerometer.addListener(({ x, y, z }) => {
    mags.push(Math.sqrt(x * x + y * y + z * z));
    if (mags.length > windowSize) mags.shift();
    if (mags.length === windowSize) {
      const mean = mags.reduce((a, b) => a + b, 0) / windowSize;
      const variance = mags.reduce((a, b) => a + (b - mean) ** 2, 0) / windowSize;
      still = Math.sqrt(variance) < thresholdG;
    }
  });
  return { isStill: () => still, stop: () => sub.remove() };
}

// ---------------------------------------------------------------- Tracker

const DEFAULTS: Required<TrackerOptions> = {
  mode: 'high',
  targetAccuracyM: 20,
  maxWaitMs: 30_000,
  minSamples: 4,
  maxSampleAccuracyM: 30,
  maxSampleAgeMs: 5_000,
  maxSampleLifeMs: 60_000,
  requireStill: true,
  onMove: 'clear',
  useLastKnownPreview: true,
};

const IDLE_SNAPSHOT: TrackerSnapshot = {
  status: 'idle',
  running: false,
  progress: { latestAccuracy: null, averagedAccuracy: null, samples: 0, isStill: true, elapsedMs: 0 },
  fix: null,
  latest: null,
  preview: null,
  error: null,
  errorCode: null,
};

const STOP_GRACE_MS = 3000; // keep GPS warm across PoleIdScreen -> CaptureScreen
const PROVIDER_POLL_MS = 5000; // re-check "is GPS still on?" (no change event in Expo)

class GpsTracker {
  private refs = 0;
  private gen = 0;
  private opts: Required<TrackerOptions> = DEFAULTS;
  private samples: Sample[] = [];
  private latest: RawReading | null = null;
  private preview: RawReading | null = null;
  private isStill = true;
  private startedAt = 0;
  private firstLockMs: number | null = null;
  private error: string | null = null;
  private errorCode: GpsErrorCode | null = null;
  private sub: Location.LocationSubscription | null = null;
  private still: ReturnType<typeof createStillnessMonitor> | null = null;
  private timeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private stopTimer: ReturnType<typeof setTimeout> | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<() => void>();
  private snapshot: TrackerSnapshot = IDLE_SNAPSHOT;
  private running = false;
  private activeMode: GpsMode | null = null;

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  getSnapshot = () => this.snapshot;

  /** Start (or join) tracking. Call stop() once for every start(). */
  async start(options?: TrackerOptions): Promise<void> {
    this.refs += 1;
    this.opts = { ...DEFAULTS, ...options };
    if (this.stopTimer) {
      clearTimeout(this.stopTimer);
      this.stopTimer = null;
    }
    if (this.running && this.activeMode === this.opts.mode) {
      this.armTimeout();
      this.rebuild();
      this.emit();
      return;
    }
    if (this.running) this.teardown(); // mode changed -> new subscription
    await this.begin();
  }

  stop() {
    this.refs = Math.max(0, this.refs - 1);
    if (this.refs === 0 && !this.stopTimer) {
      this.stopTimer = setTimeout(() => {
        this.stopTimer = null;
        if (this.refs === 0) this.teardown();
      }, STOP_GRACE_MS);
    }
  }

  /** Forget samples and average again ("Re-check GPS"). */
  reset() {
    this.samples = [];
    this.firstLockMs = null;
    this.startedAt = Date.now();
    this.armTimeout();
    this.rebuild();
    this.emit();
  }

  /** Full restart incl. provider check and permission. */
  async retry(): Promise<void> {
    if (this.refs === 0) return;
    this.teardown();
    await this.begin();
  }

  waitForLock(opts: { timeoutMs?: number; signal?: AbortSignal } = {}): Promise<AccurateFix> {
    const { timeoutMs = this.opts.maxWaitMs, signal } = opts;
    return new Promise<AccurateFix>((resolve, reject) => {
      let done = false;
      let timer: ReturnType<typeof setTimeout> | null = null;
      let unsub: (() => void) | null = null;
      const finish = (fn: () => void) => {
        if (done) return;
        done = true;
        if (timer) clearTimeout(timer);
        unsub?.();
        signal?.removeEventListener('abort', onAbort);
        fn();
      };
      const onAbort = () => finish(() => reject(new Error('cancelled')));
      const check = () => {
        const s = this.snapshot;
        if (s.status === 'locked' && s.fix) finish(() => resolve(s.fix as AccurateFix));
        else if (s.status === 'error') finish(() => reject(new Error(s.error ?? 'GPS error')));
      };
      if (signal?.aborted) return onAbort();
      signal?.addEventListener('abort', onAbort);
      unsub = this.subscribe(check);
      timer = setTimeout(() => {
        const fix = this.snapshot.fix;
        finish(() => (fix ? resolve(fix) : reject(new Error('No usable GPS reading. Move to an open area and try again.'))));
      }, timeoutMs);
      check();
    });
  }

  // ------------------------------------------------------------ internals

  private async begin() {
    const myGen = ++this.gen;
    this.running = true;
    this.activeMode = this.opts.mode;
    this.samples = [];
    this.latest = null;
    this.preview = null;
    this.firstLockMs = null;
    this.error = null;
    this.errorCode = null;
    this.isStill = true;
    this.startedAt = Date.now();
    this.rebuild();
    this.emit();

    try {
      // 1) Permission
      const perm = await Location.requestForegroundPermissionsAsync();
      if (myGen !== this.gen) return;
      if (perm.status !== 'granted') return this.setError('permission_denied');

      // 2) Providers (AngleCam Path A: is GPS / network enabled?)
      const prov = await checkProviders();
      if (myGen !== this.gen) return;
      if (!prov.ok && prov.code) return this.setError(prov.code);

      // 3) Quick preview from cache (display only)
      if (this.opts.useLastKnownPreview) {
        getQuickPreview().then((p) => {
          if (myGen !== this.gen || !p || this.latest) return;
          this.preview = toRaw(p);
          this.rebuild();
          this.emit();
        });
      }

      // 4) Continuous updates (AngleCam requests 0 ms / 0 m)
      this.still = createStillnessMonitor();
      this.armTimeout();
      const sub = await Location.watchPositionAsync(
        {
          accuracy: MODE_TO_ACCURACY[this.opts.mode],
          timeInterval: 1000,
          distanceInterval: 0,
          mayShowUserSettingsDialog: true,
        },
        (loc) => this.onLocation(loc),
      );
      if (myGen !== this.gen) {
        sub.remove();
        return;
      }
      this.sub = sub;

      // 5) Keep checking providers: user may switch GPS off mid-inspection
      this.pollTimer = setInterval(async () => {
        const p = await checkProviders().catch(() => null);
        if (myGen !== this.gen || !p) return;
        if (!p.ok && p.code) {
          if (this.errorCode !== p.code) this.setError(p.code);
        } else if (this.errorCode) {
          this.retry(); // provider came back -> restart cleanly
        }
      }, PROVIDER_POLL_MS);
    } catch (e) {
      if (myGen !== this.gen) return;
      this.error = e instanceof Error ? e.message : 'GPS error';
      this.errorCode = 'unknown';
      this.rebuild();
      this.emit();
    }
  }

  private setError(code: ProviderErrorCode) {
    this.error = PROVIDER_MESSAGES[code];
    this.errorCode = code;
    this.samples = []; // never keep a fix across a provider failure
    this.rebuild();
    this.emit();
  }

  private onLocation(loc: Location.LocationObject) {
    if (this.errorCode) return;
    const o = this.opts;
    const now = Date.now();
    const acc = loc.coords.accuracy;

    // Layer 1: always keep the newest raw reading (AngleCam-style live display)
    this.latest = toRaw(loc);
    this.preview = null;

    // Layer 2: accuracy filtering + averaging
    this.isStill = this.still ? this.still.isStill() : true;
    this.samples = this.samples.filter((s) => now - s.ts <= o.maxSampleLifeMs);

    const stale = now - loc.timestamp > o.maxSampleAgeMs;
    const mocked = (loc as { mocked?: boolean }).mocked === true;
    const bad = acc == null || acc <= 0 || acc > o.maxSampleAccuracyM;
    const moving = o.requireStill && !this.isStill;

    if (moving) {
      if (o.onMove === 'clear') this.samples = [];
    } else if (!stale && !mocked && !bad) {
      this.samples.push({ lat: loc.coords.latitude, lon: loc.coords.longitude, alt: loc.coords.altitude, acc: acc as number, ts: now });
      if (this.samples.length > 30) this.samples.shift();
    }

    this.rebuild();
    this.emit();
  }

  private rebuild() {
    if (!this.running) {
      this.snapshot = IDLE_SNAPSHOT;
      return;
    }
    const o = this.opts;
    const now = Date.now();
    const elapsedMs = now - this.startedAt;

    let fix: AccurateFix | null = null;
    if (this.samples.length > 0) {
      const used = rejectOutliers(this.samples);
      const c = combine(used);
      const reachedTarget = c.accuracy <= o.targetAccuracyM && used.length >= o.minSamples;
      if (reachedTarget && this.firstLockMs == null) this.firstLockMs = elapsedMs;
      fix = { ...c, samples: used.length, timeToFixMs: this.firstLockMs ?? elapsedMs, reachedTarget, timestamp: now };
    }

    let status: LockStatus;
    if (this.error) status = 'error';
    else if (fix?.reachedTarget) status = 'locked';
    else if (elapsedMs > o.maxWaitMs) status = 'timeout';
    else status = 'locking';

    this.snapshot = {
      status,
      running: true,
      fix,
      latest: this.latest,
      preview: this.preview,
      error: this.error,
      errorCode: this.errorCode,
      progress: {
        latestAccuracy: this.latest?.accuracy ?? null,
        averagedAccuracy: fix ? fix.accuracy : null,
        samples: fix ? fix.samples : 0,
        isStill: this.isStill,
        elapsedMs,
      },
    };
  }

  private armTimeout() {
    if (this.timeoutTimer) clearTimeout(this.timeoutTimer);
    const left = this.opts.maxWaitMs - (Date.now() - this.startedAt);
    this.timeoutTimer = setTimeout(() => {
      this.rebuild();
      this.emit();
    }, Math.max(0, left) + 50);
  }

  private teardown() {
    this.gen += 1;
    this.sub?.remove();
    this.sub = null;
    this.still?.stop();
    this.still = null;
    if (this.timeoutTimer) clearTimeout(this.timeoutTimer);
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.timeoutTimer = null;
    this.pollTimer = null;
    this.running = false;
    this.activeMode = null;
    this.samples = [];
    this.snapshot = IDLE_SNAPSHOT;
    this.emit();
  }

  private emit() {
    this.listeners.forEach((fn) => fn());
  }
}

function toRaw(l: Location.LocationObject): RawReading {
  return { latitude: l.coords.latitude, longitude: l.coords.longitude, accuracy: l.coords.accuracy, timestamp: l.timestamp };
}

/** One tracker for the whole app. */
export const gpsTracker = new GpsTracker();
