import {
  AudienceCorrectionInputSchema,
  AudienceDraftUpdateInputSchema,
  type AudienceDraftSignalInput,
  type AudienceModelView,
  type RelationshipView,
} from '@twinby/contracts';
import {
  applyAudienceCorrectionToRelationship,
  activateAudienceModelVersion,
  confirmAudienceUpdate,
  deleteAudienceModelVersion,
  getCurrentAudienceModel,
  getPreferenceProfile,
  getStoredPreferenceSummary,
  listAudienceModelVersions,
  updateAudienceDraft,
  type AppDatabase,
} from '@twinby/database';
import { getLogger } from '@twinby/logging';
import { createProviderFromDb } from './ai-handlers';
import { requireDb } from './db-helpers';

function slugKey(prefix: string, statement: string, index: number): string {
  const slug = statement
    .toLowerCase()
    .replace(/[^a-zа-яё0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return `${prefix}-${slug || index}`;
}

function toSignals(
  statements: string[],
  polarity: AudienceDraftSignalInput['polarity'],
  category?: AudienceDraftSignalInput['category'],
): AudienceDraftSignalInput[] {
  return statements
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 12)
    .map((statement, index) => ({
      key: slugKey(polarity, statement, index),
      statement,
      polarity,
      category,
      status: 'inferred' as const,
      likelihood: 'probable' as const,
      confidence: 0.7,
      evidence: ['eurydice-preferences'],
      contradictions: [],
      sourceRefs: ['eurydice'],
    }));
}

export function createAudienceHandlers(getDb: () => AppDatabase | null) {
  return {
    getCurrent(): AudienceModelView {
      return getCurrentAudienceModel(requireDb(getDb()));
    },
    listVersions(): AudienceModelView[] {
      return listAudienceModelVersions(requireDb(getDb()));
    },
    deleteVersion(id: unknown): void {
      if (typeof id !== 'string' || !id) {
        throw new Error('Некорректный id версии Audience');
      }
      deleteAudienceModelVersion(requireDb(getDb()), id);
    },
    activateVersion(id: unknown): AudienceModelView {
      if (typeof id !== 'string' || !id) {
        throw new Error('Некорректный id версии Audience');
      }
      return activateAudienceModelVersion(requireDb(getDb()), id);
    },
    updateDraft(raw: unknown): AudienceModelView {
      const input = AudienceDraftUpdateInputSchema.parse(raw ?? {});
      return updateAudienceDraft(requireDb(getDb()), input);
    },
    confirmUpdate(): AudienceModelView {
      return confirmAudienceUpdate(requireDb(getDb()));
    },
    applyCorrection(raw: unknown): RelationshipView {
      const input = AudienceCorrectionInputSchema.parse(raw);
      return applyAudienceCorrectionToRelationship(requireDb(getDb()), input);
    },
    async deriveFromEurydice(): Promise<AudienceModelView> {
      const db = requireDb(getDb());
      const profile = getPreferenceProfile(db);
      const stored = getStoredPreferenceSummary(db);
      const hasNarrative =
        Boolean(profile.narrative.likedDescription?.trim()) ||
        Boolean(profile.narrative.dislikedDescription?.trim()) ||
        Boolean(profile.narrative.hardRejects?.trim()) ||
        Boolean(stored?.summary);

      if (!hasNarrative) {
        throw new Error(
          'В Eurydice пока мало данных: заполните предпочтения или проанализируйте референсы, затем повторите',
        );
      }

      const provider = createProviderFromDb(db, { timeoutMs: 120_000 });
      getLogger('ai').info(
        {
          hasSummary: Boolean(stored?.summary),
          summaryStale: stored?.stale ?? null,
        },
        'Deriving Audience Model from Eurydice via AI',
      );

      const result = await provider.deriveAudienceFromEurydice({
        preferenceProfile: profile,
        preferenceSummary: stored?.summary ?? null,
      });

      const current = getCurrentAudienceModel(db);
      const removeSignalIds = [
        ...current.positiveSignals,
        ...current.negativeSignals,
        ...current.hardRejects,
        ...current.toleratedVariations,
        ...current.visualCore,
        ...current.presentationPatterns,
        ...current.secondaryInterests,
      ].map((s) => s.id);

      let important = (result.analysis.importantSignals ?? [])
        .map((s) => s.trim())
        .filter(Boolean);
      let likes = (result.analysis.positiveSignals ?? [])
        .map((s) => s.trim())
        .filter(Boolean);
      // If the model skipped importantSignals, fall back to Eurydice preference skills.
      if (important.length === 0 && profile.narrative.importantSkills?.length) {
        important = profile.narrative.importantSkills
          .map((s) => s.trim())
          .filter(Boolean);
      }
      // Keep likes disjoint from important.
      const importantSet = new Set(important.map((s) => s.toLowerCase()));
      likes = likes.filter((s) => !importantSet.has(s.toLowerCase()));

      const addSignals: AudienceDraftSignalInput[] = [
        ...toSignals(important, 'positive', 'visual-core'),
        ...toSignals(likes, 'positive'),
        ...toSignals(result.analysis.negativeSignals, 'negative'),
        ...toSignals(result.analysis.hardRejects, 'hard-reject'),
      ];

      const view = updateAudienceDraft(db, {
        summary: result.analysis.summary.trim(),
        removeSignalIds,
        addSignals,
      });

      getLogger('ai').info(
        {
          model: result.model,
          latencyMs: result.latencyMs,
          signals: addSignals.length,
        },
        'Audience draft derived from Eurydice',
      );

      return view;
    },
  };
}
