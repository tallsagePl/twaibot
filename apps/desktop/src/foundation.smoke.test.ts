import { describe, expect, it } from 'vitest';
import {
  AcceptConsentInputSchema,
  CONSENT_TEXT_VERSION,
  IPC_CHANNELS,
  PingRequestSchema,
} from '@twinby/contracts';

describe('desktop foundation smoke', () => {
  it('exposes required IPC channels', () => {
    expect(IPC_CHANNELS.APP_PING).toBe('app:ping');
    expect(IPC_CHANNELS.DATABASE_HEALTH).toBe('database:health');
    expect(IPC_CHANNELS.LEGAL_ACCEPT).toBe('legal:acceptConsent');
    expect(IPC_CHANNELS.AI_ANALYZE_REFERENCES).toBe('ai:analyzeReferences');
    expect(IPC_CHANNELS.REFERENCES_ADD).toBe('references:add');
    expect(IPC_CHANNELS.SUMMARY_GET).toBe('summary:get');
  });

  it('keeps ping and consent contracts stable', () => {
    expect(PingRequestSchema.parse({ message: 'foundation' }).message).toBe(
      'foundation',
    );
    expect(
      AcceptConsentInputSchema.parse({
        consentVersion: CONSENT_TEXT_VERSION,
        accepted: true,
      }).accepted,
    ).toBe(true);
  });
});
