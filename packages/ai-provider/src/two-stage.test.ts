import { describe, expect, it } from 'vitest';
import { ProfileEvidenceSchema, TwoStageAiRawSchema } from '@twinby/contracts';
import { toTwoStageAiRaw } from './index';

describe('ProfileEvidence two-stage', () => {
  it('parses evidence and wraps two-stage raw', () => {
    const evidence = ProfileEvidenceSchema.parse({
      observations: {
        faceVisibility: 'clear',
        bodyVisibility: 'partial',
        bodyTypeHint: 'slim',
        photoTypes: ['portrait', 'travel'],
        presentation: ['natural'],
        bioSignals: ['music'],
        notableVisual: ['длинные волосы'],
      },
      uncertainties: ['Телосложение полностью не видно'],
      evidenceCompleteness: 0.7,
    });

    const decision = {
      action: 'dislike' as const,
      overallScore: 35,
      confidence: 0.8,
      breakdown: {
        visualFit: 40,
        presentationFit: 60,
        bioFit: 50,
        interestsFit: null,
        compatibilityFit: null,
        distanceFit: null,
      },
      matchedPreferences: [],
      concerns: ['[C0] силуэт неясен при hardReject'],
      uncertainties: ['Телосложение полностью не видно'],
      shortReason: '[C0] Недостаточно тела при жёстком фильтре — дизлайк.',
      evidenceCompleteness: 0.7,
    };

    const raw = toTwoStageAiRaw(evidence, decision, {
      extraction: 'model-a',
      decision: 'model-b',
    });
    expect(TwoStageAiRawSchema.parse(raw).pipeline).toBe('two-stage');
    expect(raw.evidence.observations.bodyTypeHint).toBe('slim');
  });
});
