import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Button, ScrollView, StyleSheet, ActivityIndicator, Alert, TouchableOpacity } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as location from '../services/location';
import * as quality from '../services/quality';
import * as dedup from '../services/dedup';
import * as syncService from '../services/syncService';
import * as api from '../services/api';
import PhotoThumbnail from '../components/PhotoThumbnail';
import CircularBubbleView from '../components/CircularBubbleView';
import GpsAccuracyBadge from './GpsAccuracyBadge';
import { useAccurateLocation } from '../services/useAccurateLocation';
import { useBubbleLevel } from '../services/useBubbleLevel';
import { CHECKLIST_ITEMS } from '../constants/checklist';
import { CapturedPole, InspectionRecord, PhotoMeta } from '../types';
import * as storage from '../services/storage';

type Props = { pole: CapturedPole; onDone: () => void };

// GPS tuning for capture (starting values — calibrate with real field data).
const CAPTURE_TARGET_ACCURACY_M = 15; // badge turns green at this
const CAPTURE_MAX_ACCURACY_M = 30; // shutter disabled if worse than this

// Bubble level is required for every photo in this section only (section 1 = Pole Inclination).
const BUBBLE_SECTION_INDEX = 0;

export default function CaptureScreen({ pole, onDone }: Props) {
  const sessionIdRef = useRef(`${pole.id}-${Date.now()}`);
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [itemIndex, setItemIndex] = useState(0);
  const [photos, setPhotos] = useState<PhotoMeta[]>([]);
  const [tilt, setTilt] = useState<quality.TiltReading | null>(null);
  const [zoom, setZoom] = useState(0);
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  // Must be called before any early return (React hook rule).
  const gps = useAccurateLocation({
    targetAccuracyM: CAPTURE_TARGET_ACCURACY_M,
    maxWaitMs: 30_000,
    onMove: 'ignore',
  });
  const gpsReady = gps.fix !== null && gps.fix.accuracy <= CAPTURE_MAX_ACCURACY_M;

  const item = CHECKLIST_ITEMS[itemIndex];
  const photosForItem = photos.filter((p) => p.checklistKey === item.key);
  const itemSatisfied = photosForItem.length >= item.minPhotos;
  const atMaxForItem = photosForItem.length >= item.maxPhotos;
  const isLastItem = itemIndex === CHECKLIST_ITEMS.length - 1;

  // Bubble ON for the whole Pole Inclination section, OFF from section 2 onward.
  const isBubbleSection = itemIndex === BUBBLE_SECTION_INDEX;
  const bubbleLevel = useBubbleLevel(isBubbleSection);
  const bubbleCanCapture = bubbleLevel.sensorAvailable === false || bubbleLevel.canCapture;

  useEffect(() => {
    const unsubscribe = quality.subscribeTilt(setTilt);
    return unsubscribe;
  }, []);

  if (!permission) return <ActivityIndicator style={{ flex: 1 }} />;
  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text>Camera access is needed to capture pole photos.</Text>
        <Button title="Grant permission" onPress={requestPermission} />
      </View>
    );
  }

  // Angle-guidance check: only applies to the 2nd+ shot of an item that
  // declares minAngleSeparationDeg, compared against the MOST RECENT shot
  // for that same item.
  function angleGuidance(currentHeading: number | null): { ok: boolean; message: string | null } {
    if (!item.minAngleSeparationDeg || photosForItem.length === 0) return { ok: true, message: null };
    const lastHeading = photosForItem[photosForItem.length - 1].headingDeg;
    if (currentHeading == null || lastHeading == null) return { ok: true, message: null };
    let diff = Math.abs(currentHeading - lastHeading) % 360;
    if (diff > 180) diff = 360 - diff;
    const remaining = item.minAngleSeparationDeg - diff;
    if (remaining > 0) {
      return { ok: false, message: `Move around the pole — need ~${Math.round(remaining)}° more from your last shot` };
    }
    return { ok: true, message: null };
  }

  async function handleCapture() {
    if (!cameraRef.current || !tilt?.ok || !gpsReady || atMaxForItem) return;
    if (isBubbleSection && !bubbleCanCapture) return;
    setBusy(true);
    setStatusMsg('Capturing…');
    try {
      const shot = await cameraRef.current.takePictureAsync({ quality: 0.85 });
      if (!shot) return;

      setStatusMsg('Reading GPS…');
      const fix = await location.getFixOrThrow();
      if (fix.accuracyM != null && fix.accuracyM > CAPTURE_MAX_ACCURACY_M) {
        Alert.alert('GPS too weak', `GPS accuracy is ±${Math.round(fix.accuracyM)} m. Hold the phone still for a few seconds and try again.`);
        return;
      }
      const heading = await location.readHeadingOnce();

      const angleCheck = angleGuidance(heading);
      if (!angleCheck.ok) {
        Alert.alert('Not enough angle change', angleCheck.message || '');
        return;
      }

      setStatusMsg('Checking for duplicates…');
      let hash = '';
      try {
        hash = await dedup.hashPhotoFile(shot.uri);
      } catch (e) {
        console.warn('Hash failed, skipping duplicate check:', e);
      }
      if (hash && dedup.isDuplicateInSession(hash, photos.map((p) => p.localHash))) {
        Alert.alert('Duplicate photo', 'This looks identical to a photo you already captured. Try a different angle.');
        return;
      }

      setStatusMsg('Checking sharpness & framing…');
      const [blur, framing] = await Promise.all([
        quality.checkBlur(shot.uri),
        quality.checkFraming(shot.uri, item.fullPoleShot),
      ]);

      if (blur.status === 'poor' || framing.status === 'poor') {
        const reasons = [blur.status === 'poor' ? blur.detail : null, framing.status === 'poor' ? framing.detail : null]
          .filter(Boolean)
          .join('\n');
        const keepAnyway = await new Promise<boolean>((resolve) => {
          Alert.alert('Quality check', reasons || 'This photo may not be usable.', [
            { text: 'Retake', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Keep anyway', onPress: () => resolve(true) },
          ]);
        });
        if (!keepAnyway) return;
      }

      const savedUri: unknown = await storage.persistCapturedPhoto(sessionIdRef.current, shot.uri, item.key);
      // Use the permanent copy; the camera temp file can be deleted before upload.
      const photoUri = typeof savedUri === 'string' && savedUri.length > 0 ? savedUri : shot.uri;
      const meta: PhotoMeta = {
        uri: photoUri,
        checklistKey: item.key,
        timestamp: new Date().toISOString(),
        latitude: fix.latitude,
        longitude: fix.longitude,
        gpsAccuracyM: fix.accuracyM,
        gpsSamples: fix.samples,
        headingDeg: heading,
        pitchDeg: tilt.pitchDeg,
        rollDeg: tilt.rollDeg,
        localHash: hash,
        quality: {
          tiltOk: tilt.ok,
          tiltOffVerticalDeg: tilt.offVerticalDeg,
          blurStatus: blur.status,
          blurScore: blur.score ?? null,
          framingStatus: framing.status,
          framingDetail: framing.detail ?? null,
        },
      };
      setPhotos((prev) => [...prev, meta]);
    } catch (err) {
      console.error('Capture failed:', err);
      Alert.alert('Capture failed', (err as Error)?.message || 'Please try again.');
    } finally {
      setBusy(false);
      setStatusMsg('');
    }
  }

  function handleRemove(uri: string) {
    setPhotos((prev) => prev.filter((p) => p.uri !== uri));
  }

  function goNextItem() {
    setZoom(0);
    if (isLastItem) void handleFinish();
    else setItemIndex((i) => i + 1);
  }

  async function handleFinish() {
    const unmet = CHECKLIST_ITEMS.filter(
      (ci) => photos.filter((p) => p.checklistKey === ci.key).length < ci.minPhotos
    );
    if (unmet.length > 0) {
      Alert.alert('Checklist incomplete', `Still missing: ${unmet.map((u) => u.label).join(', ')}`);
      return;
    }

    const record: InspectionRecord = {
      id: sessionIdRef.current,
      poleId: pole.id,
      photos,
      status: 'draft',
      createdAt: new Date().toISOString(),
    };

    setBusy(true);
    setStatusMsg('Uploading…');
    try {
      const out = await syncService.attemptUpload(record);
      setBusy(false);
      if (out.result === 'uploaded') {
        Alert.alert('Uploaded', 'Inspection uploaded successfully.');
      } else {
        const msg = {
          offline: "No signal. Saved on this phone and will sync automatically once you're back online.",
          server_unreachable: 'Cannot reach the server (check Wi-Fi / server IP). Saved on this phone.',
          server_error: `Server error: ${out.detail ?? 'unknown'}. Saved on this phone, will retry.`,
          photo_missing: `${out.detail ?? 'A photo file is missing'}. Please retake this inspection.`,
        }[out.reason];
        Alert.alert('Saved offline', msg);
      }
      onDone();
    } catch (err) {
      setBusy(false);
      if (err instanceof api.UploadRejectedError) {
        const rejectedKeys = new Set(err.rejected.map((r) => r.checklistKey));
        setPhotos((prev) => prev.filter((p) => !rejectedKeys.has(p.checklistKey)));
        // Going back to section 1 re-enables the bubble automatically.
        const firstRejectedIdx = CHECKLIST_ITEMS.findIndex((ci) => rejectedKeys.has(ci.key));
        if (firstRejectedIdx >= 0) setItemIndex(firstRejectedIdx);
        Alert.alert(
          'Some photos were rejected — not uploaded',
          err.rejected.map((r) => `${r.checklistKey}: ${r.detail}`).join('\n\n') + '\n\nPlease retake the listed item(s).'
        );
      } else {
        Alert.alert('Upload failed', (err as Error).message || 'Try again.');
      }
    }
  }

  const tiltMessage = !tilt
    ? 'Reading sensors…'
    : tilt.ok
      ? 'Phone level — ready to capture'
      : `Phone tilted ${Math.round(tilt.offVerticalDeg)}° — please hold phone straight`;

  const gpsMessage =
    gps.status === 'error'
      ? gps.error
      : !gpsReady
        ? `Waiting for GPS (need ±${CAPTURE_MAX_ACCURACY_M} m or better) — hold the phone still`
        : null;

  return (
    <View style={styles.container}>
      <Text style={styles.progress}>
        Item {itemIndex + 1} / {CHECKLIST_ITEMS.length} — {item.label} ({item.priority})
      </Text>
      <Text style={styles.guidance}>{item.shotGuidance}</Text>

      <View style={styles.cameraFrame}>
        <CameraView ref={cameraRef} style={styles.camera} facing="back" zoom={zoom} />
        {isBubbleSection && (
          <View style={styles.bubbleOverlay}>
            <CircularBubbleView level={bubbleLevel} />
          </View>
        )}
      </View>

      <View style={styles.zoomRow}>
        <TouchableOpacity style={styles.zoomBtn} onPress={() => setZoom((z) => Math.max(0, z - 0.1))}>
          <Text style={styles.zoomBtnText}>－</Text>
        </TouchableOpacity>
        <Text style={styles.zoomLabel}>Zoom {Math.round(zoom * 100)}%</Text>
        <TouchableOpacity style={styles.zoomBtn} onPress={() => setZoom((z) => Math.min(1, z + 0.1))}>
          <Text style={styles.zoomBtnText}>＋</Text>
        </TouchableOpacity>
      </View>

      <Text style={[styles.tiltMsg, { color: tilt?.ok ? '#16a34a' : '#d97706' }]}>{tiltMessage}</Text>

      <View style={styles.gpsRow}>
        <GpsAccuracyBadge status={gps.status} progress={gps.progress} targetAccuracyM={CAPTURE_TARGET_ACCURACY_M} />
        {gps.status === 'error' && <Button title="Retry GPS" onPress={gps.retry} />}
      </View>
      {!!gpsMessage && <Text style={styles.gpsMsg}>{gpsMessage}</Text>}

      {busy && !!statusMsg && <Text style={styles.statusMsg}>{statusMsg}</Text>}

      <ScrollView horizontal style={styles.thumbRow}>
        {photosForItem.map((p) => (
          <PhotoThumbnail key={p.uri} photo={p} onRemove={() => handleRemove(p.uri)} />
        ))}
      </ScrollView>

      <Text style={styles.count}>
        {photosForItem.length} / {item.minPhotos} required (max {item.maxPhotos})
      </Text>

      {busy ? (
        <ActivityIndicator />
      ) : (
        <View style={styles.buttonRow}>
          <Button
            title="Capture"
            onPress={handleCapture}
            disabled={!tilt?.ok || !gpsReady || atMaxForItem || (isBubbleSection && !bubbleCanCapture)}
          />
          <Button
            title={isLastItem ? 'Finish & Save' : 'Next Item'}
            onPress={goNextItem}
            disabled={!itemSatisfied}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  progress: { fontSize: 14, fontWeight: '600' },
  guidance: { fontSize: 12, color: '#555', marginBottom: 8 },
  cameraFrame: { position: 'relative' },
  camera: { width: '100%', height: 300, borderRadius: 8, overflow: 'hidden' },
  bubbleOverlay: { position: 'absolute', top: 8, alignSelf: 'center' },
  zoomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14, marginTop: 6 },
  zoomBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#e5e5e5', alignItems: 'center', justifyContent: 'center' },
  zoomBtnText: { fontSize: 18, fontWeight: '700' },
  zoomLabel: { fontSize: 12, color: '#555', minWidth: 80, textAlign: 'center' },
  tiltMsg: { textAlign: 'center', fontWeight: '600', marginVertical: 6 },
  gpsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  gpsMsg: { textAlign: 'center', color: '#d97706', fontSize: 12, marginTop: 4 },
  statusMsg: { textAlign: 'center', color: '#2563eb', marginBottom: 4 },
  thumbRow: { flexDirection: 'row', maxHeight: 90 },
  count: { textAlign: 'center', marginVertical: 6, color: '#555' },
  buttonRow: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 4 },
});
