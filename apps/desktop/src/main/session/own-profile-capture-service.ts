import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type {
  OwnProfileCaptureResultView,
  VerifiedProfileSnapshotView,
} from '@twinby/contracts';
import { resolveAppPaths } from '@twinby/config';
import {
  getActiveExperiment,
  getActiveVerifiedSnapshot,
  getPendingProfileChange,
  insertVerifiedProfileSnapshot,
  resolvePlanProfileVariant,
  setPendingProfileChange,
  type AppDatabase,
} from '@twinby/database';
import { SharpImagePipeline } from '@twinby/image-pipeline';
import { getLogger } from '@twinby/logging';
import { comparePlannedToActual } from '@twinby/own-profile';
import { parseOwnProfileEdit } from '@twinby/twinby-adapter';
import { toActualSnapshot, toPlannedVariant } from './profile-deployment';
import { matchSnapshotPhotosToIndexed } from './profile-photo-match';
import type { TwinbyNavigationService } from './twinby-navigation-service';

export interface VerifiedProfileSnapshotDraft {
  bio: string;
  occupation?: string;
  interests?: string[];
  relationshipGoal?: string;
  photos: Array<{
    position: number;
    localPreviewPath: string;
    perceptualHash: string;
  }>;
  capturedAt: string;
}

/**
 * Own Twinby profile snapshot from edit screen (Мои фото + Био).
 * Read-only: no profile mutations. Exit: 2× Back from edit → nav,
 * or preview → swipe down → Back reverse.
 *
 * On change during a running experiment → pending profile-change (§24.5),
 * never auto-stop without user confirmation.
 */
export class OwnProfileCaptureService {
  private readonly images = new SharpImagePipeline();

  constructor(
    private readonly deps: {
      getDb: () => AppDatabase;
      navigation: TwinbyNavigationService;
      getProjectRoot: () => string;
    },
  ) {}

  async capture(): Promise<OwnProfileCaptureResultView> {
    const actions = await this.deps.navigation.createActionExecutor();
    if (!actions) {
      throw new Error('Locator profile Twinby не найден');
    }

    const screen = await this.deps.navigation.openOwnProfile({ openPreview: false });
    if (screen.type !== 'own-profile-edit') {
      throw new Error(
        `Ожидался own-profile-edit, получен ${screen.type}. ` +
          'Проверьте accessibility-id profilePage-ProfileWidget-Avatar.',
      );
    }

    const source = await actions.getPageSource();
    const parsed = parseOwnProfileEdit(source);
    if (!parsed.bio.trim()) {
      throw new Error('Не удалось прочитать bio с экрана редактирования');
    }
    if (parsed.photos.length === 0) {
      throw new Error('Не найдены слоты фото (Главное фото / 1..N)');
    }

    const png = await actions.takeScreenshotPng();
    const paths = resolveAppPaths({ projectRoot: this.deps.getProjectRoot() });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outDir = join(paths.temporary, 'own-profile', stamp);
    mkdirSync(outDir, { recursive: true });

    const photos: VerifiedProfileSnapshotDraft['photos'] = [];
    for (const slot of parsed.photos) {
      const outPath = join(outDir, `photo-${slot.position}.jpg`);
      const processed = await this.images.process(png, outPath, {
        crop: {
          left: slot.bounds.left,
          top: slot.bounds.top,
          width: slot.bounds.width,
          height: slot.bounds.height,
        },
        maxWidth: 640,
        maxHeight: 640,
        quality: 62,
        format: 'jpeg',
      });
      photos.push({
        position: slot.position,
        localPreviewPath: processed.path,
        perceptualHash: processed.perceptualHash,
      });
    }

    const draft: VerifiedProfileSnapshotDraft = {
      bio: parsed.bio,
      occupation: parsed.financeLine,
      photos,
      capturedAt: new Date().toISOString(),
    };

    // Optional verify via preview then reverse exit
    try {
      const profile = await this.deps.navigation.resolveLocatorProfile();
      const previewBtn = profile?.navigation.ownProfilePreviewButton;
      if (previewBtn?.[0]) {
        await actions.tapNav(previewBtn);
        await this.deps.navigation.returnToBottomNav({ fromPreview: true });
      } else {
        await this.deps.navigation.leaveChatOrProfileEdit();
      }
    } catch {
      await this.deps.navigation.returnToBottomNav();
    }

    return this.persistIfChanged(draft);
  }

  persistIfChanged(draft: VerifiedProfileSnapshotDraft): OwnProfileCaptureResultView {
    const db = this.deps.getDb();
    const last = getActiveVerifiedSnapshot(db);
    const comparison = this.compareToLast(draft, last);
    if (!comparison.changed) {
      if (!last) {
        throw new Error('Не удалось сохранить слепок профиля');
      }
      return {
        snapshot: last,
        changed: false,
        reason: comparison.reason,
        pendingProfileChange: Boolean(getPendingProfileChange(db)),
      };
    }

    const photos = matchSnapshotPhotosToIndexed(db, draft.photos);
    const planVariant = resolvePlanProfileVariant(db);

    let deploymentStatus: VerifiedProfileSnapshotView['deploymentStatus'] =
      'not-verified';
    let plannedSimilarity: number | undefined;
    let differencesFromPlan: string[] = [];
    let profileVariantId: string | undefined;

    if (planVariant) {
      const provisional: VerifiedProfileSnapshotView = {
        id: 'provisional',
        profileVariantId: planVariant.id,
        capturedAt: draft.capturedAt,
        bio: draft.bio,
        occupation: draft.occupation,
        interests: draft.interests ?? [],
        relationshipGoal: draft.relationshipGoal,
        differencesFromPlan: [],
        deploymentStatus: 'not-verified',
        source: 'twinby-profile-capture',
        photos: photos.map((p) => ({
          position: p.position,
          localPreviewPath: p.localPreviewPath,
          perceptualHash: p.perceptualHash,
          matchedPhotoAssetId: p.matchedPhotoAssetId,
          matchConfidence: p.matchConfidence,
        })),
      };
      const comparison = comparePlannedToActual(
        toPlannedVariant(planVariant),
        toActualSnapshot(provisional),
      );
      deploymentStatus = comparison.deploymentStatus;
      plannedSimilarity = comparison.similarity / 100;
      differencesFromPlan = comparison.differences;
      profileVariantId = planVariant.id;
    }

    const snapshot = insertVerifiedProfileSnapshot(db, {
      profileVariantId,
      bio: draft.bio,
      occupation: draft.occupation,
      interests: draft.interests,
      relationshipGoal: draft.relationshipGoal,
      deploymentStatus,
      plannedSimilarity,
      differencesFromPlan,
      photos,
    });

    const pending = this.maybeQueueProfileChange(last, snapshot, comparison.reason);
    return {
      snapshot,
      changed: true,
      reason: comparison.reason,
      pendingProfileChange: pending,
    };
  }

  compareToLast(
    current: VerifiedProfileSnapshotDraft,
    last: VerifiedProfileSnapshotView | null = getActiveVerifiedSnapshot(
      this.deps.getDb(),
    ),
  ): { changed: boolean; reason?: string } {
    if (!last) {
      return { changed: true, reason: 'Нет предыдущего слепка' };
    }
    if ((last.bio ?? '').trim() !== (current.bio ?? '').trim()) {
      return { changed: true, reason: 'Изменилось bio' };
    }
    if ((last.occupation ?? '') !== (current.occupation ?? '')) {
      return { changed: true, reason: 'Изменилась occupation' };
    }
    if ((last.relationshipGoal ?? '') !== (current.relationshipGoal ?? '')) {
      return { changed: true, reason: 'Изменилась цель отношений' };
    }
    const lastHashes = last.photos
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((p) => p.perceptualHash);
    const nextHashes = current.photos
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((p) => p.perceptualHash);
    if (lastHashes.length !== nextHashes.length) {
      return { changed: true, reason: 'Изменилось число фото' };
    }
    for (let i = 0; i < lastHashes.length; i++) {
      if (lastHashes[i] !== nextHashes[i]) {
        return { changed: true, reason: `Изменилось фото #${i + 1}` };
      }
    }
    return { changed: false, reason: 'Слепок совпадает с последним' };
  }

  private maybeQueueProfileChange(
    previous: VerifiedProfileSnapshotView | null,
    next: VerifiedProfileSnapshotView,
    reason?: string,
  ): boolean {
    const db = this.deps.getDb();
    const experiment = getActiveExperiment(db);
    if (!experiment || experiment.status !== 'running') {
      return false;
    }
    // First snapshot ever during a test is not a mid-test change.
    if (!previous) {
      return false;
    }
    const pending = {
      experimentId: experiment.id,
      previousSnapshotId: previous.id,
      newSnapshotId: next.id,
      reason: reason ?? 'Обнаружено изменение профиля Twinby',
      detectedAt: new Date().toISOString(),
    };
    setPendingProfileChange(db, pending);
    getLogger('session').warn(
      {
        experimentId: experiment.id,
        previousSnapshotId: previous.id,
        newSnapshotId: next.id,
        reason: pending.reason,
      },
      'Profile change detected during experiment — awaiting user confirmation',
    );
    return true;
  }
}
