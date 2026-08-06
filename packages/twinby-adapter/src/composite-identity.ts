import { createHash } from 'node:crypto';
import { fingerprintFromName } from './page-source-lists';

export interface CompositeIdentityParts {
  name?: string;
  age?: number;
  primaryPhotoHash?: string;
  bioFingerprint?: string;
}

/** Short stable hash of bio text for identity matching (§21.2). */
export function bioFingerprintFromText(bio: string): string {
  const normalized = bio
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .slice(0, 500);
  if (!normalized) {
    return '';
  }
  return createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

/**
 * Composite candidate id (§19.2 / §21.2): name + age + photo hash + bio fingerprint.
 * Not Twinby API ids. Falls back to name-only if no stronger signals.
 */
export function buildCompositeFingerprint(parts: CompositeIdentityParts): string {
  const name = (parts.name ?? '').trim().toLowerCase();
  const age = parts.age != null && Number.isFinite(parts.age) ? String(parts.age) : '';
  const photo = (parts.primaryPhotoHash ?? '').trim();
  const bio = (parts.bioFingerprint ?? '').trim();
  if (!photo && !bio && !age) {
    return fingerprintFromName(parts.name ?? 'unknown');
  }
  const payload = `${name}|${age}|${photo}|${bio}`;
  return `cid:${createHash('sha256').update(payload).digest('hex').slice(0, 24)}`;
}
