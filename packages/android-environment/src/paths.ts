import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface AndroidSdkPaths {
  androidHome?: string;
  adb?: string;
  emulator?: string;
  platformTools?: string;
  source: 'ANDROID_HOME' | 'ANDROID_SDK_ROOT' | 'default' | 'none';
}

function firstExisting(...candidates: Array<string | undefined>): string | undefined {
  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

export function resolveAndroidSdkPaths(
  env: NodeJS.ProcessEnv = process.env,
): AndroidSdkPaths {
  const fromEnv =
    firstExisting(env.ANDROID_HOME, env.ANDROID_SDK_ROOT) ??
    undefined;

  const defaultSdk = join(homedir(), 'AppData', 'Local', 'Android', 'Sdk');
  const androidHome =
    fromEnv ?? (existsSync(defaultSdk) ? defaultSdk : undefined);

  if (!androidHome) {
    return { source: 'none' };
  }

  const source: AndroidSdkPaths['source'] = env.ANDROID_HOME
    ? 'ANDROID_HOME'
    : env.ANDROID_SDK_ROOT
      ? 'ANDROID_SDK_ROOT'
      : 'default';

  const platformTools = join(androidHome, 'platform-tools');
  const adb = firstExisting(
    join(platformTools, process.platform === 'win32' ? 'adb.exe' : 'adb'),
  );
  const emulator = firstExisting(
    join(
      androidHome,
      'emulator',
      process.platform === 'win32' ? 'emulator.exe' : 'emulator',
    ),
  );

  return {
    androidHome,
    platformTools: existsSync(platformTools) ? platformTools : undefined,
    adb,
    emulator,
    source,
  };
}

export function resolveJavaBinary(env: NodeJS.ProcessEnv = process.env): string | undefined {
  if (env.JAVA_HOME) {
    const candidate = join(
      env.JAVA_HOME,
      'bin',
      process.platform === 'win32' ? 'java.exe' : 'java',
    );
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}
