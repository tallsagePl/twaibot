import { describe, expect, it } from 'vitest';
import {
  DefaultDecisionEngine,
  evaluateHardFilters,
} from './index.js';
import {
  computeEffectiveConfidence,
  resolveExecutionPolicy,
} from './execution-policy.js';

const filters = {
  minAge: 25,
  maxAge: 40,
  maxDistanceKm: 50,
  minCompatibilityPercent: 40,
  blockedKeywords: ['лёгкое общение', 'только друзья'],
  preferredKeywords: [] as string[],
  allowedRelationshipGoals: [] as string[],
  requireBio: false,
};

const thresholds = {
  likeScore: 50,
  dislikeScore: 49,
  autoLikeScore: 0,
  autoDislikeScore: 100,
  minConfidence: 0,
};

describe('evaluateHardFilters', () => {
  it('rejects age below min', () => {
    const hit = evaluateHardFilters({ age: 22, bio: 'ok' }, filters);
    expect(hit?.decision).toBe('dislike');
    expect(hit?.reason).toMatch(/Возраст/);
  });

  it('rejects blocked keyword', () => {
    const hit = evaluateHardFilters(
      {
        age: 30,
        bio: 'Не ищу серьёзное — только лёгкое общение.',
        goal: 'дружба',
        compatibilityPercent: 70,
        distanceKm: 10,
      },
      filters,
    );
    expect(hit?.reason).toMatch(/Заблокированное слово/);
  });

  it('passes clean candidate', () => {
    const hit = evaluateHardFilters(
      {
        age: 28,
        bio: 'Люблю музыку',
        goal: 'отношения',
        compatibilityPercent: 80,
        distanceKm: 5,
      },
      filters,
    );
    expect(hit).toBeNull();
  });
});

describe('resolveExecutionPolicy', () => {
  it('always confirms in recommendation-only', () => {
    const r = resolveExecutionPolicy({
      mode: 'recommendation-only',
      decision: 'like',
      overallScore: 95,
      effectiveConfidence: 0.95,
      thresholds,
    });
    expect(r.requiresConfirmation).toBe(true);
    expect(r.executableAction).toBeNull();
  });

  it('auto-likes without score gap', () => {
    const r = resolveExecutionPolicy({
      mode: 'auto-high-confidence',
      decision: 'like',
      overallScore: 55,
      effectiveConfidence: 0.2,
      thresholds,
    });
    expect(r.requiresConfirmation).toBe(false);
    expect(r.executableAction).toBe('like');
  });

  it('auto-dislikes without score gap', () => {
    const r = resolveExecutionPolicy({
      mode: 'auto-high-confidence',
      decision: 'dislike',
      overallScore: 10,
      effectiveConfidence: 0.1,
      thresholds,
    });
    expect(r.requiresConfirmation).toBe(false);
    expect(r.executableAction).toBe('dislike');
  });

  it('coerces review to dislike in auto policy', () => {
    const r = resolveExecutionPolicy({
      mode: 'auto-high-confidence',
      decision: 'review',
      overallScore: 62,
      effectiveConfidence: 0.1,
      thresholds,
    });
    expect(r.requiresConfirmation).toBe(false);
    expect(r.executableAction).toBe('dislike');
  });
});

describe('DefaultDecisionEngine auto', () => {
  const engine = new DefaultDecisionEngine();
  const preferences = {
    id: 'p',
    name: 't',
    hardFilters: filters,
    narrative: {
      likedDescription: '',
      dislikedDescription: '',
      priorities: '',
      hardRejects: '',
      uncertaintyPolicy: '',
      likedSkills: [],
      dislikedSkills: [],
      importantSkills: [],
      stopSkills: [],
    },
    weights: {
      visual: 0.55,
      presentation: 0.2,
      bio: 0.1,
      interests: 0.08,
      compatibility: 0.05,
      distance: 0.02,
    },
    thresholds,
    version: 1,
    createdAt: '',
    updatedAt: '',
  };

  it('requires confirmation in recommendation-only', () => {
    const final = engine.decide({
      mode: 'recommendation-only',
      ai: { decision: 'like', confidence: 0.95, reasons: ['ok'], overallScore: 92 },
      preferences,
      completeness: 0.9,
    });
    expect(final.requiresConfirmation).toBe(true);
    expect(final.executableAction).toBeNull();
  });

  it('never asks in auto for mid scores', () => {
    const final = engine.decide({
      mode: 'auto-high-confidence',
      ai: {
        decision: 'like',
        confidence: 0.4,
        reasons: ['borderline'],
        overallScore: 55,
      },
      preferences,
      completeness: 0.5,
    });
    expect(final.requiresConfirmation).toBe(false);
    expect(final.executableAction).toBe('like');
  });

  it('coerces review to dislike in auto even with high score', () => {
    const final = engine.decide({
      mode: 'auto-high-confidence',
      ai: {
        decision: 'review',
        confidence: 0.2,
        reasons: ['unsure'],
        overallScore: 70,
      },
      preferences,
      completeness: 0.4,
    });
    expect(final.decision).toBe('dislike');
    expect(final.requiresConfirmation).toBe(false);
    expect(final.executableAction).toBe('dislike');
  });

  it('prefers hard filter and can auto-dislike', () => {
    const final = engine.decide({
      mode: 'auto-high-confidence',
      ai: { decision: 'like', confidence: 0.9, reasons: ['ok'], overallScore: 90 },
      hardFilterHit: { decision: 'dislike', reason: 'age' },
      preferences,
    });
    expect(final.decision).toBe('dislike');
    expect(final.source).toBe('hard_filter');
    expect(final.executableAction).toBe('dislike');
  });
});

describe('DefaultDecisionEngine score↔action', () => {
  const engine = new DefaultDecisionEngine();
  const preferences = {
    id: 'p',
    name: 't',
    hardFilters: filters,
    narrative: {
      likedDescription: '',
      dislikedDescription: '',
      priorities: '',
      hardRejects: '',
      uncertaintyPolicy: '',
      likedSkills: [],
      dislikedSkills: [],
      importantSkills: [],
      stopSkills: [],
    },
    weights: {
      visual: 0.55,
      presentation: 0.2,
      bio: 0.1,
      interests: 0.08,
      compatibility: 0.05,
      distance: 0.02,
    },
    thresholds,
    version: 1,
    createdAt: '',
    updatedAt: '',
  };

  it('coerces like below likeScore to dislike', () => {
    const final = engine.decide({
      mode: 'recommendation-only',
      ai: {
        decision: 'like',
        confidence: 0.9,
        reasons: ['pretty face'],
        overallScore: 30,
      },
      preferences,
      completeness: 0.9,
    });
    expect(final.decision).toBe('dislike');
    expect(final.reasons.join(' ')).toMatch(/score↔action/);
  });

  it('keeps dislike above likeScore but lowers confidence', () => {
    const aligned = engine.decide({
      mode: 'recommendation-only',
      ai: {
        decision: 'dislike',
        confidence: 1,
        reasons: ['no'],
        overallScore: 20,
      },
      preferences,
      completeness: 1,
    });
    const mismatch = engine.decide({
      mode: 'recommendation-only',
      ai: {
        decision: 'dislike',
        confidence: 1,
        reasons: ['no'],
        overallScore: 80,
      },
      preferences,
      completeness: 1,
    });
    expect(mismatch.decision).toBe('dislike');
    expect(mismatch.reasons.join(' ')).toMatch(/score↔action mismatch/);
    expect(mismatch.effectiveConfidence).toBeLessThan(aligned.effectiveConfidence);
  });

  it('does not rescue like when C0 reason and low score', () => {
    const final = engine.decide({
      mode: 'recommendation-only',
      ai: {
        decision: 'like',
        confidence: 0.85,
        reasons: ['[C0] нарушен hard reject по фигуре'],
        overallScore: 30,
      },
      preferences,
      completeness: 0.8,
    });
    expect(final.decision).toBe('dislike');
    expect(final.reasons.join(' ')).toMatch(/score↔action/);
  });

  it('keeps C0 dislike without confidence penalty when score is high', () => {
    const plain = engine.decide({
      mode: 'recommendation-only',
      ai: {
        decision: 'dislike',
        confidence: 1,
        reasons: ['no'],
        overallScore: 80,
      },
      preferences,
      completeness: 1,
    });
    const withC0 = engine.decide({
      mode: 'recommendation-only',
      ai: {
        decision: 'dislike',
        confidence: 1,
        reasons: ['[C0] veto'],
        overallScore: 80,
      },
      preferences,
      completeness: 1,
    });
    expect(withC0.decision).toBe('dislike');
    expect(withC0.reasons.join(' ')).toMatch(/сохранён из‑за C0/);
    expect(withC0.effectiveConfidence).toBeGreaterThan(plain.effectiveConfidence);
  });
});

describe('computeEffectiveConfidence', () => {
  it('is below raw when completeness low', () => {
    const eff = computeEffectiveConfidence({
      modelConfidence: 1,
      completeness: 0.4,
      decision: 'like',
      overallScore: 90,
      autoLikeScore: 0,
      autoDislikeScore: 100,
    });
    expect(eff).toBeLessThan(1);
  });
});
