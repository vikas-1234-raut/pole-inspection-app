// services/locationProviders.ts
//
// AngleCam-style "Path A" checks: which location providers are switched on?
//
// From the reverse-engineering notes: AngleCam checks whether the GPS provider and
// the network provider are enabled before requesting updates, and treats
// "provider disabled" as a DIFFERENT problem from "location is inaccurate".
// This file does the same using public expo-location APIs:
//
//   getProviderStatusAsync()   -> is location on? is GPS on? is network location on?
//   enableNetworkProviderAsync -> Android dialog asking the user to turn on
//                                 high-accuracy location (GPS + network)
//   getLastKnownPositionAsync  -> cached position, for a quick preview only
//
// Error kinds (so the screen can show the right message and the right button):
//   permission_denied  - user refused location permission      -> ask again / open settings
//   services_off       - phone location switch is OFF           -> "Turn on location"
//   gps_off            - location ON but GPS provider is off    -> "Turn on high accuracy"
//   (inaccurate GPS is NOT an error - it is status 'locking'/'timeout' in gpsAccuracy.ts)

import * as Location from 'expo-location';
import { Platform } from 'react-native';

export type ProviderErrorCode = 'permission_denied' | 'services_off' | 'gps_off';

export interface ProviderCheck {
  ok: boolean;
  code: ProviderErrorCode | null;
  message: string | null;
  gpsAvailable: boolean | null; // null = unknown (iOS does not report this)
  networkAvailable: boolean | null;
}

export const PROVIDER_MESSAGES: Record<ProviderErrorCode, string> = {
  permission_denied: 'Location permission is required before any capture can begin.',
  services_off: 'Location is turned off on this phone. Turn it on to continue.',
  gps_off: 'GPS is off (location is using network only). Turn on high-accuracy location.',
};

/** Check permission + location switch + GPS provider. Does not ask for permission. */
export async function checkProviders(): Promise<ProviderCheck> {
  const perm = await Location.getForegroundPermissionsAsync();
  if (perm.status !== 'granted') return fail('permission_denied', null, null);

  const s = await Location.getProviderStatusAsync();
  const gps = s.gpsAvailable ?? null;
  const net = s.networkAvailable ?? null;

  if (!s.locationServicesEnabled) return fail('services_off', gps, net);
  // Only Android reports gpsAvailable. Network-only location is far too coarse
  // (often 100 m+) for pole inspection, so we treat "GPS off" as blocking.
  if (Platform.OS === 'android' && gps === false) return fail('gps_off', gps, net);

  return { ok: true, code: null, message: null, gpsAvailable: gps, networkAvailable: net };
}

/**
 * Try to fix a provider problem.
 *  - permission_denied: asks for permission again
 *  - services_off / gps_off on Android: shows the system "turn on location" dialog
 * Returns the new check result.
 */
export async function tryEnableLocation(): Promise<ProviderCheck> {
  const before = await checkProviders();
  if (before.code === 'permission_denied') {
    await Location.requestForegroundPermissionsAsync();
  } else if (Platform.OS === 'android' && (before.code === 'services_off' || before.code === 'gps_off')) {
    try {
      await Location.enableNetworkProviderAsync(); // system dialog; throws if user cancels
    } catch {
      // user tapped "No thanks" - result is reported by the re-check below
    }
  }
  return checkProviders();
}

/**
 * Cached position (like AngleCam's optional last-known read).
 * ONLY for showing something on screen quickly. Never use it for the pole ID,
 * photos or fraud checks - it can be minutes old and from another place.
 */
export async function getQuickPreview(maxAgeMs = 60_000): Promise<Location.LocationObject | null> {
  try {
    return await Location.getLastKnownPositionAsync({ maxAge: maxAgeMs, requiredAccuracy: 100 });
  } catch {
    return null;
  }
}

function fail(code: ProviderErrorCode, gps: boolean | null, net: boolean | null): ProviderCheck {
  return { ok: false, code, message: PROVIDER_MESSAGES[code], gpsAvailable: gps, networkAvailable: net };
}
