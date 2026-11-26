// PoleIdScreen.tsx
//
// Order of operations here matters and is deliberate:
//   1. Get a GPS fix FIRST — hard gate, nothing below renders without it
//      ("without GPS permission further process not be done").
//   2. Field worker types the pole's name (their existing TL naming).
//   3. Hash(name + rounded GPS) generates the pole id LOCALLY (services/poleId.ts).
//   4. Register with the backend, which runs the 30-40m proximity/fraud check.
//
// v4 (GPS accuracy, D24): averaged GPS lock (±5 m) via useAccurateLocation, onMove 'clear'.
// v5 (AngleCam-style acquisition, D25):
//   - Provider errors are shown separately from "inaccurate GPS":
//       permission denied / location OFF / GPS OFF -> message + "Turn on" button
//       inaccurate -> keep waiting (amber badge), never an error
//   - Live raw coordinates shown under the badge (like AngleCam), plus a greyed
//     "approx." last-known position before the first live reading.
//     Neither is ever SAVED — only the averaged fix goes into the pole ID.

import React, { useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import * as location from '../services/location';
import * as poleIdService from '../services/poleId';
import * as api from '../services/api';
import { useAccurateLocation } from '../services/useAccurateLocation';
import GpsAccuracyBadge from './GpsAccuracyBadge';
import { CapturedPole } from '../types';

type Props = { onPoleReady: (pole: CapturedPole) => void };
type Phase = 'ready' | 'registering';

const TARGET_ACCURACY_M = 20;
const MAX_WAIT_MS = 30_000;
const ACCEPT_AFTER_TIMEOUT_M = 35;

export default function PoleIdScreen({ onPoleReady }: Props) {
  const [phase, setPhase] = useState<Phase>('ready');
  const [name, setName] = useState('');

  const gps = useAccurateLocation({
    mode: 'high',
    targetAccuracyM: TARGET_ACCURACY_M,
    maxWaitMs: MAX_WAIT_MS,
    onMove: 'clear',
  });

  const fix = gps.fix;
  const gpsGood =
    gps.status === 'locked' ||
    (gps.status === 'timeout' && fix !== null && fix.accuracy <= ACCEPT_AFTER_TIMEOUT_M);
  const gpsWeakAfterTimeout = gps.status === 'timeout' && fix !== null && !gpsGood;

  const badge = (
    <GpsAccuracyBadge
      status={gps.status}
      progress={gps.progress}
      targetAccuracyM={TARGET_ACCURACY_M}
      latest={gps.latest}
      preview={gps.preview}
      errorCode={gps.errorCode}
      onEnableLocation={gps.enableLocation}
    />
  );

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
        Alert.alert(
          'Location check',
          `${messages}\n\nYou can still continue, but this inspection will be flagged for the reviewer.`,
          [
            {
              text: 'Re-check GPS',
              style: 'cancel',
              onPress: () => {
                gps.recheck();
                setPhase('ready');
              },
            },
            { text: 'Continue anyway', onPress: () => onPoleReady({ ...pole, flagged: true }) },
          ],
        );
        return;
      }
      onPoleReady(weakGps ? { ...pole, flagged: true } : pole);
    } catch (err: any) {
      Alert.alert('Could not register pole', err.message || 'Check your connection and try again.');
      setPhase('ready');
    }
  }

  function handleContinue() {
    if (!fix || !name.trim()) return;
    if (gpsGood) return void register(false);
    if (gpsWeakAfterTimeout) {
      Alert.alert(
        'Weak GPS',
        `GPS accuracy is only ±${Math.round(fix.accuracy)} m. Move to an open area for a better fix, or continue and this pole will be flagged for the reviewer.`,
        [
          { text: 'Wait for better GPS', style: 'cancel', onPress: () => gps.recheck() },
          { text: 'Continue anyway', onPress: () => register(true) },
        ],
      );
    }
  }

  // ---------- Provider / permission problem (NOT the same as inaccurate GPS) ----------
  if (gps.status === 'error') {
    return (
      <View style={styles.center}>
        {badge}
        <Text style={styles.error}>{gps.error}</Text>
        <Button title="Retry" onPress={gps.retry} />
      </View>
    );
  }

  // ---------- Hard gate: nothing interactive until we have a usable fix ----------
  if (!fix) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text>Getting GPS fix — required before you can continue…</Text>
        {badge}
        <Text style={styles.hint}>Stand next to the pole and hold the phone still.</Text>
      </View>
    );
  }

  const canPressContinue = !!name.trim() && (gpsGood || gpsWeakAfterTimeout);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>New Pole Inspection</Text>
      {badge}
      <Text style={styles.gpsLine}>
        Saved position: {fix.latitude.toFixed(5)}, {fix.longitude.toFixed(5)}  (±{fix.accuracy.toFixed(1)} m, {fix.samples} readings)
      </Text>
      {!gpsGood && !gpsWeakAfterTimeout && (
        <Text style={styles.hint}>Improving GPS accuracy — stay at the pole and hold the phone still…</Text>
      )}
      <TextInput style={styles.input} placeholder="Pole name / TL line number" value={name} onChangeText={setName} />
      {phase === 'registering' ? (
        <ActivityIndicator />
      ) : (
        <Button
          title={gpsWeakAfterTimeout ? 'Continue (weak GPS)' : 'Continue to Capture'}
          onPress={handleContinue}
          disabled={!canPressContinue}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, justifyContent: 'center', gap: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  title: { fontSize: 20, fontWeight: '600', marginBottom: 4 },
  gpsLine: { color: '#555', textAlign: 'center' },
  hint: { color: '#777', fontSize: 12, textAlign: 'center' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12 },
  error: { color: '#b91c1c', textAlign: 'center' },
});
