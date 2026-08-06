import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import {
  HistoryQuerySchema,
  ReviewDecisionInputSchema,
  StartSessionInputSchema,
  type CapturedProfile,
  type CurrentCandidate,
  type HistoryQuery,
  type PaginatedHistory,
  type ReviewDecisionInput,
  type SessionViewState,
  type StartSessionInput,
  type SwipeAction,
  type SwipeDecision,
} from '@twinby/contracts';
import { resolveAppPaths } from '@twinby/config';
import {
  insertSession,
  listHistoryEvents,
  updateSessionRow,
  type AppDatabase,
} from '@twinby/database';
import { getLogger } from '@twinby/logging';
import { TwinbyProfileCapture } from '@twinby/profile-capture';
import {
  applyUserDecisionToCounters,
  canTransition,
  createIdleSessionState,
  type SessionState,
} from '@twinby/session-orchestrator';
import { createAppiumHandlers } from '../ipc/appium-handlers';
import { createTwinbyHandlers } from '../ipc/twinby-handlers';
import { hasApiKey } from '../security/secrets';
import { ActionExecutionService } from './action-execution-service';
import { CandidateEvaluationService } from './candidate-evaluation-service';
import {
  snapshotCardIdentity,
  type CardIdentitySnapshot,
} from './card-identity';
import { DeviceBootstrapService } from './device-bootstrap-service';
import { DialogsScanService } from './dialogs-scan-service';
import { HistoryRecorder } from './history-recorder';
import { getHistoryRoot, purgePreviousDetailedSessions } from './history-detail-store';
import { IncomingLikesScanService } from './incoming-likes-scan-service';
import { MatchesScanService } from './matches-scan-service';
import { OwnProfileCaptureService } from './own-profile-capture-service';
import { PreflightOrchestrator } from './preflight-orchestrator';
import { ProfileCapturePipeline } from './profile-capture-pipeline';
import { RelationshipReconciliationService } from './relationship-reconciliation-service';
import { SessionLimitService } from './session-limit-service';
import {
  SessionRecoveryService,
  type DeviceCaps,
} from './session-recovery-service';
import { TwinbyNavigationService } from './twinby-navigation-service';
import { sleep } from './session-utils';

interface ActiveLiveCandidate {
  captureId: string;
  observationId: string;
  captured: CapturedProfile;
  photoDataUrls: string[];
  modelDecision?: SwipeDecision;
  modelConfidence?: number;
  modelReasons: string[];
  overallScore?: number;
  decisionSource?: CurrentCandidate['decisionSource'];
  finalDecision?: SwipeDecision;
  requiresConfirmation?: boolean;
  effectiveConfidence?: number;
  autoEligible?: boolean;
  latencyMs?: number;
  model?: string;
  aiRawJson?: string;
}

export class LiveSessionService {
  private state: SessionState = { ...createIdleSessionState(), source: 'live' };
  private active: ActiveLiveCandidate | null = null;
  private pausedAt: SessionState['status'] | null = null;
  private loopToken = 0;
  private maxProfiles = 40;
  private processed = 0;
  private autoActions = 0;
  private consecutiveFailures = 0;
  private identityRecaptureAttempts = 0;
  private lastAdvancedIdentity: CardIdentitySnapshot | null = null;
  private advancing = false;
  private evaluateAbort: AbortController | null = null;
  private lastDeviceCaps: DeviceCaps | null = null;

  private readonly appium;
  private readonly twinby;
  private readonly navigation: TwinbyNavigationService;
  private readonly limits: SessionLimitService;
  private readonly history: HistoryRecorder;
  private readonly recovery: SessionRecoveryService;
  private readonly bootstrap: DeviceBootstrapService;
  private readonly capturePipeline: ProfileCapturePipeline;
  private readonly evaluation: CandidateEvaluationService;
  private readonly actions: ActionExecutionService;
  /** Constructed for stage 1 wiring; not invoked until stage 5. */
  private readonly preflight: PreflightOrchestrator;

  constructor(
    private readonly getDb: () => AppDatabase,
    private readonly getProjectRoot: () => string,
  ) {
    this.appium = createAppiumHandlers(getProjectRoot);
    this.twinby = createTwinbyHandlers(getDb, getProjectRoot);
    this.navigation = new TwinbyNavigationService({
      appium: this.appium,
      twinby: this.twinby,
    });
    this.limits = new SessionLimitService(getDb);
    this.history = new HistoryRecorder(getProjectRoot);
    this.recovery = new SessionRecoveryService({
      appium: this.appium,
      twinby: this.twinby,
      navigation: this.navigation,
      getLastDeviceCaps: () => this.lastDeviceCaps,
      getConsecutiveFailures: () => this.consecutiveFailures,
      setConsecutiveFailures: (n) => {
        this.consecutiveFailures = n;
      },
    });
    this.bootstrap = new DeviceBootstrapService({
      appium: this.appium,
      twinby: this.twinby,
      navigation: this.navigation,
      setLastDeviceCaps: (caps) => {
        this.lastDeviceCaps = caps;
      },
      ensureAppiumSession: () => this.recovery.ensureAppiumSession(),
      transition: (to) => this.transition(to),
      persistSession: () => this.persistSession(),
    });
    this.capturePipeline = new ProfileCapturePipeline({
      appium: this.appium,
      twinby: this.twinby,
      getProjectRoot,
      ensureAppiumSession: (force) => this.recovery.ensureAppiumSession(force),
    });
    this.evaluation = new CandidateEvaluationService(this.limits);
    this.actions = new ActionExecutionService({
      appium: this.appium,
      twinby: this.twinby,
      history: this.history,
      getIdentityRecaptureAttempts: () => this.identityRecaptureAttempts,
      setIdentityRecaptureAttempts: (n) => {
        this.identityRecaptureAttempts = n;
      },
      getLastAdvancedIdentity: () => this.lastAdvancedIdentity,
      onRecordDecided: (captured, decision) => this.recordDecided(captured, decision),
      bumpAutoActions: () => {
        this.autoActions += 1;
      },
      setConsecutiveFailures: (n) => {
        this.consecutiveFailures = n;
      },
    });
    this.preflight = new PreflightOrchestrator({
      getDb: () => this.getDb(),
      navigation: this.navigation,
      ownProfile: new OwnProfileCaptureService({
        getDb: () => this.getDb(),
        navigation: this.navigation,
        getProjectRoot: () => this.getProjectRoot(),
      }),
      dialogs: new DialogsScanService(this.navigation),
      matches: new MatchesScanService(this.navigation),
      likes: new IncomingLikesScanService({
        navigation: this.navigation,
        getDb: () => this.getDb(),
      }),
      reconciliation: new RelationshipReconciliationService(() => this.getDb()),
    });
  }

  getViewState(): SessionViewState {
    if (this.state.status === 'error' && this.active) {
      this.promoteActiveToManualReview(
        this.state.errorMessage ?? 'Сбой — выберите like/dislike вручную',
      );
    }
    return this.toViewState();
  }

  async start(raw?: unknown): Promise<SessionViewState> {
    const input: StartSessionInput = StartSessionInputSchema.parse(raw ?? {});
    if (input.source !== 'live') {
      throw new Error('LiveSessionService принимает только source=live');
    }
    if (input.mode !== 'recommendation-only' && input.mode !== 'auto-high-confidence') {
      throw new Error('Доступны режимы recommendation-only и auto-high-confidence');
    }

    if (
      this.state.status !== 'idle' &&
      this.state.status !== 'stopped' &&
      this.state.status !== 'error'
    ) {
      throw new Error('Сессия уже запущена. Сначала остановите текущую.');
    }

    const db = this.getDb();
    if (!hasApiKey(db)) {
      throw new Error('Задайте API-ключ ArionHub в разделе «ИИ» перед запуском сессии');
    }

    const sessionLimits = this.twinby.getSessionLimits();
    this.maxProfiles = input.maxProfiles ?? sessionLimits.maxProfiles;
    this.processed = 0;
    this.autoActions = 0;
    this.consecutiveFailures = 0;
    this.identityRecaptureAttempts = 0;
    this.lastAdvancedIdentity = null;
    this.advancing = false;
    this.evaluateAbort?.abort();
    this.evaluateAbort = null;
    this.limits.resetSessionSpend();
    this.active = null;
    this.pausedAt = null;
    this.loopToken += 1;

    const sessionId = randomUUID();
    const startedAt = new Date().toISOString();
    const historyRoot = getHistoryRoot(this.getProjectRoot());
    purgePreviousDetailedSessions(db, historyRoot);

    this.state = {
      sessionId,
      status: 'validating-environment',
      mode: input.mode,
      source: 'live',
      counters: {
        viewed: 0,
        likes: 0,
        dislikes: 0,
        reviews: 0,
        skips: 0,
        errors: 0,
      },
      startedAt,
      totalProfiles: this.maxProfiles,
      remainingProfiles: this.maxProfiles,
    };

    insertSession(db, {
      id: sessionId,
      mode: input.mode,
      source: 'live',
      status: 'validating-environment',
      startedAt,
      counters: this.state.counters,
      hasDetail: true,
    });

    try {
      await this.bootstrap.bootstrap(input, sessionLimits);

      const preflightResult = await this.preflight.run({
        override: input.skipPreflight === true,
        overrideReason: input.skipPreflightReason,
      });
      if (preflightResult.status === 'failed' && !input.skipPreflight) {
        throw new Error(
          `Preflight не выполнен: ${
            preflightResult.steps
              .map((s) => s.error)
              .filter(Boolean)
              .join('; ') || preflightResult.status
          }. Можно передать skipPreflight: true с причиной.`,
        );
      }
      getLogger('session').info(
        {
          sessionId,
          preflightStatus: preflightResult.status,
          override: preflightResult.overrideUsed,
        },
        'Preflight finished before live feed',
      );

      this.transition('ready');
      this.persistSession();
      getLogger('session').info({ sessionId }, 'Live session ready');
      void this.processNext(this.loopToken);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.fail(message);
    }

    return this.toViewState();
  }

  async pause(): Promise<SessionViewState> {
    if (
      !['ready', 'awaiting-review', 'cooldown', 'capturing-profile', 'evaluating'].includes(
        this.state.status,
      )
    ) {
      throw new Error('Сейчас нельзя поставить сессию на паузу');
    }
    this.pausedAt = this.state.status;
    this.transition('paused');
    this.persistSession();
    return this.toViewState();
  }

  async resume(): Promise<SessionViewState> {
    if (this.state.status === 'error') {
      this.state = { ...this.state, errorMessage: undefined };
      this.consecutiveFailures = 0;
      this.loopToken += 1;
      const token = this.loopToken;
      this.transition('recovering');
      this.persistSession();
      await this.recovery.recoverFeedBestEffort();
      await this.cleanupActive().catch(() => undefined);
      this.active = null;
      this.transition('cooldown');
      this.persistSession();
      void this.processNext(token);
      return this.toViewState();
    }
    if (this.state.status !== 'paused') {
      throw new Error('Сессия не на паузе');
    }
    const resumeTo = this.pausedAt && this.pausedAt !== 'paused' ? this.pausedAt : 'ready';
    this.pausedAt = null;
    this.transition(resumeTo);
    this.persistSession();
    if (resumeTo === 'ready' || resumeTo === 'cooldown') {
      void this.processNext(this.loopToken);
    }
    return this.toViewState();
  }

  async stop(): Promise<SessionViewState> {
    this.loopToken += 1;
    this.evaluateAbort?.abort();
    this.evaluateAbort = null;
    if (this.state.status !== 'idle' && this.state.status !== 'stopped') {
      this.transition('stopping');
      const observationId = this.active?.observationId;
      this.active = null;
      // Persist stopped immediately — never await capture/Appium cleanup on the Stop IPC path.
      this.state = {
        ...this.state,
        status: 'stopped',
        stoppedAt: new Date().toISOString(),
        remainingProfiles: Math.max(0, this.maxProfiles - this.processed),
      };
      this.persistSession();
      if (observationId) {
        void this.cleanupObservation(observationId).catch(() => undefined);
      }
    }
    return this.toViewState();
  }

  async confirm(raw: unknown): Promise<SessionViewState> {
    const input = ReviewDecisionInputSchema.parse(raw);
    return this.resolveReview(input, false, false);
  }

  async skip(captureId: unknown): Promise<SessionViewState> {
    if (typeof captureId !== 'string' || !captureId) {
      throw new Error('Некорректный captureId');
    }
    return this.resolveReview(
      {
        captureId,
        decision: 'dislike',
        corrected: true,
        comment: 'skip→dislike (сдвиг ленты)',
      },
      true,
      false,
    );
  }

  listHistory(raw?: unknown): PaginatedHistory {
    const query: HistoryQuery = HistoryQuerySchema.parse(raw ?? {});
    return listHistoryEvents(this.getDb(), query);
  }

  private async processNext(token: number): Promise<void> {
    if (token !== this.loopToken) {
      return;
    }
    if (['paused', 'stopping', 'stopped', 'error'].includes(this.state.status)) {
      return;
    }

    const sessionLimits = this.twinby.getSessionLimits();
    const cap = this.limits.checkSessionCaps({
      limits: sessionLimits,
      startedAt: this.state.startedAt,
      processed: this.processed,
      maxProfiles: this.maxProfiles,
      counters: this.state.counters,
    });
    if (!cap.ok) {
      this.state = {
        ...this.state,
        status: 'stopped',
        stoppedAt: new Date().toISOString(),
        remainingProfiles: cap.remainingProfiles,
        errorMessage: cap.errorMessage,
      };
      this.persistSession();
      if (cap.remainingProfiles === 0) {
        getLogger('session').info(
          { sessionId: this.state.sessionId },
          'Live session limits reached',
        );
      }
      return;
    }

    try {
      this.transition('capturing-profile');
      this.persistSession();

      const captureResult = await this.capturePipeline.capture({
        limits: sessionLimits,
        currentToken: token,
        getLoopToken: () => this.loopToken,
        lastAdvancedIdentity: this.lastAdvancedIdentity,
      });
      if (captureResult.kind === 'aborted' || token !== this.loopToken) {
        return;
      }
      if (['paused', 'stopping', 'stopped', 'error'].includes(this.state.status)) {
        return;
      }

      const { captured, photoDataUrls, captureMs, sameCard } = captureResult;
      const captureId = captured.observationId;
      this.active = {
        captureId,
        observationId: captured.observationId,
        captured,
        photoDataUrls,
        modelReasons: [],
      };

      if (sameCard) {
        this.active.modelDecision = 'dislike';
        this.active.finalDecision = 'dislike';
        this.active.decisionSource = 'fallback';
        this.active.modelReasons = ['same-card-after-advance'];
        this.transition('executing-action');
        this.persistSession();
        await this.resolveReview(
          { captureId, decision: 'dislike', corrected: false },
          false,
          true,
        );
        return;
      }

      this.transition('evaluating');
      this.persistSession();

      const evalResult = await this.evaluation.evaluate({
        db: this.getDb(),
        captured,
        captureMs,
        limits: sessionLimits,
        mode: this.state.mode,
        currentToken: token,
        getLoopToken: () => this.loopToken,
        getAbortController: () => this.evaluateAbort,
        setAbortController: (c) => {
          this.evaluateAbort = c;
        },
      });

      if (evalResult.kind === 'aborted' || token !== this.loopToken) {
        return;
      }
      if (['paused', 'stopping', 'stopped', 'error'].includes(this.state.status)) {
        return;
      }

      if (evalResult.kind === 'spend-limit') {
        this.state = {
          ...this.state,
          status: 'stopped',
          stoppedAt: new Date().toISOString(),
          errorMessage: evalResult.message,
        };
        this.persistSession();
        await this.cleanupActive().catch(() => undefined);
        this.active = null;
        return;
      }

      if (evalResult.kind === 'awaiting-manual') {
        if (evalResult.bumpErrors) {
          this.state.counters = {
            ...this.state.counters,
            errors: this.state.counters.errors + 1,
          };
        }
        this.active = {
          ...this.active,
          modelDecision: evalResult.modelDecision,
          modelConfidence: evalResult.modelConfidence,
          modelReasons: evalResult.modelReasons,
          finalDecision: 'review',
          requiresConfirmation: true,
          autoEligible: false,
          decisionSource: 'fallback',
        };
        this.transition('awaiting-review');
        this.state = {
          ...this.state,
          status: 'awaiting-review',
          errorMessage: undefined,
        };
        this.persistSession();
        return;
      }

      if (evalResult.bumpErrors) {
        this.state.counters = {
          ...this.state.counters,
          errors: this.state.counters.errors + 1,
        };
      }

      const { final } = evalResult;
      this.consecutiveFailures = 0;
      this.state = { ...this.state, errorMessage: undefined };
      this.active = {
        ...this.active,
        modelDecision: evalResult.modelDecision,
        modelConfidence: evalResult.modelConfidence,
        modelReasons: evalResult.modelReasons,
        overallScore: evalResult.overallScore,
        decisionSource: final.source,
        finalDecision: final.decision,
        requiresConfirmation: final.requiresConfirmation,
        effectiveConfidence: final.effectiveConfidence,
        autoEligible: Boolean(final.executableAction && !final.requiresConfirmation),
        latencyMs: evalResult.latencyMs,
        model: evalResult.model,
        aiRawJson: evalResult.aiRawJson,
      };

      const autoCap = this.limits.isAutoActionsCapReached(
        sessionLimits,
        this.autoActions,
      );
      if (
        this.state.mode === 'auto-high-confidence' &&
        final.executableAction &&
        autoCap
      ) {
        this.state = {
          ...this.state,
          status: 'stopped',
          stoppedAt: new Date().toISOString(),
          errorMessage: `Достигнут лимит auto-действий (${sessionLimits.maxAutoActions})`,
        };
        this.persistSession();
        return;
      }

      if (
        !final.requiresConfirmation &&
        final.executableAction &&
        (this.state.mode !== 'auto-high-confidence' || !autoCap)
      ) {
        this.persistSession();
        await this.resolveReview(
          {
            captureId,
            decision: final.executableAction,
            corrected: false,
            comment: 'auto-high-confidence',
          },
          false,
          true,
        );
        return;
      }

      if (this.state.mode === 'auto-high-confidence') {
        const forced: 'like' | 'dislike' =
          final.decision === 'like' || final.decision === 'dislike'
            ? final.decision
            : 'dislike';
        this.persistSession();
        await this.resolveReview(
          {
            captureId,
            decision: forced,
            corrected: false,
            comment:
              forced === 'dislike' && final.decision !== 'dislike'
                ? 'auto-forced-gray-dislike'
                : 'auto-high-confidence',
          },
          false,
          true,
        );
        return;
      }

      this.transition('awaiting-review');
      this.persistSession();
    } catch (err) {
      if (token !== this.loopToken) {
        return;
      }
      if (['paused', 'stopping', 'stopped', 'error'].includes(this.state.status)) {
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      getLogger('session').error({ err: message }, 'Live session capture/evaluate failed');
      if (this.active) {
        this.promoteActiveToManualReview(message);
        return;
      }
      await this.recoverAndRetry(token, message);
    }
  }

  private promoteActiveToManualReview(message: string): void {
    if (!this.active) {
      return;
    }
    if (['stopping', 'stopped', 'idle', 'paused'].includes(this.state.status)) {
      return;
    }
    this.state.counters = {
      ...this.state.counters,
      errors: this.state.counters.errors + 1,
    };
    this.active = {
      ...this.active,
      modelDecision: this.active.modelDecision ?? 'review',
      modelConfidence: this.active.modelConfidence ?? 0,
      modelReasons: [
        ...(this.active.modelReasons?.length
          ? this.active.modelReasons
          : [`Сбой: ${message}`]),
        'Выберите like или dislike вручную — сессия продолжит работу.',
      ].slice(0, 8),
      finalDecision: 'review',
      requiresConfirmation: true,
      autoEligible: false,
      decisionSource: this.active.decisionSource ?? 'fallback',
    };
    if (this.state.status !== 'awaiting-review') {
      this.transition('awaiting-review');
    }
    this.state = {
      ...this.state,
      status: 'awaiting-review',
      errorMessage: undefined,
    };
    this.persistSession();
  }

  private async resolveReview(
    input: ReviewDecisionInput,
    asSkip: boolean,
    autoExecuted: boolean,
  ): Promise<SessionViewState> {
    if (['stopping', 'stopped', 'idle'].includes(this.state.status)) {
      return this.toViewState();
    }
    if (
      this.state.status !== 'awaiting-review' &&
      this.state.status !== 'error' &&
      !autoExecuted
    ) {
      throw new Error('Нет анкеты, ожидающей решения');
    }
    if (!this.active) {
      throw new Error('Нет активной анкеты');
    }
    const actionToken = this.loopToken;
    if (this.state.status === 'error') {
      this.transition('awaiting-review');
    }
    if (this.active.captureId !== input.captureId) {
      throw new Error('Анкета уже сменилась — обновите состояние сессии');
    }
    if (input.decision === 'review') {
      throw new Error('В live нельзя подтвердить «review» — выберите like или dislike');
    }

    const db = this.getDb();
    const pendingHistory = this.actions.buildPendingHistory({
      db,
      sessionId: this.state.sessionId!,
      mode: this.state.mode,
      active: this.active,
      review: input,
      asSkip,
      autoExecuted,
    });

    this.transition('executing-action');
    this.persistSession();

    const swipe: SwipeAction =
      asSkip || input.decision !== 'like' ? 'dislike' : 'like';
    const decided: 'like' | 'dislike' | 'skip' = asSkip
      ? 'skip'
      : input.decision === 'like'
        ? 'like'
        : 'dislike';

    try {
      this.advancing = true;
      const outcome = await this.actions.executeSwipe({
        db,
        active: this.active,
        pendingHistory,
        asSkip,
        autoExecuted,
        decided,
        swipe,
        cleanupActive: () => this.cleanupActive(),
        clearActive: () => {
          this.active = null;
        },
        transition: (to) => {
          if (actionToken !== this.loopToken) {
            return;
          }
          if (['stopping', 'stopped', 'idle'].includes(this.state.status)) {
            return;
          }
          this.transition(to);
        },
        persist: () => {
          if (actionToken !== this.loopToken) {
            return;
          }
          this.persistSession();
        },
        getLoopToken: () => this.loopToken,
        scheduleProcessNext: (t) => {
          if (t !== this.loopToken) {
            return;
          }
          if (['paused', 'stopping', 'stopped', 'error', 'idle'].includes(this.state.status)) {
            return;
          }
          void this.processNext(t);
        },
      });

      if (outcome.kind === 'aborted') {
        return this.toViewState();
      }

      if (outcome.kind === 'stopped-no-profiles') {
        this.state = {
          ...this.state,
          status: 'stopped',
          stoppedAt: new Date().toISOString(),
          remainingProfiles: 0,
        };
        this.persistSession();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      getLogger('session').error({ err: message }, 'Live action failed');
      if (actionToken !== this.loopToken) {
        return this.toViewState();
      }
      if (this.active) {
        await this.actions.forceDislikeOnError({
          db,
          active: this.active,
          pendingHistory,
          asSkip,
        });
      }
      await this.cleanupActive().catch(() => undefined);
      this.active = null;
      if (actionToken !== this.loopToken) {
        return this.toViewState();
      }
      await this.recoverAndRetry(actionToken, message);
    } finally {
      this.advancing = false;
    }

    return this.toViewState();
  }

  private recordDecided(
    captured: CapturedProfile,
    decision: 'like' | 'dislike' | 'skip',
  ): void {
    this.lastAdvancedIdentity = snapshotCardIdentity(captured);
    this.processed += 1;
    this.state.counters = applyUserDecisionToCounters(
      {
        ...this.state.counters,
        viewed: this.state.counters.viewed + 1,
      },
      decision,
    );
    this.state.remainingProfiles = Math.max(0, this.maxProfiles - this.processed);
  }

  private async recoverAndRetry(token: number, message: string): Promise<void> {
    if (token !== this.loopToken) {
      return;
    }
    if (['paused', 'stopping', 'stopped', 'idle'].includes(this.state.status)) {
      return;
    }
    if (this.active && !this.advancing) {
      const decision =
        this.active.finalDecision === 'like' || this.active.finalDecision === 'dislike'
          ? this.active.finalDecision
          : this.active.modelDecision === 'like' || this.active.modelDecision === 'dislike'
            ? this.active.modelDecision
            : 'dislike';
      getLogger('session').warn(
        { decision, message },
        'Recover with active decision — advancing feed',
      );
      try {
        await this.resolveReview(
          {
            captureId: this.active.captureId,
            decision,
            corrected: false,
          },
          false,
          true,
        );
        return;
      } catch (err) {
        getLogger('session').warn(
          { err: err instanceof Error ? err.message : String(err) },
          'Advance during recover failed — falling back to manual review',
        );
        this.promoteActiveToManualReview(message);
        return;
      }
    }

    if (this.active) {
      this.promoteActiveToManualReview(message);
      return;
    }

    this.consecutiveFailures += 1;
    const result = await this.recovery.recoverWithoutActive({
      message,
      limits: this.twinby.getSessionLimits(),
      bumpErrorCounter: () => {
        this.state.counters = {
          ...this.state.counters,
          errors: this.state.counters.errors + 1,
        };
      },
      setErrorMessage: (msg) => {
        this.state = { ...this.state, errorMessage: msg };
      },
      fail: (msg) => this.fail(msg),
      transitionRecovering: () => this.transition('recovering'),
      persist: () => this.persistSession(),
      cleanupActive: () => this.cleanupActive(),
      clearActive: () => {
        this.active = null;
      },
      transitionCooldown: () => this.transition('cooldown'),
    });

    if (!result.shouldRetryNext) {
      return;
    }
    await sleep(result.sleepMs);
    if (token === this.loopToken) {
      void this.processNext(token);
    }
  }

  private async cleanupActive(): Promise<void> {
    if (!this.active) {
      return;
    }
    await this.cleanupObservation(this.active.observationId);
  }

  private async cleanupObservation(observationId: string): Promise<void> {
    const paths = resolveAppPaths({ projectRoot: this.getProjectRoot() });
    const capture = new TwinbyProfileCapture({
      client: this.appium.getClient(),
      captureRoot: join(paths.temporary, 'captures'),
    });
    await capture.cleanup(observationId);
  }

  private fail(message: string): void {
    if (this.active) {
      this.promoteActiveToManualReview(message);
      return;
    }
    this.state = {
      ...this.state,
      status: 'error',
      errorMessage: message,
    };
    this.persistSession();
  }

  private transition(to: SessionState['status']): void {
    if (['stopping', 'stopped'].includes(this.state.status) && to !== 'stopped') {
      getLogger('session').warn(
        { from: this.state.status, to },
        'Ignored transition after stop',
      );
      return;
    }
    if (!canTransition(this.state.status, to)) {
      getLogger('session').warn(
        { from: this.state.status, to },
        'Illegal session transition attempted',
      );
    }
    this.state = {
      ...this.state,
      status: to,
      errorMessage:
        to === 'error' || to === 'recovering'
          ? this.state.errorMessage
          : to === 'awaiting-review' ||
              to === 'ready' ||
              to === 'capturing-profile' ||
              to === 'evaluating' ||
              to === 'executing-action' ||
              to === 'cooldown'
            ? undefined
            : this.state.errorMessage,
    };
  }

  private persistSession(): void {
    if (!this.state.sessionId) {
      return;
    }
    updateSessionRow(this.getDb(), {
      id: this.state.sessionId,
      status: this.state.status,
      counters: this.state.counters,
      stoppedAt: this.state.stoppedAt ?? null,
      error: this.state.errorMessage ?? null,
    });
  }

  private toViewState(): SessionViewState {
    const current: CurrentCandidate | undefined = this.active
      ? {
          captureId: this.active.captureId,
          fixtureId: this.active.captured.fields.displayName
            ? `live:${this.active.captured.fields.displayName}`
            : `live:${this.active.observationId.slice(0, 8)}`,
          observationId: this.active.observationId,
          displayName: this.active.captured.fields.displayName,
          age: this.active.captured.fields.age,
          distanceKm: this.active.captured.fields.distanceKm,
          bio: this.active.captured.fields.bio,
          interests: this.active.captured.fields.interests,
          goal: this.active.captured.fields.relationshipGoal,
          compatibilityPercent: this.active.captured.fields.compatibilityPercent,
          photoDataUrls: this.active.photoDataUrls,
          cardFingerprint: this.active.captured.cardFingerprint,
          captureWarnings: this.active.captured.warnings,
          modelDecision: this.active.modelDecision,
          modelConfidence: this.active.modelConfidence,
          modelReasons: this.active.modelReasons,
          overallScore: this.active.overallScore,
          decisionSource: this.active.decisionSource,
          finalDecision: this.active.finalDecision,
          requiresConfirmation: this.active.requiresConfirmation,
          effectiveConfidence: this.active.effectiveConfidence,
          autoEligible: this.active.autoEligible,
          evaluating: this.state.status === 'evaluating',
          latencyMs: this.active.latencyMs,
          model: this.active.model,
        }
      : undefined;

    return {
      sessionId: this.state.sessionId,
      status: this.state.status,
      mode: this.state.mode,
      source: this.state.source,
      counters: this.state.counters,
      startedAt: this.state.startedAt,
      stoppedAt: this.state.stoppedAt,
      errorMessage: this.state.errorMessage,
      totalProfiles: this.state.totalProfiles,
      remainingProfiles: this.state.remainingProfiles,
      current,
    };
  }
}

