// syncService.ts
import * as api from './api';
import * as storage from './storage';
import * as network from './network';
import * as location from './location';
import { InspectionRecord } from '../types';

export type UploadOutcome =
  | { result: 'uploaded' }
  | { result: 'queued'; reason: 'offline' | 'server_unreachable' | 'server_error'; detail?: string };

export async function attemptUpload(record: InspectionRecord): Promise<UploadOutcome> {
  if (!(await network.isConnected())) {
    await storage.enqueue(record);
    return { result: 'queued', reason: 'offline' };
  }

  let uploadFix: { latitude: number; longitude: number } | null = null;
  try {
    const fix = await location.getFixOrThrow();
    uploadFix = { latitude: fix.latitude, longitude: fix.longitude };
  } catch {
    uploadFix = null;
  }

  try {
    await api.uploadInspection(record, uploadFix);   // try directly, like the old version
    await storage.removeFromQueue(record.id);
    return { result: 'uploaded' };
  } catch (err: any) {
    console.log('[sync] UPLOAD FAILED:', err?.status, err?.message);

    if (err instanceof api.UploadRejectedError) {
      await storage.removeFromQueue(record.id);
      throw err;
    }
    await storage.enqueue(record);
    await storage.markAttempt(record.id);

    if (err instanceof api.HttpError && err.status === 401) {
      throw new Error('Session expired. Please log in again. Photos are saved and will upload after login.');
    }
    return {
      result: 'queued',
      reason: err instanceof api.HttpError ? 'server_error' : 'server_unreachable',
      detail: err?.message,
    };
  }
}

export async function processQueue() {
  const queue = await storage.getQueue();
  let uploaded = 0, rejected = 0;
  for (const record of queue) {
    try {
      const out = await attemptUpload(record);
      if (out.result === 'uploaded') uploaded += 1;
    } catch (err) {
      if (err instanceof api.UploadRejectedError) rejected += 1;
    }
  }
  const remaining = await storage.getQueue();
  return { uploaded, stillQueued: remaining.length, rejected };
}
