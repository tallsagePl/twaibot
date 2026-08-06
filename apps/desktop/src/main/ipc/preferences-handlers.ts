import {
  PreferenceProfileInputSchema,
  type PreferenceProfile,
  type PreferenceProfileInput,
} from '@twinby/contracts';
import {
  getPreferenceProfile,
  savePreferenceProfile,
  type AppDatabase,
} from '@twinby/database';
import { getLogger } from '@twinby/logging';

function requireDb(db: AppDatabase | null): AppDatabase {
  if (!db) {
    throw new Error('Database is not initialized');
  }
  return db;
}

export function getPreferences(db: AppDatabase | null): PreferenceProfile {
  return getPreferenceProfile(requireDb(db));
}

export function savePreferences(
  db: AppDatabase | null,
  raw: unknown,
): PreferenceProfile {
  const database = requireDb(db);
  const input: PreferenceProfileInput = PreferenceProfileInputSchema.parse(raw);
  const saved = savePreferenceProfile(database, input);
  getLogger('app').info({ version: saved.version }, 'Preference profile saved');
  return saved;
}
