// services/poleId.ts
//
// "Pole ID must be filled by person who upload images... id must be hash
// key using location coordinates and name filled by person."
//
// Rounding to 5 decimal places (~1.1m precision at the equator) means
// the same physical pole, captured by two different workers with two
// slightly different GPS fixes, still produces the SAME id — which is
// what makes this a deduplication key, not just an identifier. Tighter
// rounding (more decimals) would make GPS noise split one real pole into
// multiple ids; looser rounding risks merging two genuinely close poles.
// 5 decimals is a reasonable middle ground; tune against real field GPS
// accuracy once you have data (see decisions.md D11).
//
// The entered name is part of the hash (not just GPS) specifically
// because TL line poles have their own existing naming convention — this
// keeps that human-meaningful name recoverable/searchable, while GPS
// rounding does the actual dedup work.

import * as Crypto from 'expo-crypto';

export async function generatePoleId(
  latitude: number,
  longitude: number,
  enteredName: string
): Promise<string> {
  const roundedLat = latitude.toFixed(5);
  const roundedLon = longitude.toFixed(5);
  const normalizedName = enteredName.trim().toLowerCase().replace(/\s+/g, '-');
  const raw = `${roundedLat}:${roundedLon}:${normalizedName}`;

  const fullHash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    raw
  );

  return `PL-${fullHash.slice(0, 10).toUpperCase()}`;
}
