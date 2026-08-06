import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  acceptConsent,
  bootstrapDatabase,
  getLatestConsent,
  getSetting,
  setSetting,
} from './index';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('database bootstrap', () => {
  it('creates tables and stores consent', () => {
    const dir = mkdtempSync(join(tmpdir(), 'twinby-db-'));
    tempDirs.push(dir);
    const { db, sqlite } = bootstrapDatabase(join(dir, 'test.sqlite'));

    const consent = acceptConsent(db, { consentVersion: '1.0.0' });
    const latest = getLatestConsent(db);

    expect(latest?.id).toBe(consent.id);
    expect(latest?.consentVersion).toBe('1.0.0');

    setSetting(db, 'theme', 'system');
    expect(getSetting(db, 'theme')).toBe('system');

    sqlite.close();
  });
});
