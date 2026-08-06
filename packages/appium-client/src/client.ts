import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { adbScreencapPng, adbTap, isAdbFastUdid } from './adb-fast';
import { buildAndroidCapabilities, type TwinbyCapabilitiesInput } from './capabilities';
import { humanDelay } from './human-delay';
import { AppiumHttpClient } from './http';
import {
  AppiumServerManager,
  type AppiumServerManagerOptions,
  type ManagedServerStatus,
} from './server';

export interface AppiumSessionInfo {
  sessionId: string;
  udid: string;
  capabilities: Record<string, unknown>;
}

export interface ScreenshotResult {
  mimeType: 'image/png';
  base64: string;
  dataUrl: string;
}

export interface PageSourceResult {
  source: string;
  savedPath?: string;
}

export interface ManagedAppiumClientOptions extends AppiumServerManagerOptions {
  temporaryDir?: string;
}

export class ManagedAppiumClient {
  private readonly server: AppiumServerManager;
  private readonly temporaryDir?: string;
  private http: AppiumHttpClient;
  private session: AppiumSessionInfo | null = null;

  constructor(options: ManagedAppiumClientOptions = {}) {
    this.server = new AppiumServerManager(options);
    this.temporaryDir = options.temporaryDir;
    this.http = new AppiumHttpClient({ baseUrl: this.server.baseUrl });
  }

  async getServerStatus(): Promise<ManagedServerStatus> {
    return this.server.getStatus();
  }

  async startServer(): Promise<ManagedServerStatus> {
    const status = await this.server.start();
    this.http = new AppiumHttpClient({ baseUrl: status.url });
    return status;
  }

  async stopServer(): Promise<ManagedServerStatus> {
    if (this.session) {
      try {
        await this.endSession();
      } catch {
        this.session = null;
      }
    }
    return this.server.stop();
  }

  getSession(): AppiumSessionInfo | null {
    return this.session;
  }

  /**
   * Drop local session if Appium already closed it
   * ("A session is either terminated or not started").
   */
  async ensureSessionAlive(): Promise<AppiumSessionInfo | null> {
    if (!this.session) {
      return null;
    }
    try {
      await this.http.getWindowRect(this.session.sessionId);
      return this.session;
    } catch (err) {
      if (isDeadSessionError(err)) {
        this.session = null;
        return null;
      }
      throw err;
    }
  }

  async createSession(input: TwinbyCapabilitiesInput): Promise<AppiumSessionInfo> {
    const status = await this.server.getStatus();
    if (!status.ready) {
      await this.startServer();
    }

    if (this.session) {
      await this.endSession().catch(() => {
        this.session = null;
      });
    }

    const caps = buildAndroidCapabilities(input);
    const created = await this.http.createSession(caps);
    this.session = {
      sessionId: created.sessionId,
      udid: input.udid,
      capabilities: created.capabilities,
    };
    return this.session;
  }

  async endSession(): Promise<void> {
    if (!this.session) {
      return;
    }
    const id = this.session.sessionId;
    this.session = null;
    try {
      await this.http.deleteSession(id);
    } catch (err) {
      if (!isDeadSessionError(err)) {
        throw err;
      }
    }
  }

  /**
   * Prefer adb screencap on emulator/BlueStacks — Appium /screenshot is often 1–3s.
   * Falls back to Appium if adb fails.
   */
  async takeScreenshotPng(): Promise<Buffer> {
    const session = await this.requireLiveSession();
    if (isAdbFastUdid(session.udid)) {
      try {
        return await adbScreencapPng(session.udid);
      } catch {
        /* fall through to Appium */
      }
    }
    const base64 = await this.http.screenshot(session.sessionId);
    return Buffer.from(base64, 'base64');
  }

  async takeScreenshot(): Promise<ScreenshotResult> {
    const png = await this.takeScreenshotPng();
    const base64 = png.toString('base64');
    return {
      mimeType: 'image/png' as const,
      base64,
      dataUrl: `data:image/png;base64,${base64}`,
    };
  }

  async getPageSource(): Promise<PageSourceResult> {
    const session = await this.requireLiveSession();
    const source = await this.http.source(session.sessionId);
    let savedPath: string | undefined;
    if (this.temporaryDir) {
      savedPath = join(this.temporaryDir, 'appium-page-source.xml');
      writeFileSync(savedPath, source, 'utf8');
    }
    return { source, savedPath };
  }

  async getWindowRect(): Promise<{
    x: number;
    y: number;
    width: number;
    height: number;
  }> {
    return this.withLiveSession((session) =>
      this.http.getWindowRect(session.sessionId),
    );
  }

  async back(): Promise<void> {
    await this.withLiveSession((session) => this.http.back(session.sessionId));
    await humanDelay();
  }

  async activateApp(packageName: string): Promise<void> {
    await this.withLiveSession((session) =>
      this.http.executeScript(session.sessionId, 'mobile: activateApp', [
        { appId: packageName },
      ]),
    );
    await humanDelay();
  }

  /** Find first element. Strategies: accessibility-id | resource-id | text | xpath */
  async findElement(
    strategy: 'accessibility-id' | 'resource-id' | 'text' | 'xpath',
    value: string,
  ): Promise<string> {
    const mapped = mapFindStrategy(strategy, value);
    return this.withLiveSession((session) =>
      this.http.findElement(session.sessionId, mapped.using, mapped.value),
    );
  }

  async getElementRect(
    elementId: string,
  ): Promise<{ x: number; y: number; width: number; height: number }> {
    return this.withLiveSession((session) =>
      this.http.getElementRect(session.sessionId, elementId),
    );
  }

  async clickElement(elementId: string): Promise<void> {
    await this.withLiveSession((session) =>
      this.http.clickElement(session.sessionId, elementId),
    );
    await humanDelay();
  }

  /** Absolute screen tap — adb on emulator, else Appium clickGesture */
  async tap(x: number, y: number): Promise<void> {
    const session = await this.requireLiveSession();
    if (isAdbFastUdid(session.udid)) {
      try {
        await adbTap(session.udid, x, y);
        await humanDelay();
        return;
      } catch {
        /* fall through */
      }
    }
    await this.http.executeScript(session.sessionId, 'mobile: clickGesture', [
      { x: Math.round(x), y: Math.round(y) },
    ]);
    await humanDelay();
  }

  async swipe(options: {
    left: number;
    top: number;
    width: number;
    height: number;
    direction: 'up' | 'down' | 'left' | 'right';
    percent?: number;
    speed?: number;
  }): Promise<void> {
    await this.withLiveSession((session) =>
      this.http.executeScript(session.sessionId, 'mobile: swipeGesture', [
        {
          left: Math.round(options.left),
          top: Math.round(options.top),
          width: Math.round(options.width),
          height: Math.round(options.height),
          direction: options.direction,
          percent: options.percent ?? 0.55,
          speed: options.speed ?? 800,
        },
      ]),
    );
    await humanDelay();
  }

  private async requireLiveSession(): Promise<AppiumSessionInfo> {
    const alive = await this.ensureSessionAlive();
    if (!alive) {
      throw new Error(
        'Appium-сессия завершена или не создана. Создайте сессию заново.',
      );
    }
    return alive;
  }

  private async withLiveSession<T>(
    fn: (session: AppiumSessionInfo) => Promise<T>,
  ): Promise<T> {
    const session = await this.requireLiveSession();
    try {
      return await fn(session);
    } catch (err) {
      if (isDeadSessionError(err)) {
        this.session = null;
        throw new Error(
          'Appium-сессия завершена или не создана. Создайте сессию заново.',
        );
      }
      throw err;
    }
  }
}

export function isDeadSessionError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /terminated or not started|invalid session id|session does not exist|NoSuchDriver|404/i.test(
    message,
  );
}

function mapFindStrategy(
  strategy: 'accessibility-id' | 'resource-id' | 'text' | 'xpath',
  value: string,
): { using: string; value: string } {
  switch (strategy) {
    case 'accessibility-id':
      return { using: 'accessibility id', value };
    case 'resource-id':
      // Flutter Twinby uses bare resource-id without package prefix
      return {
        using: 'xpath',
        value: `//*[@resource-id=${xpathLiteral(value)}]`,
      };
    case 'text':
      return {
        using: 'xpath',
        value: `//*[@text=${xpathLiteral(value)} or @content-desc=${xpathLiteral(value)}]`,
      };
    case 'xpath':
      return { using: 'xpath', value };
    default: {
      const _exhaustive: never = strategy;
      return _exhaustive;
    }
  }
}

function xpathLiteral(value: string): string {
  if (!value.includes("'")) {
    return `'${value}'`;
  }
  if (!value.includes('"')) {
    return `"${value}"`;
  }
  const parts = value.split("'").map((p) => `'${p}'`);
  return `concat(${parts.join(`, "'", `)})`;
}
