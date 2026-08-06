import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ensureAppDirectories, resolveAppPaths } from './index';

describe('config paths', () => {
  it('resolves repo data paths by default', () => {
    const root = join(tmpdir(), 'twinby-config-test-root');
    const paths = resolveAppPaths({ projectRoot: root });
    expect(paths.database).toContain('application.sqlite');
    expect(paths.temporary).toContain('temporary');
  });

  it('creates missing directories', () => {
    const root = mkdtempSync(join(tmpdir(), 'twinby-config-'));
    try {
      const paths = resolveAppPaths({ projectRoot: root });
      ensureAppDirectories(paths);
      expect(paths.data).toBeTruthy();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
