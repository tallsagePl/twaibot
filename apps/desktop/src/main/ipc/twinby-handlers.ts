import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  BLUESTACKS_ADB_UDID,
  CaptureProfileOptionsSchema,
  DEFAULT_SESSION_LIMITS,
  SPEED_PRESET_VALUES,
  SessionLimitsSchema,
  TWINBY_APP_PACKAGE,
  pickPreferredAndroidDevice,
  type CaptureProfileOptions,
  type CapturedProfile,
  type DiscoverySnapshot,
  type SessionLimits,
  type TwinbyPackageInfo,
} from '@twinby/contracts';
import {
  detectScreenFromPageSource,
  extractContentDescs,
  extractResourceIds,
  findLocatorProfile,
  getDefaultLocatorProfile,
  readVisibleProfileFromSource,
} from '@twinby/twinby-adapter';
import { TwinbyProfileCapture } from '@twinby/profile-capture';
import { ensureAppDirectories, resolveAppPaths } from '@twinby/config';
import { getSetting, setSetting, type AppDatabase } from '@twinby/database';
import { getLogger } from '@twinby/logging';
import { createAppiumHandlers } from './appium-handlers';

const execFileAsync = promisify(execFile);
const SESSION_LIMITS_KEY = 'session_limits_json';

function requireDb(db: AppDatabase | null): AppDatabase {
  if (!db) {
    throw new Error('Database is not initialized');
  }
  return db;
}

async function runAdb(args: string[]): Promise<string> {
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  const adb = sdk
    ? join(sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb')
    : 'adb';
  try {
    const { stdout } = await execFileAsync(adb, args, {
      timeout: 15_000,
      windowsHide: true,
      encoding: 'utf8',
      shell: !sdk,
    });
    return String(stdout ?? '').trim();
  } catch (err) {
    const error = err as { stdout?: string; stderr?: string; message?: string };
    return String(error.stdout || error.stderr || error.message || '').trim();
  }
}

export function createTwinbyHandlers(
  getDb: () => AppDatabase | null,
  getProjectRoot: () => string,
) {
  const appium = createAppiumHandlers(getProjectRoot);

  return {
    async detectPackage(): Promise<TwinbyPackageInfo> {
      const devicesOut = await runAdb(['devices']);
      const devices = devicesOut
        .split(/\r?\n/)
        .slice(1)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const [udid, state] = line.split(/\s+/);
          return {
            udid: udid ?? '',
            state: state === 'device' ? 'device' : state || 'unknown',
          };
        })
        .filter((d) => d.udid);
      const preferred =
        pickPreferredAndroidDevice(devices)?.udid ?? BLUESTACKS_ADB_UDID;
      const serialArgs = preferred ? ['-s', preferred] : [];

      const pathOut = await runAdb([
        ...serialArgs,
        'shell',
        'pm',
        'path',
        TWINBY_APP_PACKAGE,
      ]);
      const installed = pathOut.includes('package:');
      if (!installed) {
        return { packageName: null, installed: false };
      }
      const dump = await runAdb([
        ...serialArgs,
        'shell',
        'dumpsys',
        'package',
        TWINBY_APP_PACKAGE,
      ]);
      const versionName = dump.match(/versionName=([^\s]+)/)?.[1];
      const versionCode = dump.match(/versionCode=(\d+)/)?.[1];
      return {
        packageName: TWINBY_APP_PACKAGE,
        installed: true,
        versionName,
        versionCode,
      };
    },

    async getLocatorProfile() {
      const pkg = await this.detectPackage();
      return (
        findLocatorProfile({ appVersion: pkg.versionName }) ??
        getDefaultLocatorProfile()
      );
    },

    async detectScreen(pageSource?: unknown) {
      if (typeof pageSource === 'string' && pageSource.length > 0) {
        return detectScreenFromPageSource(pageSource);
      }
      const source = await appium.getPageSource();
      return detectScreenFromPageSource(source.source);
    },

    async captureDiscoverySnapshot(): Promise<DiscoverySnapshot> {
      const paths = resolveAppPaths({ projectRoot: getProjectRoot() });
      ensureAppDirectories(paths);
      const discoveryDir = join(paths.data, 'discovery');
      mkdirSync(discoveryDir, { recursive: true });

      const pkg = await this.detectPackage();
      if (!pkg.installed) {
        throw new Error('Twinby (com.twinby) не установлен на устройстве');
      }

      const session = await appium.getSession();
      if (!session) {
        throw new Error('Сначала создайте Appium-сессию на экране «Устройство»');
      }

      const shot = await appium.takeScreenshot();
      const source = await appium.getPageSource();
      const rect = await appium.getWindowRect();
      const detected = detectScreenFromPageSource(source.source);
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const screenshotPath = join(discoveryDir, `twinby-${stamp}.png`);
      const pageSourcePath = join(discoveryDir, `twinby-${stamp}.xml`);
      writeFileSync(screenshotPath, Buffer.from(shot.base64, 'base64'));
      writeFileSync(pageSourcePath, source.source, 'utf8');

      const profile =
        findLocatorProfile({
          appVersion: pkg.versionName,
          screenWidth: rect.width,
          screenHeight: rect.height,
        }) ?? getDefaultLocatorProfile();

      const snapshot: DiscoverySnapshot = {
        capturedAt: new Date().toISOString(),
        udid: session.udid,
        packageName: 'com.twinby',
        appVersion: pkg.versionName,
        windowRect: rect,
        screenshotDataUrl: shot.dataUrl,
        screenshotPath,
        pageSourcePath,
        pageSourceLength: source.source.length,
        detectedScreen: detected,
        resourceIds: extractResourceIds(source.source),
        contentDescs: extractContentDescs(source.source).slice(0, 40),
        locatorProfileId: profile?.id,
        profilePreview: readVisibleProfileFromSource(source.source),
      };

      getLogger('twinby-adapter').info(
        { screen: detected.type, ids: snapshot.resourceIds.length },
        'Discovery snapshot captured',
      );
      return snapshot;
    },

    async captureCurrentProfile(raw?: unknown): Promise<CapturedProfile> {
      const paths = resolveAppPaths({ projectRoot: getProjectRoot() });
      ensureAppDirectories(paths);
      const captureRoot = join(paths.temporary, 'captures');
      mkdirSync(captureRoot, { recursive: true });

      const pkg = await this.detectPackage();
      if (!pkg.installed) {
        throw new Error('Twinby (com.twinby) не установлен на устройстве');
      }
      const session = await appium.getSession();
      if (!session) {
        throw new Error('Сначала создайте Appium-сессию');
      }

      const limits = this.getSessionLimits();
      const options: CaptureProfileOptions = CaptureProfileOptionsSchema.parse(raw ?? {});
      const capture = new TwinbyProfileCapture({
        client: appium.getClient(),
        captureRoot,
        limits,
        appVersion: pkg.versionName,
        deviceId: session.udid,
      });

      getLogger('capture').info(
        {
          maxPhotos: options.maxPhotos ?? limits.maxPhotosPerProfile,
          requireBio: options.requireBio ?? limits.requireBio,
        },
        'Starting profile capture',
      );
      const result = await capture.captureCurrent(options);
      getLogger('capture').info(
        {
          observationId: result.observationId,
          photos: result.images.length,
          actionsUsed: result.actionsUsed,
          warnings: result.warnings.length,
        },
        'Profile capture finished',
      );
      return result;
    },

    async cleanupCapture(observationId: unknown): Promise<void> {
      if (typeof observationId !== 'string' || !observationId) {
        throw new Error('observationId обязателен');
      }
      const paths = resolveAppPaths({ projectRoot: getProjectRoot() });
      const capture = new TwinbyProfileCapture({
        client: appium.getClient(),
        captureRoot: join(paths.temporary, 'captures'),
      });
      await capture.cleanup(observationId);
    },

    getSessionLimits(): SessionLimits {
      const db = requireDb(getDb());
      const raw = getSetting(db, SESSION_LIMITS_KEY);
      if (!raw) {
        return DEFAULT_SESSION_LIMITS;
      }
      try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const current = SessionLimitsSchema.parse(
          typeof parsed.speedPreset !== 'string' ||
            !['safe', 'balanced', 'fast', 'turbo'].includes(parsed.speedPreset)
            ? {
                ...parsed,
                ...SPEED_PRESET_VALUES.turbo,
                maxProfiles: parsed.maxProfiles,
                maxLikes: parsed.maxLikes,
                maxDislikes: parsed.maxDislikes,
                maxAutoActions: parsed.maxAutoActions,
                maxSessionDurationMin: parsed.maxSessionDurationMin,
                stopOnRepeatedErrors: parsed.stopOnRepeatedErrors,
              }
            : parsed,
        );
        // Profiles-only stop: 350 ankets, no duration/likes/dislikes/auto caps.
        const needsTurbo =
          typeof parsed.speedPreset !== 'string' ||
          (current.speedPreset === 'fast' &&
            (current.minActionIntervalMs >= 400 || current.uiCooldownMs < 200)) ||
          (current.speedPreset === 'turbo' &&
            (current.maxPhotosPerProfile < 8 ||
              current.maxPhotosForAi < 5 ||
              current.uiCooldownMs < 200));
        const needsProfilesOnlyCaps =
          current.maxProfiles !== 350 ||
          current.maxLikes !== 0 ||
          current.maxDislikes !== 0 ||
          current.maxAutoActions !== 0 ||
          current.maxSessionDurationMin !== 0;
        if (needsTurbo || needsProfilesOnlyCaps) {
          const migrated = SessionLimitsSchema.parse({
            ...current,
            ...(needsTurbo ? SPEED_PRESET_VALUES.turbo : {}),
            maxProfiles: 350,
            maxLikes: 0,
            maxDislikes: 0,
            maxAutoActions: 0,
            maxSessionDurationMin: 0,
            stopOnRepeatedErrors: current.stopOnRepeatedErrors,
          });
          setSetting(db, SESSION_LIMITS_KEY, JSON.stringify(migrated), false);
          return migrated;
        }
        return current;
      } catch {
        return DEFAULT_SESSION_LIMITS;
      }
    },

    saveSessionLimits(raw: unknown): SessionLimits {
      const db = requireDb(getDb());
      const current = this.getSessionLimits();
      const next = SessionLimitsSchema.parse({
        ...current,
        ...(typeof raw === 'object' && raw ? raw : {}),
      });
      setSetting(db, SESSION_LIMITS_KEY, JSON.stringify(next), false);
      return next;
    },
  };
}
