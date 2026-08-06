import type { DetectedScreen, LocatorProfile, SessionLimits } from '@twinby/contracts';
import { getLogger } from '@twinby/logging';
import {
  TwinbyActionExecutor,
  findLocatorProfile,
  getDefaultLocatorProfile,
  isBottomNavScreen,
} from '@twinby/twinby-adapter';
import type { createAppiumHandlers } from '../ipc/appium-handlers';
import type { createTwinbyHandlers } from '../ipc/twinby-handlers';
import { sleep } from './session-utils';

type AppiumHandlers = ReturnType<typeof createAppiumHandlers>;
type TwinbyHandlers = ReturnType<typeof createTwinbyHandlers>;

/**
 * Twinby bottom nav (LTR):
 * 1 chat+matches · 2 likes · 3 feed · 4 games(ignore) · 5 profile
 *
 * Back / Esc (observed 2026-08-07):
 * - opened анкета: 1× Back
 * - chat or profile edit: 2× Back → bottom navigation
 * - own preview: swipe down, then reverse Back until nav
 */
export class TwinbyNavigationService {
  constructor(
    private readonly deps: {
      appium: AppiumHandlers;
      twinby: TwinbyHandlers;
    },
  ) {}

  async resolveLocatorProfile(): Promise<LocatorProfile | null> {
    const pkg = await this.deps.twinby.detectPackage();
    let screenWidth: number | undefined;
    let screenHeight: number | undefined;
    try {
      const rect = await this.deps.appium.getClient().getWindowRect();
      screenWidth = rect.width;
      screenHeight = rect.height;
    } catch {
      /* profile without size match */
    }
    return (
      findLocatorProfile({
        appVersion: pkg.versionName,
        screenWidth,
        screenHeight,
      }) ?? getDefaultLocatorProfile()
    );
  }

  async createActionExecutor(): Promise<TwinbyActionExecutor | null> {
    const profile = await this.resolveLocatorProfile();
    if (!profile) {
      return null;
    }
    const limits = this.deps.twinby.getSessionLimits();
    return new TwinbyActionExecutor(this.deps.appium.getClient(), profile, limits);
  }

  async ensureFeedReady(limits?: SessionLimits): Promise<DetectedScreen> {
    const actions = await this.createActionExecutor();
    if (!actions) {
      throw new Error('Locator profile Twinby не найден');
    }
    void limits;
    const screen = await actions.ensureFeedReady();
    if (screen.type === 'feed' || screen.type === 'no-profiles') {
      return screen;
    }
    await actions.openBottomTab('feed');
    return actions.ensureFeedReady();
  }

  async recoverFeed(attempts = 3): Promise<DetectedScreen | null> {
    const actions = await this.createActionExecutor();
    if (!actions) {
      return null;
    }
    for (let i = 0; i < attempts; i++) {
      // ensureFeedReady switches bottom tabs without Back (Back from likes → launcher)
      const screen = await actions.ensureFeedReady();
      if (screen.type === 'feed' || screen.type === 'no-profiles') {
        return screen;
      }
      try {
        await this.deps.appium.getClient().activateApp('com.twinby');
        await sleep(600);
      } catch {
        /* keep */
      }
      await sleep(300);
    }
    getLogger('session').warn('Failed to recover Twinby feed');
    return null;
  }

  /**
   * Tab 5 → avatar → edit. Optional «Просмотр».
   */
  async openOwnProfile(options?: { openPreview?: boolean }): Promise<DetectedScreen> {
    const actions = await this.createActionExecutor();
    if (!actions) {
      throw new Error('Locator profile Twinby не найден');
    }
    const profile = await this.resolveLocatorProfile();
    if (!profile?.navigation.ownProfileAvatar?.[0]) {
      throw new Error(
        'Нет локатора ownProfileAvatar. Обновите locator profile после Inspector dump.',
      );
    }

    await actions.openBottomTab('profile');
    await sleep(300);
    await actions.tapNav(profile.navigation.ownProfileAvatar);
    await sleep(400);

    if (options?.openPreview) {
      const previewBtn = profile.navigation.ownProfilePreviewButton;
      if (!previewBtn?.[0]) {
        throw new Error('Нет локатора ownProfilePreviewButton («Просмотр»)');
      }
      await actions.tapNav(previewBtn);
      await sleep(400);
    }

    return actions.detectScreen();
  }

  /** Exit preview: swipe down (observed Twinby UX). */
  async dismissOwnProfilePreview(): Promise<DetectedScreen> {
    const actions = await this.createActionExecutor();
    if (!actions) {
      throw new Error('Locator profile Twinby не найден');
    }
    await actions.dismissOwnProfilePreview();
    return actions.detectScreen();
  }

  /** 1× Back — закрыть открытую анкету → предыдущий экран (чат). */
  async leaveOpenedProfile(): Promise<DetectedScreen> {
    const actions = await this.createActionExecutor();
    if (!actions) {
      throw new Error('Locator profile Twinby не найден');
    }
    return actions.pressBack(1);
  }

  /**
   * Из профиля, открытого через чаты-список: 2× Back → список чатов / nav.
   * Из профиля через «Все»→чат: 2× → Новые пары; 3× → nav.
   */
  async leaveConversationProfile(options?: {
    viaMatchesList?: boolean;
  }): Promise<DetectedScreen> {
    const actions = await this.createActionExecutor();
    if (!actions) {
      throw new Error('Locator profile Twinby не найден');
    }
    const times = options?.viaMatchesList ? 3 : 2;
    return actions.pressBack(times);
  }

  /**
   * 2× Back — из чата или редактирования профиля к нижней навигации / списку.
   */
  async leaveChatOrProfileEdit(): Promise<DetectedScreen> {
    const actions = await this.createActionExecutor();
    if (!actions) {
      throw new Error('Locator profile Twinby не найден');
    }
    return actions.pressBack(2);
  }

  /**
   * Reverse exit: preview → swipe down → Back until bottom nav.
   */
  async returnToBottomNav(options?: {
    fromPreview?: boolean;
  }): Promise<DetectedScreen> {
    const actions = await this.createActionExecutor();
    if (!actions) {
      throw new Error('Locator profile Twinby не найден');
    }
    const screen = await actions.returnToBottomNav({
      fromPreview: options?.fromPreview,
    });
    if (!isBottomNavScreen(screen.type)) {
      getLogger('session').warn(
        { screen: screen.type },
        'returnToBottomNav: не дошли до нижней навигации',
      );
    }
    return screen;
  }

  /** Tab 1 — лента чатов. */
  async openDialogs(): Promise<DetectedScreen> {
    const actions = await this.createActionExecutor();
    if (!actions) {
      throw new Error('Locator profile Twinby не найден');
    }
    return actions.openBottomTab('chat');
  }

  /** Tab 1 → «Все» у блока «Новые пары». */
  async openMatches(): Promise<DetectedScreen> {
    const actions = await this.createActionExecutor();
    if (!actions) {
      throw new Error('Locator profile Twinby не найден');
    }
    const profile = await this.resolveLocatorProfile();
    await actions.openBottomTab('chat');
    await sleep(300);
    const link = profile?.navigation.allMatchesLink;
    if (!link?.[0]) {
      throw new Error(
        'Нет локатора allMatchesLink («Все» у Новые пары). Проверьте page source.',
      );
    }
    await actions.tapNav(link);
    await sleep(400);
    return actions.detectScreen();
  }

  /** Tab 2 — лента входящих лайков (read-only). */
  async openIncomingLikes(): Promise<DetectedScreen> {
    const actions = await this.createActionExecutor();
    if (!actions) {
      throw new Error('Locator profile Twinby не найден');
    }
    return actions.openBottomTab('likes');
  }
}
