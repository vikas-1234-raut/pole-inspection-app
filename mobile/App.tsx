// App.tsx
//
// Root of the mobile app. Everything is wrapped in <SafeAreaProvider>, which the
// new screens need (useSafeAreaInsets). Without it you get:
//   "No safe area value available. Make sure you are rendering <SafeAreaProvider>…"
//
// Flow:
//   not logged in            → LoginScreen
//   role 'reviewer'/'admin'  → ReviewerScreen
//   role 'field'             → PoleIdScreen → CaptureScreen → back to PoleIdScreen
//
// Pending (offline) inspections are retried when the app starts, after login,
// and whenever the app comes back to the foreground.

import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, AppState, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import LoginScreen from './src/screens/LoginScreen';
import PoleIdScreen from './src/screens/PoleIdScreen';
import CaptureScreen from './src/screens/CaptureScreen';
import ReviewerScreen from './src/screens/ReviewerScreen';
import Button from './src/components/Button';
import * as auth from './src/services/auth';
import * as syncService from './src/services/syncService';
import { AuthUser, CapturedPole } from './src/types';
import { colors, font, spacing } from './src/theme';

export default function App() {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}

function AppContent() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checkingLogin, setCheckingLogin] = useState(true);
  const [pole, setPole] = useState<CapturedPole | null>(null);

  // Upload anything saved offline. Silent: failures stay in the queue for next time.
  const syncPending = useCallback(async () => {
    try {
      const out = await syncService.processQueue();
      if (out.uploaded > 0 || out.stillQueued > 0) console.log('[sync] queue:', out);
    } catch (err) {
      console.log('[sync] queue processing failed:', (err as Error)?.message);
    }
  }, []);

  // Restore the saved login on start.
  useEffect(() => {
    (async () => {
      try {
        setUser(await auth.getCurrentUser());
      } finally {
        setCheckingLogin(false);
      }
    })();
  }, []);

  // Retry the offline queue after login and whenever the app returns to the foreground.
  useEffect(() => {
    if (!user || user.role === 'reviewer') return;
    void syncPending();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void syncPending();
    });
    return () => sub.remove();
  }, [user, syncPending]);

  async function handleLogout() {
    await auth.logout();
    setPole(null);
    setUser(null);
  }

  // ---- Loading saved login ----
  if (checkingLogin) {
    return (
      <View style={styles.loading}>
        <StatusBar barStyle="light-content" backgroundColor={colors.navy} />
        <ActivityIndicator color={colors.amber} size="large" />
      </View>
    );
  }

  // ---- Not logged in ----
  if (!user) {
    return <LoginScreen onLoggedIn={setUser} />;
  }

  // ---- Reviewer / admin ----
  if (user.role === 'reviewer' || user.role === 'admin') {
    return (
      <SafeAreaView style={styles.reviewerRoot} edges={['top', 'bottom']}>
        <StatusBar barStyle="light-content" backgroundColor={colors.navy} />
        <View style={styles.reviewerHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.hello}>Hi, {user.username}</Text>
            <View style={styles.roleBadge}>
              <Text style={styles.roleText}>{String(user.role).toUpperCase()}</Text>
            </View>
          </View>
          <Button title="Log out" variant="outline" small onPress={handleLogout} />
        </View>
        <View style={{ flex: 1, backgroundColor: colors.bg }}>
          <ReviewerScreen />
        </View>
      </SafeAreaView>
    );
  }

  // ---- Field worker: capture flow ----
  if (pole) {
    return (
      <CaptureScreen
        pole={pole}
        onDone={() => {
          setPole(null);
          void syncPending();
        }}
        onClose={() => setPole(null)}
      />
    );
  }

  return <PoleIdScreen user={user} onLogout={handleLogout} onPoleReady={setPole} />;
}

const styles = StyleSheet.create({
  loading: { flex: 1, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center' },
  reviewerRoot: { flex: 1, backgroundColor: colors.navy },
  reviewerHeader: {
    backgroundColor: colors.navy,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  hello: { color: colors.white, fontSize: font.h2, fontWeight: '800' },
  roleBadge: {
    alignSelf: 'flex-start',
    marginTop: 6,
    backgroundColor: colors.amber,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  roleText: { color: colors.navy, fontSize: font.tiny, fontWeight: '800', letterSpacing: 0.6 },
});
