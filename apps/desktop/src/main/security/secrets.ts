import { safeStorage } from 'electron';
import type { AppDatabase } from '@twinby/database';
import { deleteSetting, getSetting, setSetting } from '@twinby/database';
import { getLogger } from '@twinby/logging';

const API_KEY_SETTING = 'ai.api_key.enc';

export const CLOUD_SECRET_KEYS = {
  googleClientId: 'cloud.google.client_id.enc',
  googleClientSecret: 'cloud.google.client_secret.enc',
  googleRefreshToken: 'cloud.google.refresh_token.enc',
  yandexOAuthToken: 'cloud.yandex.oauth_token.enc',
} as const;

export type CloudSecretKey = (typeof CLOUD_SECRET_KEYS)[keyof typeof CLOUD_SECRET_KEYS];

export function isEncryptionAvailable(): boolean {
  return safeStorage.isEncryptionAvailable();
}

function writeSecret(db: AppDatabase, key: string, value: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    getLogger('security').warn(
      { key },
      'safeStorage unavailable; storing secret as opaque local value',
    );
    setSetting(db, key, Buffer.from(value, 'utf8').toString('base64'), true);
    return;
  }
  const encrypted = safeStorage.encryptString(value);
  setSetting(db, key, encrypted.toString('base64'), true);
}

function readSecret(db: AppDatabase, key: string): string | null {
  const stored = getSetting(db, key);
  if (!stored) {
    return null;
  }
  try {
    const buffer = Buffer.from(stored, 'base64');
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(buffer);
    }
    return buffer.toString('utf8');
  } catch (error) {
    getLogger('security').error({ err: String(error), key }, 'Failed to decrypt secret');
    return null;
  }
}

function clearSecret(db: AppDatabase, key: string): void {
  deleteSetting(db, key);
}

function hasSecret(db: AppDatabase, key: string): boolean {
  return Boolean(getSetting(db, key));
}

export function saveApiKey(db: AppDatabase, apiKey: string): void {
  writeSecret(db, API_KEY_SETTING, apiKey);
}

export function readApiKey(db: AppDatabase): string | null {
  return readSecret(db, API_KEY_SETTING);
}

export function clearApiKey(db: AppDatabase): void {
  clearSecret(db, API_KEY_SETTING);
}

export function hasApiKey(db: AppDatabase): boolean {
  return hasSecret(db, API_KEY_SETTING);
}

export function saveCloudSecret(
  db: AppDatabase,
  key: CloudSecretKey,
  value: string,
): void {
  const trimmed = value.trim();
  if (!trimmed) {
    clearSecret(db, key);
    return;
  }
  writeSecret(db, key, trimmed);
}

export function readCloudSecret(
  db: AppDatabase,
  key: CloudSecretKey,
): string | null {
  return readSecret(db, key);
}

export function clearCloudSecret(db: AppDatabase, key: CloudSecretKey): void {
  clearSecret(db, key);
}

export function hasCloudSecret(db: AppDatabase, key: CloudSecretKey): boolean {
  return hasSecret(db, key);
}

export function getCloudCredentialsStatus(db: AppDatabase): {
  google: {
    hasClientId: boolean;
    hasClientSecret: boolean;
    hasRefreshToken: boolean;
  };
  yandex: { hasOAuthToken: boolean };
} {
  return {
    google: {
      hasClientId: hasCloudSecret(db, CLOUD_SECRET_KEYS.googleClientId),
      hasClientSecret: hasCloudSecret(db, CLOUD_SECRET_KEYS.googleClientSecret),
      hasRefreshToken: hasCloudSecret(db, CLOUD_SECRET_KEYS.googleRefreshToken),
    },
    yandex: {
      hasOAuthToken: hasCloudSecret(db, CLOUD_SECRET_KEYS.yandexOAuthToken),
    },
  };
}
