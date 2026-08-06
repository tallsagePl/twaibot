import {
  TWINBY_APP_PACKAGE,
  type SessionLimits,
  type StartSessionInput,
} from '@twinby/contracts';
import type { createAppiumHandlers } from '../ipc/appium-handlers';
import type { createTwinbyHandlers } from '../ipc/twinby-handlers';
import type { DeviceCaps } from './session-recovery-service';
import type { TwinbyNavigationService } from './twinby-navigation-service';
import { sleep } from './session-utils';

type AppiumHandlers = ReturnType<typeof createAppiumHandlers>;
type TwinbyHandlers = ReturnType<typeof createTwinbyHandlers>;

export class DeviceBootstrapService {
  constructor(
    private readonly deps: {
      appium: AppiumHandlers;
      twinby: TwinbyHandlers;
      navigation: TwinbyNavigationService;
      setLastDeviceCaps: (caps: DeviceCaps) => void;
      ensureAppiumSession: () => Promise<{ sessionId: string; udid: string }>;
      transition: (to: 'starting-appium' | 'connecting' | 'opening-twinby') => void;
      persistSession: () => void;
    },
  ) {}

  async bootstrap(input: StartSessionInput, limits: SessionLimits): Promise<void> {
    void limits;
    const pkg = await this.deps.twinby.detectPackage();
    if (!pkg.installed) {
      throw new Error('Twinby (com.twinby) не установлен на устройстве');
    }

    this.deps.transition('starting-appium');
    this.deps.persistSession();
    await this.deps.appium.startServer();

    this.deps.transition('connecting');
    this.deps.persistSession();
    const udid = input.udid;
    if (!udid) {
      throw new Error(
        'Нет Appium-сессии. Укажите udid при старте или создайте сессию на экране «Устройство».',
      );
    }
    const appPackage = input.appPackage || TWINBY_APP_PACKAGE;
    this.deps.setLastDeviceCaps({ udid, appPackage });
    await this.deps.ensureAppiumSession();

    this.deps.transition('opening-twinby');
    this.deps.persistSession();
    try {
      await this.deps.appium.getClient().activateApp(appPackage);
    } catch {
      /* already foreground */
    }
    const bootLimits = this.deps.twinby.getSessionLimits();
    await sleep(
      bootLimits.speedPreset === 'turbo'
        ? 250
        : bootLimits.speedPreset === 'fast'
          ? 400
          : 1000,
    );

    const screen = await this.deps.navigation.ensureFeedReady(bootLimits);
    if (screen.type !== 'feed') {
      throw new Error(
        `Откройте ленту Twinby вручную (сейчас: ${screen.type}). Затем перезапустите live-сессию.`,
      );
    }
  }
}
