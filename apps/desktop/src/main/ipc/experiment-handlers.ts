import {
  CompareExperimentsInputSchema,
  CompleteExperimentInputSchema,
  ConfirmProfileChangeInputSchema,
  CreateExperimentFromSnapshotInputSchema,
  CreateExperimentInputSchema,
  ResolvePendingProfileChangeInputSchema,
  SavePostFeedbackInputSchema,
  SavePreFeedbackInputSchema,
  StartExperimentInputSchema,
  type PendingProfileChangeView,
  type ProfileExperimentView,
  type RecommendStopView,
  type ResolvePendingProfileChangeResult,
} from '@twinby/contracts';
import { computeExperimentMetrics } from '@twinby/analytics';
import {
  clearPendingProfileChange,
  completeExperiment,
  confirmProfileChangeDuringExperiment,
  createExperiment,
  createExperimentFromSnapshot,
  getActiveExperiment,
  getExperiment,
  getPendingProfileChange,
  listExperimentsByIds,
  listRelationships,
  resolvePendingProfileChange,
  saveExperimentPostFeedback,
  saveExperimentPreFeedback,
  startExperiment,
  type AppDatabase,
} from '@twinby/database';
import { requireDb } from './db-helpers';

export function createExperimentHandlers(getDb: () => AppDatabase | null) {
  return {
    create(raw: unknown): ProfileExperimentView {
      const input = CreateExperimentInputSchema.parse(raw);
      return createExperiment(requireDb(getDb()), input);
    },
    createFromSnapshot(raw?: unknown): ProfileExperimentView {
      const input = CreateExperimentFromSnapshotInputSchema.parse(raw ?? {});
      return createExperimentFromSnapshot(requireDb(getDb()), input);
    },
    savePreFeedback(raw: unknown): ProfileExperimentView {
      const input = SavePreFeedbackInputSchema.parse(raw);
      return saveExperimentPreFeedback(requireDb(getDb()), input);
    },
    start(raw: unknown): ProfileExperimentView {
      const input =
        typeof raw === 'string'
          ? StartExperimentInputSchema.parse({ experimentId: raw })
          : StartExperimentInputSchema.parse(raw);
      // Starting a new test clears a stale pending change for another experiment.
      const db = requireDb(getDb());
      const pending = getPendingProfileChange(db);
      if (pending && pending.experimentId !== input.experimentId) {
        clearPendingProfileChange(db);
      }
      return startExperiment(db, input.experimentId, {
        allowImperfectDeployment: input.allowImperfectDeployment,
      });
    },
    getActive(): ProfileExperimentView | null {
      return getActiveExperiment(requireDb(getDb()));
    },
    recommendStop(experimentId: unknown): RecommendStopView {
      if (typeof experimentId !== 'string' || !experimentId) {
        throw new Error('Некорректный id эксперимента');
      }
      const db = requireDb(getDb());
      const experiment = getExperiment(db, experimentId);
      if (!experiment) {
        throw new Error('Эксперимент не найден');
      }

      const related = listRelationships(db, { limit: 200, offset: 0 }).filter(
        (r) => r.experimentId === experimentId,
      );
      const computed = computeExperimentMetrics(
        related.map((r, index) => ({
          id: `${r.id}-${index}`,
          type:
            r.currentStage === 'incoming-like'
              ? ('incoming-like' as const)
              : r.currentStage === 'matched'
                ? ('match' as const)
                : r.currentStage === 'conversation-started'
                  ? ('conversation-started' as const)
                  : r.currentStage === 'substantive-conversation'
                    ? ('substantive-conversation' as const)
                    : r.currentStage === 'telegram-exchanged'
                      ? ('telegram-exchanged' as const)
                      : r.currentStage === 'date-proposed'
                        ? ('date-proposed' as const)
                        : r.currentStage === 'date-scheduled'
                          ? ('date-scheduled' as const)
                          : r.currentStage === 'date-completed'
                            ? ('date-completed' as const)
                            : ('incoming-like' as const),
          occurredAt: r.updatedAt,
          audienceFit: r.audienceFit.finalLabel,
          relationshipId: r.id,
        })),
      );

      const incoming = computed.totals.incomingLikes || experiment.metrics?.incomingLikes || 0;
      const target =
        computed.totals.targetIncomingLikes || experiment.metrics?.targetIncomingLikes || 0;
      const days = computed.activeDays || experiment.metrics?.activeDays || 0;

      if (days >= experiment.targetDurationDays && target >= 3) {
        return {
          experimentId,
          recommendation: 'stop-positive',
          explanation:
            'Сильный сигнал целевых входящих лайков (core+acceptable) — можно завершить тест досрочно.',
          confidence: Math.max(0.55, computed.confidence),
        };
      }
      if (days >= experiment.maxDurationDays && incoming === 0) {
        return {
          experimentId,
          recommendation: 'stop-negative',
          explanation:
            'Нулевой результат за максимальный срок — вероятно слабый профиль; рассмотрите другой вариант.',
          confidence: Math.max(0.55, computed.confidence),
        };
      }
      if (days < experiment.minDurationDays) {
        return {
          experimentId,
          recommendation: 'continue',
          explanation: 'Ещё рано: не набран минимальный срок теста.',
          confidence: 0.8,
        };
      }
      return {
        experimentId,
        recommendation: 'continue',
        explanation: 'Сигнал смешанный — продолжайте до целевого срока. Сырые метрики считаются в коде.',
        confidence: 0.5,
      };
    },
    complete(raw: unknown): ProfileExperimentView {
      const input = CompleteExperimentInputSchema.parse(raw);
      const db = requireDb(getDb());
      const view = completeExperiment(db, input);
      const pending = getPendingProfileChange(db);
      if (pending?.experimentId === input.experimentId) {
        clearPendingProfileChange(db);
      }
      return view;
    },
    confirmProfileChange(raw: unknown): ProfileExperimentView {
      const input = ConfirmProfileChangeInputSchema.parse(raw);
      const db = requireDb(getDb());
      const view = confirmProfileChangeDuringExperiment(db, input);
      clearPendingProfileChange(db);
      return view;
    },
    getPendingProfileChange(): PendingProfileChangeView | null {
      return getPendingProfileChange(requireDb(getDb()));
    },
    resolvePendingProfileChange(raw: unknown): ResolvePendingProfileChangeResult {
      const input = ResolvePendingProfileChangeInputSchema.parse(raw);
      return resolvePendingProfileChange(requireDb(getDb()), input);
    },
    savePostFeedback(raw: unknown): ProfileExperimentView {
      const input = SavePostFeedbackInputSchema.parse(raw);
      return saveExperimentPostFeedback(requireDb(getDb()), input);
    },
    compare(raw: unknown): ProfileExperimentView[] {
      const input = CompareExperimentsInputSchema.parse(raw);
      return listExperimentsByIds(requireDb(getDb()), input.experimentIds);
    },
  };
}
