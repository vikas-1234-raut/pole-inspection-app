// storage.ts
//
// WHY AsyncStorage + a flat JSON array (instead of SQLite) for the offline queue:
// - This queue only ever holds a handful of pending inspections at a time
//   (one site worker, capturing a few poles between sync windows) — not
//   thousands of rows needing indexed queries.
// - AsyncStorage is the closest mental model to `localStorage`, which you
//   already know from the web — get/set a JSON blob, no schema/migrations
//   to manage on day one.
// - Tradeoff we're accepting: no querying ("give me all pending records for
//   pole X"), no partial updates without rewriting the whole array. If the
//   queue grows large (e.g. multi-day offline capture, hundreds of poles)
//   this should move to expo-sqlite — that migration is logged in decisions.md
//   as a known future step, not a surprise.


import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { InspectionRecord } from '../types';

const QUEUE_KEY = 'pole_inspection_pending_queue_v1';

// Copy one captured photo into documentDirectory right after capture
export async function persistCapturedPhoto(sessionId: string, uri: string, key: string): Promise<string> {
  const dir = `${FileSystem.documentDirectory}pending/${sessionId}/`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
  const dest = `${dir}${key}_${Date.now()}.jpg`;
  await FileSystem.copyAsync({ from: uri, to: dest });
  await FileSystem.deleteAsync(uri, { idempotent: true }); // remove the cache copy
  return dest;
}

export async function getQueue(): Promise<InspectionRecord[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  return raw ? JSON.parse(raw) : [];
}

export async function enqueue(record: InspectionRecord): Promise<void> {
  const queue = await getQueue();
  const withoutDup = queue.filter((r) => r.id !== record.id);
  withoutDup.push({ ...record, status: 'pending_sync' });
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(withoutDup));
}

export async function removeFromQueue(recordId: string): Promise<void> {
  const queue = await getQueue();
  const next = queue.filter((r) => r.id !== recordId);
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(next));
}

export async function markAttempt(recordId: string): Promise<void> {
  const queue = await getQueue();
  const next = queue.map((r) =>
    r.id === recordId ? { ...r, lastAttemptAt: new Date().toISOString() } : r
  );
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(next));
}
