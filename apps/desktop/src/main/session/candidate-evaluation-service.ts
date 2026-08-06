import type { SessionMode, CapturedProfile, SessionLimits, SwipeDecision } from '@twinby/contracts';
import {
  DefaultDecisionEngine,
  evaluateHardFilters,
  type FinalDecision,
  type HardFilterHit,
} from '@twinby/decision-engine';
import {
  getPreferenceProfile,
  getStoredPreferenceSummary,
  listRecentUserFeedback,
  type AppDatabase,
} from '@twinby/database';
import { getLogger } from '@twinby/logging';
import { toTwoStageAiRaw } from '@twinby/ai-provider';
import { createProviderFromDb, getAiConfig } from '../ipc/ai-handlers';
import type { SessionLimitService } from './session-limit-service';
import { fileToAiImage, isRetryableError, sleep } from './session-utils';

export type CandidateEvaluationResult =
  | { kind: 'aborted' }
  | { kind: 'spend-limit'; message: string }
  | {
      kind: 'awaiting-manual';
      modelDecision: SwipeDecision;
      modelConfidence: number;
      modelReasons: string[];
      bumpErrors: boolean;
    }
  | {
      kind: 'evaluated';
      modelDecision: SwipeDecision;
      modelConfidence: number;
      modelReasons: string[];
      overallScore?: number;
      latencyMs?: number;
      model?: string;
      aiRawJson?: string;
      hardHit: HardFilterHit | null;
      final: FinalDecision;
      bumpErrors: boolean;
    };

export class CandidateEvaluationService {
  private readonly engine = new DefaultDecisionEngine();

  constructor(private readonly limitsSpend: SessionLimitService) {}

  async evaluate(input: {
    db: AppDatabase;
    captured: CapturedProfile;
    captureMs: number;
    limits: SessionLimits;
    mode: SessionMode;
    currentToken: number;
    getLoopToken: () => number;
    getAbortController: () => AbortController | null;
    setAbortController: (c: AbortController | null) => void;
  }): Promise<CandidateEvaluationResult> {
    const {
      db,
      captured,
      captureMs,
      limits,
      mode,
      currentToken,
      getLoopToken,
      getAbortController,
      setAbortController,
    } = input;
    const isStale = () => currentToken !== getLoopToken();

    const preferences = getPreferenceProfile(db);
    const hardHit = evaluateHardFilters(
      {
        age: captured.fields.age,
        distanceKm: captured.fields.distanceKm,
        bio: captured.fields.bio,
        interests: captured.fields.interests,
        goal: captured.fields.relationshipGoal,
        compatibilityPercent: captured.fields.compatibilityPercent,
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
    let bumpErrors = false;

    if (hardHit) {
      modelDecision = hardHit.decision;
      modelConfidence = 1;
      modelReasons = [hardHit.reason];
      getLogger('session').info(
        {
          captureMs,
          aiMs: 0,
          photosCaptured: captured.images.length,
          photosForAi: 0,
          speedPreset: limits.speedPreset,
          hardFilter: true,
        },
        'Profile pipeline latency',
      );
    } else {
      const aiConfig = getAiConfig(db);
      const spendBlock = this.limitsSpend.checkAiSpendLimits(aiConfig);
      if (spendBlock) {
        return { kind: 'spend-limit', message: spendBlock };
      }

      const summary = getStoredPreferenceSummary(db);
      const provider = createProviderFromDb(db, {
        imageDetail: 'low',
        maxOutputTokens: 768,
      });
      const aiPhotoCap = Math.min(6, Math.max(1, limits.maxPhotosForAi));
      const imagesForAi = captured.images.slice(0, aiPhotoCap);
      const candidateImages = imagesForAi.map((img, i) =>
        fileToAiImage(img.path, img.dataUrl, `candidate-${i + 1}`),
      );
      getAbortController()?.abort();
      const evaluateAbort = new AbortController();
      setAbortController(evaluateAbort);
      const evaluateSignal = evaluateAbort.signal;
      const evaluateInput = {
        preferenceProfile: preferences,
        preferenceSummary: summary?.summary,
        candidate: {
          age: captured.fields.age,
          distanceKm: captured.fields.distanceKm,
          compatibilityPercent: captured.fields.compatibilityPercent,
          relationshipGoal: captured.fields.relationshipGoal,
          bio: captured.fields.bio,
          interests: captured.fields.interests,
          otherVisibleText: captured.fields.otherVisibleText,
        },
        candidateImages,
        recentFeedback: listRecentUserFeedback(db, 20),
        signal: evaluateSignal,
      };

      let result: Awaited<ReturnType<typeof provider.evaluateProfileTwoStage>> | null =
        null;
      let lastAiError: string | null = null;
      const aiStarted = Date.now();
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          if (evaluateSignal.aborted || isStale()) {
            return { kind: 'aborted' };
          }
          try {
            result = await provider.evaluateProfileTwoStage(evaluateInput);
          } catch (twoStageErr) {
            if (evaluateSignal.aborted || isStale()) {
              return { kind: 'aborted' };
            }
            const msg =
              twoStageErr instanceof Error ? twoStageErr.message : String(twoStageErr);
            getLogger('session').warn(
              { attempt, err: msg },
              'Two-stage AI failed — falling back to mono evaluateProfile',
            );
            const mono = await provider.evaluateProfile(evaluateInput);
            result = mono;
          }
          lastAiError = null;
          break;
        } catch (aiErr) {
          lastAiError = aiErr instanceof Error ? aiErr.message : String(aiErr);
          if (evaluateSignal.aborted || isStale() || /отмен|abort/i.test(lastAiError)) {
            return { kind: 'aborted' };
          }
          getLogger('session').warn(
            { attempt, err: lastAiError },
            'AI evaluate failed, retrying',
          );
          if (!isRetryableError(lastAiError) || attempt === 3) {
            break;
          }
          await sleep(1500 * attempt);
          if (isStale()) {
            return { kind: 'aborted' };
          }
        }
      }
      if (result) {
        this.limitsSpend.recordAiSpend(
          db,
          aiConfig.usdPer1kTokens,
          result.promptTokens,
          result.completionTokens,
        );
      }
      const aiMs = Date.now() - aiStarted;
      getLogger('session').info(
        {
          captureMs,
          aiMs,
          photosCaptured: captured.images.length,
          photosForAi: imagesForAi.length,
          speedPreset: limits.speedPreset,
          minActionIntervalMs: limits.minActionIntervalMs,
          pipeline: result?.evidence ? 'two-stage' : 'mono',
        },
        'Profile pipeline latency',
      );

      if (isStale()) {
        return { kind: 'aborted' };
      }

      if (!result) {
        bumpErrors = true;
        const errText = lastAiError ?? 'unknown';
        // Don't burn the feed with auto-dislike when the key/model is forbidden.
        if (
          /403|Permission denied|недоступн|API-ключ|Неверный API|баланс|лимит запросов/i.test(
            errText,
          )
        ) {
          return {
            kind: 'spend-limit',
            message: `ИИ недоступен: ${errText}`,
          };
        }
        if (mode === 'auto-high-confidence') {
          modelDecision = 'dislike';
          modelConfidence = 0.3;
          modelReasons = [`ИИ не ответил (${errText}) → auto dislike`];
          overallScore = 20;
        } else {
          return {
            kind: 'awaiting-manual',
            modelDecision: 'review',
            modelConfidence: 0,
            modelReasons: [
              `ИИ не ответил (${errText}). Выберите like/dislike вручную.`,
            ],
            bumpErrors: true,
          };
        }
      } else {
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
    }

    if (captured.warnings.length) {
      modelReasons = [...modelReasons, ...captured.warnings.slice(0, 3)];
    }

    const final = this.engine.decide({
      mode,
      ai: {
        decision: modelDecision,
        confidence: modelConfidence,
        reasons: modelReasons,
        overallScore,
      },
      hardFilterHit: hardHit,
      preferences,
      completeness: captured.completeness.overall,
    });

    return {
      kind: 'evaluated',
      modelDecision,
      modelConfidence,
      modelReasons: final.reasons,
      overallScore,
      latencyMs,
      model,
      aiRawJson,
      hardHit,
      final,
      bumpErrors,
    };
  }
}
