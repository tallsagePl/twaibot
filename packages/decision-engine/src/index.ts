import type {
  PreferenceProfile,
  SessionMode,
  SwipeDecision,
} from '@twinby/contracts';
import {
  computeEffectiveConfidence,
  resolveExecutionPolicy,
} from './execution-policy';

export {
  computeEffectiveConfidence,
  resolveExecutionPolicy,
  type ExecutionPolicyInput,
  type ExecutionPolicyResult,
} from './execution-policy';

type HardFilters = PreferenceProfile['hardFilters'];

export interface CandidateForFilters {
  age?: number;
  distanceKm?: number;
  bio?: string;
  interests?: string[];
  goal?: string;
  compatibilityPercent?: number;
}

export interface AiSuggestion {
  decision: SwipeDecision;
  confidence: number;
  reasons: string[];
  overallScore?: number;
}

export interface FinalDecision {
  decision: SwipeDecision;
  source: 'hard_filter' | 'ai' | 'user' | 'fallback';
  effectiveConfidence: number;
  reasons: string[];
  requiresConfirmation: boolean;
  executableAction: 'like' | 'dislike' | null;
  blockedBy: string[];
}

export interface HardFilterHit {
  reason: string;
  decision: SwipeDecision;
}

/** True when AI reasons already mark a hard-reject / C0 veto. */
export function hasC0Signal(reasons: string[]): boolean {
  return reasons.some((r) =>
    /\[C0\]|hard\s*reject|стоп-сигнал|veto/i.test(r),
  );
}

export interface ScoreActionReconcileResult {
  decision: SwipeDecision;
  confidence: number;
  note?: string;
}

/**
 * Align like/dislike with overallScore vs thresholds.
 * Never flips dislike→like; C0 reasons block weakening a dislike.
 */
export function reconcileScoreAction(input: {
  decision: SwipeDecision;
  confidence: number;
  overallScore?: number;
  likeScore: number;
  reasons: string[];
}): ScoreActionReconcileResult {
  const { overallScore, likeScore, reasons } = input;
  let { decision, confidence } = input;

  if (decision === 'review' || typeof overallScore !== 'number') {
    return { decision, confidence };
  }

  const c0 = hasC0Signal(reasons);

  if (decision === 'like' && overallScore < likeScore) {
    return {
      decision: 'dislike',
      confidence,
      note: `score↔action: like при overallScore ${overallScore} < likeScore ${likeScore} → dislike`,
    };
  }

  if (decision === 'dislike' && overallScore >= likeScore) {
    if (c0) {
      return {
        decision: 'dislike',
        confidence,
        note: `score↔action: dislike при score ${overallScore} ≥ likeScore ${likeScore}, сохранён из‑за C0`,
      };
    }
    return {
      decision: 'dislike',
      confidence: Math.max(0, Math.min(1, confidence * 0.7)),
      note: `score↔action mismatch: dislike при overallScore ${overallScore} ≥ likeScore ${likeScore}`,
    };
  }

  return { decision, confidence };
}

export function evaluateHardFilters(
  candidate: CandidateForFilters,
  filters: HardFilters,
): HardFilterHit | null {
  if (typeof candidate.age === 'number') {
    if (typeof filters.minAge === 'number' && candidate.age < filters.minAge) {
      return {
        decision: 'dislike',
        reason: `Возраст ${candidate.age} ниже минимума ${filters.minAge}`,
      };
    }
    if (typeof filters.maxAge === 'number' && candidate.age > filters.maxAge) {
      return {
        decision: 'dislike',
        reason: `Возраст ${candidate.age} выше максимума ${filters.maxAge}`,
      };
    }
  }

  if (
    typeof candidate.distanceKm === 'number' &&
    typeof filters.maxDistanceKm === 'number' &&
    candidate.distanceKm > filters.maxDistanceKm
  ) {
    return {
      decision: 'dislike',
      reason: `Дистанция ${candidate.distanceKm} км выше лимита ${filters.maxDistanceKm} км`,
    };
  }

  if (
    typeof candidate.compatibilityPercent === 'number' &&
    typeof filters.minCompatibilityPercent === 'number' &&
    candidate.compatibilityPercent < filters.minCompatibilityPercent
  ) {
    return {
      decision: 'dislike',
      reason: `Совместимость ${candidate.compatibilityPercent}% ниже минимума ${filters.minCompatibilityPercent}%`,
    };
  }

  if (filters.requireBio && !(candidate.bio && candidate.bio.trim())) {
    return {
      decision: 'dislike',
      reason: 'Нет описания (requireBio)',
    };
  }

  if (filters.allowedRelationshipGoals.length > 0 && candidate.goal) {
    const allowed = new Set(
      filters.allowedRelationshipGoals.map((g) => g.trim().toLowerCase()),
    );
    if (!allowed.has(candidate.goal.trim().toLowerCase())) {
      return {
        decision: 'dislike',
        reason: `Цель «${candidate.goal}» не в списке допустимых`,
      };
    }
  }

  if (filters.blockedKeywords.length > 0) {
    const haystack = [
      candidate.bio ?? '',
      ...(candidate.interests ?? []),
      candidate.goal ?? '',
    ]
      .join(' ')
      .toLowerCase();
    for (const keyword of filters.blockedKeywords) {
      const needle = keyword.trim().toLowerCase();
      if (needle && haystack.includes(needle)) {
        return {
          decision: 'dislike',
          reason: `Заблокированное слово: «${keyword}»`,
        };
      }
    }
  }

  return null;
}

export interface DecisionEngine {
  decide(input: {
    mode: SessionMode;
    ai: AiSuggestion;
    hardFilterHit?: HardFilterHit | null;
    preferences?: PreferenceProfile;
    completeness?: number;
  }): FinalDecision;
}

/**
 * Hard filters win; otherwise AI + execution policy (auto thresholds).
 */
export class DefaultDecisionEngine implements DecisionEngine {
  decide(input: {
    mode: SessionMode;
    ai: AiSuggestion;
    hardFilterHit?: HardFilterHit | null;
    preferences?: PreferenceProfile;
    completeness?: number;
  }): FinalDecision {
    const thresholds = input.preferences?.thresholds ?? {
      likeScore: 50,
      dislikeScore: 49,
      autoLikeScore: 0,
      autoDislikeScore: 100,
      minConfidence: 0,
    };

    if (input.hardFilterHit) {
      const decision = input.hardFilterHit.decision;
      const overallScore = decision === 'dislike' ? 0 : 100;
      const effectiveConfidence = 1;
      const policy = resolveExecutionPolicy({
        mode: input.mode,
        decision,
        overallScore,
        effectiveConfidence,
        thresholds,
      });
      return {
        decision,
        source: 'hard_filter',
        effectiveConfidence,
        reasons: [input.hardFilterHit.reason, policy.reason],
        requiresConfirmation: policy.requiresConfirmation,
        executableAction: policy.executableAction,
        blockedBy: policy.blockedBy,
      };
    }

    let decision = input.ai.decision;
    let modelConfidence = input.ai.confidence;
    const overallScore = input.ai.overallScore;
    const notes: string[] = [];
    const bodyStrictText = [
      input.preferences?.narrative.hardRejects,
      input.preferences?.narrative.priorities,
      input.preferences?.narrative.likedDescription,
      ...(input.preferences?.narrative.stopSkills ?? []),
      ...(input.preferences?.narrative.importantSkills ?? []),
      ...(input.preferences?.narrative.likedSkills ?? []),
    ]
      .filter(Boolean)
      .join(' ');
    const bodyStrict =
      /толст|худа|хрупк|slim|строй|не\s*полн|миниатюр/i.test(bodyStrictText);

    if (input.mode === 'auto-high-confidence' && decision === 'review') {
      // Unattended auto: never pause; uncertain/review → dislike (avoid false likes).
      decision = 'dislike';
      notes.push(
        typeof overallScore === 'number'
          ? `review→dislike (auto gray, score ${overallScore}${bodyStrict ? ', body-strict' : ''})`
          : bodyStrict
            ? 'review→dislike (нет score, body-strict)'
            : 'review→dislike (нет score, auto gray)',
      );
    }

    const reconciled = reconcileScoreAction({
      decision,
      confidence: modelConfidence,
      overallScore,
      likeScore: thresholds.likeScore,
      reasons: input.ai.reasons,
    });
    decision = reconciled.decision;
    modelConfidence = reconciled.confidence;
    if (reconciled.note) {
      notes.push(reconciled.note);
    }

    const effectiveConfidence = computeEffectiveConfidence({
      modelConfidence,
      completeness: input.completeness,
      overallScore,
      decision,
      autoLikeScore: thresholds.autoLikeScore,
      autoDislikeScore: thresholds.autoDislikeScore,
    });

    const policy = resolveExecutionPolicy({
      mode: input.mode,
      decision,
      overallScore,
      effectiveConfidence,
      thresholds,
    });

    const executable =
      input.mode === 'auto-high-confidence'
        ? policy.executableAction ??
          (decision === 'like' || decision === 'dislike' ? decision : 'dislike')
        : policy.executableAction;

    return {
      decision: executable ?? decision,
      source: 'ai',
      effectiveConfidence,
      reasons: [
        ...(input.ai.reasons.length
          ? input.ai.reasons
          : ['Решение модели без дополнительных причин']),
        ...notes,
        policy.reason,
      ],
      requiresConfirmation:
        input.mode === 'auto-high-confidence' ? false : policy.requiresConfirmation,
      executableAction: input.mode === 'auto-high-confidence' ? executable : policy.executableAction,
      blockedBy: input.mode === 'auto-high-confidence' ? [] : policy.blockedBy,
    };
  }
}

/** @deprecated use DefaultDecisionEngine */
export class NotImplementedDecisionEngine extends DefaultDecisionEngine {}
