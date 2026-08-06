import {
  CompareToPlanInputSchema,
  type OwnProfileCaptureResultView,
  type ProfileVariantView,
  type VerifiedProfileSnapshotView,
} from '@twinby/contracts';
import {
  deleteVerifiedSnapshot,
  getActiveProfileVariant,
  getActiveVerifiedSnapshot,
  getProfileVariant,
  getVerifiedSnapshot,
  listVerifiedSnapshots,
  resolvePlanProfileVariant,
  updateVerifiedSnapshotDeployment,
  updateVerifiedSnapshotPhotoMatches,
  type AppDatabase,
} from '@twinby/database';
import { comparePlannedToActual } from '@twinby/own-profile';
import { OwnProfileCaptureService } from '../session/own-profile-capture-service';
import {
  toActualSnapshot,
  toPlannedVariant,
} from '../session/profile-deployment';
import {
  matchSnapshotPhotosToIndexed,
  resolvePlanPhotoAssetIds,
} from '../session/profile-photo-match';
import { TwinbyNavigationService } from '../session/twinby-navigation-service';
import { createAppiumHandlers } from './appium-handlers';
import { createTwinbyHandlers } from './twinby-handlers';
import { requireDb } from './db-helpers';

export function createSnapshotHandlers(
  getDb: () => AppDatabase | null,
  getProjectRoot: () => string,
) {
  const appium = createAppiumHandlers(getProjectRoot);
  const twinby = createTwinbyHandlers(getDb, getProjectRoot);
  const navigation = new TwinbyNavigationService({ appium, twinby });
  const captureService = new OwnProfileCaptureService({
    getDb: () => requireDb(getDb()),
    navigation,
    getProjectRoot,
  });

  return {
    async capture(): Promise<OwnProfileCaptureResultView> {
      return captureService.capture();
    },
    getActive(): VerifiedProfileSnapshotView | null {
      return getActiveVerifiedSnapshot(requireDb(getDb()));
    },
    list(): VerifiedProfileSnapshotView[] {
      return listVerifiedSnapshots(requireDb(getDb()));
    },
    compareToPlan(raw: unknown): VerifiedProfileSnapshotView {
      const input = CompareToPlanInputSchema.parse(raw);
      const db = requireDb(getDb());
      const snapshot = getVerifiedSnapshot(db, input.snapshotId);
      if (!snapshot) {
        throw new Error('Слепок не найден');
      }
      const variant = input.profileVariantId
        ? getProfileVariant(db, input.profileVariantId)
        : resolvePlanProfileVariant(db);
      if (!variant) {
        throw new Error(
          'Нет варианта профиля для сверки — создайте сет Orpheus или эксперимент',
        );
      }

      // Re-match against current cloud index (hashes may have been filled after re-index).
      const rematched = matchSnapshotPhotosToIndexed(
        db,
        snapshot.photos.map((p) => ({
          position: p.position,
          localPreviewPath: p.localPreviewPath,
          perceptualHash: p.perceptualHash,
          matchedPhotoAssetId: p.matchedPhotoAssetId,
          matchConfidence: p.matchConfidence,
        })),
      );
      const withMatches = updateVerifiedSnapshotPhotoMatches(
        db,
        snapshot.id,
        rematched,
      );

      const planned = toPlannedVariant(variant);
      planned.plannedProfile.photoAssetIds = resolvePlanPhotoAssetIds(
        db,
        planned.plannedProfile.photoAssetIds,
      );

      const comparison = comparePlannedToActual(
        planned,
        toActualSnapshot(withMatches),
      );
      return updateVerifiedSnapshotDeployment(db, {
        snapshotId: withMatches.id,
        profileVariantId: variant.id,
        deploymentStatus: comparison.deploymentStatus,
        plannedSimilarity: comparison.similarity / 100,
        differencesFromPlan: comparison.differences,
      });
    },
    resolvePlanVariant(): ProfileVariantView | null {
      return resolvePlanProfileVariant(requireDb(getDb()));
    },
    delete(id: unknown): void {
      if (typeof id !== 'string' || !id) {
        throw new Error('Некорректный id слепка');
      }
      deleteVerifiedSnapshot(requireDb(getDb()), id);
    },
    getActiveVariantId(): string | null {
      return getActiveProfileVariant(requireDb(getDb()))?.id ?? null;
    },
  };
}
