import type { AppDatabase } from '@twinby/database';
import { StartSessionInputSchema } from '@twinby/contracts';
import { LiveSessionService } from '../session/live-session-service';
import { MockSessionService } from '../session/mock-session-service';

export type SessionService = MockSessionService | LiveSessionService;

let mockService: MockSessionService | null = null;
let liveService: LiveSessionService | null = null;
let active: 'mock' | 'live' | null = null;

export function getMockSessionService(
  getDb: () => AppDatabase,
  getProjectRoot: () => string = () => process.cwd(),
): MockSessionService {
  if (!mockService) {
    mockService = new MockSessionService(getDb, getProjectRoot);
  }
  return mockService;
}

export function getLiveSessionService(
  getDb: () => AppDatabase,
  getProjectRoot: () => string,
): LiveSessionService {
  if (!liveService) {
    liveService = new LiveSessionService(getDb, getProjectRoot);
  }
  return liveService;
}

/**
 * Routes session IPC to mock or live service based on last start / current source.
 */
export function createSessionFacade(
  getDb: () => AppDatabase,
  getProjectRoot: () => string,
) {
  const mock = getMockSessionService(getDb, getProjectRoot);
  const live = getLiveSessionService(getDb, getProjectRoot);

  function current(): SessionService {
    if (active === 'live') {
      return live;
    }
    return mock;
  }

  return {
    async start(raw?: unknown) {
      const input = StartSessionInputSchema.parse(raw ?? {});
      // Stop the other source if somehow running
      if (input.source === 'live') {
        if (active === 'mock') {
          await mock.stop().catch(() => undefined);
        }
        active = 'live';
        return live.start(raw);
      }
      if (active === 'live') {
        await live.stop().catch(() => undefined);
      }
      active = 'mock';
      return mock.start(raw);
    },
    pause: () => current().pause(),
    resume: () => current().resume(),
    stop: async () => {
      const view = await current().stop();
      return view;
    },
    getState: () => current().getViewState(),
    confirm: (raw: unknown) => current().confirm(raw),
    skip: (captureId: unknown) => current().skip(captureId),
    listHistory: (raw?: unknown) => current().listHistory(raw),
  };
}
