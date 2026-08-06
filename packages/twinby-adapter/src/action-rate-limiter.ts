import type { SessionLimits } from '@twinby/contracts';

/**
 * Rate-limits UI actions (photo next, open details, like/dislike).
 * Fixed intervals only — no random stealth jitter.
 * Turbo/emulator: minActionIntervalMs can be near-zero.
 */
export class ActionRateLimiter {
  private timestamps: number[] = [];
  private lastActionAt = Number.NEGATIVE_INFINITY;

  constructor(private limits: Pick<SessionLimits, 'maxActionsPerMinute' | 'minActionIntervalMs'>) {}

  updateLimits(limits: Pick<SessionLimits, 'maxActionsPerMinute' | 'minActionIntervalMs'>): void {
    this.limits = limits;
  }

  canAct(now = Date.now()): boolean {
    this.prune(now);
    if (now - this.lastActionAt < this.limits.minActionIntervalMs) {
      return false;
    }
    return this.timestamps.length < this.limits.maxActionsPerMinute;
  }

  msUntilNextAction(now = Date.now()): number {
    this.prune(now);
    const byInterval = Math.max(0, this.limits.minActionIntervalMs - (now - this.lastActionAt));
    if (this.timestamps.length < this.limits.maxActionsPerMinute) {
      return byInterval;
    }
    const oldest = this.timestamps[0] ?? now;
    const byMinute = Math.max(0, 60_000 - (now - oldest));
    return Math.max(byInterval, byMinute);
  }

  async waitTurn(): Promise<void> {
    for (;;) {
      const wait = this.msUntilNextAction();
      if (wait <= 0 && this.canAct()) {
        return;
      }
      await sleep(Math.max(wait, 5));
    }
  }

  recordAction(now = Date.now()): void {
    this.prune(now);
    this.timestamps.push(now);
    this.lastActionAt = now;
  }

  /** Run gated action (counts toward limit). */
  async run<T>(action: () => Promise<T>): Promise<T> {
    await this.waitTurn();
    const result = await action();
    this.recordAction();
    return result;
  }

  private prune(now: number): void {
    const cutoff = now - 60_000;
    this.timestamps = this.timestamps.filter((t) => t > cutoff);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
