// PermissionsGateScreen.tsx
//
// "At starting asked for all permission like location and all" — shown
// once at app launch, before login, so a field worker isn't repeatedly
// interrupted mid-checklist by permission prompts. Camera + location are
// requested together here; CaptureScreen/PoleIdScreen still separately
// verify them before use (defense in depth — a worker could revoke a
// permission mid-session from OS settings), but the FIRST ask happens
// here, all at once, with plain-language explanations.

import React, { useState } from 'react';
import { View, Text, Button, StyleSheet, ActivityIndicator } from 'react-native';
import { useCameraPermissions } from 'expo-camera';
import * as location from '../services/location';

type Props = { onGranted: () => void };

export default function PermissionsGateScreen({ onGranted }: Props) {
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [locationGranted, setLocationGranted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checkedOnce, setCheckedOnce] = useState(false);

  async function requestAll() {
    setBusy(true);
    const camOk = (await requestCameraPermission()).granted;
    const locOk = await location.ensureLocationPermission();
    setLocationGranted(locOk);
    setCheckedOnce(true);
    setBusy(false);
    if (camOk && locOk) onGranted();
  }

  if (busy) return <ActivityIndicator style={{ flex: 1 }} />;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Before you start</Text>
      <Text style={styles.body}>
        This app needs two permissions to work:{'\n\n'}
        📷 Camera — to capture pole inspection photos{'\n'}
        📍 Location — every photo is GPS-tagged; without it, no photo can
        be captured or uploaded.
      </Text>

      {checkedOnce && !(cameraPermission?.granted && locationGranted) && (
        <Text style={styles.warning}>
          One or more permissions were denied. Please grant both to continue —
          you can also enable them from your phone's Settings app.
        </Text>
      )}

      <Button title="Grant Permissions" onPress={requestAll} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, gap: 16 },
  title: { fontSize: 22, fontWeight: '700', textAlign: 'center' },
  body: { fontSize: 14, color: '#444', lineHeight: 20 },
  warning: { color: '#b45309', fontSize: 13 },
});
