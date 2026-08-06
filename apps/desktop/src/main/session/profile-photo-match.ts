import {
  getIndexedPhotoById,
  listIndexedPhotos,
  type AppDatabase,
} from '@twinby/database';
import { hammingDistanceHex } from '@twinby/image-pipeline';

const MAX_HAMMING = 8;

export type SnapshotPhotoDraft = {
  position: number;
  localPreviewPath: string;
  perceptualHash: string;
  matchedPhotoAssetId?: string;
  matchConfidence?: number;
};

function indexedCandidates(db: AppDatabase) {
  return listIndexedPhotos(db, undefined, 500).filter(
    (photo) => photo.perceptualHash && photo.perceptualHash.length >= 8,
  );
}

function bestAssetIdForHash(
  hash: string,
  candidates: ReturnType<typeof indexedCandidates>,
  maxDistance: number,
): { id: string; distance: number } | null {
  let best: { id: string; distance: number } | null = null;
  for (const candidate of candidates) {
    try {
      const distance = hammingDistanceHex(hash, candidate.perceptualHash);
      if (distance <= maxDistance && (!best || distance < best.distance)) {
        best = { id: candidate.id, distance };
      }
    } catch {
      // ignore malformed hashes
    }
  }
  return best;
}

/**
 * Match Twinby snapshot photo hashes to indexed cloud assets by aHash Hamming distance.
 */
export function matchSnapshotPhotosToIndexed(
  db: AppDatabase,
  photos: SnapshotPhotoDraft[],
  maxDistance = MAX_HAMMING,
): SnapshotPhotoDraft[] {
  const candidates = indexedCandidates(db);
  if (candidates.length === 0) {
    return photos;
  }

  return photos.map((photo) => {
    if (!photo.perceptualHash) {
      return photo;
    }
    const best = bestAssetIdForHash(photo.perceptualHash, candidates, maxDistance);
    if (!best) {
      return photo;
    }
    return {
      ...photo,
      matchedPhotoAssetId: best.id,
      matchConfidence: Math.max(0, Math.min(1, 1 - best.distance / 64)),
    };
  });
}

/**
 * Resolve plan photo ids that were stored as pHash fallbacks into indexed asset ids.
 */
export function resolvePlanPhotoAssetIds(
  db: AppDatabase,
  photoIds: string[],
  maxDistance = MAX_HAMMING,
): string[] {
  const candidates = indexedCandidates(db);
  return photoIds.map((id) => {
    if (getIndexedPhotoById(db, id)) {
      return id;
    }
    const best = bestAssetIdForHash(id, candidates, maxDistance);
    return best?.id ?? id;
  });
}
