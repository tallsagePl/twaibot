import { existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { resolveAndroidSdkPaths, resolveJavaBinary } from './paths';
import {
  hasInstalledDriver,
  parseAdbDevices,
  parseAvdList,
  parseJavaVersion,
  parseNodeVersion,
} from './parse';
import { combineOutput, runCommand, type CommandResult } from './shell';
import type {
  AndroidDevice,
  AndroidVirtualDevice,
  EnvironmentReport,
  EnvironmentReportItem,
} from './types';

const MIN_NODE_MAJOR = 20;

export async function runEnvironmentDoctor(
  env: NodeJS.ProcessEnv = process.env,
): Promise<EnvironmentReport> {
  const items: EnvironmentReportItem[] = [];

  items.push(await checkNode());
  items.push(await checkJava(env));
  items.push(...(await checkAndroidSdk(env)));
  items.push(await checkAppium());
  items.push(await checkUiAutomator2());
  items.push(await checkAppiumInspector());

  const hardErrors = items.filter((item) => item.status === 'error');
  return {
    ok: hardErrors.length === 0,
    checkedAt: new Date().toISOString(),
    items,
  };
}

export async function listAvds(
  env: NodeJS.ProcessEnv = process.env,
): Promise<AndroidVirtualDevice[]> {
  const sdk = resolveAndroidSdkPaths(env);
  if (!sdk.emulator) {
    return [];
  }
  const result = await runCommand(sdk.emulator, ['-list-avds'], {
    timeoutMs: 20_000,
    env: withAndroidPath(env, sdk.androidHome),
  });
  if (!result.ok && !result.stdout) {
    return [];
  }
  return parseAvdList(result.stdout || combineOutput(result));
}

const BLUESTACKS_ADB_HOSTS = ['127.0.0.1:5555', '127.0.0.1:5556', 'localhost:5555'] as const;

async function adbDevicesRaw(
  env: NodeJS.ProcessEnv,
): Promise<AndroidDevice[]> {
  const sdk = resolveAndroidSdkPaths(env);
  const adb = sdk.adb ?? 'adb';
  const result = await runCommand(adb, ['devices'], {
    timeoutMs: 15_000,
    env: withAndroidPath(env, sdk.androidHome),
    shell: !sdk.adb,
  });
  if (!result.ok && !result.stdout) {
    return [];
  }
  return parseAdbDevices(result.stdout || combineOutput(result));
}

/**
 * BlueStacks often needs an explicit `adb connect` even when the player is open.
 * Try common local ports when no online device is listed.
 */
async function ensureEmulatorAdbConnected(
  env: NodeJS.ProcessEnv,
  devices: AndroidDevice[],
): Promise<AndroidDevice[]> {
  if (devices.some((d) => d.state === 'device')) {
    return devices;
  }
  const sdk = resolveAndroidSdkPaths(env);
  const adb = sdk.adb ?? 'adb';
  const runEnv = withAndroidPath(env, sdk.androidHome);
  for (const host of BLUESTACKS_ADB_HOSTS) {
    await runCommand(adb, ['connect', host], {
      timeoutMs: 8_000,
      env: runEnv,
      shell: !sdk.adb,
    });
  }
  return adbDevicesRaw(env);
}

export async function listDevices(
  env: NodeJS.ProcessEnv = process.env,
): Promise<AndroidDevice[]> {
  const first = await adbDevicesRaw(env);
  return ensureEmulatorAdbConnected(env, first);
}

export async function runAppiumDoctorSubset(): Promise<EnvironmentReport> {
  const items = [await checkAppium(), await checkUiAutomator2(), await checkAppiumInspector()];
  return {
    ok: items.every((item) => item.status !== 'error'),
    checkedAt: new Date().toISOString(),
    items,
  };
}

async function checkNode(): Promise<EnvironmentReportItem> {
  const version = parseNodeVersion(process.version);
  const major = version ? Number(version.split('.')[0]) : 0;
  if (major >= MIN_NODE_MAJOR) {
    return {
      id: 'node',
      label: 'Node.js',
      status: 'ok',
      detail: `Найден Node.js ${version}`,
      version: version ?? process.version,
      path: process.execPath,
    };
  }
  return {
    id: 'node',
    label: 'Node.js',
    status: 'error',
    detail: `Нужен Node.js ${MIN_NODE_MAJOR}+, сейчас ${process.version}`,
    version: version ?? process.version,
    path: process.execPath,
    fixCommand: 'https://nodejs.org/ — установите LTS 20+',
  };
}

async function checkJava(env: NodeJS.ProcessEnv): Promise<EnvironmentReportItem> {
  const javaBin = resolveJavaBinary(env);
  const result = javaBin
    ? await runCommand(javaBin, ['-version'], { timeoutMs: 10_000 })
    : await runCommand('java', ['-version'], { timeoutMs: 10_000, shell: true });

  const output = combineOutput(result);
  const version = parseJavaVersion(output);

  if (result.ok || version) {
    const major = version ? Number(version.replace(/^1\./, '').split('.')[0]) : 0;
    const tooOld = major > 0 && major < 11;
    return {
      id: 'java',
      label: 'Java',
      status: tooOld ? 'warning' : 'ok',
      detail: tooOld
        ? `Найдена Java ${version}. Для Appium лучше JDK 17+.`
        : version
          ? `Найдена Java ${version}`
          : 'Java доступна',
      version: version ?? undefined,
      path: javaBin ?? 'java (PATH)',
      fixCommand: tooOld
        ? 'Установите Temurin JDK 17 и задайте JAVA_HOME'
        : undefined,
    };
  }

  return {
    id: 'java',
    label: 'Java',
    status: 'error',
    detail:
      'Java не найдена. Appium/UiAutomator2 обычно требуют JDK 17+.',
    fixCommand:
      'Установите Temurin JDK 17 и задайте JAVA_HOME. Пример: setx JAVA_HOME "C:\\Program Files\\Eclipse Adoptium\\jdk-17..."',
  };
}

async function checkAndroidSdk(
  env: NodeJS.ProcessEnv,
): Promise<EnvironmentReportItem[]> {
  const sdk = resolveAndroidSdkPaths(env);
  const items: EnvironmentReportItem[] = [];

  if (!sdk.androidHome) {
    items.push({
      id: 'android-home',
      label: 'ANDROID_HOME',
      status: 'error',
      detail:
        'Android SDK не найден. Установите Android Studio и задайте ANDROID_HOME.',
      fixCommand:
        'setx ANDROID_HOME "%LOCALAPPDATA%\\Android\\Sdk" && setx ANDROID_SDK_ROOT "%LOCALAPPDATA%\\Android\\Sdk"',
    });
    items.push(missing('adb', 'ADB'));
    items.push(missing('emulator', 'Emulator'));
    items.push({
      id: 'avd',
      label: 'AVD',
      status: 'error',
      detail: 'Нельзя проверить AVD без SDK',
      fixCommand: 'Android Studio → Device Manager → Create Device',
    });
    items.push({
      id: 'adb-devices',
      label: 'ADB devices',
      status: 'unknown',
      detail: 'Пропуск: нет ADB',
    });
    return items;
  }

  items.push({
    id: 'android-home',
    label: 'ANDROID_HOME',
    status: sdk.source === 'default' ? 'warning' : 'ok',
    detail:
      sdk.source === 'default'
        ? `SDK найден по умолчанию: ${sdk.androidHome} (переменная ANDROID_HOME не задана)`
        : `SDK: ${sdk.androidHome} (${sdk.source})`,
    path: sdk.androidHome,
    fixCommand:
      sdk.source === 'default'
        ? `setx ANDROID_HOME "${sdk.androidHome}"`
        : undefined,
  });

  if (sdk.adb && existsSync(sdk.adb)) {
    const adbVersion = await runCommand(sdk.adb, ['version'], {
      timeoutMs: 10_000,
      env: withAndroidPath(env, sdk.androidHome),
    });
    const adbOut = (adbVersion.stdout || adbVersion.stderr || 'adb найден')
      .replace(/\r/g, '')
      .split('\n')[0]!;
    const adbVer =
      adbVersion.stdout.match(/Version\s+([\d.]+-\d+)/i)?.[1] ??
      adbVersion.stdout.match(/version\s+([\d.]+)/i)?.[1];
    items.push({
      id: 'adb',
      label: 'ADB',
      status: adbVersion.ok || adbVersion.stdout ? 'ok' : 'warning',
      detail: adbOut,
      path: sdk.adb,
      version: adbVer,
    });
  } else {
    items.push({
      id: 'adb',
      label: 'ADB',
      status: 'error',
      detail: 'adb.exe не найден в platform-tools',
      fixCommand:
        'sdkmanager "platform-tools" или Android Studio → SDK Tools → Android SDK Platform-Tools',
    });
  }

  if (sdk.emulator && existsSync(sdk.emulator)) {
    items.push({
      id: 'emulator',
      label: 'Emulator',
      status: 'ok',
      detail: 'Бинарник emulator найден',
      path: sdk.emulator,
    });
  } else {
    items.push({
      id: 'emulator',
      label: 'Emulator',
      status: 'error',
      detail: 'emulator.exe не найден',
      fixCommand:
        'sdkmanager "emulator" или Android Studio → SDK Tools → Android Emulator',
    });
  }

  const avds = await listAvds(env);
  if (avds.length > 0) {
    items.push({
      id: 'avd',
      label: 'AVD',
      status: 'ok',
      detail: `Найдено AVD: ${avds.map((a) => a.name).join(', ')}`,
    });
  } else {
    items.push({
      id: 'avd',
      label: 'AVD',
      status: 'error',
      detail: 'AVD не найдены. Создайте виртуальное устройство в Android Studio.',
      fixCommand: 'Android Studio → Device Manager → Create Device (Pixel + Google Play image)',
    });
  }

  const devices = await listDevices(env);
  const online = devices.filter((d) => d.state === 'device');
  if (online.length > 0) {
    items.push({
      id: 'adb-devices',
      label: 'ADB devices',
      status: 'ok',
      detail: `Онлайн: ${online.map((d) => d.udid).join(', ')}`,
    });
  } else if (devices.length > 0) {
    items.push({
      id: 'adb-devices',
      label: 'ADB devices',
      status: 'warning',
      detail: `Устройства есть, но не online: ${devices
        .map((d) => `${d.udid}(${d.state})`)
        .join(', ')}`,
      fixCommand: 'adb kill-server && adb start-server',
    });
  } else {
    items.push({
      id: 'adb-devices',
      label: 'ADB devices',
      status: 'warning',
      detail:
        'Нет подключённых устройств. Для реальной сессии запустите эмулятор (этап 6).',
      fixCommand: 'pnpm android:list-avds  # запуск AVD — этап 6',
    });
  }

  return items;
}

async function checkAppium(): Promise<EnvironmentReportItem> {
  const result = await runCommand('appium', ['-v'], {
    timeoutMs: 15_000,
    shell: true,
  });
  const version = (result.stdout || result.stderr).trim();
  if (result.ok || /^\d+\.\d+/.test(version)) {
    return {
      id: 'appium',
      label: 'Appium',
      status: 'ok',
      detail: `Appium ${version}`,
      version,
      fixCommand: undefined,
    };
  }

  // npx fallback
  const npx = await runCommand('npx', ['--yes', 'appium', '-v'], {
    timeoutMs: 60_000,
    shell: true,
  });
  const npxVersion = (npx.stdout || npx.stderr).trim();
  if (npx.ok || /^\d+\.\d+/.test(npxVersion)) {
    return {
      id: 'appium',
      label: 'Appium',
      status: 'warning',
      detail: `Appium доступен через npx (${npxVersion}). Рекомендуется глобальная установка.`,
      version: npxVersion,
      fixCommand: 'npm install -g appium',
    };
  }

  return {
    id: 'appium',
    label: 'Appium',
    status: 'error',
    detail: 'Appium CLI не найден',
    fixCommand: 'npm install -g appium',
  };
}

async function checkUiAutomator2(): Promise<EnvironmentReportItem> {
  const attempts: Array<() => Promise<CommandResult>> = [
    () =>
      runCommand('appium', ['driver', 'list', '--installed', '--json'], {
        timeoutMs: 30_000,
        shell: true,
      }),
    () =>
      runCommand('appium', ['driver', 'list', '--installed'], {
        timeoutMs: 30_000,
        shell: true,
      }),
    () =>
      runCommand('npx', ['--yes', 'appium', 'driver', 'list', '--installed', '--json'], {
        timeoutMs: 90_000,
        shell: true,
      }),
  ];

  let sawAnyOutput = false;
  for (const attempt of attempts) {
    const result = await attempt();
    const output = combineOutput(result);
    if (output) {
      sawAnyOutput = true;
    }
    if (hasInstalledDriver(output, 'uiautomator2')) {
      return {
        id: 'uiautomator2',
        label: 'UiAutomator2',
        status: 'ok',
        detail: 'Драйвер uiautomator2 установлен',
      };
    }
    // Explicit JSON saying not installed
    if (output.includes('uiautomator2') && output.includes('"installed":false')) {
      break;
    }
  }

  return {
    id: 'uiautomator2',
    label: 'UiAutomator2',
    status: 'error',
    detail: sawAnyOutput
      ? 'Драйвер uiautomator2 не установлен'
      : 'Не удалось проверить драйверы Appium',
    fixCommand: 'npm install -g appium && appium driver install uiautomator2',
  };
}

async function checkAppiumInspector(): Promise<EnvironmentReportItem> {
  // Inspector is a separate desktop app — we only hint.
  const candidates = [
    join(
      process.env.LOCALAPPDATA ?? '',
      'Programs',
      'Appium Inspector',
      'Appium Inspector.exe',
    ),
    join(
      process.env.LOCALAPPDATA ?? '',
      'appium-inspector',
      'Appium Inspector.exe',
    ),
  ].filter((p) => p.length > 10);

  const found = candidates.find((p) => existsSync(p));
  if (found) {
    return {
      id: 'appium-inspector',
      label: 'Appium Inspector',
      status: 'ok',
      detail: 'Найден Appium Inspector',
      path: found,
    };
  }

  return {
    id: 'appium-inspector',
    label: 'Appium Inspector',
    status: 'warning',
    detail:
      'Appium Inspector не найден автоматически. Нужен для этапа 8 (discovery локаторов).',
    fixCommand:
      'https://github.com/appium/appium-inspector/releases — скачайте Windows installer',
  };
}

function missing(id: string, label: string): EnvironmentReportItem {
  return {
    id,
    label,
    status: 'error',
    detail: `${label} недоступен без Android SDK`,
  };
}

function withAndroidPath(
  env: NodeJS.ProcessEnv,
  androidHome?: string,
): NodeJS.ProcessEnv {
  if (!androidHome) {
    return env;
  }
  const platformTools = join(androidHome, 'platform-tools');
  const emulatorDir = join(androidHome, 'emulator');
  const current = env.PATH ?? env.Path ?? '';
  const prefixed = [platformTools, emulatorDir, current].filter(Boolean).join(delimiter);
  return {
    ...env,
    ANDROID_HOME: env.ANDROID_HOME ?? androidHome,
    ANDROID_SDK_ROOT: env.ANDROID_SDK_ROOT ?? androidHome,
    PATH: prefixed,
    Path: prefixed,
  };
}
