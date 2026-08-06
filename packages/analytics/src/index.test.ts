import { describe, expect, it } from 'vitest';
import {
  DefaultExperimentMetricsService,
  type ExperimentMetricEvent,
} from './index.js';

describe('DefaultExperimentMetricsService', () => {
  const service = new DefaultExperimentMetricsService();

  const events: ExperimentMetricEvent[] = [
    {
      id: '1',
      type: 'incoming-like',
      occurredAt: '2026-08-01T10:00:00.000Z',
      audienceFit: 'core',
    },
    {
      id: '2',
      type: 'incoming-like',
      occurredAt: '2026-08-01T11:00:00.000Z',
      audienceFit: 'outside',
    },
    {
      id: '3',
      type: 'match',
      occurredAt: '2026-08-02T09:00:00.000Z',
      audienceFit: 'acceptable',
    },
    {
      id: '4',
      type: 'eurydice-session',
      occurredAt: '2026-08-02T08:00:00.000Z',
    },
    {
      id: '5',
      type: 'telegram-exchanged',
      occurredAt: '2026-08-02T12:00:00.000Z',
    },
  ];

  it('computes totals', () => {
    const metrics = service.compute(events);
    expect(metrics.totals.incomingLikes).toBe(2);
    expect(metrics.totals.targetIncomingLikes).toBe(1);
    expect(metrics.totals.matches).toBe(1);
    expect(metrics.totals.targetMatches).toBe(1);
    expect(metrics.totals.telegramExchanges).toBe(1);
    expect(metrics.totals.eurydiceSessions).toBe(1);
  });

  it('computes ratios', () => {
    const metrics = service.compute(events);
    expect(metrics.ratios.targetIncomingLikeShare).toBe(0.5);
    expect(metrics.ratios.matchFromIncomingRate).toBe(0.5);
    expect(metrics.ratios.matchesPerSession).toBe(1);
    expect(metrics.ratios.telegramConversion).toBe(1);
  });

  it('groups per-day', () => {
    const metrics = service.compute(events);
    expect(metrics.perDay).toHaveLength(2);
    expect(metrics.perDay[0]?.day).toBe('2026-08-01');
    expect(metrics.perDay[0]?.totals.incomingLikes).toBe(2);
    expect(metrics.perDay[1]?.day).toBe('2026-08-02');
    expect(metrics.perDay[1]?.totals.matches).toBe(1);
    expect(metrics.activeDays).toBe(2);
  });

  it('returns null ratios when denominator is zero', () => {
    const metrics = service.compute([]);
    expect(metrics.ratios.targetIncomingLikeShare).toBeNull();
    expect(metrics.ratios.matchesPerSession).toBeNull();
    expect(metrics.sampleSize).toBe(0);
  });
});
