export {
  buildAndroidCapabilities,
  type TwinbyCapabilitiesInput,
} from './capabilities';
export {
  ManagedAppiumClient,
  type AppiumSessionInfo,
  type ManagedAppiumClientOptions,
  type PageSourceResult,
  type ScreenshotResult,
} from './client';
export { adbScreencapPng, adbTap, isAdbFastUdid } from './adb-fast';
export { humanDelay, randomHumanDelayMs } from './human-delay';
export {
  AppiumHttpClient,
  AppiumHttpError,
  probeAppiumStatus,
} from './http';
export {
  AppiumServerManager,
  type AppiumServerManagerOptions,
  type ManagedServerStatus,
} from './server';

/** @deprecated use ManagedAppiumClient */
export {
  ManagedAppiumClient as AppiumClientImpl,
} from './client';

export interface AppiumServerStatus {
  running: boolean;
  url: string;
  owned?: boolean;
  ready?: boolean;
  pid?: number;
  version?: string;
}

export interface AppiumClient {
  startServer(): Promise<AppiumServerStatus>;
  stopServer(): Promise<void>;
  createSession(capabilities: Record<string, unknown>): Promise<{
    sessionId: string;
    udid: string;
  }>;
  endSession(): Promise<void>;
  takeScreenshot(): Promise<Buffer>;
  getPageSource(): Promise<string>;
}
