import { existsSync, readFileSync } from 'node:fs';
import type { AiImageInput } from '@twinby/ai-provider';
import {
  AddIdentityReferenceInputSchema,
  IdentityDraftInputSchema,
  type IdentityModelView,
} from '@twinby/contracts';
import {
  activateIdentityModelVersion,
  addIdentityReference,
  confirmIdentityModel,
  createIdentityDraft,
  deleteIdentityModelVersion,
  getActiveVerifiedSnapshot,
  getCurrentIdentityModel,
  listIdentityModelVersions,
  removeIdentityReference,
  type AppDatabase,
} from '@twinby/database';
import { getLogger } from '@twinby/logging';
import { createProviderFromDb } from './ai-handlers';
import { requireDb } from './db-helpers';

function loadSnapshotPhotos(
  photos: { position: number; localPreviewPath: string }[],
): AiImageInput[] {
  const out: AiImageInput[] = [];
  for (const photo of photos.slice(0, 4)) {
    const path = photo.localPreviewPath;
    if (!path || !existsSync(path)) continue;
    try {
      out.push({
        label: `profile-photo-${photo.position + 1}`,
        mimeType: 'image/jpeg',
        base64: readFileSync(path).toString('base64'),
      });
    } catch {
      // skip unreadable preview
    }
  }
  return out;
}

export function createIdentityHandlers(getDb: () => AppDatabase | null) {
  return {
    getCurrent(): IdentityModelView {
      return getCurrentIdentityModel(requireDb(getDb()));
    },
    listVersions(): IdentityModelView[] {
      return listIdentityModelVersions(requireDb(getDb()));
    },
    deleteVersion(id: unknown): void {
      if (typeof id !== 'string' || !id) {
        throw new Error('Некорректный id версии Identity');
      }
      deleteIdentityModelVersion(requireDb(getDb()), id);
    },
    activateVersion(id: unknown): IdentityModelView {
      if (typeof id !== 'string' || !id) {
        throw new Error('Некорректный id версии Identity');
      }
      return activateIdentityModelVersion(requireDb(getDb()), id);
    },
    createDraft(raw: unknown): IdentityModelView {
      const input = IdentityDraftInputSchema.parse(raw ?? {});
      return createIdentityDraft(requireDb(getDb()), input);
    },
    async analyzeCurrentProfile(): Promise<IdentityModelView> {
      const db = requireDb(getDb());
      const snapshot = getActiveVerifiedSnapshot(db);
      if (!snapshot) {
        throw new Error(
          'Нет verified snapshot Twinby — сначала снимите слепок в Orpheus или через preflight',
        );
      }

      const provider = createProviderFromDb(db, { timeoutMs: 180_000 });
      const photos = loadSnapshotPhotos(snapshot.photos);
      getLogger('ai').info(
        {
          snapshotId: snapshot.id,
          photoCount: photos.length,
          hasBio: Boolean(snapshot.bio?.trim()),
          interests: snapshot.interests?.length ?? 0,
        },
        'Analyzing Twinby snapshot into Identity draft via AI',
      );

      const result = await provider.analyzeOwnProfileIdentity({
        bio: snapshot.bio,
        occupation: snapshot.occupation,
        interests: snapshot.interests,
        relationshipGoal: snapshot.relationshipGoal,
        photos,
      });

      getLogger('ai').info(
        {
          model: result.model,
          latencyMs: result.latencyMs,
          uncertainties: result.analysis.uncertainties,
          realInterests: result.draft.realInterests.length,
        },
        'Identity draft AI analysis complete',
      );

      return createIdentityDraft(db, result.draft);
    },
    addReference(raw: unknown): IdentityModelView {
      const input = AddIdentityReferenceInputSchema.parse(raw);
      return addIdentityReference(requireDb(getDb()), {
        polarity: input.polarity,
        referenceId: input.filePath,
      });
    },
    removeReference(id: unknown): IdentityModelView {
      if (typeof id !== 'string' || !id) {
        throw new Error('Некорректный id референса Identity');
      }
      return removeIdentityReference(requireDb(getDb()), id);
    },
    confirm(): IdentityModelView {
      return confirmIdentityModel(requireDb(getDb()));
    },
  };
}
