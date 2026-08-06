import { describe, expect, it } from 'vitest';
import type { CapturedProfile } from '@twinby/contracts';
import { isSameCardIdentity, snapshotCardIdentity } from './card-identity';

function makeCaptured(
  partial: {
    displayName?: string;
    age?: number;
    bio?: string;
    otherVisibleText?: string[];
    photoHashes?: string[];
  },
): CapturedProfile {
  return {
    observationId: 'obs',
    capturedAt: new Date().toISOString(),
    fields: {
      displayName: partial.displayName,
      age: partial.age,
      bio: partial.bio,
      interests: [],
      otherVisibleText: partial.otherVisibleText ?? [],
    },
    images: (partial.photoHashes ?? []).map((sha256, index) => ({
      index,
      path: `/tmp/${sha256}.jpg`,
      width: 100,
      height: 100,
      bytes: 1000,
      sha256,
      perceptualHash: sha256,
    })),
    source: { appPackage: 'com.twinby', deviceId: 'dev' },
    completeness: { text: 1, images: 1, overall: 1 },
    cardFingerprint: 'fp',
    warnings: [],
    actionsUsed: 0,
  };
}

describe('isSameCardIdentity', () => {
  it('matches only when name, age, description and photos all equal', () => {
    const a = snapshotCardIdentity(
      makeCaptured({
        displayName: 'Олеся',
        age: 22,
        bio: 'Люблю кофе',
        photoHashes: ['aaa', 'bbb'],
      }),
    );
    const b = snapshotCardIdentity(
      makeCaptured({
        displayName: 'Олеся',
        age: 22,
        bio: 'Люблю кофе',
        photoHashes: ['aaa', 'bbb'],
      }),
    );
    expect(isSameCardIdentity(a, b)).toBe(true);
  });

  it('does not match when name differs', () => {
    const a = snapshotCardIdentity(
      makeCaptured({ displayName: 'Олеся', age: 22, bio: 'x', photoHashes: ['a'] }),
    );
    const b = snapshotCardIdentity(
      makeCaptured({ displayName: 'Анна', age: 22, bio: 'x', photoHashes: ['a'] }),
    );
    expect(isSameCardIdentity(a, b)).toBe(false);
  });

  it('does not match when age differs', () => {
    const a = snapshotCardIdentity(
      makeCaptured({ displayName: 'Олеся', age: 22, bio: 'x', photoHashes: ['a'] }),
    );
    const b = snapshotCardIdentity(
      makeCaptured({ displayName: 'Олеся', age: 23, bio: 'x', photoHashes: ['a'] }),
    );
    expect(isSameCardIdentity(a, b)).toBe(false);
  });

  it('does not match when description differs', () => {
    const a = snapshotCardIdentity(
      makeCaptured({ displayName: 'Олеся', age: 22, bio: 'кофе', photoHashes: ['a'] }),
    );
    const b = snapshotCardIdentity(
      makeCaptured({ displayName: 'Олеся', age: 22, bio: 'чай', photoHashes: ['a'] }),
    );
    expect(isSameCardIdentity(a, b)).toBe(false);
  });

  it('does not match when photos differ', () => {
    const a = snapshotCardIdentity(
      makeCaptured({ displayName: 'Олеся', age: 22, bio: 'x', photoHashes: ['a'] }),
    );
    const b = snapshotCardIdentity(
      makeCaptured({ displayName: 'Олеся', age: 22, bio: 'x', photoHashes: ['b'] }),
    );
    expect(isSameCardIdentity(a, b)).toBe(false);
  });

  it('does not match empty shells', () => {
    const a = snapshotCardIdentity(makeCaptured({}));
    const b = snapshotCardIdentity(makeCaptured({}));
    expect(isSameCardIdentity(a, b)).toBe(false);
  });
});
