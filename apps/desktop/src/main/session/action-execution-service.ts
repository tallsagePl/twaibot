import type {
  CapturedProfile,
  ReviewDecisionInput,
  SessionMode,
  SwipeAction,
} from '@twinby/contracts';
import { getPreferenceProfile, type AppDatabase } from '@twinby/database';
import { getLogger } from '@twinby/logging';
import {
  TwinbyActionExecutor,
  findLocatorProfile,
  getDefaultLocatorProfile,
} from '@twinby/twinby-adapter';
import type { createAppiumHandlers } from '../ipc/appium-handlers';
import type { createTwinbyHandlers } from '../ipc/twinby-handlers';
import {
  isSameCardIdentity,
  snapshotCardIdentity,
  type CardIdentitySnapshot,
} from './card-identity';
import type { HistoryPendingEvent, HistoryRecorder } from './history-recorder';
import { verifyProfileIdentity } from './identity-guard';
import { sleep } from './session-utils';

type AppiumHandlers = ReturnType<typeof createAppiumHandlers>;
type TwinbyHandlers = ReturnType<typeof createTwinbyHandlers>;

export type ActiveForAction = {
  captureId: string;
  observationId: string;
  captured: CapturedProfile;
  photoDataUrls: string[];
  modelDecision?: ReviewDecisionInput['decision'] | 'review';
  modelConfidence?: number;
  modelReasons: string[];
  decisionSource?: string;
  finalDecision?: ReviewDecisionInput['decision'] | 'review';
  effectiveConfidence?: number;
  latencyMs?: number;
  model?: string;
  aiRawJson?: string;
};

export type ActionExecutionOutcome =
  | { kind: 'recapture' }
  | { kind: 'stopped-no-profiles' }
  | { kind: 'cooldown-next'; sleepMs: number }
  | { kind: 'aborted' }
  | { kind: 'failed'; message: string; pendingHistory: HistoryPendingEvent };

export class ActionExecutionService {
  constructor(
    private readonly deps: {
      appium: AppiumHandlers;
      twinby: TwinbyHandlers;
      history: HistoryRecorder;
      getIdentityRecaptureAttempts: () => number;
      setIdentityRecaptureAttempts: (n: number) => void;
      getLastAdvancedIdentity: () => CardIdentitySnapshot | null;
      onRecordDecided: (
        captured: CapturedProfile,
        decision: 'like' | 'dislike' | 'skip',
      ) => void;
      bumpAutoActions: () => void;
      setConsecutiveFailures: (n: number) => void;
    },
  ) {}

  buildPendingHistory(input: {
    db: AppDatabase;
    sessionId: string;
    mode: SessionMode;
    active: ActiveForAction;
    review: ReviewDecisionInput;
    asSkip: boolean;
    autoExecuted: boolean;
  }): HistoryPendingEvent {
    const { db, sessionId, mode, active, review, asSkip, autoExecuted } = input;
    const corrected =
      asSkip ||
      (!autoExecuted &&
        (review.corrected ||
          (active.finalDecision != null &&
            review.decision !== active.finalDecision)));

    return {
      sessionId,
      fixtureId: active.captured.fields.displayName
        ? `live:${active.captured.fields.displayName}`
        : `live:${active.observationId.slice(0, 8)}`,
      captureId: review.captureId,
      modelDecision: active.modelDecision === 'review' ? undefined : active.modelDecision,
      userDecision: (asSkip ? 'skip' : review.decision) as 'like' | 'dislike' | 'skip',
      decisionSource: (autoExecuted
        ? 'auto'
        : corrected
          ? 'user'
          : active.decisionSource === 'hard_filter'
            ? 'hard_filter'
            : (active.decisionSource ?? 'ai')) as HistoryPendingEvent['decisionSource'],
      confidence: active.modelConfidence,
      effectiveConfidence: active.effectiveConfidence,
      reasons: active.modelReasons,
      comment: review.comment,
      latencyMs: active.latencyMs,
      model: active.model,
      preferenceVersion: getPreferenceProfile(db).version,
      corrected,
      aiRawJson: active.aiRawJson,
      autoExecuted,
      sessionMode: mode,
    };
  }

  async executeSwipe(input: {
    db: AppDatabase;
    active: ActiveForAction;
    pendingHistory: HistoryPendingEvent;
    asSkip: boolean;
    autoExecuted: boolean;
    decided: 'like' | 'dislike' | 'skip';
    swipe: SwipeAction;
    cleanupActive: () => Promise<void>;
    clearActive: () => void;
    transition: (to: 'cooldown' | 'recovering') => void;
    persist: () => void;
    getLoopToken: () => number;
    scheduleProcessNext: (token: number) => void;
  }): Promise<ActionExecutionOutcome> {
    const {
      db,
      active,
      pendingHistory,
      asSkip,
      autoExecuted,
      decided,
      swipe,
      cleanupActive,
      clearActive,
      transition,
      persist,
    getLoopToken,
    scheduleProcessNext,
  } = input;

    // Capture generation at swipe start — stop() bumps loopToken and must not resume.
    const tokenAtStart = getLoopToken();
    const stillCurrent = () => getLoopToken() === tokenAtStart;

    const pkg = await this.deps.twinby.detectPackage();
    if (!stillCurrent()) {
      await cleanupActive().catch(() => undefined);
      clearActive();
      return { kind: 'aborted' };
    }
    const profile =
      findLocatorProfile({ appVersion: pkg.versionName }) ?? getDefaultLocatorProfile();
    if (!profile) {
      throw new Error('Locator profile не найден');
    }
    const limits = this.deps.twinby.getSessionLimits();
    const actions = new TwinbyActionExecutor(
      this.deps.appium.getClient(),
      profile,
      limits,
    );

    const feedScreen = await actions.ensureFeedReady();
    if (!stillCurrent()) {
      await cleanupActive().catch(() => undefined);
      clearActive();
      return { kind: 'aborted' };
    }
    if (feedScreen.type !== 'feed' && feedScreen.type !== 'no-profiles') {
      throw new Error(`Перед ${swipe} нет feed (экран: ${feedScreen.type})`);
    }

    const fingerprint = active.captured.cardFingerprint;
    const identity = await verifyProfileIdentity(this.deps.appium.getClient(), {
      fingerprint,
      displayName: active.captured.fields.displayName,
      age: active.captured.fields.age,
    });

    if (!identity.matched) {
      const attempts = this.deps.getIdentityRecaptureAttempts() + 1;
      this.deps.setIdentityRecaptureAttempts(attempts);
      getLogger('session').warn(
        {
          expected: identity.expected,
          actual: identity.actual,
          displayName: identity.displayName,
          reason: identity.reason,
          attempts,
          decidedSwipe: swipe,
        },
        'Identity mismatch — cancel action, recapture',
      );

      if (attempts <= 2) {
        await cleanupActive().catch(() => undefined);
        clearActive();
        if (!stillCurrent()) {
          return { kind: 'aborted' };
        }
        transition('cooldown');
        persist();
        await sleep(Math.max(60, limits.uiCooldownMs));
        if (!stillCurrent()) {
          return { kind: 'aborted' };
        }
        scheduleProcessNext(tokenAtStart);
        return { kind: 'recapture' };
      }

      pendingHistory.comment = [
        pendingHistory.comment,
        `identity-mismatch-recapture-exhausted:${identity.reason ?? 'mismatch'}`,
      ]
        .filter(Boolean)
        .join(' · ');
      pendingHistory.decisionSource = 'fallback';
      pendingHistory.userDecision = asSkip ? 'skip' : 'dislike';
      this.deps.setIdentityRecaptureAttempts(0);
      const exhaustResult = await actions.performAction('dislike');
      if (autoExecuted) {
        this.deps.bumpAutoActions();
      }
      this.deps.history.persistLive(db, pendingHistory, {
        sessionId: pendingHistory.sessionId,
        captured: active.captured,
        photoDataUrls: active.photoDataUrls,
        modelDecision:
          active.modelDecision === 'review' ? undefined : active.modelDecision,
        modelReasons: active.modelReasons,
        aiRawJson: active.aiRawJson,
      });
      this.deps.onRecordDecided(active.captured, 'dislike');
      await cleanupActive().catch(() => undefined);
      clearActive();
      if (!exhaustResult.ok && exhaustResult.screenAfter.type === 'no-profiles') {
        return { kind: 'stopped-no-profiles' };
      }
      if (!stillCurrent()) {
        return { kind: 'aborted' };
      }
      this.deps.setConsecutiveFailures(0);
      transition('cooldown');
      persist();
      const sleepMs =
        limits.speedPreset === 'turbo'
          ? Math.max(20, limits.uiCooldownMs)
          : Math.max(60, limits.uiCooldownMs + 40);
      await sleep(sleepMs);
      if (!stillCurrent()) {
        return { kind: 'aborted' };
      }
      scheduleProcessNext(tokenAtStart);
      return { kind: 'cooldown-next', sleepMs };
    }

    this.deps.setIdentityRecaptureAttempts(0);
    if (!stillCurrent()) {
      await cleanupActive().catch(() => undefined);
      clearActive();
      return { kind: 'aborted' };
    }
    let result = await actions.performAction(swipe);
    if (!result.ok && swipe === 'like') {
      getLogger('session').warn(
        { result },
        'Like failed after decision — forcing dislike to advance',
      );
      result = await actions.performAction('dislike');
      pendingHistory.userDecision = asSkip ? 'skip' : 'dislike';
      pendingHistory.comment = [pendingHistory.comment, 'forced-dislike-advance']
        .filter(Boolean)
        .join(' · ');
      pendingHistory.decisionSource = 'fallback';
    }

    if (!result.ok && result.screenAfter.type === 'unknown') {
      if (!stillCurrent()) {
        await cleanupActive().catch(() => undefined);
        clearActive();
        return { kind: 'aborted' };
      }
      transition('recovering');
      await actions.dismissKnownOverlay();
      if (!stillCurrent()) {
        await cleanupActive().catch(() => undefined);
        clearActive();
        return { kind: 'aborted' };
      }
      const screen = await actions.ensureFeedReady();
      if (screen.type !== 'feed' && screen.type !== 'no-profiles') {
        result = await actions.performAction('dislike');
        if (!result.ok && result.screenAfter.type !== 'no-profiles') {
          throw new Error(
            result.message ??
              `Не удалось сдвинуть ленту после ${swipe} (экран: ${screen.type})`,
          );
        }
      }
    }

    if (autoExecuted) {
      this.deps.bumpAutoActions();
    }
    this.deps.history.persistLive(db, pendingHistory, {
      sessionId: pendingHistory.sessionId,
      captured: active.captured,
      photoDataUrls: active.photoDataUrls,
      modelDecision:
        active.modelDecision === 'review' ? undefined : active.modelDecision,
      modelReasons: active.modelReasons,
      aiRawJson: active.aiRawJson,
    });
    this.deps.onRecordDecided(
      active.captured,
      decided === 'skip' ? 'skip' : decided === 'like' ? 'like' : 'dislike',
    );

    if (!result.ok && result.screenAfter.type === 'no-profiles') {
      await cleanupActive();
      clearActive();
      return { kind: 'stopped-no-profiles' };
    }

    if (!result.ok) {
      getLogger('session').warn({ result }, 'Action completed with non-feed screen');
    }

    this.deps.setConsecutiveFailures(0);
    await cleanupActive();
    clearActive();
    if (!stillCurrent()) {
      return { kind: 'aborted' };
    }
    transition('cooldown');
    persist();
    const sleepMs =
      limits.speedPreset === 'turbo'
        ? Math.max(20, limits.uiCooldownMs)
        : Math.max(60, limits.uiCooldownMs + 40);
    await sleep(sleepMs);
    if (!stillCurrent()) {
      return { kind: 'aborted' };
    }
    scheduleProcessNext(tokenAtStart);
    return { kind: 'cooldown-next', sleepMs };
  }

  async forceDislikeOnError(input: {
    db: AppDatabase;
    active: ActiveForAction;
    pendingHistory: HistoryPendingEvent;
    asSkip: boolean;
  }): Promise<boolean> {
    const { db, active, pendingHistory, asSkip } = input;
    const last = this.deps.getLastAdvancedIdentity();
    if (last && isSameCardIdentity(snapshotCardIdentity(active.captured), last)) {
      return false;
    }
    try {
      const pkg = await this.deps.twinby.detectPackage();
      const profile =
        findLocatorProfile({ appVersion: pkg.versionName }) ??
        getDefaultLocatorProfile();
      if (!profile) {
        return false;
      }
      const actions = new TwinbyActionExecutor(
        this.deps.appium.getClient(),
        profile,
        this.deps.twinby.getSessionLimits(),
      );
      await actions.ensureFeedReady().catch(() => undefined);
      await actions.performAction('dislike').catch(() => undefined);
      pendingHistory.userDecision = asSkip ? 'skip' : 'dislike';
      pendingHistory.comment = [
        pendingHistory.comment,
        'error-forced-dislike-advance',
      ]
        .filter(Boolean)
        .join(' · ');
      pendingHistory.decisionSource = 'fallback';
      this.deps.history.persistLive(db, pendingHistory, {
        sessionId: pendingHistory.sessionId,
        captured: active.captured,
        photoDataUrls: active.photoDataUrls,
        modelDecision:
          active.modelDecision === 'review' ? undefined : active.modelDecision,
        modelReasons: active.modelReasons,
        aiRawJson: active.aiRawJson,
      });
      this.deps.onRecordDecided(active.captured, 'dislike');
      return true;
    } catch {
      return false;
    }
  }
}
