import type { ManagedAppiumClient } from '@twinby/appium-client';
import type {
  ActionResult,
  DetectedScreen,
  Locator,
  LocatorProfile,
  SessionLimits,
  SwipeAction,
} from '@twinby/contracts';
import { ActionRateLimiter } from './action-rate-limiter';
import { LocatorExecutor } from './locator-executor';
import {
  detectScreenFromPageSource,
  isBottomNavScreen,
} from './screen-detector';

type PaceLimits = Pick<
  SessionLimits,
  'maxActionsPerMinute' | 'minActionIntervalMs' | 'uiCooldownMs' | 'speedPreset'
>;

export class TwinbyActionExecutor {
  private readonly executor: LocatorExecutor;
  private readonly limiter: ActionRateLimiter;
  private uiCooldownMs: number;
  private speedPreset: SessionLimits['speedPreset'];

  constructor(
    private readonly client: ManagedAppiumClient,
    private readonly profile: LocatorProfile,
    limits: PaceLimits,
  ) {
    this.executor = new LocatorExecutor(client);
    this.limiter = new ActionRateLimiter(limits);
    this.uiCooldownMs = limits.uiCooldownMs;
    this.speedPreset = limits.speedPreset;
  }

  async detectScreen(): Promise<DetectedScreen> {
    const source = (await this.client.getPageSource()).source;
    return detectScreenFromPageSource(source);
  }

  /**
   * Like/dislike only — never auto-called without user confirm in recommendation-only.
   */
  async performAction(action: SwipeAction): Promise<ActionResult> {
    const locators =
      action === 'like' ? this.profile.feed.likeButton : this.profile.feed.dislikeButton;
    const locator = locators[0];
    if (!locator) {
      return {
        ok: false,
        action,
        screenAfter: await this.detectScreen(),
        recovered: false,
        identityMatched: true,
        message: `Locator для ${action} не найден в profile`,
      };
    }

    await this.limiter.run(async () => {
      await this.executor.tapLocator(locator);
    });

    await sleep(this.afterTapMs());
    let screenAfter = await this.detectScreen();
    let recovered = false;

    if (
      screenAfter.type === 'match-dialog' ||
      screenAfter.type === 'premium-dialog' ||
      screenAfter.type === 'unknown'
    ) {
      recovered = await this.dismissKnownOverlay();
      screenAfter = await this.detectScreen();
    }

    return {
      ok: screenAfter.type === 'feed' || screenAfter.type === 'no-profiles',
      action,
      screenAfter,
      recovered,
      identityMatched: true,
      message:
        screenAfter.type === 'feed'
          ? undefined
          : `После ${action} экран: ${screenAfter.type}`,
    };
  }

  /** Best-effort overlay dismiss without messaging. */
  async dismissKnownOverlay(): Promise<boolean> {
    const before = await this.detectScreen();
    // Never Back from bottom tabs — on Twinby that exits to the launcher.
    if (before.type === 'feed' || isBottomNavScreen(before.type)) {
      return false;
    }
    try {
      await this.client.back();
      await sleep(this.recoverMs());
      const after = await this.detectScreen();
      return after.type === 'feed' || after.type !== before.type;
    } catch {
      return false;
    }
  }

  /** Tap first working locator from a navigation locator list. */
  async tapNav(locators: Locator[] | undefined): Promise<void> {
    if (!locators?.length) {
      throw new Error('Locator навигации не задан в profile');
    }
    let lastError: unknown;
    for (const locator of locators) {
      try {
        await this.limiter.run(async () => {
          await this.executor.tapLocator(locator);
        });
        await sleep(this.afterTapMs());
        return;
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error('Не удалось нажать locator навигации');
  }

  async openBottomTab(
    tab: 'chat' | 'likes' | 'feed' | 'profile',
  ): Promise<DetectedScreen> {
    const locators = this.profile.navigation[tab];
    await this.tapNav(locators);
    return this.detectScreen();
  }

  /** Exit own-profile preview via swipe down (observed UX). */
  async dismissOwnProfilePreview(): Promise<void> {
    const rect = await this.client.getWindowRect();
    await this.limiter.run(async () => {
      await this.client.swipe({
        left: Math.round(rect.width * 0.2),
        top: Math.round(rect.height * 0.12),
        width: Math.round(rect.width * 0.6),
        height: Math.round(rect.height * 0.45),
        direction: 'down',
        percent: 0.7,
      });
    });
    await sleep(this.afterTapMs());
  }

  /**
   * Android Back / Esc equivalent.
   * Observed Twinby UX (2026-08-07):
   * - opened анкета (profile-details / preview): 1× → previous screen
   * - chat or own-profile-edit: 2× → bottom navigation
   */
  async pressBack(times = 1): Promise<DetectedScreen> {
    let screen = await this.detectScreen();
    for (let i = 0; i < times; i++) {
      await this.limiter.run(async () => {
        await this.client.back();
      });
      await sleep(this.afterTapMs());
      screen = await this.detectScreen();
    }
    return screen;
  }

  /**
   * Leave nested Twinby UI and land on a bottom-nav screen.
   * Preview: swipe down first, then Back until nav (reverse of entry).
   * Stops if Twinby is lost (unknown) — Back would leave the app.
   */
  async returnToBottomNav(options?: {
    fromPreview?: boolean;
    maxBacks?: number;
  }): Promise<DetectedScreen> {
    if (options?.fromPreview) {
      await this.dismissOwnProfilePreview();
    }
    const maxBacks = options?.maxBacks ?? 4;
    let screen = await this.detectScreen();
    if (isBottomNavScreen(screen.type)) {
      return screen;
    }
    for (let i = 0; i < maxBacks; i++) {
      if (screen.type === 'unknown') {
        try {
          await this.client.activateApp(this.profile.appPackage);
          await sleep(this.appActivateMs());
          screen = await this.detectScreen();
        } catch {
          /* keep */
        }
        if (isBottomNavScreen(screen.type) || screen.type === 'unknown') {
          return screen;
        }
      }
      screen = await this.pressBack(1);
      if (isBottomNavScreen(screen.type)) {
        return screen;
      }
    }
    return screen;
  }

  async tapAtBounds(bounds: {
    left: number;
    top: number;
    right: number;
    bottom: number;
  }): Promise<void> {
    const x = (bounds.left + bounds.right) / 2;
    const y = (bounds.top + bounds.bottom) / 2;
    await this.limiter.run(async () => {
      await this.client.tap(x, y);
    });
    await sleep(this.afterTapMs());
  }

  async getPageSource(): Promise<string> {
    return (await this.client.getPageSource()).source;
  }

  async takeScreenshotPng(): Promise<Buffer> {
    return this.client.takeScreenshotPng();
  }

  async getWindowRect(): Promise<{ x: number; y: number; width: number; height: number }> {
    return this.client.getWindowRect();
  }

  /**
   * Reach Twinby feed. Never press Back from bottom-nav tabs (likes/chats/hub) —
   * that exits Twinby to the Android launcher on BlueStacks.
   */
  async ensureFeedReady(): Promise<DetectedScreen> {
    let screen = await this.detectScreen();
    if (screen.type === 'feed' || screen.type === 'no-profiles') {
      return screen;
    }

    for (let attempt = 0; attempt < 8; attempt++) {
      // Bottom tab already visible → switch to feed via tab tap only
      if (
        isBottomNavScreen(screen.type) &&
        screen.type !== 'feed' &&
        screen.type !== 'no-profiles'
      ) {
        try {
          await this.openBottomTab('feed');
        } catch {
          await this.client.activateApp(this.profile.appPackage);
          await sleep(this.appActivateMs());
          try {
            await this.openBottomTab('feed');
          } catch {
            /* next attempt */
          }
        }
        screen = await this.detectScreen();
        if (screen.type === 'feed' || screen.type === 'no-profiles') {
          return screen;
        }
        continue;
      }

      if (
        screen.type === 'profile-details' ||
        screen.type === 'conversation' ||
        screen.type === 'matches-list' ||
        screen.type === 'own-profile-edit' ||
        screen.type === 'own-profile-preview' ||
        screen.type === 'photo-viewer'
      ) {
        await this.pressBack(1);
        screen = await this.detectScreen();
        if (screen.type === 'feed' || screen.type === 'no-profiles') {
          return screen;
        }
        continue;
      }

      if (
        screen.type === 'match-dialog' ||
        screen.type === 'premium-dialog' ||
        screen.type === 'login'
      ) {
        await this.dismissKnownOverlay();
        screen = await this.detectScreen();
        if (screen.type === 'feed' || screen.type === 'no-profiles') {
          return screen;
        }
        continue;
      }

      // unknown / lost: activate Twinby — do not spam Back (exits to launcher)
      try {
        await this.client.activateApp(this.profile.appPackage);
        await sleep(this.appActivateMs());
        try {
          await this.openBottomTab('feed');
        } catch {
          /* tab may appear after activate */
        }
        screen = await this.detectScreen();
        if (screen.type === 'feed' || screen.type === 'no-profiles') {
          return screen;
        }
      } catch {
        /* keep trying */
      }
    }
    return screen;
  }

  private afterTapMs(): number {
    if (this.speedPreset === 'turbo') {
      return Math.max(40, this.uiCooldownMs);
    }
    if (this.speedPreset === 'fast') {
      return Math.max(80, this.uiCooldownMs + 40);
    }
    return Math.max(250, this.uiCooldownMs + 200);
  }

  private recoverMs(): number {
    if (this.speedPreset === 'turbo') {
      return Math.max(40, this.uiCooldownMs);
    }
    if (this.speedPreset === 'fast') {
      return Math.max(80, this.uiCooldownMs + 40);
    }
    return Math.max(200, this.uiCooldownMs + 150);
  }

  private appActivateMs(): number {
    if (this.speedPreset === 'turbo') {
      return 250;
    }
    if (this.speedPreset === 'fast') {
      return 400;
    }
    return 800;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
