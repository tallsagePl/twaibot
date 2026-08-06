import {
  CreateAppiumSessionInputSchema,
  resolveAppiumSessionDefaults,
  type AppiumPageSource,
  type AppiumScreenshot,
  type AppiumServerStatus,
  type AppiumSessionInfo,
  type AppiumWindowRect,
  type CreateAppiumSessionInput,
} from '@twinby/contracts';
import { ManagedAppiumClient } from '@twinby/appium-client';
import { resolveAppPaths, ensureAppDirectories } from '@twinby/config';
import { getLogger } from '@twinby/logging';
import { join } from 'node:path';

let client: ManagedAppiumClient | null = null;

function getClient(projectRoot: string): ManagedAppiumClient {
  if (!client) {
    const paths = resolveAppPaths({ projectRoot });
    ensureAppDirectories(paths);
    client = new ManagedAppiumClient({
      logsDir: paths.logs,
      temporaryDir: paths.temporary,
      host: '127.0.0.1',
      port: 4723,
    });
  }
  return client;
}

function toPublicStatus(status: Awaited<
  ReturnType<ManagedAppiumClient['getServerStatus']>
>): AppiumServerStatus {
  return {
    running: status.running,
    ready: status.ready,
    url: status.url,
    owned: status.owned,
    pid: status.pid,
    version: status.version,
    error: status.error,
  };
}

export function createAppiumHandlers(getProjectRoot: () => string) {
  return {
    getClient(): ManagedAppiumClient {
      return getClient(getProjectRoot());
    },

    async getStatus(): Promise<AppiumServerStatus> {
      return toPublicStatus(await getClient(getProjectRoot()).getServerStatus());
    },

    async startServer(): Promise<AppiumServerStatus> {
      getLogger('appium').info('Starting Appium server');
      return toPublicStatus(await getClient(getProjectRoot()).startServer());
    },

    async stopServer(): Promise<AppiumServerStatus> {
      getLogger('appium').info('Stopping Appium server (if owned)');
      return toPublicStatus(await getClient(getProjectRoot()).stopServer());
    },

    async createSession(raw: unknown): Promise<AppiumSessionInfo> {
      const parsed: CreateAppiumSessionInput =
        CreateAppiumSessionInputSchema.parse(raw);
      const input = resolveAppiumSessionDefaults(parsed);
      getLogger('appium').info(
        {
          udid: input.udid,
          deviceName: input.deviceName,
          appPackage: input.appPackage,
          appActivity: input.appActivity,
        },
        'Creating Appium session',
      );
      const session = await getClient(getProjectRoot()).createSession(input);
      return {
        sessionId: session.sessionId,
        udid: session.udid,
        capabilities: session.capabilities,
      };
    },

    async endSession(): Promise<void> {
      await getClient(getProjectRoot()).endSession();
    },

    async getSession(): Promise<AppiumSessionInfo | null> {
      const session = await getClient(getProjectRoot()).ensureSessionAlive();
      if (!session) {
        return null;
      }
      return {
        sessionId: session.sessionId,
        udid: session.udid,
        capabilities: session.capabilities,
      };
    },

    async ensureSessionAlive(): Promise<AppiumSessionInfo | null> {
      return this.getSession();
    },

    async takeScreenshot(): Promise<AppiumScreenshot> {
      return getClient(getProjectRoot()).takeScreenshot();
    },

    async getPageSource(): Promise<AppiumPageSource> {
      const result = await getClient(getProjectRoot()).getPageSource();
      return {
        source: result.source,
        savedPath: result.savedPath,
        length: result.source.length,
      };
    },

    async getWindowRect(): Promise<AppiumWindowRect> {
      return getClient(getProjectRoot()).getWindowRect();
    },
  };
}

/** Expose temp path helper for tests/docs */
export function appiumTempHint(projectRoot: string): string {
  return join(resolveAppPaths({ projectRoot }).temporary, 'appium-page-source.xml');
}
