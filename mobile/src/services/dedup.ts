// services/dedup.ts
//
// Client-side duplicate check, scoped to THIS capture session only —
// catches the field worker accidentally tapping capture twice on the same
// frame, or re-using a gallery-adjacent shot, before it ever leaves the
// phone. This is an exact-hash check (SHA-256 of file bytes), so it will
// NOT catch a photo that's been recompressed or lightly edited.
//
// It is deliberately NOT the fraud defense against a contractor reusing
// an old "healthy" photo across different inspections — that needs
// comparison against the ENTIRE historical photo archive, which only the
// server can do. That check is perceptual-hash based (utils/imageHash.js
// on the backend, computed from the file the server actually received —
// never trusting a client-supplied hash for that purpose). This file and
// that one solve two different problems; see decisions.md D13.

import * as Crypto from 'expo-crypto';
import {File as ExpoFile} from 'expo-file-system';

export async function hashPhotoFile(uri: string): Promise<string> {
  const file = new ExpoFile(uri);
  if (!file.exists) throw new Error(`Photo not found: ${uri}`);

  const base64 = await file.base64();         
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    base64
  );
}

export function isDuplicateInSession(hash: string, existingHashes: string[]): boolean {
  return existingHashes.includes(hash);
}
