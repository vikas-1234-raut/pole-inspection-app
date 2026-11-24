// LoginScreen.tsx
//
// Gate in front of everything else. "Track people and viewer... based on
// login give them access" — this is where that starts: no screen past
// this one renders without a successful login, and the returned role
// (field/reviewer/admin) is what App.tsx uses to decide which flow to
// show next (capture flow vs. in-app reviewer).

import React, { useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import * as auth from '../services/auth';
import { AuthUser } from '../types';

type Props = { onLoggedIn: (user: AuthUser) => void };

export default function LoginScreen({ onLoggedIn }: Props) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleLogin() {
    if (!username || !password) return;
    setBusy(true);
    try {
      const user = await auth.login(username.trim(), password);
      onLoggedIn(user);
    } catch (err: any) {
      Alert.alert('Login failed', err.message || 'Check your username and password.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Pole Inspection</Text>
      <TextInput
        style={styles.input}
        placeholder="Username"
        autoCapitalize="none"
        value={username}
        onChangeText={setUsername}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      {busy ? <ActivityIndicator /> : <Button title="Log In" onPress={handleLogin} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, gap: 12 },
  title: { fontSize: 24, fontWeight: '700', textAlign: 'center', marginBottom: 24 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, marginBottom: 12 },
});
