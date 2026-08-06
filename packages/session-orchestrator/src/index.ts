import type { SessionMode, SwipeDecision } from '@twinby/contracts';

export type SessionStatus =
  | 'idle'
  | 'validating-environment'
  | 'starting-emulator'
  | 'waiting-for-device'
  | 'starting-appium'
  | 'connecting'
  | 'opening-twinby'
  | 'ready'
  | 'capturing-profile'
  | 'evaluating'
  | 'awaiting-review'
  | 'executing-action'
  | 'cooldown'
  | 'recovering'
  | 'paused'
  | 'stopping'
  | 'stopped'
  | 'error';

/** Mock session uses a subset of the full machine. */
export const MOCK_SESSION_STATUSES: SessionStatus[] = [
  'idle',
  'ready',
  'capturing-profile',
  'evaluating',
  'awaiting-review',
  'executing-action',
  'cooldown',
  'paused',
  'stopping',
  'stopped',
  'error',
];

const MOCK_TRANSITIONS: Record<SessionStatus, SessionStatus[]> = {
  idle: ['ready', 'validating-environment', 'error'],
  'validating-environment': [
    'starting-appium',
    'connecting',
    'opening-twinby',
    'ready',
    'error',
    'stopping',
  ],
  'starting-emulator': ['waiting-for-device', 'error', 'stopping'],
  'waiting-for-device': ['starting-appium', 'error', 'stopping'],
  'starting-appium': ['connecting', 'error', 'stopping'],
  connecting: ['opening-twinby', 'ready', 'error', 'stopping'],
  'opening-twinby': ['ready', 'error', 'stopping'],
  ready: ['capturing-profile', 'paused', 'stopping', 'stopped', 'error'],
  'capturing-profile': ['evaluating', 'recovering', 'awaiting-review', 'stopping', 'error'],
  evaluating: ['awaiting-review', 'executing-action', 'recovering', 'stopping', 'error'],
  'awaiting-review': ['executing-action', 'cooldown', 'paused', 'stopping', 'error'],
  'executing-action': ['cooldown', 'recovering', 'awaiting-review', 'stopping', 'error'],
  cooldown: ['capturing-profile', 'ready', 'stopped', 'stopping', 'error', 'recovering'],
  recovering: ['ready', 'cooldown', 'capturing-profile', 'awaiting-review', 'error', 'stopping'],
  paused: ['ready', 'capturing-profile', 'awaiting-review', 'stopping', 'stopped'],
  stopping: ['stopped'],
  stopped: ['idle', 'ready', 'validating-environment'],
  error: [
    'idle',
    'stopped',
    'stopping',
    'validating-environment',
    'recovering',
    'ready',
    'capturing-profile',
    'cooldown',
    'awaiting-review',
    'executing-action',
  ],
};

export function canTransition(from: SessionStatus, to: SessionStatus): boolean {
  if (from === to) {
    return true;
  }
  return MOCK_TRANSITIONS[from]?.includes(to) ?? false;
}

export interface SessionCounters {
  viewed: number;
  likes: number;
  dislikes: number;
  reviews: number;
  skips: number;
  errors: number;
}

export interface SessionState {
  sessionId: string | null;
  status: SessionStatus;
  mode: SessionMode;
  source: 'mock' | 'live';
  counters: SessionCounters;
  startedAt?: string;
  stoppedAt?: string;
  errorMessage?: string;
  totalProfiles: number;
  remainingProfiles: number;
}

export type SessionEvent =
  | { type: 'state'; state: SessionState }
  | { type: 'error'; message: string }
  | { type: 'profile'; captureId: string };

export function createIdleSessionState(mode: SessionMode = 'recommendation-only'): SessionState {
  return {
    sessionId: null,
    status: 'idle',
    mode,
    source: 'mock',
    counters: {
      viewed: 0,
      likes: 0,
      dislikes: 0,
      reviews: 0,
      skips: 0,
      errors: 0,
    },
    totalProfiles: 0,
    remainingProfiles: 0,
  };
}

export function applyUserDecisionToCounters(
  counters: SessionCounters,
  decision: SwipeDecision | 'skip',
): SessionCounters {
  const next = { ...counters };
  if (decision === 'like') {
    next.likes += 1;
  } else if (decision === 'dislike') {
    next.dislikes += 1;
  } else if (decision === 'review') {
    next.reviews += 1;
  } else {
    next.skips += 1;
  }
  return next;
}

export interface SessionOrchestrator {
  start(mode: SessionMode): Promise<SessionState>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  stop(): Promise<void>;
  getState(): SessionState;
}

export class NotImplementedSessionOrchestrator implements SessionOrchestrator {
  private state = createIdleSessionState();

  async start(mode: SessionMode): Promise<SessionState> {
    this.state = { ...createIdleSessionState(mode), status: 'idle' };
    throw new Error('SessionOrchestrator.start is not implemented yet (этап 4: используйте MockSessionService)');
  }

  async pause(): Promise<void> {
    throw new Error('SessionOrchestrator.pause is not implemented yet');
  }

  async resume(): Promise<void> {
    throw new Error('SessionOrchestrator.resume is not implemented yet');
  }

  async stop(): Promise<void> {
    this.state = { ...this.state, status: 'stopped', stoppedAt: new Date().toISOString() };
  }

  getState(): SessionState {
    return this.state;
  }
}
