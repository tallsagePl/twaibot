import { nativeImage } from 'electron';
import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import type { AiImageInput } from '@twinby/ai-provider';
import {
  HistoryQuerySchema,
  ReviewDecisionInputSchema,
  SessionLimitsSchema,
  DEFAULT_SESSION_LIMITS,
  StartSessionInputSchema,
  type CurrentCandidate,
  type HistoryQuery,
  type PaginatedHistory,
  type ReviewDecisionInput,
  type SessionLimits,
  type SessionViewState,
  type StartSessionInput,
  type SwipeDecision,
} from '@twinby/contracts';
import {
  DefaultDecisionEngine,
  evaluateHardFilters,
} from '@twinby/decision-engine';
import {
  getPreferenceProfile,
  getSetting,
  getStoredPreferenceSummary,
  insertSession,
  listHistoryEvents,
  listRecentUserFeedback,
  updateSessionRow,
  type AppDatabase,
} from '@twinby/database';
import { getLogger } from '@twinby/logging';
import {
  applyUserDecisionToCounters,
  canTransition,
  createIdleSessionState,
  type SessionState,
} from '@twinby/session-orchestrator';
import { listMockProfiles, type MockProfileFixture } from '@twinby/test-fixtures';
import { toTwoStageAiRaw } from '@twinby/ai-provider';
import { createProviderFromDb, getAiConfig } from '../ipc/ai-handlers';
import { hasApiKey } from '../security/secrets';
import { HistoryRecorder } from './history-recorder';
import { purgePreviousDetailedSessions, getHistoryRoot } from './history-detail-store';
import { SessionLimitService } from './session-limit-service';

interface ActiveCandidate {
  captureId: string;
  fixture: MockProfileFixture;
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

export class MockSessionService {
  private state: SessionState = createIdleSessionState();
  private queue: MockProfileFixture[] = [];
  private index = 0;
  private active: ActiveCandidate | null = null;
  private pausedAt: SessionState['status'] | null = null;
  private loopToken = 0;
  private autoActions = 0;
  private evaluateAbort: AbortController | null = null;
  private readonly engine = new DefaultDecisionEngine();
  private readonly limitsSpend: SessionLimitService;
  private readonly history: HistoryRecorder;

  constructor(
    private readonly getDb: () => AppDatabase,
    private readonly getProjectRoot: () => string = () => process.cwd(),
  ) {
    this.limitsSpend = new SessionLimitService(getDb);
    this.history = new HistoryRecorder(getProjectRoot);
  }

  private getLimits(): SessionLimits {
    const raw = getSetting(this.getDb(), 'session_limits_json');
    if (!raw) {
      return DEFAULT_SESSION_LIMITS;
    }
    try {
      return SessionLimitsSchema.parse(JSON.parse(raw));
    } catch {
      return DEFAULT_SESSION_LIMITS;
    }
  }

  getViewState(): SessionViewState {
    return this.toViewState();
  }

  async start(raw?: unknown): Promise<SessionViewState> {
    const input: StartSessionInput = StartSessionInputSchema.parse(raw ?? {});
    if (input.source !== 'mock') {
      throw new Error('MockSessionService принимает только source=mock');
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

    const profiles = listMockProfiles();
    if (profiles.length === 0) {
      throw new Error('Fixtures не найдены в packages/test-fixtures/profiles');
    }

    const sessionId = randomUUID();
    const startedAt = new Date().toISOString();
    const historyRoot = getHistoryRoot(this.getProjectRoot());
    purgePreviousDetailedSessions(db, historyRoot);

    this.queue = profiles;
    this.index = 0;
    this.active = null;
    this.pausedAt = null;
    this.autoActions = 0;
    this.evaluateAbort?.abort();
    this.evaluateAbort = null;
    this.limitsSpend.resetSessionSpend();
    this.loopToken += 1;

    this.state = {
      sessionId,
      status: 'ready',
      mode: input.mode,
      source: 'mock',
      counters: {
        viewed: 0,
        likes: 0,
        dislikes: 0,
        reviews: 0,
        skips: 0,
        errors: 0,
      },
      startedAt,
      totalProfiles: profiles.length,
      remainingProfiles: profiles.length,
    };

    insertSession(db, {
      id: sessionId,
      mode: input.mode,
      source: 'mock',
      status: 'ready',
      startedAt,
      counters: this.state.counters,
      hasDetail: true,
    });

    getLogger('session').info({ sessionId, count: profiles.length }, 'Mock session started');
    void this.processNext(this.loopToken);
    return this.toViewState();
  }

  async pause(): Promise<SessionViewState> {
    if (!['ready', 'awaiting-review', 'cooldown', 'capturing-profile', 'evaluating'].includes(this.state.status)) {
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
      this.transition('ready');
      this.persistSession();
      void this.processNext(this.loopToken);
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
      this.state = {
        ...this.state,
        status: 'stopped',
        stoppedAt: new Date().toISOString(),
        remainingProfiles: Math.max(0, this.queue.length - this.index),
      };
      this.active = null;
      this.persistSession();
    }
    return this.toViewState();
  }

  async confirm(raw: unknown): Promise<SessionViewState> {
    const input = ReviewDecisionInputSchema.parse(raw);
    return this.resolveReview(input);
  }

  async skip(captureId: unknown): Promise<SessionViewState> {
    if (typeof captureId !== 'string' || !captureId) {
      throw new Error('Некорректный captureId');
    }
    if (this.state.status !== 'awaiting-review' || !this.active) {
      throw new Error('Нет анкеты, ожидающей решения');
    }
    if (this.active.captureId !== captureId) {
      throw new Error('Анкета уже сменилась — обновите состояние сессии');
    }

    const db = this.getDb();
    this.persistMockHistory(db, {
      sessionId: this.state.sessionId!,
      fixtureId: this.active.fixture.id,
      captureId,
      modelDecision: this.active.modelDecision,
      userDecision: 'skip',
      decisionSource: 'skip',
      confidence: this.active.modelConfidence,
      reasons: this.active.modelReasons,
      latencyMs: this.active.latencyMs,
      model: this.active.model,
      preferenceVersion: getPreferenceProfile(db).version,
      corrected: false,
      aiRawJson: this.active.aiRawJson,
      autoExecuted: false,
      sessionMode: this.state.mode,
      effectiveConfidence: this.active.effectiveConfidence,
    });

    this.state.counters = applyUserDecisionToCounters(this.state.counters, 'skip');
    this.transition('executing-action');
    // Mock: no real swipe
    this.transition('cooldown');
    this.active = null;
    this.index += 1;
    this.state.remainingProfiles = Math.max(0, this.queue.length - this.index);
    this.persistSession();
    void this.processNext(this.loopToken);
    return this.toViewState();
  }

  listHistory(raw?: unknown): PaginatedHistory {
    const query: HistoryQuery = HistoryQuerySchema.parse(raw ?? {});
    return listHistoryEvents(this.getDb(), query);
  }

  private async processNext(token: number): Promise<void> {
    if (token !== this.loopToken) {
      return;
    }
    if (this.state.status === 'paused' || this.state.status === 'stopping' || this.state.status === 'stopped') {
      return;
    }

    if (this.index >= this.queue.length) {
      this.active = null;
      this.state = {
        ...this.state,
        status: 'stopped',
        stoppedAt: new Date().toISOString(),
        remainingProfiles: 0,
      };
      this.persistSession();
      getLogger('session').info({ sessionId: this.state.sessionId }, 'Mock session finished fixtures');
      return;
    }

    const fixture = this.queue[this.index]!;
    try {
      this.transition('capturing-profile');
      const photoDataUrls = fixture.photoPaths.map((path) => fileToDataUrl(path));
      const captureId = randomUUID();
      this.active = {
        captureId,
        fixture,
        photoDataUrls,
        modelReasons: [],
      };
      this.state.counters = {
        ...this.state.counters,
        viewed: this.state.counters.viewed + 1,
      };
      this.state.remainingProfiles = Math.max(0, this.queue.length - this.index - 1);

      this.transition('evaluating');
      this.persistSession();

      const db = this.getDb();
      const preferences = getPreferenceProfile(db);
      const hardHit = evaluateHardFilters(
        {
          age: fixture.age,
          distanceKm: fixture.distanceKm,
          bio: fixture.bio,
          interests: fixture.interests,
          goal: fixture.goal,
          compatibilityPercent: fixture.compatibilityPercent,
        },
        preferences.hardFilters,
      );

      let modelDecision: SwipeDecision = 'review';
      let modelConfidence = 0;
      let modelReasons: string[] = [];
      let overallScore: number | undefined;
      let latencyMs: number | undefined;
      let model: string | undefined;
      let aiRawJson: string | undefined;

      if (hardHit) {
        modelDecision = hardHit.decision;
        modelConfidence = 1;
        modelReasons = [hardHit.reason];
      } else {
        const aiConfig = getAiConfig(db);
        const spendBlock = this.limitsSpend.checkAiSpendLimits(aiConfig);
        if (spendBlock) {
          this.state = {
            ...this.state,
            status: 'stopped',
            stoppedAt: new Date().toISOString(),
            errorMessage: spendBlock,
          };
          this.persistSession();
          return;
        }

        const summary = getStoredPreferenceSummary(db);
        const provider = createProviderFromDb(db, {
          imageDetail: 'low',
          maxOutputTokens: 768,
        });
        const aiPhotoCap = 3;
        const candidateImages = fixture.photoPaths
          .slice(0, aiPhotoCap)
          .map((path, i) => fileToAiImage(path, `candidate-${i + 1}`));
        this.evaluateAbort?.abort();
        this.evaluateAbort = new AbortController();
        const signal = this.evaluateAbort.signal;
        const evaluateInput = {
          preferenceProfile: preferences,
          preferenceSummary: summary?.summary,
          candidate: {
            age: fixture.age,
            distanceKm: fixture.distanceKm,
            compatibilityPercent: fixture.compatibilityPercent,
            relationshipGoal: fixture.goal,
            bio: fixture.bio,
            interests: fixture.interests,
            otherVisibleText: [] as string[],
          },
          candidateImages,
          recentFeedback: listRecentUserFeedback(db, 20),
          signal,
        };
        let result: Awaited<ReturnType<typeof provider.evaluateProfileTwoStage>>;
        try {
          try {
            result = await provider.evaluateProfileTwoStage(evaluateInput);
          } catch {
            result = await provider.evaluateProfile(evaluateInput);
          }
        } catch (aiErr) {
          const msg = aiErr instanceof Error ? aiErr.message : String(aiErr);
          if (signal.aborted || /отмен|abort/i.test(msg) || token !== this.loopToken) {
            return;
          }
          throw aiErr;
        }

        this.limitsSpend.recordAiSpend(
          db,
          aiConfig.usdPer1kTokens,
          result.promptTokens,
          result.completionTokens,
        );

        getLogger('session').info(
          {
            photosForAi: candidateImages.length,
            aiMs: result.latencyMs,
            pipeline: result.evidence ? 'two-stage' : 'mono',
          },
          'Mock profile pipeline latency',
        );

        // stop() bumps loopToken; ignore stale AI responses
        if (token !== this.loopToken) {
          return;
        }

        modelDecision = result.decision;
        modelConfidence = result.confidence;
        modelReasons = result.reasons.length
          ? result.reasons
          : [result.raw.shortReason].filter(Boolean);
        overallScore = result.raw.overallScore;
        latencyMs = result.latencyMs;
        model = result.model;
        if (result.evidence) {
          const [extractionModel, decisionModel] = result.model.includes('+')
            ? result.model.split('+')
            : [result.model, result.model];
          aiRawJson = JSON.stringify(
            toTwoStageAiRaw(result.evidence, result.raw, {
              extraction: extractionModel || result.model,
              decision: decisionModel || result.model,
            }),
          );
        } else {
          aiRawJson = JSON.stringify(result.raw);
        }
      }

      const final = this.engine.decide({
        mode: this.state.mode,
        ai: {
          decision: modelDecision,
          confidence: modelConfidence,
          reasons: modelReasons,
          overallScore,
        },
        hardFilterHit: hardHit,
        preferences,
        completeness: photoDataUrls.length >= 2 ? 0.85 : 0.6,
      });

      this.active = {
        ...this.active,
        modelDecision,
        modelConfidence,
        modelReasons: final.reasons,
        overallScore,
        decisionSource: final.source,
        finalDecision: final.decision,
        requiresConfirmation: final.requiresConfirmation,
        effectiveConfidence: final.effectiveConfidence,
        autoEligible: Boolean(final.executableAction && !final.requiresConfirmation),
        latencyMs,
        model,
        aiRawJson,
      };

      const limits = this.getLimits();
      const autoCapHit =
        limits.maxAutoActions > 0 && this.autoActions >= limits.maxAutoActions;
      if (
        this.state.mode === 'auto-high-confidence' &&
        final.executableAction &&
        autoCapHit
      ) {
        this.state = {
          ...this.state,
          status: 'stopped',
          stoppedAt: new Date().toISOString(),
          errorMessage: `Достигнут лимит auto-действий (${limits.maxAutoActions})`,
        };
        this.persistSession();
        return;
      }
      if (
        !final.requiresConfirmation &&
        final.executableAction &&
        (this.state.mode !== 'auto-high-confidence' || !autoCapHit)
      ) {
        this.persistSession();
        await this.autoExecute(token, final.executableAction);
        return;
      }
      // Auto never pauses for review — gray → dislike.
      if (this.state.mode === 'auto-high-confidence' && !autoCapHit) {
        const forced: 'like' | 'dislike' =
          final.decision === 'like' || final.decision === 'dislike'
            ? final.decision
            : 'dislike';
        this.persistSession();
        await this.autoExecute(token, forced);
        return;
      }

      this.transition('awaiting-review');
      this.persistSession();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      getLogger('session').error({ err: message }, 'Mock session evaluate failed');
      this.state.counters = {
        ...this.state.counters,
        errors: this.state.counters.errors + 1,
      };
      this.state = {
        ...this.state,
        status: 'error',
        errorMessage: message,
      };
      this.persistSession();
    }
  }

  private async resolveReview(input: ReviewDecisionInput): Promise<SessionViewState> {
    if (this.state.status !== 'awaiting-review' || !this.active) {
      throw new Error('Нет анкеты, ожидающей решения');
    }
    if (this.active.captureId !== input.captureId) {
      throw new Error('Анкета уже сменилась — обновите состояние сессии');
    }

    const db = this.getDb();
    const corrected =
      input.corrected ||
      (this.active.finalDecision != null && input.decision !== this.active.finalDecision);

    this.persistMockHistory(db, {
      sessionId: this.state.sessionId!,
      fixtureId: this.active.fixture.id,
      captureId: input.captureId,
      modelDecision: this.active.modelDecision,
      userDecision: input.decision,
      decisionSource: corrected ? 'user' : (this.active.decisionSource ?? 'ai'),
      confidence: this.active.modelConfidence,
      reasons: this.active.modelReasons,
      comment: input.comment,
      latencyMs: this.active.latencyMs,
      model: this.active.model,
      preferenceVersion: getPreferenceProfile(db).version,
      corrected,
      aiRawJson: this.active.aiRawJson,
      autoExecuted: false,
      sessionMode: this.state.mode,
      effectiveConfidence: this.active.effectiveConfidence,
    });

    this.state.counters = applyUserDecisionToCounters(this.state.counters, input.decision);
    this.transition('executing-action');
    // Mock adapter: pretend swipe succeeded
    this.transition('cooldown');
    this.active = null;
    this.index += 1;
    this.state.remainingProfiles = Math.max(0, this.queue.length - this.index);
    this.persistSession();
    void this.processNext(this.loopToken);
    return this.toViewState();
  }

  private async autoExecute(
    token: number,
    action: 'like' | 'dislike',
  ): Promise<void> {
    if (token !== this.loopToken || !this.active) {
      return;
    }
    const db = this.getDb();
    this.autoActions += 1;
    this.persistMockHistory(db, {
      sessionId: this.state.sessionId!,
      fixtureId: this.active.fixture.id,
      captureId: this.active.captureId,
      modelDecision: this.active.modelDecision,
      userDecision: action,
      decisionSource: 'auto',
      confidence: this.active.modelConfidence,
      effectiveConfidence: this.active.effectiveConfidence,
      reasons: this.active.modelReasons,
      latencyMs: this.active.latencyMs,
      model: this.active.model,
      preferenceVersion: getPreferenceProfile(db).version,
      corrected: false,
      aiRawJson: this.active.aiRawJson,
      autoExecuted: true,
      sessionMode: this.state.mode,
    });

    this.state.counters = applyUserDecisionToCounters(this.state.counters, action);
    this.transition('executing-action');
    this.transition('cooldown');
    this.active = null;
    this.index += 1;
    this.state.remainingProfiles = Math.max(0, this.queue.length - this.index);
    this.persistSession();
    getLogger('session').info(
      { action, autoActions: this.autoActions },
      'Mock auto action executed',
    );
    void this.processNext(token);
  }

  private persistMockHistory(
    db: AppDatabase,
    pendingHistory: Parameters<HistoryRecorder['persistMock']>[1],
  ): void {
    const source =
      this.active && this.state.sessionId
        ? {
            sessionId: this.state.sessionId,
            displayName: this.active.fixture.id,
            bio: this.active.fixture.bio,
            age: this.active.fixture.age,
            interests: this.active.fixture.interests,
            relationshipGoal: this.active.fixture.goal,
            distanceKm: this.active.fixture.distanceKm,
            modelDecision: this.active.modelDecision,
            modelReasons: this.active.modelReasons,
            aiRawJson: this.active.aiRawJson,
            sourcePhotoPaths: this.active.fixture.photoPaths,
            photoDataUrls: this.active.photoDataUrls,
          }
        : null;
    this.history.persistMock(db, pendingHistory, source);
  }

  private transition(to: SessionState['status']): void {
    if (!canTransition(this.state.status, to)) {
      getLogger('session').warn(
        { from: this.state.status, to },
        'Illegal session transition attempted',
      );
    }
    this.state = { ...this.state, status: to, errorMessage: to === 'error' ? this.state.errorMessage : undefined };
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
          fixtureId: this.active.fixture.id,
          age: this.active.fixture.age,
          distanceKm: this.active.fixture.distanceKm,
          bio: this.active.fixture.bio,
          interests: this.active.fixture.interests,
          goal: this.active.fixture.goal,
          compatibilityPercent: this.active.fixture.compatibilityPercent,
          photoDataUrls: this.active.photoDataUrls,
          captureWarnings: [],
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

function fileToAiImage(path: string, label: string): AiImageInput {
  const image = nativeImage.createFromPath(path);
  if (image.isEmpty()) {
    throw new Error(`Не удалось прочитать фото ${basename(path)}`);
  }
  const { width, height } = image.getSize();
  const maxSide = 768;
  const scale = Math.min(1, maxSide / Math.max(width, height, 1));
  const resized =
    scale < 1
      ? image.resize({
          width: Math.max(1, Math.round(width * scale)),
          height: Math.max(1, Math.round(height * scale)),
          quality: 'better',
        })
      : image;
  return {
    label,
    mimeType: 'image/jpeg',
    base64: resized.toJPEG(72).toString('base64'),
  };
}

function fileToDataUrl(path: string): string {
  const image = nativeImage.createFromPath(path);
  if (image.isEmpty()) {
    return '';
  }
  return `data:image/jpeg;base64,${image.toJPEG(80).toString('base64')}`;
}
