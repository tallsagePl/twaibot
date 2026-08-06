import type {
  PreferenceProfile,
  SessionMode,
  SwipeDecision,
} from '@twinby/contracts';

type Thresholds = PreferenceProfile['thresholds'];

export interface ExecutionPolicyInput {
  mode: SessionMode;
  decision: SwipeDecision;
  overallScore?: number;
  effectiveConfidence: number;
  thresholds: Thresholds;
  blockedBy?: string[];
}

export interface ExecutionPolicyResult {
  requiresConfirmation: boolean;
  /** Action that may run without user confirm in auto mode */
  executableAction: 'like' | 'dislike' | null;
  blockedBy: string[];
  reason: string;
}

/**
 * recommendation-only → always confirm.
 * auto-high-confidence → unattended: never pause for review; gray/uncertain → dislike.
 */
export function resolveExecutionPolicy(input: ExecutionPolicyInput): ExecutionPolicyResult {
  const blockedBy = [...(input.blockedBy ?? [])];

  if (input.mode === 'recommendation-only') {
    return {
      requiresConfirmation: true,
      executableAction: null,
      blockedBy,
      reason: 'Режим recommendation-only: нужно подтверждение',
    };
  }

  // Auto mode: never ask the user. review / uncertain → dislike (safer than false like).
  if (input.decision === 'review') {
    return {
      requiresConfirmation: false,
      executableAction: 'dislike',
      blockedBy: [],
      reason: 'review→dislike (auto, gray→dislike)',
    };
  }

  if (blockedBy.length > 0) {
    // Still auto — hard blockers already applied as dislike upstream.
    return {
      requiresConfirmation: false,
      executableAction: input.decision,
      blockedBy: [],
      reason: `Auto ${input.decision} despite flags: ${blockedBy.join(', ')}`,
    };
  }

  return {
    requiresConfirmation: false,
    executableAction: input.decision,
    blockedBy: [],
    reason: `Auto-${input.decision}: score ${input.overallScore ?? 'n/a'}`,
  };
}

export function computeEffectiveConfidence(input: {
  modelConfidence: number;
  completeness?: number;
  overallScore?: number;
  decision: SwipeDecision;
  autoLikeScore: number;
  autoDislikeScore: number;
}): number {
  // Keep effective confidence high enough for aggressive auto thresholds.
  const completenessFactor = clamp(input.completeness ?? 0.9, 0.65, 1);
  let thresholdDistanceFactor = 0.95;
  if (typeof input.overallScore === 'number') {
    if (input.decision === 'like') {
      const margin = input.overallScore - input.autoLikeScore;
      thresholdDistanceFactor = clamp(0.88 + margin / 60, 0.7, 1);
    } else if (input.decision === 'dislike') {
      const margin = input.autoDislikeScore - input.overallScore;
      thresholdDistanceFactor = clamp(0.88 + margin / 60, 0.7, 1);
    } else {
      thresholdDistanceFactor = 0.55;
    }
  }
  return round3(
    clamp(input.modelConfidence * completenessFactor * thresholdDistanceFactor, 0, 1),
  );
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
