import {
  ApplySessionFeedbackSchema,
  DeleteHistorySessionSchema,
  HistorySessionProfilesQuerySchema,
  SaveHistoryProfileFeedbackSchema,
  SubmitSessionFeedbackSchema,
  type ApplySessionFeedback,
  type DeleteHistorySession,
  type HistorySessionProfile,
  type HistorySessionSummary,
  type PaginatedHistorySessionProfiles,
  type PreferenceProfile,
  type SaveHistoryProfileFeedback,
  type SessionFeedbackAnalysis,
  type SubmitSessionFeedback,
} from '@twinby/contracts';
import {
  deleteHistorySession,
  getHistorySessionProfile,
  getPreferenceProfile,
  listHistorySessions,
  listSessionFeedbackItems,
  listSessionProfiles,
  markHistoryFeedbackSent,
  savePreferenceProfile,
  updateHistoryProfileFeedback,
  type AppDatabase,
} from '@twinby/database';
import { getLogger } from '@twinby/logging';
import { createProviderFromDb } from './ai-handlers';
import {
  getHistoryRoot,
  photoPathsToDataUrls,
  purgeSessionDetail,
  resolveModelDescription,
} from '../session/history-detail-store';

function withResolvedModelDescriptions(
  historyRoot: string,
  page: PaginatedHistorySessionProfiles,
): PaginatedHistorySessionProfiles {
  return {
    ...page,
    items: page.items.map((item) => ({
      ...item,
      modelExcerpt:
        resolveModelDescription({
          historyRoot,
          sessionId: item.sessionId,
          eventId: item.id,
          reasons: item.reasons,
          fallbackExcerpt: item.modelExcerpt,
        }) ?? item.modelExcerpt,
    })),
  };
}

export function createHistoryHandlers(
  getDb: () => AppDatabase,
  getProjectRoot: () => string,
) {
  ensureHistoryStorage(getProjectRoot);

  return {
    listSessions(): HistorySessionSummary[] {
      return listHistorySessions(getDb());
    },

    listSessionProfiles(raw: unknown): PaginatedHistorySessionProfiles {
      const query = HistorySessionProfilesQuerySchema.parse(raw);
      const historyRoot = getHistoryRoot(getProjectRoot());
      return withResolvedModelDescriptions(
        historyRoot,
        listSessionProfiles(getDb(), query, photoPathsToDataUrls),
      );
    },

    saveProfileFeedback(raw: unknown): HistorySessionProfile {
      const input: SaveHistoryProfileFeedback =
        SaveHistoryProfileFeedbackSchema.parse(raw);
      const db = getDb();
      updateHistoryProfileFeedback(db, {
        eventId: input.eventId,
        decision: input.decision,
        comment: input.comment,
      });
      const found = getHistorySessionProfile(db, input.eventId, photoPathsToDataUrls);
      if (!found) {
        throw new Error('Анкета не найдена после сохранения правки');
      }
      const historyRoot = getHistoryRoot(getProjectRoot());
      return {
        ...found,
        modelExcerpt:
          resolveModelDescription({
            historyRoot,
            sessionId: found.sessionId,
            eventId: found.id,
            reasons: found.reasons,
            fallbackExcerpt: found.modelExcerpt,
          }) ?? found.modelExcerpt,
      };
    },

    async submitSessionFeedback(raw: unknown): Promise<SessionFeedbackAnalysis> {
      const input: SubmitSessionFeedback = SubmitSessionFeedbackSchema.parse(raw);
      const db = getDb();
      const items = listSessionFeedbackItems(db, input.sessionId);
      if (items.length === 0) {
        throw new Error(
          'Нет правок для отправки — отметьте «согласен» / лайк / дизлайк хотя бы у одной анкеты',
        );
      }

      // Prefer corrections + comments; cap volume so the request stays under timeout.
      const MAX_FEEDBACK_ITEMS = 40;
      const ranked = [...items].sort((a, b) => {
        const score = (item: (typeof items)[number]) => {
          let s = 0;
          if (!item.agreed && item.userDecision) s += 4;
          if (item.comment?.trim()) s += 2;
          if (item.agreed) s += 1;
          return s;
        };
        return score(b) - score(a);
      });
      const capped = ranked.slice(0, MAX_FEEDBACK_ITEMS);

      const provider = createProviderFromDb(db, {
        maxOutputTokens: 1600,
        timeoutMs: 300_000,
      });
      const preferences = getPreferenceProfile(db);
      getLogger('session').info(
        {
          sessionId: input.sessionId,
          count: capped.length,
          totalMarked: items.length,
        },
        'Submitting session feedback to AI',
      );

      const analysis = await provider.analyzeSessionFeedback({
        sessionId: input.sessionId,
        preferenceProfile: preferences,
        items: capped.map((item) => ({
          displayName: item.displayName,
          bio: item.bio,
          modelDecision: item.modelDecision,
          modelExcerpt: item.modelExcerpt,
          userDecision: item.userDecision,
          agreed: item.agreed,
          comment: item.comment,
        })),
        revisionNote: input.revisionNote,
        previousUnderstanding: input.previousUnderstanding,
      });

      markHistoryFeedbackSent(db, input.sessionId, new Date().toISOString());
      return analysis;
    },

    applySessionFeedback(raw: unknown): PreferenceProfile {
      const input: ApplySessionFeedback = ApplySessionFeedbackSchema.parse(raw);
      if (!input.accept) {
        throw new Error('Чтобы применить правки, нужно согласие');
      }
      const db = getDb();
      const patch = input.narrativePatch ?? {};
      const hasPatch = Object.values(patch).some(
        (value) => typeof value === 'string' && value.trim().length > 0,
      );

      let profile = getPreferenceProfile(db);
      if (hasPatch) {
        const current = profile;
        const mergeField = (currentValue: string, delta?: string): string | undefined => {
          if (!delta?.trim()) {
            return undefined;
          }
          const next = delta.trim();
          if (!currentValue.trim()) {
            return next;
          }
          if (currentValue.includes(next)) {
            return currentValue;
          }
          return `${currentValue.trim()}\n${next}`;
        };

        const narrative: {
          likedDescription?: string;
          dislikedDescription?: string;
          priorities?: string;
          hardRejects?: string;
          uncertaintyPolicy?: string;
        } = {};
        const liked = mergeField(
          current.narrative.likedDescription,
          patch.likedDescription,
        );
        const disliked = mergeField(
          current.narrative.dislikedDescription,
          patch.dislikedDescription,
        );
        const priorities = mergeField(current.narrative.priorities, patch.priorities);
        const hardRejects = mergeField(
          current.narrative.hardRejects,
          patch.hardRejects,
        );
        const uncertainty = mergeField(
          current.narrative.uncertaintyPolicy,
          patch.uncertaintyPolicy,
        );
        if (liked !== undefined) narrative.likedDescription = liked;
        if (disliked !== undefined) narrative.dislikedDescription = disliked;
        if (priorities !== undefined) narrative.priorities = priorities;
        if (hardRejects !== undefined) narrative.hardRejects = hardRejects;
        if (uncertainty !== undefined) narrative.uncertaintyPolicy = uncertainty;

        profile = savePreferenceProfile(db, {
          name: current.name,
          narrative,
        });
      }

      // After user agrees — collapse to lite history like older sessions.
      purgeSessionDetail(db, getHistoryRoot(getProjectRoot()), input.sessionId);
      getLogger('session').info(
        { sessionId: input.sessionId },
        'Session detail purged after feedback accepted',
      );

      return profile;
    },

    deleteSession(raw: unknown): void {
      const input: DeleteHistorySession = DeleteHistorySessionSchema.parse(raw);
      const db = getDb();
      const historyRoot = getHistoryRoot(getProjectRoot());
      purgeSessionDetail(db, historyRoot, input.sessionId);
      deleteHistorySession(db, input.sessionId);
      getLogger('session').info(
        { sessionId: input.sessionId },
        'History session deleted',
      );
    },
  };
}

export function ensureHistoryStorage(getProjectRoot: () => string): string {
  return getHistoryRoot(getProjectRoot());
}
