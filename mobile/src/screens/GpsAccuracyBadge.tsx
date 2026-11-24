// components/GpsAccuracyBadge.tsx
//
// AngleCam-style live GPS overlay:
//   line 1: status (Getting GPS / Hold steady / Improving / Locked / GPS off ...)
//   line 2: averaged accuracy vs target          <- the value that gets SAVED
//   line 3 (optional): live raw lat/lon + its own accuracy  <- what AngleCam shows
// All new props are optional, so existing <GpsAccuracyBadge status progress /> calls still work.
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LockProgress, RawReading, GpsErrorCode } from '../services/gpsAccuracy';
import { LockStatus } from '../services/useAccurateLocation';

interface Props {
  status: LockStatus;
  progress: LockProgress | null;
  targetAccuracyM?: number;
  /** Newest raw reading - shows live coordinates like AngleCam. */
  latest?: RawReading | null;
  /** Cached position before live GPS - shown greyed as "approx." */
  preview?: RawReading | null;
  errorCode?: GpsErrorCode | null;
  /** Shows a "Turn on" button for provider errors. */
  onEnableLocation?: () => void;
}

const ERROR_TITLES: Record<GpsErrorCode, string> = {
  permission_denied: 'Location permission needed',
  services_off: 'Location is OFF',
  gps_off: 'GPS is OFF (network only)',
  unknown: 'GPS error',
};

export default function GpsAccuracyBadge({
  status,
  progress,
  targetAccuracyM = 5,
  latest,
  preview,
  errorCode,
  onEnableLocation,
}: Props) {
  const acc = progress?.averagedAccuracy ?? progress?.latestAccuracy ?? null;

  let color = '#d32f2f';
  if (status === 'locked') color = '#2e7d32';
  else if (status !== 'error' && acc != null && acc <= targetAccuracyM * 2) color = '#f9a825';

  let message = 'Getting GPS…';
  if (status === 'error') message = errorCode ? ERROR_TITLES[errorCode] : 'GPS error';
  else if (status === 'locked') message = 'GPS locked';
  else if (status === 'timeout') message = 'Best available GPS';
  else if (progress && !progress.isStill) message = 'Hold the phone steady';
  else if (progress && progress.samples > 0) message = `Improving accuracy (${progress.samples} samples)`;

  const live = latest ?? preview ?? null;

  return (
    <View style={[styles.box, { borderColor: color }]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <View style={{ flexShrink: 1 }}>
        <Text style={styles.title}>{message}</Text>
        {status !== 'error' && (
          <Text style={styles.sub}>
            {acc != null ? `±${acc.toFixed(1)} m` : '--'} (target ±{targetAccuracyM} m)
          </Text>
        )}
        {status !== 'error' && live && (
          <Text style={[styles.live, !latest && styles.approx]}>
            {!latest ? 'approx. ' : 'live '}
            {live.latitude.toFixed(6)}, {live.longitude.toFixed(6)}
            {live.accuracy != null ? `  ±${Math.round(live.accuracy)} m` : ''}
          </Text>
        )}
      </View>
      {status === 'error' && onEnableLocation && errorCode !== 'unknown' && (
        <TouchableOpacity style={styles.btn} onPress={onEnableLocation}>
          <Text style={styles.btnText}>Turn on</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderWidth: 1.5,
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
    gap: 8,
  },
  dot: { width: 12, height: 12, borderRadius: 6 },
  title: { color: '#fff', fontSize: 13, fontWeight: '600' },
  sub: { color: '#ddd', fontSize: 12 },
  live: { color: '#9ad', fontSize: 11 },
  approx: { color: '#888', fontStyle: 'italic' },
  btn: { backgroundColor: '#2563eb', borderRadius: 6, paddingVertical: 4, paddingHorizontal: 10 },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 12 },
});
