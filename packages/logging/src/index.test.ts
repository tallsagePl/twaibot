import { describe, expect, it } from 'vitest';
import { safeLogFields } from './index';

describe('logging redaction', () => {
  it('redacts sensitive keys', () => {
    const result = safeLogFields({
      apiKey: 'sk-secret',
      model: 'gpt',
      nested: { token: 'abc', ok: true },
    });
    expect(result.apiKey).toBe('[REDACTED]');
    expect(result.model).toBe('gpt');
    expect((result.nested as Record<string, unknown>).token).toBe('[REDACTED]');
    expect((result.nested as Record<string, unknown>).ok).toBe(true);
  });
});
