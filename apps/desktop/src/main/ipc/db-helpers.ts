import type { AppDatabase } from '@twinby/database';

/** Shared by Orpheus IPC handlers (audience/identity/cloud/orpheus/snapshot/experiment/relationship/preflight). */
export function requireDb(db: AppDatabase | null): AppDatabase {
  if (!db) {
    throw new Error('Database is not initialized');
  }
  return db;
}

/** Marks a not-yet-wired operation (needs AI, Twinby device session, or real OAuth). */
export function notImplemented(message: string): never {
  throw new Error(message);
}
