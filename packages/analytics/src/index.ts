export type AudienceFitLabel =
  | 'core'
  | 'acceptable'
  | 'borderline'
  | 'outside';

export type ExperimentMetricEventType =
  | 'incoming-like'
  | 'match'
  | 'conversation-started'
  | 'substantive-conversation'
  | 'telegram-exchanged'
  | 'date-proposed'
  | 'date-scheduled'
  | 'date-completed'
  | 'eurydice-session';

export interface ExperimentMetricEvent {
  id: string;
  type: ExperimentMetricEventType;
  occurredAt: string;
  audienceFit?: AudienceFitLabel;
  sessionId?: string;
  relationshipId?: string;
}

export interface MetricTotals {
  incomingLikes: number;
  targetIncomingLikes: number;
  matches: number;
  targetMatches: number;
  conversations: number;
  substantiveConversations: number;
  telegramExchanges: number;
  dateProposed: number;
  dateScheduled: number;
  dateCompleted: number;
  eurydiceSessions: number;
}

export interface MetricRatios {
  targetIncomingLikeShare: number | null;
  matchFromIncomingRate: number | null;
  conversationRate: number | null;
  substantiveConversationRate: number | null;
  telegramConversion: number | null;
  dateProposedRate: number | null;
  dateScheduledRate: number | null;
  dateCompletedRate: number | null;
  matchesPerSession: number | null;
  targetMatchesPerSession: number | null;
}

export interface PerDayMetrics {
  day: string;
  totals: MetricTotals;
}

export interface CalculatedExperimentMetrics {
  totals: MetricTotals;
  ratios: MetricRatios;
  perDay: PerDayMetrics[];
  sampleSize: number;
  activeDays: number;
  confidence: number;
}

export interface ExperimentMetricsService {
  compute(events: ExperimentMetricEvent[]): CalculatedExperimentMetrics;
}

function isTarget(fit?: AudienceFitLabel): boolean {
  return fit === 'core' || fit === 'acceptable';
}

function emptyTotals(): MetricTotals {
  return {
    incomingLikes: 0,
    targetIncomingLikes: 0,
    matches: 0,
    targetMatches: 0,
    conversations: 0,
    substantiveConversations: 0,
    telegramExchanges: 0,
    dateProposed: 0,
    dateScheduled: 0,
    dateCompleted: 0,
    eurydiceSessions: 0,
  };
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

function ratio(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1000) / 1000;
}

function applyEvent(totals: MetricTotals, event: ExperimentMetricEvent): void {
  switch (event.type) {
    case 'incoming-like':
      totals.incomingLikes += 1;
      if (isTarget(event.audienceFit)) totals.targetIncomingLikes += 1;
      break;
    case 'match':
      totals.matches += 1;
      if (isTarget(event.audienceFit)) totals.targetMatches += 1;
      break;
    case 'conversation-started':
      totals.conversations += 1;
      break;
    case 'substantive-conversation':
      totals.substantiveConversations += 1;
      break;
    case 'telegram-exchanged':
      totals.telegramExchanges += 1;
      break;
    case 'date-proposed':
      totals.dateProposed += 1;
      break;
    case 'date-scheduled':
      totals.dateScheduled += 1;
      break;
    case 'date-completed':
      totals.dateCompleted += 1;
      break;
    case 'eurydice-session':
      totals.eurydiceSessions += 1;
      break;
    default:
      break;
  }
}

export function computeRatios(totals: MetricTotals): MetricRatios {
  return {
    targetIncomingLikeShare: ratio(
      totals.targetIncomingLikes,
      totals.incomingLikes,
    ),
    matchFromIncomingRate: ratio(totals.matches, totals.incomingLikes),
    conversationRate: ratio(totals.conversations, totals.matches),
    substantiveConversationRate: ratio(
      totals.substantiveConversations,
      totals.conversations,
    ),
    telegramConversion: ratio(totals.telegramExchanges, totals.matches),
    dateProposedRate: ratio(totals.dateProposed, totals.matches),
    dateScheduledRate: ratio(totals.dateScheduled, totals.matches),
    dateCompletedRate: ratio(totals.dateCompleted, totals.matches),
    matchesPerSession: ratio(totals.matches, totals.eurydiceSessions),
    targetMatchesPerSession: ratio(
      totals.targetMatches,
      totals.eurydiceSessions,
    ),
  };
}

/**
 * Pure metrics from raw events — no LLM.
 */
export function computeExperimentMetrics(
  events: ExperimentMetricEvent[],
): CalculatedExperimentMetrics {
  const totals = emptyTotals();
  const byDay = new Map<string, MetricTotals>();

  for (const event of events) {
    applyEvent(totals, event);
    const day = dayKey(event.occurredAt);
    const dayTotals = byDay.get(day) ?? emptyTotals();
    applyEvent(dayTotals, event);
    byDay.set(day, dayTotals);
  }

  const perDay: PerDayMetrics[] = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, dayTotals]) => ({ day, totals: dayTotals }));

  const sampleSize =
    totals.incomingLikes + totals.matches + totals.eurydiceSessions;
  const activeDays = perDay.length;
  // Heuristic confidence grows with sample size, capped.
  const confidence = Math.min(
    0.95,
    Math.round((0.15 + Math.log10(sampleSize + 1) * 0.25) * 1000) / 1000,
  );

  return {
    totals,
    ratios: computeRatios(totals),
    perDay,
    sampleSize,
    activeDays,
    confidence,
  };
}

export class DefaultExperimentMetricsService implements ExperimentMetricsService {
  compute(events: ExperimentMetricEvent[]): CalculatedExperimentMetrics {
    return computeExperimentMetrics(events);
  }
}
