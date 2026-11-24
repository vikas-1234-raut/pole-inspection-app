// hooks/useAccurateLocation.ts
//
// Starts the shared GPS tracker when a screen mounts, stops it on unmount,
// and re-renders the screen whenever the tracker has new data.
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import {
  gpsTracker,
  AccurateFix,
  GpsErrorCode,
  LockProgress,
  LockStatus,
  RawReading,
  TrackerOptions,
} from '../services/gpsAccuracy';
import { tryEnableLocation } from '../services/locationProviders';

export type { LockStatus };

export interface UseAccurateLocationResult {
  status: LockStatus;
  progress: LockProgress;
  /** Averaged fix to SAVE (null until the first usable reading). */
  fix: AccurateFix | null;
  /** Newest raw reading - live display only. */
  latest: RawReading | null;
  /** Cached last-known position before live GPS - display only. */
  preview: RawReading | null;
  error: string | null;
  errorCode: GpsErrorCode | null;
  /** Forget samples and average again ("Re-check GPS"). */
  recheck: () => void;
  /** Full restart incl. permission + provider check. */
  retry: () => void;
  /** Ask the user to turn on location / GPS / permission, then restart. */
  enableLocation: () => void;
}

export function useAccurateLocation(options?: TrackerOptions): UseAccurateLocationResult {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const snap = useSyncExternalStore(gpsTracker.subscribe, gpsTracker.getSnapshot);

  useEffect(() => {
    gpsTracker.start(optionsRef.current);
    return () => gpsTracker.stop();
  }, []);

  const recheck = useCallback(() => gpsTracker.reset(), []);
  const retry = useCallback(() => {
    gpsTracker.retry();
  }, []);
  const enableLocation = useCallback(() => {
    tryEnableLocation().then(() => gpsTracker.retry());
  }, []);

  return {
    status: snap.status,
    progress: snap.progress,
    fix: snap.fix,
    latest: snap.latest,
    preview: snap.preview,
    error: snap.error,
    errorCode: snap.errorCode,
    recheck,
    retry,
    enableLocation,
  };
}
