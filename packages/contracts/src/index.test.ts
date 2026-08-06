import { describe, expect, it } from 'vitest';
import {
  AcceptConsentInputSchema,
  CONSENT_TEXT_VERSION,
  PingRequestSchema,
  PingResponseSchema,
} from './index';

describe('contracts', () => {
  it('validates ping request', () => {
    expect(PingRequestSchema.parse({ message: 'hello' }).message).toBe('hello');
  });

  it('rejects empty ping message', () => {
    expect(() => PingRequestSchema.parse({ message: '' })).toThrow();
  });

  it('validates ping response', () => {
    const result = PingResponseSchema.parse({
      ok: true,
      echo: 'hello',
      appVersion: '0.1.0',
      timestamp: new Date().toISOString(),
    });
    expect(result.ok).toBe(true);
  });

  it('requires exact consent version and accepted=true', () => {
    expect(
      AcceptConsentInputSchema.parse({
        consentVersion: CONSENT_TEXT_VERSION,
        accepted: true,
      }),
    ).toEqual({
      consentVersion: CONSENT_TEXT_VERSION,
      accepted: true,
    });
  });
});
