import { describe, expect, it } from 'vitest';
import {
  extractJsonObject,
  identityAnalysisToDraft,
  mapProviderError,
} from './index';

describe('ai-provider helpers', () => {
  it('extracts json from markdown fence', () => {
    const parsed = extractJsonObject('```json\n{"ok":true,"action":"review"}\n```') as {
      ok: boolean;
    };
    expect(parsed.ok).toBe(true);
  });

  it('maps unauthorized errors to Russian user message', () => {
    const mapped = mapProviderError({ status: 401, message: 'Incorrect API key' });
    expect(mapped.userMessage).toContain('API-ключ');
  });

  it('maps 403 permission denied to model-access guidance', () => {
    const mapped = mapProviderError({
      status: 403,
      message: '403 Permission denied (request id: abc)',
    });
    expect(mapped.userMessage).toContain('403');
    expect(mapped.userMessage.toLowerCase()).toMatch(/модел|fallback/);
  });

  it('maps identity snapshot analysis nulls to draft undefined/empty', () => {
    const draft = identityAnalysisToDraft({
      age: null,
      city: '  Москва  ',
      occupation: null,
      professionalArea: ' IT ',
      relationshipIntent: '',
      freeformText: 'Люблю nerdy юмор и руковожу IT-командой.',
      realInterests: [' настолки ', '', 'кино'],
      lifestyle: [],
      explicitNonIdentity: ['тусовщик'],
      resources: [],
      constraints: [],
      uncertainties: ['город не подтверждён фото'],
    });
    expect(draft.age).toBeUndefined();
    expect(draft.city).toBe('Москва');
    expect(draft.occupation).toBeUndefined();
    expect(draft.professionalArea).toBe('IT');
    expect(draft.relationshipIntent).toBeUndefined();
    expect(draft.realInterests).toEqual(['настолки', 'кино']);
    expect(draft.explicitNonIdentity).toEqual(['тусовщик']);
  });
});
