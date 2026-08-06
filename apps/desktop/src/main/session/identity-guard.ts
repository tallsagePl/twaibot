import type { ManagedAppiumClient } from '@twinby/appium-client';
import { computeCardFingerprint } from '@twinby/profile-capture';
import { detectScreenFromPageSource, readVisibleProfileFromSource } from '@twinby/twinby-adapter';

export interface IdentityExpected {
  fingerprint: string;
  displayName?: string;
  age?: number;
}

export interface IdentityCheckResult {
  matched: boolean;
  expected: string;
  actual: string;
  displayName?: string;
  reason?: string;
}

/**
 * Strip Twinby chrome noise: leading ids, "N км", city fragments.
 * "1125 Москва 3 км Амалия" → "амалия"
 */
export function normalizeDisplayName(raw?: string): string {
  if (!raw) {
    return '';
  }
  let s = raw.trim().toLowerCase();
  s = s.replace(/^\d+\s*/, '');
  s = s.replace(/\b\d+[.,]?\d*\s*км\b/gi, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  // Prefer last token that looks like a name (cyrillic/latin letters)
  const tokens = s.split(' ').filter(Boolean);
  const nameLike = tokens.filter((t) => /^[a-zа-яё]{2,}$/i.test(t));
  if (nameLike.length > 0) {
    return nameLike[nameLike.length - 1]!;
  }
  return s;
}

function namesSoftMatch(expected?: string, actual?: string): boolean {
  const a = normalizeDisplayName(expected);
  const b = normalizeDisplayName(actual);
  if (!a || !b) {
    return false;
  }
  if (a === b) {
    return true;
  }
  return a.includes(b) || b.includes(a);
}

/**
 * Re-read visible card and compare identity before like/dislike.
 * Soft-matches on normalized name+age when fingerprint drifts.
 */
export async function verifyProfileIdentity(
  client: ManagedAppiumClient,
  expected: IdentityExpected | string,
): Promise<IdentityCheckResult> {
  const expectedFingerprint =
    typeof expected === 'string' ? expected : expected.fingerprint;
  const expectedName =
    typeof expected === 'string' ? undefined : expected.displayName;
  const expectedAge = typeof expected === 'string' ? undefined : expected.age;

  const source = (await client.getPageSource()).source;
  const screen = detectScreenFromPageSource(source);
  const preview = readVisibleProfileFromSource(source);
  const actual = computeCardFingerprint(
    {
      displayName: preview.displayName,
      age: preview.age,
      distanceKm: preview.distanceKm,
      city: preview.city,
    },
    source,
  );

  if (actual === expectedFingerprint) {
    return {
      matched: true,
      expected: expectedFingerprint,
      actual,
      displayName: preview.displayName,
    };
  }

  const ageOk =
    expectedAge == null || preview.age == null || expectedAge === preview.age;
  if (namesSoftMatch(expectedName, preview.displayName) && ageOk) {
    return {
      matched: true,
      expected: expectedFingerprint,
      actual,
      displayName: preview.displayName,
      reason: 'soft-match normalized-name+age',
    };
  }

  return {
    matched: false,
    expected: expectedFingerprint,
    actual,
    displayName: preview.displayName,
    reason: screen.type !== 'feed' ? `screen=${screen.type}` : 'fingerprint mismatch',
  };
}
