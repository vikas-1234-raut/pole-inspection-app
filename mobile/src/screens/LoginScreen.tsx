// LoginScreen.tsx — navy header + white login panel (same navy/amber theme).
// - Login panel is CENTRED in the space below the header.
// - Keyboard fix: KeyboardAvoidingView + ScrollView move the panel up while typing.
import React, { useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Button from '../components/Button';
import * as auth from '../services/auth';
import { colors, font, radius, spacing, TAP } from '../theme';

type Props = {
  // Called after a successful login with the user returned by auth.login().
  onLoggedIn: (user: any) => void;
};

// 👉 Fine-tune the panel position here:
//    bigger PANEL_SHIFT_UP = panel sits higher, 0 = exact centre, negative = lower.
const PANEL_SHIFT_UP = 40;

export default function LoginScreen({ onLoggedIn }: Props) {
  const insets = useSafeAreaInsets();
  const passwordRef = useRef<TextInput>(null);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  // Shrink the navy header while the keyboard is open, so the form has room.
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const s = Keyboard.addListener(showEvt, () => setKeyboardOpen(true));
    const h = Keyboard.addListener(hideEvt, () => setKeyboardOpen(false));
    return () => {
      s.remove();
      h.remove();
    };
  }, []);

  const handleLogin = async () => {
    if (!username.trim() || !password) {
      setError('Enter username and password');
      return;
    }
    Keyboard.dismiss();
    setError(null);
    setLoading(true);
    try {
      // 👉 Same login call as before. Change only if your auth.ts uses another name.
      const user = await auth.login(username.trim(), password);
      onLoggedIn(user);
    } catch (e: any) {
      setError(e?.message ?? 'Login failed. Check username, password and server.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.root}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <ScrollView
            style={styles.flex}
            contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {/* Navy header (compact while typing) */}
            <View
              style={[
                styles.header,
                { paddingTop: insets.top + (keyboardOpen ? spacing.lg : 56) },
                keyboardOpen && styles.headerCompact,
              ]}
            >
              {!keyboardOpen && (
                <View style={styles.logo}>
                  <Text style={styles.logoText}>⚡</Text>
                </View>
              )}
              <Text style={styles.title}>Pole Inspection</Text>
              {!keyboardOpen && <Text style={styles.subtitle}>Sign in to continue</Text>}
            </View>

            {/* Wrapper fills the space below the header and centres the panel in it */}
            <View
              style={[
                styles.panelWrap,
                { paddingBottom: keyboardOpen ? spacing.lg : spacing.lg + PANEL_SHIFT_UP },
              ]}
            >
              {/* White login panel */}
              <View style={styles.panel}>
                <Text style={styles.label}>Username</Text>
                <TextInput
                  style={styles.input}
                  value={username}
                  onChangeText={setUsername}
                  placeholder="Enter username"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="next"
                  onSubmitEditing={() => passwordRef.current?.focus()}
                  blurOnSubmit={false}
                  editable={!loading}
                />

                <Text style={styles.label}>Password</Text>
                <View>
                  <TextInput
                    ref={passwordRef}
                    style={[styles.input, styles.passwordInput]}
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Enter password"
                    placeholderTextColor={colors.textMuted}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="done"
                    onSubmitEditing={handleLogin}
                    editable={!loading}
                  />
                  <TouchableOpacity
                    style={styles.showBtn}
                    onPress={() => setShowPassword((v) => !v)}
                    hitSlop={8}
                  >
                    <Text style={styles.showText}>{showPassword ? 'Hide' : 'Show'}</Text>
                  </TouchableOpacity>
                </View>

                {error ? <Text style={styles.error}>{error}</Text> : null}

                <Button
                  title="Log in"
                  onPress={handleLogin}
                  loading={loading}
                  disabled={loading}
                  style={styles.loginBtn}
                />
              </View>
            </View>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.navy },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, backgroundColor: colors.bg },

  header: {
    backgroundColor: colors.navy,
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingBottom: 40,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
  },
  headerCompact: { paddingBottom: 24 },
  logo: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.amber,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  logoText: { fontSize: 34 },
  title: { color: colors.white, fontSize: font.title, fontWeight: '700' },
  subtitle: { color: colors.faintWhite, fontSize: font.body, marginTop: spacing.xs },

  // Fills remaining space and centres the panel vertically.
  panelWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingTop: spacing.lg,
  },
  panel: {
    backgroundColor: colors.card,
    marginHorizontal: spacing.lg,
    borderRadius: radius.lg,
    padding: spacing.xl,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
  },
  label: {
    fontSize: font.small,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  input: {
    minHeight: TAP + 4,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    fontSize: font.body,
    color: colors.text,
    backgroundColor: colors.bg,
    marginBottom: spacing.lg,
  },
  passwordInput: { paddingRight: 64 },
  showBtn: { position: 'absolute', right: spacing.md, top: 14 },
  showText: { color: colors.navyLight, fontWeight: '700' },
  error: { color: colors.red, marginBottom: spacing.md, fontSize: font.small },
  loginBtn: { marginTop: spacing.xs },
});
