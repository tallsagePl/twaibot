import { randomUUID } from 'node:crypto';
import {
  AuditVariantInputSchema,
  CreatePhotoPlanInputSchema,
  ProfileGenerationConstraintsSchema,
  RegenerateAllInputSchema,
  RegeneratePhotosKeepIdeaInputSchema,
  ReorderKeepPhotosInputSchema,
  RequestPhotoEditPreviewInputSchema,
  SaveVariantInputSchema,
  SuggestPhotosInputSchema,
  type PhotoEditPreviewView,
  type PhotoPlanView,
  type ProfileAssessmentView,
  type ProfileVariantView,
  type ProposedProfileSet,
  type SuggestPhotosResult,
} from '@twinby/contracts';
import {
  getProfileVariant,
  listCloudConnections,
  listIndexedPhotos,
  saveProfileVariant,
  type AppDatabase,
} from '@twinby/database';
import { StubProfileAuditService } from '@twinby/profile-auditor';
import {
  generateProposedProfileSets,
  suggestPhotosForProfileType,
} from '../session/profile-type-generation-service';
import { notImplemented, requireDb } from './db-helpers';

function clamp01(n: number): number {
  if (n > 1) {
    return Math.min(1, n / 100);
  }
  return Math.max(0, Math.min(1, n));
}

export function createOrpheusHandlers(getDb: () => AppDatabase | null) {
  const auditor = new StubProfileAuditService();

  return {
    async generateProfileSets(raw?: unknown): Promise<ProposedProfileSet[]> {
      const input = ProfileGenerationConstraintsSchema.parse(raw ?? {});
      return generateProposedProfileSets(requireDb(getDb()), input);
    },
    async regenerateAll(raw?: unknown): Promise<ProposedProfileSet[]> {
      const input = RegenerateAllInputSchema.parse(raw ?? {});
      return generateProposedProfileSets(requireDb(getDb()), input.constraints);
    },
    async regeneratePhotosKeepIdea(raw: unknown): Promise<ProposedProfileSet> {
      const input = RegeneratePhotosKeepIdeaInputSchema.parse(raw);
      const db = requireDb(getDb());
      const sets = await generateProposedProfileSets(db, input.constraints);
      const base = sets.find((s) => s.id === input.profileSetId) ?? sets[0];
      if (!base) {
        throw new Error('Не удалось сгенерировать сет');
      }
      const picked = await suggestPhotosForProfileType(db, {
        setName: base.name,
        brief: base.brief,
        desiredPhotoVision: base.desiredPhotoVision,
        limit: 6,
      });
      const photoIds =
        picked.photoIds.length > 0 ? picked.photoIds : base.photoIds;
      return {
        ...base,
        id: input.profileSetId,
        photoIds,
        photoRoles: photoIds.map((photoId, i) => ({
          photoId,
          role: base.photoRoles[i]?.role ?? 'lifestyle',
          explanation:
            base.photoRoles[i]?.explanation ??
            (base.desiredPhotoVision.slice(0, 120) || 'Под бриф типа'),
        })),
      };
    },
    async reorderKeepPhotos(raw: unknown): Promise<ProposedProfileSet> {
      const input = ReorderKeepPhotosInputSchema.parse(raw);
      const sets = await generateProposedProfileSets(requireDb(getDb()), {
        pinnedPhotoIds: input.photoIds,
      });
      const base = sets[0];
      if (!base) {
        throw new Error('Не удалось переупорядочить сет');
      }
      return {
        ...base,
        id: input.profileSetId,
        photoIds: input.photoIds,
      };
    },
    async suggestPhotos(raw?: unknown): Promise<SuggestPhotosResult> {
      const input = SuggestPhotosInputSchema.parse(raw ?? {});
      const db = requireDb(getDb());
      const connected = listCloudConnections(db).filter((c) => c.connected);
      const providers =
        input.providers && input.providers.length > 0
          ? input.providers
          : connected.map((c) => c.provider);
      const available = connected.filter((c) => providers.includes(c.provider));
      if (available.length === 0) {
        return {
          needsStorage: true,
          photos: [],
          previews: {},
          message: 'Подключите хранилище',
        };
      }

      const picked = await suggestPhotosForProfileType(db, {
        setName: input.setName,
        brief: input.brief,
        desiredPhotoVision: input.desiredPhotoVision,
        limit: input.limit,
        providers: available.map((c) => c.provider),
      });

      if (picked.photoIds.length === 0) {
        return {
          needsStorage: false,
          photos: [],
          previews: {},
          message: picked.message,
        };
      }

      const byId = new Map(
        listIndexedPhotos(
          db,
          available.map((c) => c.provider),
          200,
        ).map((p) => [p.id, p]),
      );
      const photos = picked.photoIds
        .map((id) => byId.get(id))
        .filter((p): p is NonNullable<typeof p> => Boolean(p));

      return {
        needsStorage: false,
        photos,
        previews: {},
        message: picked.message || `Подобрано ${photos.length} фото`,
      };
    },
    saveVariant(raw: unknown): ProfileVariantView {
      const input = SaveVariantInputSchema.parse(raw);
      return saveProfileVariant(requireDb(getDb()), input);
    },
    async auditVariant(raw: unknown): Promise<ProfileAssessmentView> {
      const input = AuditVariantInputSchema.parse(raw);
      const db = requireDb(getDb());
      const variant = getProfileVariant(db, input.profileVariantId);
      if (!variant) {
        throw new Error('Вариант профиля не найден');
      }
      const result = await auditor.audit({
        profileId: variant.id,
        name: variant.name,
        bio: variant.bio,
        photoIds: variant.photoIds,
      });
      return {
        id: randomUUID(),
        profileVariantId: variant.id,
        coherence: clamp01(result.overallScore),
        authenticity: clamp01(result.authenticity.identityPreservationScore),
        targetAudienceAlignment: clamp01(result.overallScore * 0.9),
        firstImpressionStrength: clamp01(result.overallScore * 0.85),
        conversationHookStrength: clamp01(result.overallScore * 0.7),
        dominantSignals: result.strengths,
        conflictingSignals: result.authenticity.blockingConflicts,
        repeatedSignals: [],
        missingRoles: result.missingPhotos,
        createdAt: result.assessedAt,
      };
    },
    createPhotoPlan(raw?: unknown): PhotoPlanView {
      const input = CreatePhotoPlanInputSchema.parse(raw ?? {});
      return {
        id: randomUUID(),
        profileVariantId: input.profileVariantId,
        createdAt: new Date().toISOString(),
        tasks: [
          {
            id: randomUUID(),
            title: 'Главное фото с лицом',
            goal: 'Ясное лицо в первом кадре',
            targetRole: 'main-face',
            expectedImpact: 'high',
            effort: { money: 'low', time: 'medium', coordination: 'low' },
            feasibility: 0.8,
            locationIdea: 'Дневной свет у окна',
            clothingIdea: 'Нейтральный верх',
            poseIdea: 'Прямой взгляд в камеру',
            emotionIdea: 'Спокойная уверенность',
            photographerIdea: 'Селфи или друг',
            minimalVersion: 'Чёткий портрет без фильтров',
            improvedVersion: 'Портрет с мягким светом и чистым фоном',
            whyNeeded: ['Главное фото должно показывать лицо'],
            risks: ['Сильный ретуш снижает доверие'],
          },
          {
            id: randomUUID(),
            title: 'Полноростовой кадр',
            goal: 'Показать телосложение и стиль',
            targetRole: 'full-body',
            expectedImpact: 'high',
            effort: { money: 'low', time: 'medium', coordination: 'medium' },
            feasibility: 0.7,
            locationIdea: 'Улица / парк',
            clothingIdea: 'Повседневный образ',
            poseIdea: 'Естественная стойка',
            emotionIdea: 'Расслабленность',
            photographerIdea: 'Друг с телефона',
            minimalVersion: 'Фото в полный рост',
            improvedVersion: 'Полный рост + контекст места',
            whyNeeded: ['Аудитория оценивает силуэт'],
            risks: [],
          },
        ],
      };
    },
    requestPhotoEditPreview(raw: unknown): PhotoEditPreviewView {
      RequestPhotoEditPreviewInputSchema.parse(raw);
      notImplemented(
        'Превью обработки фото — только по явному запросу (этап 11), AI ещё не подключён',
      );
    },
  };
}
