// // PoleIdScreen.tsx
// //
// // Order of operations here matters and is deliberate:
// //   1. Get a GPS fix FIRST — hard gate, nothing below renders without it
// //      ("without GPS permission further process not be done").
// //   2. Field worker types the pole's name (their existing TL naming).
// //   3. Hash(name + rounded GPS) generates the pole id LOCALLY (services/poleId.ts).
// //   4. Register with the backend, which runs the 30-40m proximity/fraud check.
// //
// // v4 (GPS accuracy, D24): averaged GPS lock (±5 m) via useAccurateLocation, onMove 'clear'.
// // v5 (AngleCam-style acquisition, D25):
// //   - Provider errors are shown separately from "inaccurate GPS":
// //       permission denied / location OFF / GPS OFF -> message + "Turn on" button
// //       inaccurate -> keep waiting (amber badge), never an error
// //   - Live raw coordinates shown under the badge (like AngleCam), plus a greyed
// //     "approx." last-known position before the first live reading.
// //     Neither is ever SAVED — only the averaged fix goes into the pole ID.

// import React, { useState } from 'react';
// import { View, Text, TextInput, Button, StyleSheet, ActivityIndicator, Alert } from 'react-native';
// import * as location from '../services/location';
// import * as poleIdService from '../services/poleId';
// import * as api from '../services/api';
// import { useAccurateLocation } from '../services/useAccurateLocation';
// import GpsAccuracyBadge from './GpsAccuracyBadge';
// import { CapturedPole } from '../types';

// type Props = { onPoleReady: (pole: CapturedPole) => void };
// type Phase = 'ready' | 'registering';

// const TARGET_ACCURACY_M = 20;
// const MAX_WAIT_MS = 30_000;
// const ACCEPT_AFTER_TIMEOUT_M = 35;

// export default function PoleIdScreen({ onPoleReady }: Props) {
//   const [phase, setPhase] = useState<Phase>('ready');
//   const [name, setName] = useState('');

//   const gps = useAccurateLocation({
//     mode: 'high',
//     targetAccuracyM: TARGET_ACCURACY_M,
//     maxWaitMs: MAX_WAIT_MS,
//     onMove: 'clear',
//   });

//   const fix = gps.fix;
//   const gpsGood =
//     gps.status === 'locked' ||
//     (gps.status === 'timeout' && fix !== null && fix.accuracy <= ACCEPT_AFTER_TIMEOUT_M);
//   const gpsWeakAfterTimeout = gps.status === 'timeout' && fix !== null && !gpsGood;

//   const badge = (
//     <GpsAccuracyBadge
//       status={gps.status}
//       progress={gps.progress}
//       targetAccuracyM={TARGET_ACCURACY_M}
//       latest={gps.latest}
//       preview={gps.preview}
//       errorCode={gps.errorCode}
//       onEnableLocation={gps.enableLocation}
//     />
//   );

//   async function register(weakGps: boolean) {
//     if (!name.trim()) return;
//     setPhase('registering');
//     try {
//       const f = await location.getFixOrThrow();
//       const id = await poleIdService.generatePoleId(f.latitude, f.longitude, name);
//       const pole: CapturedPole = { id, enteredName: name.trim(), latitude: f.latitude, longitude: f.longitude };

//       const result = await api.registerCapturedPole(pole);
//       if (result.flags && result.flags.length > 0) {
//         const messages = result.flags.map((fl) => fl.detail).join('\n\n');
//         Alert.alert(
//           'Location check',
//           `${messages}\n\nYou can still continue, but this inspection will be flagged for the reviewer.`,
//           [
//             {
//               text: 'Re-check GPS',
//               style: 'cancel',
//               onPress: () => {
//                 gps.recheck();
//                 setPhase('ready');
//               },
//             },
//             { text: 'Continue anyway', onPress: () => onPoleReady({ ...pole, flagged: true }) },
//           ],
//         );
//         return;
//       }
//       onPoleReady(weakGps ? { ...pole, flagged: true } : pole);
//     } catch (err: any) {
//       Alert.alert('Could not register pole', err.message || 'Check your connection and try again.');
//       setPhase('ready');
//     }
//   }

//   function handleContinue() {
//     if (!fix || !name.trim()) return;
//     if (gpsGood) return void register(false);
//     if (gpsWeakAfterTimeout) {
//       Alert.alert(
//         'Weak GPS',
//         `GPS accuracy is only ±${Math.round(fix.accuracy)} m. Move to an open area for a better fix, or continue and this pole will be flagged for the reviewer.`,
//         [
//           { text: 'Wait for better GPS', style: 'cancel', onPress: () => gps.recheck() },
//           { text: 'Continue anyway', onPress: () => register(true) },
//         ],
//       );
//     }
//   }

//   // ---------- Provider / permission problem (NOT the same as inaccurate GPS) ----------
//   if (gps.status === 'error') {
//     return (
//       <View style={styles.center}>
//         {badge}
//         <Text style={styles.error}>{gps.error}</Text>
//         <Button title="Retry" onPress={gps.retry} />
//       </View>
//     );
//   }

//   // ---------- Hard gate: nothing interactive until we have a usable fix ----------
//   if (!fix) {
//     return (
//       <View style={styles.center}>
//         <ActivityIndicator />
//         <Text>Getting GPS fix — required before you can continue…</Text>
//         {badge}
//         <Text style={styles.hint}>Stand next to the pole and hold the phone still.</Text>
//       </View>
//     );
//   }

//   const canPressContinue = !!name.trim() && (gpsGood || gpsWeakAfterTimeout);

//   return (
//     <View style={styles.container}>
//       <Text style={styles.title}>New Pole Inspection</Text>
//       {badge}
//       <Text style={styles.gpsLine}>
//         Saved position: {fix.latitude.toFixed(5)}, {fix.longitude.toFixed(5)}  (±{fix.accuracy.toFixed(1)} m, {fix.samples} readings)
//       </Text>
//       {!gpsGood && !gpsWeakAfterTimeout && (
//         <Text style={styles.hint}>Improving GPS accuracy — stay at the pole and hold the phone still…</Text>
//       )}
//       <TextInput style={styles.input} placeholder="Pole name / TL line number" value={name} onChangeText={setName} />
//       {phase === 'registering' ? (
//         <ActivityIndicator />
//       ) : (
//         <Button
//           title={gpsWeakAfterTimeout ? 'Continue (weak GPS)' : 'Continue to Capture'}
//           onPress={handleContinue}
//           disabled={!canPressContinue}
//         />
//       )}
//     </View>
//   );
// }

// const styles = StyleSheet.create({
//   container: { flex: 1, padding: 16, justifyContent: 'center', gap: 12 },
//   center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
//   title: { fontSize: 20, fontWeight: '600', marginBottom: 4 },
//   gpsLine: { color: '#555', textAlign: 'center' },
//   hint: { color: '#777', fontSize: 12, textAlign: 'center' },
//   input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12 },
//   error: { color: '#b91c1c', textAlign: 'center' },
// });

// PoleIdScreen.tsx  ("New Inspection")
//
// UI redesign only. Business logic unchanged:
//   1. GPS fix first (hard gate: name entry is locked until a fix exists).
//   2. Worker types the pole name.
//   3. Hash(name + GPS) → pole id (services/poleId.ts).
//   4. Register with backend (proximity/fraud check); weak GPS after timeout → flagged.
// Keeps the "last fix" memory so the screen never flickers back to loading.
import React, { useMemo, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StatusBar, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as location from '../services/location';
import * as poleIdService from '../services/poleId';
import * as api from '../services/api';
import { useAccurateLocation } from '../services/useAccurateLocation';
import { AuthUser, CapturedPole } from '../types';
import Button from '../components/Button';
import { colors, font, radius, spacing, TAP } from '../theme';

type Props = {
  onPoleReady: (pole: CapturedPole) => void;
  user?: AuthUser | null;
  onLogout?: () => void;
};
type Phase = 'ready' | 'registering';

const TARGET_ACCURACY_M = 20;
const MAX_WAIT_MS = 30_000;
const ACCEPT_AFTER_TIMEOUT_M = 35;

export default function PoleIdScreen({ onPoleReady, user, onLogout }: Props) {
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<Phase>('ready');
  const [name, setName] = useState('');

  const gpsOptions = useMemo(
    () => ({ mode: 'high' as const, targetAccuracyM: TARGET_ACCURACY_M, maxWaitMs: MAX_WAIT_MS, onMove: 'clear' as const }),
    []
  );
  const gps = useAccurateLocation(gpsOptions);

  const lastFixRef = useRef<typeof gps.fix>(null);
  if (gps.fix) lastFixRef.current = gps.fix;
  const fix = gps.fix ?? lastFixRef.current;

  const gpsGood =
    gps.fix !== null &&
    (gps.status === 'locked' || (gps.status === 'timeout' && gps.fix.accuracy <= ACCEPT_AFTER_TIMEOUT_M));
  const gpsWeakAfterTimeout = gps.status === 'timeout' && gps.fix !== null && !gpsGood;
  const canPressContinue = !!name.trim() && (gpsGood || gpsWeakAfterTimeout) && phase === 'ready';

  async function register(weakGps: boolean) {
    if (!name.trim()) return;
    setPhase('registering');
    try {
      const f = await location.getFixOrThrow();
      const id = await poleIdService.generatePoleId(f.latitude, f.longitude, name);
      const pole: CapturedPole = { id, enteredName: name.trim(), latitude: f.latitude, longitude: f.longitude };
      const result = await api.registerCapturedPole(pole);
      if (result.flags && result.flags.length > 0) {
        const messages = result.flags.map((fl) => fl.detail).join('\n\n');
        Alert.alert('Location check', `${messages}\n\nYou can still continue, but this inspection will be flagged for the reviewer.`, [
          { text: 'Re-check GPS', style: 'cancel', onPress: () => { gps.recheck(); setPhase('ready'); } },
          { text: 'Continue anyway', onPress: () => onPoleReady({ ...pole, flagged: true }) },
        ]);
        return;
      }
      onPoleReady(weakGps ? { ...pole, flagged: true } : pole);
    } catch (err: any) {
      Alert.alert('Could not register pole', err?.message || 'Check your connection and try again.');
      setPhase('ready');
    }
  }

  function handleContinue() {
    if (!gps.fix || !name.trim()) return;
    if (gpsGood) return void register(false);
    if (gpsWeakAfterTimeout) {
      Alert.alert(
        'Weak GPS',
        `GPS accuracy is only ±${Math.round(gps.fix.accuracy)} m. Move to an open area for a better fix, or continue and this pole will be flagged for the reviewer.`,
        [
          { text: 'Wait for better GPS', style: 'cancel', onPress: () => gps.recheck() },
          { text: 'Continue anyway', onPress: () => void register(true) },
        ]
      );
    }
  }

  // ---- GPS card state ----
  const isError = gps.status === 'error';
  const dotColor = isError ? colors.red : gpsGood ? colors.green : colors.orange;
  const statusText = isError
    ? 'GPS problem'
    : gpsGood
      ? 'GPS locked'
      : gpsWeakAfterTimeout
        ? 'Weak GPS — can continue (flagged)'
        : fix
          ? 'Improving accuracy — hold still'
          : 'Getting GPS fix…';
  const accuracy = fix?.accuracy ?? gps.latest?.accuracy ?? null;
  const pct = accuracy ? Math.max(0.05, Math.min(1, TARGET_ACCURACY_M / accuracy)) : 0;
  const coord = fix ?? gps.latest ?? gps.preview;
  const isApprox = !fix && !!coord;

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar barStyle="light-content" backgroundColor={colors.navy} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.hello}>{user ? `Hi, ${user.username}` : 'Pole Inspection'}</Text>
          {user && (
            <View style={styles.roleBadge}>
              <Text style={styles.roleText}>{String(user.role).toUpperCase()}</Text>
            </View>
          )}
        </View>
        {onLogout && <Button title="Log out" variant="outline" small onPress={onLogout} />}
      </View>

      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]} keyboardShouldPersistTaps="handled">
        <Text style={styles.pageTitle}>New Inspection</Text>
        <Text style={styles.pageSub}>Stand next to the pole and hold the phone still.</Text>

        {/* GPS card */}
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={[styles.dot, { backgroundColor: dotColor }]} />
            <Text style={styles.cardTitle}>{statusText}</Text>
          </View>

          {isError ? (
            <>
              <Text style={styles.errorText}>{gps.error}</Text>
              <View style={[styles.row, { gap: spacing.sm, marginTop: spacing.md }]}>
                <Button title="Turn on location" variant="secondary" small onPress={gps.enableLocation} style={{ flex: 1 }} />
                <Button title="Retry" variant="ghost" small onPress={gps.retry} />
              </View>
            </>
          ) : (
            <>
              <View style={styles.barTrack}>
                <View style={[styles.barFill, { width: `${pct * 100}%`, backgroundColor: dotColor }]} />
              </View>
              <View style={styles.statsRow}>
                <Stat label="Accuracy" value={accuracy != null ? `±${accuracy.toFixed(1)} m` : '—'} />
                <Stat label="Target" value={`±${TARGET_ACCURACY_M} m`} />
                <Stat label="Readings" value={fix ? String(fix.samples) : '0'} />
              </View>
              <Text style={[styles.coords, isApprox && { color: colors.disabled }]}>
                {coord
                  ? `${isApprox ? 'approx. ' : ''}${coord.latitude.toFixed(5)}, ${coord.longitude.toFixed(5)}`
                  : 'Waiting for first reading…'}
              </Text>
            </>
          )}
        </View>

        {/* Pole name */}
        <View style={styles.card}>
          <Text style={styles.label}>Pole name / TL line number</Text>
          <TextInput
            style={[styles.input, !fix && { opacity: 0.5 }]}
            placeholder={fix ? 'e.g. D001' : 'Waiting for GPS…'}
            placeholderTextColor={colors.disabled}
            value={name}
            onChangeText={setName}
            editable={!!fix && phase === 'ready'}
            autoCapitalize="characters"
          />
        </View>

        <Button
          title={gpsWeakAfterTimeout ? 'Continue (weak GPS)' : 'Continue to Capture'}
          onPress={handleContinue}
          disabled={!canPressContinue}
          loading={phase === 'registering'}
          style={{ marginTop: spacing.sm }}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    backgroundColor: colors.navy,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  hello: { color: colors.white, fontSize: font.h2, fontWeight: '800' },
  roleBadge: { alignSelf: 'flex-start', marginTop: 6, backgroundColor: colors.amber, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
  roleText: { color: colors.navy, fontSize: font.tiny, fontWeight: '800', letterSpacing: 0.6 },
  body: { padding: spacing.lg, gap: spacing.md },
  pageTitle: { fontSize: font.title, fontWeight: '800', color: colors.text },
  pageSub: { fontSize: font.small, color: colors.textMuted, marginTop: -6 },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 12, height: 12, borderRadius: 6, marginRight: spacing.sm },
  cardTitle: { fontSize: font.body + 1, fontWeight: '700', color: colors.text, flex: 1 },
  errorText: { color: colors.red, fontSize: font.small, marginTop: spacing.sm },
  barTrack: { height: 10, borderRadius: 5, backgroundColor: colors.border, marginTop: spacing.md, overflow: 'hidden' },
  barFill: { height: 10, borderRadius: 5 },
  statsRow: { flexDirection: 'row', marginTop: spacing.md },
  statLabel: { fontSize: font.tiny, color: colors.textMuted, fontWeight: '600' },
  statValue: { fontSize: font.body, color: colors.text, fontWeight: '800', marginTop: 2 },
  coords: { fontSize: font.small, color: colors.textMuted, marginTop: spacing.md, fontVariant: ['tabular-nums'] },
  label: { fontSize: font.small, fontWeight: '600', color: colors.textMuted, marginBottom: spacing.sm },
  input: {
    minHeight: TAP + 6,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: font.body + 1,
    color: colors.text,
    backgroundColor: colors.bg,
  },
});
