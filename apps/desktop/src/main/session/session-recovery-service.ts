import {
  resolveAppiumSessionDefaults,
  TWINBY_APP_PACKAGE,
  type SessionLimits,
} from '@twinby/contracts';
import { getLogger } from '@twinby/logging';
import type { createAppiumHandlers } from '../ipc/appium-handlers';
import type { createTwinbyHandlers } from '../ipc/twinby-handlers';
import type { TwinbyNavigationService } from './twinby-navigation-service';

type AppiumHandlers = ReturnType<typeof createAppiumHandlers>;
type TwinbyHandlers = ReturnType<typeof createTwinbyHandlers>;

export type DeviceCaps = {
  udid: string;
  appPackage: string;
};

export class SessionRecoveryService {
  constructor(
    private readonly deps: {
      appium: AppiumHandlers;
      twinby: TwinbyHandlers;
      navigation: TwinbyNavigationService;
      getLastDeviceCaps: () => DeviceCaps | null;
      getConsecutiveFailures: () => number;
      setConsecutiveFailures: (n: number) => void;
    },
  ) {}

  async ensureAppiumSession(forceRecreate = false): Promise<{
    sessionId: string;
    udid: string;
  }> {
    const { appium } = this.deps;
    if (!forceRecreate) {
      const existing = await appium.ensureSessionAlive();
      if (existing) {
        return existing;
      }
    } else {
      await appium.endSession().catch(() => undefined);
    }

    const caps = this.deps.getLastDeviceCaps();
    if (!caps?.udid) {
      throw new Error(
        'Appium-сессия потеряна. Укажите устройство и нажмите «Создать сессию» / «Запуск».',
      );
    }

    getLogger('session').info(
      { udid: caps.udid, forceRecreate },
      'Creating / recreating Appium session',
    );
    const created = await appium.createSession(
      resolveAppiumSessionDefaults({
        udid: caps.udid,
        appPackage: caps.appPackage || TWINBY_APP_PACKAGE,
        noReset: true,
      }),
    );
    try {
      await appium.getClient().activateApp(caps.appPackage || TWINBY_APP_PACKAGE);
    } catch {
      /* already foreground */
    }
    return created;
  }

  async recoverFeedBestEffort(forceRecreate = false): Promise<void> {
    try {
      await this.ensureAppiumSession(forceRecreate);
      const screen = await this.deps.navigation.recoverFeed(3);
      if (screen?.type === 'feed' && this.deps.getConsecutiveFailures() > 0) {
        this.deps.setConsecutiveFailures(0);
      }
    } catch (err) {
      getLogger('session').warn(
        { err: err instanceof Error ? err.message : String(err) },
        'Feed recovery best-effort failed',
      );
    }
  }

  /**
   * Policy after capture/action failure when there is no active card left.
   * Returns whether the caller should schedule processNext after cooldown sleep.
   */
  async recoverWithoutActive(input: {
    message: string;
    limits: SessionLimits;
    bumpErrorCounter: () => void;
    setErrorMessage: (message: string) => void;
    fail: (message: string) => void;
    transitionRecovering: () => void;
    persist: () => void;
    cleanupActive: () => Promise<void>;
    clearActive: () => void;
    transitionCooldown: () => void;
  }): Promise<{ shouldRetryNext: boolean; sleepMs: number }> {
    input.bumpErrorCounter();
    input.setErrorMessage(input.message);

    const consecutiveFailures = this.deps.getConsecutiveFailures();
    const recoverable =
      /feed|unknown|Twinby feed|socket hang up|instrumentation|terminated|not started|proxy/i.test(
        input.message,
      );

    if (
      !recoverable &&
      consecutiveFailures >= input.limits.stopOnRepeatedErrors
    ) {
      input.fail(`Повторные сбои (${consecutiveFailures}): ${input.message}`);
      return { shouldRetryNext: false, sleepMs: 0 };
    }

    input.transitionRecovering();
    input.persist();
    await this.recoverFeedBestEffort(consecutiveFailures % 3 === 0);
    await input.cleanupActive().catch(() => undefined);
    input.clearActive();
    input.transitionCooldown();
    input.persist();
    getLogger('session').info(
      {
        consecutiveFailures: this.deps.getConsecutiveFailures(),
        message: input.message,
        recoverable,
      },
      'Recovering — retrying next profile',
    );

    const sleepMs = recoverable
      ? Math.max(500, input.limits.uiCooldownMs + 200)
      : input.limits.speedPreset === 'turbo'
        ? Math.max(80, input.limits.uiCooldownMs + 40)
        : Math.max(250, input.limits.uiCooldownMs + 150);

    return { shouldRetryNext: true, sleepMs };
  }
}
