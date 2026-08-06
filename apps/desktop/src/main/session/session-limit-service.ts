import type { SessionCounters, SessionLimits } from '@twinby/contracts';
import {
  addDailyAiSpendUsd,
  getDailyAiSpendUsd,
  type AppDatabase,
} from '@twinby/database';

export type SessionCapStop = {
  ok: false;
  errorMessage: string;
  remainingProfiles: number;
};

export type SessionCapOk = { ok: true };

export class SessionLimitService {
  private sessionSpendUsd = 0;

  constructor(private readonly getDb: () => AppDatabase) {}

  resetSessionSpend(): void {
    this.sessionSpendUsd = 0;
  }

  getSessionSpendUsd(): number {
    return this.sessionSpendUsd;
  }

  checkAiSpendLimits(aiConfig: {
    sessionSpendingLimitUsd?: number;
    dailySpendingLimitUsd?: number;
  }): string | null {
    if (
      typeof aiConfig.sessionSpendingLimitUsd === 'number' &&
      this.sessionSpendUsd >= aiConfig.sessionSpendingLimitUsd
    ) {
      return `Достигнут лимит расходов сессии ($${aiConfig.sessionSpendingLimitUsd.toFixed(2)})`;
    }
    if (typeof aiConfig.dailySpendingLimitUsd === 'number') {
      const daily = getDailyAiSpendUsd(this.getDb());
      if (daily >= aiConfig.dailySpendingLimitUsd) {
        return `Достигнут дневной лимит расходов AI ($${aiConfig.dailySpendingLimitUsd.toFixed(2)})`;
      }
    }
    return null;
  }

  recordAiSpend(
    db: AppDatabase,
    usdPer1kTokens: number,
    promptTokens?: number,
    completionTokens?: number,
  ): void {
    const tokens = (promptTokens ?? 0) + (completionTokens ?? 0);
    if (!(tokens > 0) || !(usdPer1kTokens > 0)) {
      return;
    }
    const delta = (tokens / 1000) * usdPer1kTokens;
    this.sessionSpendUsd += delta;
    addDailyAiSpendUsd(db, delta);
  }

  /** Duration / likes / dislikes / maxProfiles — stop before capture. */
  checkSessionCaps(input: {
    limits: SessionLimits;
    startedAt?: string;
    processed: number;
    maxProfiles: number;
    counters: SessionCounters;
  }): SessionCapOk | SessionCapStop {
    const { limits, startedAt, processed, maxProfiles, counters } = input;

    if (limits.maxSessionDurationMin > 0 && startedAt) {
      const elapsedMin = (Date.now() - new Date(startedAt).getTime()) / 60_000;
      if (elapsedMin >= limits.maxSessionDurationMin) {
        return {
          ok: false,
          remainingProfiles: Math.max(0, maxProfiles - processed),
          errorMessage: `Достигнут лимит длительности (${limits.maxSessionDurationMin} мин)`,
        };
      }
    }

    const likesHit = limits.maxLikes > 0 && counters.likes >= limits.maxLikes;
    const dislikesHit =
      limits.maxDislikes > 0 && counters.dislikes >= limits.maxDislikes;
    if (processed >= maxProfiles || likesHit || dislikesHit) {
      return {
        ok: false,
        remainingProfiles: 0,
        errorMessage:
          processed >= maxProfiles
            ? `Достигнут лимит анкет (${maxProfiles})`
            : likesHit
              ? `Достигнут лимит likes (${limits.maxLikes})`
              : `Достигнут лимит dislikes (${limits.maxDislikes})`,
      };
    }

    return { ok: true };
  }

  isAutoActionsCapReached(limits: SessionLimits, autoActions: number): boolean {
    return limits.maxAutoActions > 0 && autoActions >= limits.maxAutoActions;
  }
}
