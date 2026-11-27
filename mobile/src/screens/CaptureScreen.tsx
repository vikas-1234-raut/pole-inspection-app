// import React, { useEffect, useRef, useState } from 'react';
// import { View, Text, Button, ScrollView, StyleSheet, ActivityIndicator, Alert, TouchableOpacity } from 'react-native';
// import { CameraView, useCameraPermissions } from 'expo-camera';
// import * as location from '../services/location';
// import * as quality from '../services/quality';
// import * as dedup from '../services/dedup';
// import * as syncService from '../services/syncService';
// import * as api from '../services/api';
// import PhotoThumbnail from '../components/PhotoThumbnail';
// import CircularBubbleView from '../components/CircularBubbleView';
// import GpsAccuracyBadge from './GpsAccuracyBadge';
// import { useAccurateLocation } from '../services/useAccurateLocation';
// import { useBubbleLevel } from '../services/useBubbleLevel';
// import { CHECKLIST_ITEMS } from '../constants/checklist';
// import { CapturedPole, InspectionRecord, PhotoMeta } from '../types';
// import * as storage from '../services/storage';

// type Props = { pole: CapturedPole; onDone: () => void };

// // GPS tuning for capture (starting values — calibrate with real field data).
// const CAPTURE_TARGET_ACCURACY_M = 15; // badge turns green at this
// const CAPTURE_MAX_ACCURACY_M = 30; // shutter disabled if worse than this

// // Bubble level is required for every photo in this section only (section 1 = Pole Inclination).
// const BUBBLE_SECTION_INDEX = 0;

// export default function CaptureScreen({ pole, onDone }: Props) {
//   const sessionIdRef = useRef(`${pole.id}-${Date.now()}`);
//   const cameraRef = useRef<CameraView>(null);
//   const [permission, requestPermission] = useCameraPermissions();
//   const [itemIndex, setItemIndex] = useState(0);
//   const [photos, setPhotos] = useState<PhotoMeta[]>([]);
//   const [tilt, setTilt] = useState<quality.TiltReading | null>(null);
//   const [zoom, setZoom] = useState(0);
//   const [busy, setBusy] = useState(false);
//   const [statusMsg, setStatusMsg] = useState('');

//   // Must be called before any early return (React hook rule).
//   const gps = useAccurateLocation({
//     targetAccuracyM: CAPTURE_TARGET_ACCURACY_M,
//     maxWaitMs: 30_000,
//     onMove: 'ignore',
//   });
//   const gpsReady = gps.fix !== null && gps.fix.accuracy <= CAPTURE_MAX_ACCURACY_M;

//   const item = CHECKLIST_ITEMS[itemIndex];
//   const photosForItem = photos.filter((p) => p.checklistKey === item.key);
//   const itemSatisfied = photosForItem.length >= item.minPhotos;
//   const atMaxForItem = photosForItem.length >= item.maxPhotos;
//   const isLastItem = itemIndex === CHECKLIST_ITEMS.length - 1;

//   // Bubble ON for the whole Pole Inclination section, OFF from section 2 onward.
//   const isBubbleSection = itemIndex === BUBBLE_SECTION_INDEX;
//   const bubbleLevel = useBubbleLevel(isBubbleSection);
//   const bubbleCanCapture = bubbleLevel.sensorAvailable === false || bubbleLevel.canCapture;

//   useEffect(() => {
//     const unsubscribe = quality.subscribeTilt(setTilt);
//     return unsubscribe;
//   }, []);

//   if (!permission) return <ActivityIndicator style={{ flex: 1 }} />;
//   if (!permission.granted) {
//     return (
//       <View style={styles.center}>
//         <Text>Camera access is needed to capture pole photos.</Text>
//         <Button title="Grant permission" onPress={requestPermission} />
//       </View>
//     );
//   }

//   // Angle-guidance check: only applies to the 2nd+ shot of an item that
//   // declares minAngleSeparationDeg, compared against the MOST RECENT shot
//   // for that same item.
//   function angleGuidance(currentHeading: number | null): { ok: boolean; message: string | null } {
//     if (!item.minAngleSeparationDeg || photosForItem.length === 0) return { ok: true, message: null };
//     const lastHeading = photosForItem[photosForItem.length - 1].headingDeg;
//     if (currentHeading == null || lastHeading == null) return { ok: true, message: null };
//     let diff = Math.abs(currentHeading - lastHeading) % 360;
//     if (diff > 180) diff = 360 - diff;
//     const remaining = item.minAngleSeparationDeg - diff;
//     if (remaining > 0) {
//       return { ok: false, message: `Move around the pole — need ~${Math.round(remaining)}° more from your last shot` };
//     }
//     return { ok: true, message: null };
//   }

//   async function handleCapture() {
//     if (!cameraRef.current || !tilt?.ok || !gpsReady || atMaxForItem) return;
//     if (isBubbleSection && !bubbleCanCapture) return;
//     setBusy(true);
//     setStatusMsg('Capturing…');
//     try {
//       const shot = await cameraRef.current.takePictureAsync({ quality: 0.85 });
//       if (!shot) return;

//       setStatusMsg('Reading GPS…');
//       const fix = await location.getFixOrThrow();
//       if (fix.accuracyM != null && fix.accuracyM > CAPTURE_MAX_ACCURACY_M) {
//         Alert.alert('GPS too weak', `GPS accuracy is ±${Math.round(fix.accuracyM)} m. Hold the phone still for a few seconds and try again.`);
//         return;
//       }
//       const heading = await location.readHeadingOnce();

//       const angleCheck = angleGuidance(heading);
//       if (!angleCheck.ok) {
//         Alert.alert('Not enough angle change', angleCheck.message || '');
//         return;
//       }

//       setStatusMsg('Checking for duplicates…');
//       let hash = '';
//       try {
//         hash = await dedup.hashPhotoFile(shot.uri);
//       } catch (e) {
//         console.warn('Hash failed, skipping duplicate check:', e);
//       }
//       if (hash && dedup.isDuplicateInSession(hash, photos.map((p) => p.localHash))) {
//         Alert.alert('Duplicate photo', 'This looks identical to a photo you already captured. Try a different angle.');
//         return;
//       }

//       setStatusMsg('Checking sharpness & framing…');
//       const [blur, framing] = await Promise.all([
//         quality.checkBlur(shot.uri),
//         quality.checkFraming(shot.uri, item.fullPoleShot),
//       ]);

//       if (blur.status === 'poor' || framing.status === 'poor') {
//         const reasons = [blur.status === 'poor' ? blur.detail : null, framing.status === 'poor' ? framing.detail : null]
//           .filter(Boolean)
//           .join('\n');
//         const keepAnyway = await new Promise<boolean>((resolve) => {
//           Alert.alert('Quality check', reasons || 'This photo may not be usable.', [
//             { text: 'Retake', style: 'cancel', onPress: () => resolve(false) },
//             { text: 'Keep anyway', onPress: () => resolve(true) },
//           ]);
//         });
//         if (!keepAnyway) return;
//       }

//       const savedUri: unknown = await storage.persistCapturedPhoto(sessionIdRef.current, shot.uri, item.key);
//       // Use the permanent copy; the camera temp file can be deleted before upload.
//       const photoUri = typeof savedUri === 'string' && savedUri.length > 0 ? savedUri : shot.uri;
//       const meta: PhotoMeta = {
//         uri: photoUri,
//         checklistKey: item.key,
//         timestamp: new Date().toISOString(),
//         latitude: fix.latitude,
//         longitude: fix.longitude,
//         gpsAccuracyM: fix.accuracyM,
//         gpsSamples: fix.samples,
//         headingDeg: heading,
//         pitchDeg: tilt.pitchDeg,
//         rollDeg: tilt.rollDeg,
//         localHash: hash,
//         quality: {
//           tiltOk: tilt.ok,
//           tiltOffVerticalDeg: tilt.offVerticalDeg,
//           blurStatus: blur.status,
//           blurScore: blur.score ?? null,
//           framingStatus: framing.status,
//           framingDetail: framing.detail ?? null,
//         },
//       };
//       setPhotos((prev) => [...prev, meta]);
//     } catch (err) {
//       console.error('Capture failed:', err);
//       Alert.alert('Capture failed', (err as Error)?.message || 'Please try again.');
//     } finally {
//       setBusy(false);
//       setStatusMsg('');
//     }
//   }

//   function handleRemove(uri: string) {
//     setPhotos((prev) => prev.filter((p) => p.uri !== uri));
//   }

//   function goNextItem() {
//     setZoom(0);
//     if (isLastItem) void handleFinish();
//     else setItemIndex((i) => i + 1);
//   }

//   async function handleFinish() {
//     const unmet = CHECKLIST_ITEMS.filter(
//       (ci) => photos.filter((p) => p.checklistKey === ci.key).length < ci.minPhotos
//     );
//     if (unmet.length > 0) {
//       Alert.alert('Checklist incomplete', `Still missing: ${unmet.map((u) => u.label).join(', ')}`);
//       return;
//     }

//     const record: InspectionRecord = {
//       id: sessionIdRef.current,
//       poleId: pole.id,
//       photos,
//       status: 'draft',
//       createdAt: new Date().toISOString(),
//     };

//     setBusy(true);
//     setStatusMsg('Uploading…');
//     try {
//       const out = await syncService.attemptUpload(record);
//       setBusy(false);
//       if (out.result === 'uploaded') {
//         Alert.alert('Uploaded', 'Inspection uploaded successfully.');
//       } else {
//         const msg = {
//           offline: "No signal. Saved on this phone and will sync automatically once you're back online.",
//           server_unreachable: 'Cannot reach the server (check Wi-Fi / server IP). Saved on this phone.',
//           server_error: `Server error: ${out.detail ?? 'unknown'}. Saved on this phone, will retry.`,
//           photo_missing: `${out.detail ?? 'A photo file is missing'}. Please retake this inspection.`,
//         }[out.reason];
//         Alert.alert('Saved offline', msg);
//       }
//       onDone();
//     } catch (err) {
//       setBusy(false);
//       if (err instanceof api.UploadRejectedError) {
//         const rejectedKeys = new Set(err.rejected.map((r) => r.checklistKey));
//         setPhotos((prev) => prev.filter((p) => !rejectedKeys.has(p.checklistKey)));
//         // Going back to section 1 re-enables the bubble automatically.
//         const firstRejectedIdx = CHECKLIST_ITEMS.findIndex((ci) => rejectedKeys.has(ci.key));
//         if (firstRejectedIdx >= 0) setItemIndex(firstRejectedIdx);
//         Alert.alert(
//           'Some photos were rejected — not uploaded',
//           err.rejected.map((r) => `${r.checklistKey}: ${r.detail}`).join('\n\n') + '\n\nPlease retake the listed item(s).'
//         );
//       } else {
//         Alert.alert('Upload failed', (err as Error).message || 'Try again.');
//       }
//     }
//   }

//   const tiltMessage = !tilt
//     ? 'Reading sensors…'
//     : tilt.ok
//       ? 'Phone level — ready to capture'
//       : `Phone tilted ${Math.round(tilt.offVerticalDeg)}° — please hold phone straight`;

//   const gpsMessage =
//     gps.status === 'error'
//       ? gps.error
//       : !gpsReady
//         ? `Waiting for GPS (need ±${CAPTURE_MAX_ACCURACY_M} m or better) — hold the phone still`
//         : null;

//   return (
//     <View style={styles.container}>
//       <Text style={styles.progress}>
//         Item {itemIndex + 1} / {CHECKLIST_ITEMS.length} — {item.label} ({item.priority})
//       </Text>
//       <Text style={styles.guidance}>{item.shotGuidance}</Text>

//       <View style={styles.cameraFrame}>
//         <CameraView ref={cameraRef} style={styles.camera} facing="back" zoom={zoom} />
//         {isBubbleSection && (
//           <View style={styles.bubbleOverlay}>
//             <CircularBubbleView level={bubbleLevel} />
//           </View>
//         )}
//       </View>

//       <View style={styles.zoomRow}>
//         <TouchableOpacity style={styles.zoomBtn} onPress={() => setZoom((z) => Math.max(0, z - 0.1))}>
//           <Text style={styles.zoomBtnText}>－</Text>
//         </TouchableOpacity>
//         <Text style={styles.zoomLabel}>Zoom {Math.round(zoom * 100)}%</Text>
//         <TouchableOpacity style={styles.zoomBtn} onPress={() => setZoom((z) => Math.min(1, z + 0.1))}>
//           <Text style={styles.zoomBtnText}>＋</Text>
//         </TouchableOpacity>
//       </View>

//       <Text style={[styles.tiltMsg, { color: tilt?.ok ? '#16a34a' : '#d97706' }]}>{tiltMessage}</Text>

//       <View style={styles.gpsRow}>
//         <GpsAccuracyBadge status={gps.status} progress={gps.progress} targetAccuracyM={CAPTURE_TARGET_ACCURACY_M} />
//         {gps.status === 'error' && <Button title="Retry GPS" onPress={gps.retry} />}
//       </View>
//       {!!gpsMessage && <Text style={styles.gpsMsg}>{gpsMessage}</Text>}

//       {busy && !!statusMsg && <Text style={styles.statusMsg}>{statusMsg}</Text>}

//       <ScrollView horizontal style={styles.thumbRow}>
//         {photosForItem.map((p) => (
//           <PhotoThumbnail key={p.uri} photo={p} onRemove={() => handleRemove(p.uri)} />
//         ))}
//       </ScrollView>

//       <Text style={styles.count}>
//         {photosForItem.length} / {item.minPhotos} required (max {item.maxPhotos})
//       </Text>

//       {busy ? (
//         <ActivityIndicator />
//       ) : (
//         <View style={styles.buttonRow}>
//           <Button
//             title="Capture"
//             onPress={handleCapture}
//             disabled={!tilt?.ok || !gpsReady || atMaxForItem || (isBubbleSection && !bubbleCanCapture)}
//           />
//           <Button
//             title={isLastItem ? 'Finish & Save' : 'Next Item'}
//             onPress={goNextItem}
//             disabled={!itemSatisfied}
//           />
//         </View>
//       )}
//     </View>
//   );
// }

// const styles = StyleSheet.create({
//   container: { flex: 1, padding: 12 },
//   center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
//   progress: { fontSize: 14, fontWeight: '600' },
//   guidance: { fontSize: 12, color: '#555', marginBottom: 8 },
//   cameraFrame: { position: 'relative' },
//   camera: { width: '100%', height: 300, borderRadius: 8, overflow: 'hidden' },
//   bubbleOverlay: { position: 'absolute', top: 8, alignSelf: 'center' },
//   zoomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14, marginTop: 6 },
//   zoomBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#e5e5e5', alignItems: 'center', justifyContent: 'center' },
//   zoomBtnText: { fontSize: 18, fontWeight: '700' },
//   zoomLabel: { fontSize: 12, color: '#555', minWidth: 80, textAlign: 'center' },
//   tiltMsg: { textAlign: 'center', fontWeight: '600', marginVertical: 6 },
//   gpsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
//   gpsMsg: { textAlign: 'center', color: '#d97706', fontSize: 12, marginTop: 4 },
//   statusMsg: { textAlign: 'center', color: '#2563eb', marginBottom: 4 },
//   thumbRow: { flexDirection: 'row', maxHeight: 90 },
//   count: { textAlign: 'center', marginVertical: 6, color: '#555' },
//   buttonRow: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 4 },
// });

// CaptureScreen.tsx — FULL-SCREEN camera redesign.
//
// UI only changed. Business logic is the same as before:
//   - GPS gate (±30 m), tilt check, photo max per item
//   - bubble level required for every photo in section 1 (Pole Inclination) only
//   - angle-change, duplicate, blur and framing checks
//   - photo saved to permanent storage (savedUri) and uploaded via syncService
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as location from '../services/location';
import * as quality from '../services/quality';
import * as dedup from '../services/dedup';
import * as syncService from '../services/syncService';
import * as api from '../services/api';
import * as storage from '../services/storage';
import { useAccurateLocation } from '../services/useAccurateLocation';
import { useBubbleLevel } from '../services/useBubbleLevel';
import { CHECKLIST_ITEMS } from '../constants/checklist';
import { CapturedPole, InspectionRecord, PhotoMeta } from '../types';
import BubbleLevel from '../components/BubbleLevel';
import Button from '../components/Button';
import { colors, font, radius, spacing, TAP } from '../theme';


type Props = { pole: CapturedPole; onDone: () => void; onClose?: () => void };

const CAPTURE_TARGET_ACCURACY_M = 15;
const CAPTURE_MAX_ACCURACY_M = 30;
const BUBBLE_SECTION_INDEX = 0;

// expo-camera zoom is 0..1 (not a multiplier). Calibrate these on your phone.
const ZOOM_PRESETS = [
  { label: '1x', value: 0 },
  { label: '2x', value: 0.12 },
  { label: '3x', value: 0.25 },
];

export default function CaptureScreen({ pole, onDone, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const sessionIdRef = useRef(`${pole.id}-${Date.now()}`);
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [itemIndex, setItemIndex] = useState(0);
  const [photos, setPhotos] = useState<PhotoMeta[]>([]);
  const [tilt, setTilt] = useState<quality.TiltReading | null>(null);
  const [zoomIdx, setZoomIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [showThumbs, setShowThumbs] = useState(false);

  const gps = useAccurateLocation({ targetAccuracyM: CAPTURE_TARGET_ACCURACY_M, maxWaitMs: 30_000, onMove: 'ignore' });
  const gpsReady = gps.fix !== null && gps.fix.accuracy <= CAPTURE_MAX_ACCURACY_M;

  const item = CHECKLIST_ITEMS[itemIndex];
  const photosForItem = photos.filter((p) => p.checklistKey === item.key);
  const itemSatisfied = photosForItem.length >= item.minPhotos;
  const atMaxForItem = photosForItem.length >= item.maxPhotos;
  const isLastItem = itemIndex === CHECKLIST_ITEMS.length - 1;

  const isBubbleSection = itemIndex === BUBBLE_SECTION_INDEX;
  const bubbleLevel = useBubbleLevel(isBubbleSection);
  const bubbleCanCapture = bubbleLevel.sensorAvailable === false || bubbleLevel.canCapture;

  useEffect(() => {
    const unsubscribe = quality.subscribeTilt(setTilt);
    return unsubscribe;
  }, []);

  // ---------------- Permission screens ----------------
  if (!permission) {
    return (
      <View style={styles.permRoot}>
        <ActivityIndicator color={colors.amber} />
      </View>
    );
  }
  if (!permission.granted) {
    return (
      <View style={[styles.permRoot, { padding: spacing.xl }]}>
        <Text style={styles.permTitle}>Camera access needed</Text>
        <Text style={styles.permText}>Camera access is needed to capture pole photos.</Text>
        <Button title="Grant permission" onPress={requestPermission} style={{ alignSelf: 'stretch', marginTop: spacing.lg }} />
      </View>
    );
  }

  // ---------------- Logic (unchanged) ----------------
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

      // shot.uri is deleted by persistCapturedPhoto — always use the saved copy.
      const savedUri = await storage.persistCapturedPhoto(sessionIdRef.current, shot.uri, item.key);
      const meta: PhotoMeta = {
        uri: savedUri,
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
    Alert.alert('Delete photo?', 'This photo will be removed from the inspection.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => setPhotos((prev) => prev.filter((p) => p.uri !== uri)) },
    ]);
  }

  function goNextItem() {
    setZoomIdx(0);
    setShowThumbs(false);
    if (isLastItem) void handleFinish();
    else setItemIndex((i) => i + 1);
  }

  function handleClose() {
    Alert.alert('Leave inspection?', 'Photos for this pole will not be uploaded.', [
      { text: 'Stay', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: () => (onClose ? onClose() : onDone()) },
    ]);
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
        const msg = ({
          offline: "No signal. Saved on this phone and will sync automatically once you're back online.",
          server_unreachable: 'Cannot reach the server (check Wi-Fi / server IP). Saved on this phone.',
          server_error: `Server error: ${out.detail ?? 'unknown'}. Saved on this phone, will retry.`,
          photo_missing: `${out.detail ?? 'A photo file is missing'}. Please capture this pole again.`,
        } as Record<string, string>)[out.reason];
        Alert.alert(out.reason === 'photo_missing' ? 'Photo missing' : 'Saved offline', msg);
      }
      onDone();
    } catch (err) {
      setBusy(false);
      if (err instanceof api.UploadRejectedError) {
        const rejectedKeys = new Set(err.rejected.map((r) => r.checklistKey));
        setPhotos((prev) => prev.filter((p) => !rejectedKeys.has(p.checklistKey)));
        const firstRejectedIdx = CHECKLIST_ITEMS.findIndex((ci) => rejectedKeys.has(ci.key));
        if (firstRejectedIdx >= 0) setItemIndex(firstRejectedIdx);
        Alert.alert(
          'Some photos were rejected — not uploaded',
          err.rejected.map((r) => `${r.checklistKey}: ${r.detail}`).join('\n\n') + '\n\nPlease retake the listed item(s).'
        );
      } else {
        Alert.alert('Upload failed', (err as Error).message || 'Try again.');
      }
    } finally {
      setStatusMsg('');
    }
  }

  // ---------------- UI state ----------------
  const canShoot = !busy && !!tilt?.ok && gpsReady && !atMaxForItem && (!isBubbleSection || bubbleCanCapture);

  const status = busy
    ? { text: statusMsg || 'Working…', color: colors.navyLight }
    : !gpsReady
      ? { text: gps.status === 'error' ? 'GPS problem' : `Waiting for GPS (±${CAPTURE_MAX_ACCURACY_M} m)`, color: colors.orange }
      : !tilt
        ? { text: 'Reading sensors…', color: colors.navyLight }
        : !tilt.ok
          ? { text: `Hold phone straight (${Math.round(tilt.offVerticalDeg)}°)`, color: colors.orange }
          : isBubbleSection && !bubbleCanCapture
            ? { text: bubbleLevel.isInside ? 'Hold level…' : bubbleLevel.hint, color: colors.orange }
            : atMaxForItem
              ? { text: 'Max photos reached — tap Next', color: colors.navyLight }
              : { text: 'Ready', color: colors.green };

  const gpsAcc = gps.fix?.accuracy ?? null;
  const gpsChipColor = gpsAcc == null ? colors.disabled : gpsAcc <= CAPTURE_TARGET_ACCURACY_M ? colors.green : gpsReady ? colors.orange : colors.red;
  const lastPhoto = photosForItem[photosForItem.length - 1];
  const priority = String(item.priority ?? '');
  const priorityHigh = priority.toLowerCase() === 'high';

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* Full-screen camera */}
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" zoom={ZOOM_PRESETS[zoomIdx].value} />

      {/* ---------- Top scrim ---------- */}
      <View style={[styles.topScrim, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.row}>
          <View style={styles.segments}>
            {CHECKLIST_ITEMS.map((ci, i) => {
              const done = photos.filter((p) => p.checklistKey === ci.key).length >= ci.minPhotos;
              const bg = i === itemIndex ? colors.amber : done ? colors.green : colors.faintWhite;
              return <View key={ci.key} style={[styles.segment, { backgroundColor: bg }]} />;
            })}
          </View>
          <Pressable onPress={handleClose} style={styles.closeBtn} hitSlop={8} accessibilityLabel="Close">
            <Text style={styles.closeText}>✕</Text>
          </Pressable>
        </View>

        <View style={[styles.row, { marginTop: spacing.sm }]}>
          <Text style={styles.itemTitle} numberOfLines={1}>
            {itemIndex + 1}/{CHECKLIST_ITEMS.length} · {item.label}
          </Text>
          {!!priority && (
            <View style={[styles.priority, { backgroundColor: priorityHigh ? colors.red : colors.navyLight }]}>
              <Text style={styles.priorityText}>{priority}</Text>
            </View>
          )}
          <View style={{ flex: 1 }} />
          <Pressable onPress={gps.status === 'error' ? gps.retry : undefined} style={styles.gpsChip}>
            <View style={[styles.gpsDot, { backgroundColor: gpsChipColor }]} />
            <Text style={styles.gpsChipText}>
              {gps.status === 'error' ? 'GPS · Retry' : gpsAcc != null ? `±${gpsAcc.toFixed(0)} m` : 'GPS…'}
            </Text>
          </Pressable>
        </View>

        {!!item.shotGuidance && (
          <Text style={styles.guidance} numberOfLines={2}>{item.shotGuidance}</Text>
        )}
      </View>

      {/* ---------- Bubble level on the right edge (section 1 only) ---------- */}
      {isBubbleSection && (
        <View style={[styles.bubbleDock, { top: insets.top + 150 }]} pointerEvents="none">
          <BubbleLevel level={bubbleLevel} />
        </View>
      )}

      {/* ---------- Bottom scrim ---------- */}
      <View style={[styles.bottomScrim, { paddingBottom: insets.bottom + spacing.md }]}>
        {showThumbs && photosForItem.length > 0 && (
          <ScrollView horizontal style={styles.thumbStrip} contentContainerStyle={{ gap: spacing.sm }}>
            {photosForItem.map((p) => (
              <Pressable key={p.uri} onPress={() => handleRemove(p.uri)}>
                <Image source={{ uri: p.uri }} style={styles.thumbLarge} />
                <View style={styles.thumbDelete}><Text style={styles.thumbDeleteText}>✕</Text></View>
              </Pressable>
            ))}
          </ScrollView>
        )}

        <View style={[styles.statusPill, { backgroundColor: status.color }]}>
          <Text style={styles.statusText} numberOfLines={1}>{status.text}</Text>
        </View>

        <View style={styles.zoomRow}>
          {ZOOM_PRESETS.map((z, i) => (
            <Pressable
              key={z.label}
              onPress={() => setZoomIdx(i)}
              style={[styles.zoomChip, i === zoomIdx && styles.zoomChipActive]}
            >
              <Text style={[styles.zoomText, i === zoomIdx && styles.zoomTextActive]}>{z.label}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.controlsRow}>
          {/* Thumbnail + count */}
          <Pressable style={styles.thumbBox} onPress={() => setShowThumbs((v) => !v)} disabled={photosForItem.length === 0}>
            {lastPhoto ? (
              <Image source={{ uri: lastPhoto.uri }} style={styles.thumb} />
            ) : (
              <View style={[styles.thumb, styles.thumbEmpty]} />
            )}
            <Text style={[styles.countText, itemSatisfied && { color: colors.green }]}>
              {photosForItem.length} / {item.minPhotos}
            </Text>
            <Text style={styles.countSub}>required</Text>
          </Pressable>

          {/* Shutter */}
          <Pressable
            onPress={handleCapture}
            disabled={!canShoot}
            style={({ pressed }) => [styles.shutterOuter, !canShoot && styles.shutterDisabled, pressed && canShoot && { transform: [{ scale: 0.94 }] }]}
            accessibilityLabel="Capture photo"
          >
            <View style={[styles.shutterInner, { backgroundColor: canShoot ? colors.amber : colors.disabled }]}>
              {busy && <ActivityIndicator color={colors.navy} />}
            </View>
          </Pressable>

          {/* Next */}
          <View style={styles.nextBox}>
            <Button
              title={isLastItem ? 'Finish' : 'Next'}
              small
              variant={itemSatisfied ? 'primary' : 'outline'}
              onPress={goNextItem}
              disabled={!itemSatisfied || busy}
              style={{ minWidth: 84 }}
            />
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  row: { flexDirection: 'row', alignItems: 'center' },

  permRoot: { flex: 1, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center' },
  permTitle: { color: colors.white, fontSize: font.h2 + 2, fontWeight: '800' },
  permText: { color: 'rgba(255,255,255,0.75)', fontSize: font.body, textAlign: 'center', marginTop: spacing.sm },

  // Top
  topScrim: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: colors.scrim, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  segments: { flex: 1, flexDirection: 'row', gap: 3, marginRight: spacing.md },
  segment: { flex: 1, height: 5, borderRadius: 3 },
  closeBtn: { width: TAP, height: TAP, borderRadius: TAP / 2, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  closeText: { color: colors.white, fontSize: 18, fontWeight: '700' },
  itemTitle: { color: colors.white, fontSize: font.h2, fontWeight: '800', flexShrink: 1 },
  priority: { marginLeft: spacing.sm, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  priorityText: { color: colors.white, fontSize: font.tiny, fontWeight: '800', textTransform: 'uppercase' },
  gpsChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: radius.pill, paddingHorizontal: 10, minHeight: 30 },
  gpsDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  gpsChipText: { color: colors.white, fontSize: font.small, fontWeight: '700' },
  guidance: { color: 'rgba(255,255,255,0.85)', fontSize: font.small, marginTop: spacing.xs },

  // Bubble
  bubbleDock: { position: 'absolute', right: spacing.md },

  // Bottom
  bottomScrim: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.scrim, paddingTop: spacing.md, paddingHorizontal: spacing.lg, alignItems: 'center' },
  thumbStrip: { alignSelf: 'stretch', marginBottom: spacing.sm, maxHeight: 76 },
  thumbLarge: { width: 68, height: 68, borderRadius: radius.sm, borderWidth: 2, borderColor: colors.white },
  thumbDelete: { position: 'absolute', top: 2, right: 2, width: 20, height: 20, borderRadius: 10, backgroundColor: colors.red, alignItems: 'center', justifyContent: 'center' },
  thumbDeleteText: { color: colors.white, fontSize: 11, fontWeight: '800' },
  statusPill: { borderRadius: radius.pill, paddingHorizontal: spacing.lg, paddingVertical: 6, maxWidth: '100%' },
  statusText: { color: colors.white, fontSize: font.small, fontWeight: '800' },
  zoomRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  zoomChip: { minWidth: TAP, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 10 },
  zoomChipActive: { backgroundColor: colors.white },
  zoomText: { color: colors.white, fontSize: font.small, fontWeight: '800' },
  zoomTextActive: { color: colors.navy },
  controlsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', alignSelf: 'stretch', marginTop: spacing.md },
  thumbBox: { width: 90, alignItems: 'center' },
  thumb: { width: 52, height: 52, borderRadius: radius.sm, borderWidth: 2, borderColor: colors.white },
  thumbEmpty: { backgroundColor: 'rgba(255,255,255,0.12)' },
  countText: { color: colors.white, fontSize: font.small, fontWeight: '800', marginTop: 4 },
  countSub: { color: 'rgba(255,255,255,0.65)', fontSize: font.tiny },
  shutterOuter: { width: 80, height: 80, borderRadius: 40, borderWidth: 4, borderColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  shutterDisabled: { borderColor: 'rgba(255,255,255,0.4)' },
  shutterInner: { width: 62, height: 62, borderRadius: 31, alignItems: 'center', justifyContent: 'center' },
  nextBox: { width: 90, alignItems: 'center' },
});
