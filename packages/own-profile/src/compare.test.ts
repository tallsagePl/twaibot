import { describe, expect, it } from 'vitest';
import {
  comparePlannedToActual,
  photoPlanMatchesActual,
  type OwnProfileVariant,
  type VerifiedProfileSnapshot,
} from './index';

function planned(photoAssetIds: string[], bio = 'Hello'): OwnProfileVariant {
  return {
    id: 'v1',
    version: 1,
    name: 'test',
    status: 'draft',
    strategyId: 's',
    plannedProfile: { photoAssetIds, bio },
    hypothesis: '',
    changedSignalBundle: {
      id: 'c',
      name: 'c',
      changedSignals: [],
      commonHypothesis: '',
      expectedEffect: { funnelStage: 'incoming-like', direction: 'increase' },
    },
    createdAgainstAudienceVersion: 1,
    createdAgainstIdentityVersion: 1,
    createdAt: new Date().toISOString(),
  };
}

function actual(
  photos: Array<{ hash: string; matched?: string }>,
  bio = 'Hello',
): VerifiedProfileSnapshot {
  return {
    id: 's1',
    capturedAt: new Date().toISOString(),
    photos: photos.map((p, i) => ({
      position: i,
      localPreviewPath: `/p${i}.jpg`,
      perceptualHash: p.hash,
      matchedPhotoAssetId: p.matched,
    })),
    bio,
    differencesFromPlan: [],
    deploymentStatus: 'not-verified',
    source: 'twinby-profile-capture',
  };
}

describe('photoPlanMatchesActual', () => {
  it('matches by asset id', () => {
    expect(
      photoPlanMatchesActual('asset-1', {
        perceptualHash: 'aaaa',
        matchedPhotoAssetId: 'asset-1',
      }),
    ).toBe(true);
  });

  it('matches by pHash fallback used in baseline plans', () => {
    expect(
      photoPlanMatchesActual('ffff7f7b71000000', {
        perceptualHash: 'ffff7f7b71000000',
      }),
    ).toBe(true);
  });
});

describe('comparePlannedToActual', () => {
  it('scores 100% when plan stores pHashes of the same Twinby photos', () => {
    const hashes = [
      'ffff7f7b71000000',
      '8000000007ffffff',
      '7f3d3d2e2e061cfe',
      'ffffc7c783030307',
      'ffdfc0809ecf41d8',
    ];
    const result = comparePlannedToActual(
      planned(hashes),
      actual(hashes.map((hash) => ({ hash }))),
    );
    expect(result.similarity).toBe(100);
    expect(result.deploymentStatus).toBe('matches-plan');
    expect(result.differences).toEqual([]);
  });

  it('scores 30% when bio matches but photos cannot be linked', () => {
    const result = comparePlannedToActual(
      planned(['asset-a', 'asset-b', 'asset-c', 'asset-d', 'asset-e']),
      actual([
        { hash: '1111111111111111' },
        { hash: '2222222222222222' },
        { hash: '3333333333333333' },
        { hash: '4444444444444444' },
        { hash: '5555555555555555' },
      ]),
    );
    expect(result.similarity).toBe(30);
    expect(result.bioMatches).toBe(true);
    expect(result.photoMatches).toBe(0);
  });
});
