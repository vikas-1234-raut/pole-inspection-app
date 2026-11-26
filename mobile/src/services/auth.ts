// services/auth.ts
//
// Login + token storage. Token goes in expo-secure-store (OS keychain/
// keystore), not AsyncStorage — it's a credential, not app data, and
// secure-store is the standard place for that in Expo.
//
// getCurrentUser() decodes the JWT payload LOCALLY, without verifying the
// signature — that's fine here because it's only used to decide which
// screen to show (a UI convenience). The actual security boundary is
// server-side: every protected endpoint re-verifies the token itself
// (middleware/auth.js). A tampered token might fool the UI into showing
// the wrong screen, but it cannot get real data out of the API.

import * as SecureStore from 'expo-secure-store';
import { AuthUser } from '../types';

const TOKEN_KEY = 'pole_inspection_jwt';
const API_BASE_URL = 'http://10.221.148.180:4000';

export async function login(username: string, password: string): Promise<AuthUser> {
  const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Login failed');
  }
  const data = await res.json();
  await SecureStore.setItemAsync(TOKEN_KEY, data.token);
  return data.user;
}

export async function logout(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const token = await getToken();
  if (!token) return null;
  try {
    const payload = JSON.parse(decodeBase64Url(token.split('.')[1]));
    return { id: payload.userId, username: payload.username, role: payload.role };
  } catch {
    return null;
  }
}

// RN's JS engine (Hermes) doesn't reliably ship atob/btoa, so decode the
// JWT payload manually rather than pull in a polyfill for one call site.
function decodeBase64Url(input: string): string {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let output = '';
  let buffer = 0;
  let bits = 0;
  for (const char of padded) {
    if (char === '=') break;
    buffer = (buffer << 6) | chars.indexOf(char);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output += String.fromCharCode((buffer >> bits) & 0xff);
    }
  }
  return output;
}
