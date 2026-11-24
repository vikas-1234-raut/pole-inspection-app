// App.tsx
//
// Root navigation, now role-aware:
//   no user            -> LoginScreen
//   role 'field'        -> PoleIdScreen -> CaptureScreen
//   role 'reviewer'      -> ReviewerScreen
//   role 'admin'          -> both, with a toggle (sees everything)
// The role check here is a UI convenience only — every protected backend
// endpoint re-checks the role from the verified JWT independently
// (middleware/auth.js), so this file being bypassed somehow still
// wouldn't grant real access to anything.

import React, { useEffect, useState } from 'react';
import { SafeAreaView, StatusBar, View, Button, Text } from 'react-native';
import PermissionsGateScreen from './src/screens/PermissionsGateScreen';
import LoginScreen from './src/screens/LoginScreen';
import PoleIdScreen from './src/screens/PoleIdScreen';
import CaptureScreen from './src/screens/CaptureScreen';
import ReviewerScreen from './src/screens/ReviewerScreen';
import * as auth from './src/services/auth';
import * as network from './src/services/network';
import * as SecureStore from 'expo-secure-store';
import * as syncService from './src/services/syncService';
import { AuthUser, CapturedPole } from './src/types';
import AsyncStorage from '@react-native-async-storage/async-storage';



export default function App() {
  const [permissionsGranted, setPermissionsGranted] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [adminView, setAdminView] = useState<'capture' | 'review'>('review');
  const [selectedPole, setSelectedPole] = useState<CapturedPole | null>(null);

  useEffect(() => {
  (async () => {
    await AsyncStorage.removeItem('pole_inspection_pending_queue_v1'); // TEMP: remove after one run
  })();
}, []);

  useEffect(() => {
    auth.getCurrentUser().then((u) => {
      setUser(u);
      setCheckingSession(false);
    });

    syncService.processQueue();
    const unsubscribe = network.subscribeToReconnect(() => syncService.processQueue());
    return unsubscribe;
  }, []);

  if (checkingSession) return <SafeAreaView style={{ flex: 1 }} />;

  if (!permissionsGranted) {
    return (
      <SafeAreaView style={{ flex: 1 }}>
        <StatusBar barStyle="dark-content" />
        <PermissionsGateScreen onGranted={() => setPermissionsGranted(true)} />
      </SafeAreaView>
    );
  }

  if (!user) {
    return (
      <SafeAreaView style={{ flex: 1 }}>
        <StatusBar barStyle="dark-content" />
        <LoginScreen onLoggedIn={setUser} />
      </SafeAreaView>
    );
  }

  const effectiveView = user.role === 'field' ? 'capture' : user.role === 'reviewer' ? 'review' : adminView;

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <StatusBar barStyle="dark-content" />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 8 }}>
        <Text>{user.username} ({user.role})</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {user.role === 'admin' && (
            <Button
              title={adminView === 'capture' ? 'View Reviewer' : 'View Capture'}
              onPress={() => setAdminView(adminView === 'capture' ? 'review' : 'capture')}
            />
          )}
          <Button title="Log Out" onPress={() => auth.logout().then(() => setUser(null))} />
        </View>
      </View>

      {effectiveView === 'review' ? (
        <ReviewerScreen />
      ) : selectedPole ? (
        <CaptureScreen pole={selectedPole} onDone={() => setSelectedPole(null)} />
      ) : (
        <PoleIdScreen onPoleReady={setSelectedPole} />
      )}
    </SafeAreaView>
  );
}
