import { describe, expect, it } from 'vitest';
import { OwnProfileCaptureService } from './own-profile-capture-service';

describe('OwnProfileCaptureService.compareToLast', () => {
  const service = new OwnProfileCaptureService({
    getDb: () => {
      throw new Error('db not used');
    },
    navigation: {
      openOwnProfile: async () => undefined,
    } as never,
    getProjectRoot: () => process.cwd(),
  });

  it('detects unchanged photo hashes and bio', () => {
    const draft = {
      bio: 'Hello',
      occupation: 'Dev',
      photos: [
        { position: 0, localPreviewPath: '/a.jpg', perceptualHash: 'aaa' },
        { position: 1, localPreviewPath: '/b.jpg', perceptualHash: 'bbb' },
      ],
      capturedAt: new Date().toISOString(),
    };
    const last = {
      id: '1',
      capturedAt: draft.capturedAt,
      bio: 'Hello',
      occupation: 'Dev',
      interests: [],
      differencesFromPlan: [],
      deploymentStatus: 'not-verified' as const,
      source: 'twinby-profile-capture' as const,
      photos: draft.photos,
    };
    expect(service.compareToLast(draft, last)).toEqual({
      changed: false,
      reason: 'Слепок совпадает с последним',
    });
  });

  it('detects photo order/hash change', () => {
    const draft = {
      bio: 'Hello',
      photos: [{ position: 0, localPreviewPath: '/a.jpg', perceptualHash: 'zzz' }],
      capturedAt: new Date().toISOString(),
    };
    const last = {
      id: '1',
      capturedAt: draft.capturedAt,
      bio: 'Hello',
      interests: [],
      differencesFromPlan: [],
      deploymentStatus: 'not-verified' as const,
      source: 'twinby-profile-capture' as const,
      photos: [{ position: 0, localPreviewPath: '/a.jpg', perceptualHash: 'aaa' }],
    };
    expect(service.compareToLast(draft, last).changed).toBe(true);
  });

  it('treats first snapshot as a change', () => {
    const draft = {
      bio: 'New',
      photos: [{ position: 0, localPreviewPath: '/a.jpg', perceptualHash: 'aaa' }],
      capturedAt: new Date().toISOString(),
    };
    expect(service.compareToLast(draft, null)).toEqual({
      changed: true,
      reason: 'Нет предыдущего слепка',
    });
  });
});
