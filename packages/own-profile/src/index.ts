export type OwnProfileVariantStatus =
  | 'draft'
  | 'ready'
  | 'recommended'
  | 'active'
  | 'testing'
  | 'paused'
  | 'archived';

export type DeploymentStatus =
  | 'not-verified'
  | 'matches-plan'
  | 'partially-matches'
  | 'does-not-match';

export interface ProfileChangeSet {
  id: string;
  name: string;
  changedSignals: Array<{
    type:
      | 'main-photo'
      | 'photo-order'
      | 'photo-set'
      | 'bio'
      | 'positioning';
    before: string;
    after: string;
  }>;
  commonHypothesis: string;
  expectedEffect: {
    funnelStage:
      | 'incoming-like'
      | 'match'
      | 'conversation'
      | 'telegram'
      | 'date';
    direction: 'increase' | 'decrease';
  };
}

export interface OwnProfileVariant {
  id: string;
  version: number;
  name: string;
  status: OwnProfileVariantStatus;
  strategyId: string;
  plannedProfile: {
    photoAssetIds: string[];
    bio: string;
  };
  hypothesis: string;
  changedSignalBundle: ProfileChangeSet;
  createdAgainstAudienceVersion: number;
  createdAgainstIdentityVersion: number;
  createdAt: string;
  activatedAt?: string;
  deactivatedAt?: string;
  archivedAt?: string;
  verifiedSnapshotId?: string;
}

export interface VerifiedProfileSnapshot {
  id: string;
  profileVariantId?: string;
  capturedAt: string;
  photos: Array<{
    position: number;
    localPreviewPath: string;
    perceptualHash: string;
    matchedPhotoAssetId?: string;
    matchConfidence?: number;
  }>;
  bio: string;
  occupation?: string;
  interests?: string[];
  relationshipGoal?: string;
  plannedSimilarity?: number;
  differencesFromPlan: string[];
  deploymentStatus: DeploymentStatus;
  source: 'twinby-profile-capture';
}

export interface ProfileDeploymentComparison {
  similarity: number;
  deploymentStatus: DeploymentStatus;
  differences: string[];
  photoMatches: number;
  photoMismatches: number;
  bioMatches: boolean;
}

export interface OwnProfileCapture {
  capture(): Promise<VerifiedProfileSnapshot>;
}

export interface ProfileDeploymentVerifier {
  compare(
    planned: OwnProfileVariant,
    actual: VerifiedProfileSnapshot,
  ): Promise<ProfileDeploymentComparison>;
}

function normalizeBio(bio: string): string {
  return bio.trim().replace(/\s+/g, ' ').toLowerCase();
}

function looksLikePerceptualHash(value: string): boolean {
  return /^[0-9a-f]{16}$/i.test(value.trim());
}

function photoRefLabel(id: string): string {
  if (looksLikePerceptualHash(id)) {
    return `отпечаток ${id.slice(0, 8)}…`;
  }
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}

/** True when planned photo id matches actual via asset id or pHash fallback. */
export function photoPlanMatchesActual(
  plannedId: string,
  actualPhoto: {
    perceptualHash: string;
    matchedPhotoAssetId?: string;
  },
): boolean {
  if (actualPhoto.matchedPhotoAssetId && actualPhoto.matchedPhotoAssetId === plannedId) {
    return true;
  }
  // Baseline variants often store Twinby pHash when cloud match was missing.
  if (
    actualPhoto.perceptualHash &&
    actualPhoto.perceptualHash.toLowerCase() === plannedId.toLowerCase()
  ) {
    return true;
  }
  return false;
}

/**
 * Pure compare of planned variant vs captured Twinby snapshot.
 * Accepts matchedPhotoAssetId or pHash fallback (when plan stored hashes).
 */
export function comparePlannedToActual(
  planned: OwnProfileVariant,
  actual: VerifiedProfileSnapshot,
): ProfileDeploymentComparison {
  const plannedIds = planned.plannedProfile.photoAssetIds;
  const differences: string[] = [];

  let photoMatches = 0;
  let photoMismatches = 0;

  if (actual.photos.length !== plannedIds.length) {
    differences.push(
      `Число фото: план ${plannedIds.length}, факт ${actual.photos.length}`,
    );
  }

  const orderedActual = [...actual.photos].sort((a, b) => a.position - b.position);
  const maxLen = Math.max(plannedIds.length, orderedActual.length);

  for (let i = 0; i < maxLen; i += 1) {
    const plannedId = plannedIds[i];
    const actualPhoto = orderedActual[i];
    if (!plannedId && actualPhoto) {
      photoMismatches += 1;
      differences.push(`Лишнее фото на позиции ${actualPhoto.position}`);
      continue;
    }
    if (plannedId && !actualPhoto) {
      photoMismatches += 1;
      differences.push(
        `Нет фото на позиции ${i} (ожидалось ${photoRefLabel(plannedId)})`,
      );
      continue;
    }
    if (!plannedId || !actualPhoto) continue;

    if (photoPlanMatchesActual(plannedId, actualPhoto)) {
      photoMatches += 1;
      continue;
    }

    photoMismatches += 1;
    if (actualPhoto.matchedPhotoAssetId) {
      differences.push(
        `Позиция ${i}: план ${photoRefLabel(plannedId)}, факт ${photoRefLabel(actualPhoto.matchedPhotoAssetId)}`,
      );
    } else if (looksLikePerceptualHash(plannedId)) {
      differences.push(
        `Позиция ${i}: фото из плана не найдено в индексе облака (${photoRefLabel(plannedId)})`,
      );
    } else {
      differences.push(
        `Позиция ${i}: нет сопоставления с облаком для ${photoRefLabel(plannedId)}`,
      );
    }
  }

  const bioMatches =
    normalizeBio(planned.plannedProfile.bio) === normalizeBio(actual.bio);
  if (!bioMatches) {
    differences.push('Bio не совпадает с планом');
  }

  const photoDenom = Math.max(1, plannedIds.length);
  const photoScore = photoMatches / photoDenom;
  const bioScore = bioMatches ? 1 : 0;
  const similarity = Math.round((photoScore * 0.7 + bioScore * 0.3) * 100);

  let deploymentStatus: DeploymentStatus;
  if (similarity >= 95 && photoMismatches === 0 && bioMatches) {
    deploymentStatus = 'matches-plan';
  } else if (similarity >= 40) {
    deploymentStatus = 'partially-matches';
  } else if (plannedIds.length === 0 && !planned.plannedProfile.bio) {
    deploymentStatus = 'not-verified';
  } else {
    deploymentStatus = 'does-not-match';
  }

  return {
    similarity,
    deploymentStatus,
    differences,
    photoMatches,
    photoMismatches,
    bioMatches,
  };
}

export class DefaultProfileDeploymentVerifier implements ProfileDeploymentVerifier {
  async compare(
    planned: OwnProfileVariant,
    actual: VerifiedProfileSnapshot,
  ): Promise<ProfileDeploymentComparison> {
    return comparePlannedToActual(planned, actual);
  }
}

export class StubOwnProfileCapture implements OwnProfileCapture {
  async capture(): Promise<VerifiedProfileSnapshot> {
    throw new Error(
      'OwnProfileCapture.capture: требуется locator discovery и Twinby UI automation',
    );
  }
}
