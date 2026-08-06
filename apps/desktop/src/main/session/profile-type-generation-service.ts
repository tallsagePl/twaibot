import { randomUUID } from 'node:crypto';
import type { ProposedProfileSet } from '@twinby/contracts';
import {
  getCurrentAudienceModel,
  getCurrentIdentityModel,
  listIndexedPhotos,
  listPhotoLookGroups,
  type AppDatabase,
} from '@twinby/database';
import { generateProfileSets } from '@twinby/profile-builder';
import { getLogger } from '@twinby/logging';
import { createProviderFromDb } from '../ipc/ai-handlers';
import { hasApiKey } from '../security/secrets';

function clamp01(n: number): number {
  if (n > 1) return Math.min(1, n / 100);
  return Math.max(0, Math.min(1, n));
}

function placeholderSets(
  db: AppDatabase,
  constraints?: {
    pinnedPhotoIds?: string[];
    forbiddenPhotoIds?: string[];
    freeformNote?: string;
  },
): ProposedProfileSet[] {
  const audience = getCurrentAudienceModel(db);
  const identity = getCurrentIdentityModel(db);
  const indexed = listIndexedPhotos(db, undefined, 200);
  const pinned = constraints?.pinnedPhotoIds ?? [];
  const available =
    pinned.length > 0
      ? pinned
      : indexed.length > 0
        ? indexed.map((p) => p.id)
        : ['photo-placeholder-1', 'photo-placeholder-2', 'photo-placeholder-3'];

  const result = generateProfileSets({
    availablePhotoIds: available,
    pinnedPhotoIds: pinned,
    forbiddenPhotoIds: constraints?.forbiddenPhotoIds,
    maxPhotos: 6,
    city: identity.city,
    occupation: identity.occupation,
    realInterests: identity.realInterests.map((s) => s.statement),
    explicitNonIdentity: identity.explicitNonIdentity.map((s) => s.statement),
    relationshipIntent: identity.relationshipIntent,
    toneHints: constraints?.freeformNote
      ? [constraints.freeformNote]
      : undefined,
  });

  return result.sets.map((set) => ({
    id: set.id,
    name: set.name,
    bio: set.bio,
    brief: `Акцент «${set.name}»: усилить реальные черты Identity без выдуманных фактов.`,
    desiredPhotoVision:
      'Связный набор: ясное лицо, полный рост/lifestyle и кадр с характером под акцент — только из имеющейся библиотеки.',
    strategy: {
      ...set.strategy,
      audienceModelVersion: audience.version,
      identityModelVersion: identity.version,
      userNotes: set.strategy.userNotes,
    },
    photoIds: set.photoIds.filter((id) => !id.startsWith('photo-placeholder')),
    photoRoles: set.photoRoles.filter(
      (r) => !r.photoId.startsWith('photo-placeholder'),
    ),
    strengths: set.strengths,
    weaknesses: [
      ...set.weaknesses,
      'Черновик без ИИ — подключите ключ или перегенерируйте для полного брифа',
    ],
    killerFeatures: set.killerFeatures,
    risks: set.risks,
    authenticityAssessment: {
      ...set.authenticityAssessment,
      identityPreservationScore: clamp01(
        set.authenticityAssessment.identityPreservationScore,
      ),
      strategyAmplificationScore: clamp01(
        set.authenticityAssessment.strategyAmplificationScore,
      ),
    },
    expectedPerformance: {
      ...set.expectedPerformance,
      confidence: clamp01(set.expectedPerformance.confidence),
      assumptions: set.expectedPerformance.assumptions ?? [],
    },
  }));
}

export async function generateProposedProfileSets(
  db: AppDatabase,
  constraints?: {
    pinnedPhotoIds?: string[];
    forbiddenPhotoIds?: string[];
    freeformNote?: string;
  },
): Promise<ProposedProfileSet[]> {
  if (!hasApiKey(db)) {
    return placeholderSets(db, constraints);
  }

  const audience = getCurrentAudienceModel(db);
  const identity = getCurrentIdentityModel(db);
  const forbidden = new Set(constraints?.forbiddenPhotoIds ?? []);
  const photos = listIndexedPhotos(db, undefined, 80).filter(
    (p) => !forbidden.has(p.id),
  );
  const lookGroups = listPhotoLookGroups(db);

  try {
    const provider = createProviderFromDb(db, {
      timeoutMs: 180_000,
      maxOutputTokens: 2600,
    });
    const ai = await provider.proposeProfileTypeSets({
      identity: {
        city: identity.city,
        occupation: identity.occupation,
        relationshipIntent: identity.relationshipIntent,
        realInterests: identity.realInterests.map((s) => s.statement),
        explicitNonIdentity: identity.explicitNonIdentity.map((s) => s.statement),
        aiSummary: identity.aiSummary,
      },
      audience: {
        codeName: audience.codeName,
        summary: audience.summary,
      },
      lookGroups: lookGroups.map((g) => ({
        name: g.name,
        brief: g.brief,
        moodTags: g.moodTags,
        photoIds: g.photoIds,
      })),
      photos: photos.map((p) => ({
        id: p.id,
        fileName: p.fileName,
        description: p.shortDescription,
        signals: p.observedSignals,
      })),
      freeformNote: constraints?.freeformNote,
    });

    if (ai.sets.length < 3) {
      getLogger('ai').warn(
        { count: ai.sets.length },
        'proposeProfileTypeSets returned fewer than 3 sets; falling back',
      );
      return placeholderSets(db, constraints);
    }

    const pinned = (constraints?.pinnedPhotoIds ?? []).filter(
      (id) => !forbidden.has(id),
    );

    return ai.sets.map((set) => {
      const photoIds = [
        ...pinned,
        ...set.photoIds.filter((id) => !pinned.includes(id)),
      ].slice(0, 6);
      return {
        id: randomUUID(),
        name: set.name,
        bio: set.bio,
        brief: set.brief,
        desiredPhotoVision: set.desiredPhotoVision,
        strategy: {
          id: randomUUID(),
          name: set.name,
          primaryTraits: identity.realInterests
            .map((s) => s.statement)
            .slice(0, 2),
          secondaryTraits: identity.realInterests
            .map((s) => s.statement)
            .slice(2, 4),
          suppressedTraits: identity.explicitNonIdentity.map((s) => s.statement),
          forbiddenSignals: identity.explicitNonIdentity.map((s) => s.statement),
          intendedFirstImpression: [set.name],
          intendedEmotionalTone: [set.name],
          intendedConversationHooks: identity.realInterests
            .map((s) => s.statement)
            .slice(0, 1),
          audienceModelVersion: audience.version,
          identityModelVersion: identity.version,
          userNotes: set.brief,
          createdAt: new Date().toISOString(),
        },
        photoIds,
        photoRoles: photoIds.map((photoId, i) => ({
          photoId,
          role:
            i === 0
              ? ('main-face' as const)
              : i === 1
                ? ('full-body' as const)
                : ('lifestyle' as const),
          explanation:
            set.photoReasons[i] ??
            (set.desiredPhotoVision.slice(0, 120) || 'Под бриф типа'),
        })),
        strengths: set.strengths.length
          ? set.strengths
          : [`Акцент: ${set.name}`],
        weaknesses: set.weaknesses,
        killerFeatures: set.strengths.slice(0, 1),
        risks: identity.explicitNonIdentity.map(
          (s) => `Не изображать: ${s.statement}`,
        ),
        authenticityAssessment: {
          identityPreservationScore: 0.75,
          strategyAmplificationScore: 0.35,
          directlySupportedSignalCount: identity.realInterests.length,
          amplifiedSignalCount: 1,
          misleadingSignalCount: 0,
          fabricatedSignalCount: 0,
          blockingConflicts: [],
          warnings:
            photoIds.length < 2
              ? ['Мало подходящих фото в библиотеке для этого типа']
              : [],
        },
        expectedPerformance: {
          confidence: photoIds.length >= 3 ? 0.45 : 0.25,
          assumptions: [
            `Сгенерировано моделью ${ai.model}`,
            'Прогноз черновой — без эксперимента',
          ],
          incomingLikesPerDay: { low: 1, high: 5 },
        },
      } satisfies ProposedProfileSet;
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    getLogger('ai').warn({ err: message }, 'proposeProfileTypeSets failed');
    return placeholderSets(db, constraints);
  }
}

export async function suggestPhotosForProfileType(
  db: AppDatabase,
  input: {
    setName?: string;
    brief?: string;
    desiredPhotoVision?: string;
    limit: number;
    providers?: Array<'google-drive' | 'yandex-disk'>;
  },
): Promise<{ photoIds: string[]; message?: string }> {
  const photos = listIndexedPhotos(db, input.providers, 80);
  if (photos.length === 0) {
    return {
      photoIds: [],
      message:
        'В индексе пока нет фото — откройте Настройки → Хранилище → «Просмотр хранилища»',
    };
  }

  if (!hasApiKey(db)) {
    const shuffled = [...photos].sort(() => Math.random() - 0.5);
    return {
      photoIds: shuffled.slice(0, Math.min(input.limit, shuffled.length)).map((p) => p.id),
      message: 'ИИ недоступен — случайный набор (добавьте API-ключ для подбора по брифу)',
    };
  }

  try {
    const provider = createProviderFromDb(db, {
      timeoutMs: 120_000,
      maxOutputTokens: 1200,
    });
    const lookGroups = listPhotoLookGroups(db);
    const result = await provider.suggestPhotosForBrief({
      setName: input.setName,
      brief: input.brief,
      desiredPhotoVision: input.desiredPhotoVision,
      limit: input.limit,
      lookGroups: lookGroups.map((g) => ({
        name: g.name,
        brief: g.brief,
        moodTags: g.moodTags,
        photoIds: g.photoIds,
      })),
      photos: photos.map((p) => ({
        id: p.id,
        fileName: p.fileName,
        description: p.shortDescription,
        signals: p.observedSignals,
      })),
    });
    return {
      photoIds: result.photoIds,
      message:
        result.message ||
        (result.photoIds.length > 0
          ? `Подобрано ${result.photoIds.length} фото под бриф`
          : 'Не удалось подобрать связный набор'),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    getLogger('ai').warn({ err: message }, 'suggestPhotosForBrief failed');
    const shuffled = [...photos].sort(() => Math.random() - 0.5);
    return {
      photoIds: shuffled.slice(0, Math.min(input.limit, 3)).map((p) => p.id),
      message: `Ошибка ИИ — упрощённый набор. ${message}`,
    };
  }
}
