import { describe, expect, it } from 'vitest';
import { InMemoryPhotoIndex } from './index.js';

describe('InMemoryPhotoIndex', () => {
  const sample = {
    id: 'file-1',
    provider: 'google-drive' as const,
    name: 'face-portrait.jpg',
    modifiedAt: '2026-08-01T12:00:00.000Z',
    checksum: 'abc',
    path: '/Photos/face-portrait.jpg',
  };

  it('indexes a file and reports isKnown', async () => {
    const index = new InMemoryPhotoIndex();
    expect(await index.isKnown(sample)).toBe(false);
    const asset = await index.index(sample);
    expect(asset.externalFileId).toBe('file-1');
    expect(asset.possibleRoles).toContain('main-face');
    expect(await index.isKnown(sample)).toBe(true);
  });

  it('skips re-index when identity is unchanged', async () => {
    const index = new InMemoryPhotoIndex();
    const first = await index.index(sample);
    const second = await index.index(sample);
    expect(second.id).toBe(first.id);
    expect(index.list()).toHaveLength(1);
  });

  it('searches by query text and filters by role', async () => {
    const index = new InMemoryPhotoIndex();
    await index.index(sample);
    await index.index({
      id: 'file-2',
      provider: 'yandex-disk',
      name: 'city-lifestyle.jpg',
      modifiedAt: '2026-08-02T12:00:00.000Z',
    });

    const byText = await index.search({ query: 'portrait', limit: 10 });
    expect(byText.hits.length).toBeGreaterThan(0);
    expect(byText.hits[0]?.asset.fileName).toContain('portrait');

    const byRole = await index.search({ roles: ['lifestyle'], limit: 10 });
    expect(byRole.hits).toHaveLength(1);
    expect(byRole.hits[0]?.asset.fileName).toContain('lifestyle');
  });
});
