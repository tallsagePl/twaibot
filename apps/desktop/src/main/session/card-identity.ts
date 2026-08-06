import type { CapturedProfile } from '@twinby/contracts';

/** Strict identity for same-card detection after advance. */
export type CardIdentitySnapshot = {
  displayName: string;
  age: number | null;
  description: string;
  photoHashes: string[];
};

export function snapshotCardIdentity(captured: CapturedProfile): CardIdentitySnapshot {
  const fields = captured.fields;
  const description = normalizeText(
    [fields.bio, ...(fields.otherVisibleText ?? [])].filter(Boolean).join('\n'),
  );
  return {
    displayName: normalizeText(fields.displayName),
    age: fields.age ?? null,
    description,
    photoHashes: captured.images.map((img) => img.sha256).filter(Boolean),
  };
}

/**
 * Same card only when name, age, description and photos all match.
 * If anything differs — not a repeat (must not force-skip).
 */
export function isSameCardIdentity(
  a: CardIdentitySnapshot,
  b: CardIdentitySnapshot,
): boolean {
  if (a.displayName !== b.displayName) {
    return false;
  }
  if (a.age !== b.age) {
    return false;
  }
  if (a.description !== b.description) {
    return false;
  }
  if (a.photoHashes.length !== b.photoHashes.length) {
    return false;
  }
  for (let i = 0; i < a.photoHashes.length; i += 1) {
    if (a.photoHashes[i] !== b.photoHashes[i]) {
      return false;
    }
  }
  // Empty shells are too ambiguous to treat as a repeat.
  if (!a.displayName && !a.description && a.photoHashes.length === 0) {
    return false;
  }
  return true;
}

function normalizeText(value?: string | null): string {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}
