import { ApiError } from '../../engine/errors';

let activeSync = false;

/**
 * Synchronous guard ensuring at most one import sync runs concurrently.
 * Returns a release function to be called in a finally block.
 */
export function acquireSyncLock(): () => void {
  if (activeSync) {
    throw new ApiError('sync_in_progress', 409, 'Import sync is already in progress');
  }
  activeSync = true;
  return () => {
    activeSync = false;
  };
}

export function isSyncActive(): boolean {
  return activeSync;
}

export const isSyncLocked = isSyncActive;
