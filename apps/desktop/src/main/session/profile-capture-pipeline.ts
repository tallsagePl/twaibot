import { join } from 'node:path';
import type { CapturedProfile, SessionLimits } from '@twinby/contracts';
import { ensureAppDirectories, resolveAppPaths } from '@twinby/config';
import { getLogger } from '@twinby/logging';
import { TwinbyProfileCapture } from '@twinby/profile-capture';
import type { createAppiumHandlers } from '../ipc/appium-handlers';
import type { createTwinbyHandlers } from '../ipc/twinby-handlers';
import {
  isSameCardIdentity,
  snapshotCardIdentity,
  type CardIdentitySnapshot,
} from './card-identity';

type AppiumHandlers = ReturnType<typeof createAppiumHandlers>;
type TwinbyHandlers = ReturnType<typeof createTwinbyHandlers>;

export type CapturePipelineResult =
  | {
      kind: 'captured';
      captured: CapturedProfile;
      photoDataUrls: string[];
      captureMs: number;
      sameCard: boolean;
    }
  | { kind: 'aborted' };

export class ProfileCapturePipeline {
  constructor(
    private readonly deps: {
      appium: AppiumHandlers;
      twinby: TwinbyHandlers;
      getProjectRoot: () => string;
      ensureAppiumSession: (
        forceRecreate?: boolean,
      ) => Promise<{ sessionId: string; udid: string }>;
    },
  ) {}

  async capture(input: {
    limits: SessionLimits;
    /** Token for this processNext generation — compared to live getLoopToken(). */
    currentToken: number;
    getLoopToken: () => number;
    lastAdvancedIdentity: CardIdentitySnapshot | null;
  }): Promise<CapturePipelineResult> {
    const { limits, currentToken, getLoopToken, lastAdvancedIdentity } = input;
    const isStale = () => currentToken !== getLoopToken();
    if (isStale()) {
      return { kind: 'aborted' };
    }
    const paths = resolveAppPaths({ projectRoot: this.deps.getProjectRoot() });
    ensureAppDirectories(paths);
    const captureRoot = join(paths.temporary, 'captures');
    const pkg = await this.deps.twinby.detectPackage();
    if (isStale()) {
      return { kind: 'aborted' };
    }
    const session = await this.deps.ensureAppiumSession();
    if (isStale()) {
      return { kind: 'aborted' };
    }

    const captureStarted = Date.now();
    const capture = new TwinbyProfileCapture({
      client: this.deps.appium.getClient(),
      captureRoot,
      limits,
      appVersion: pkg.versionName,
      deviceId: session.udid,
    });

    const captureOptions = {
      includeDataUrls: true as const,
      requireAllPhotos: limits.requireAllPhotos,
      requireBio: limits.requireBio,
      maxPhotos: limits.maxPhotosPerProfile,
      maxImageDimension:
        limits.speedPreset === 'turbo' || limits.speedPreset === 'fast' ? 420 : 512,
      jpegQuality:
        limits.speedPreset === 'turbo' || limits.speedPreset === 'fast' ? 48 : 52,
    };

    let captured: CapturedProfile;
    try {
      captured = await capture.captureCurrent(captureOptions);
    } catch (err) {
      if (isStale()) {
        return { kind: 'aborted' };
      }
      const message = err instanceof Error ? err.message : String(err);
      if (/завершена или не создана|terminated or not started|invalid session/i.test(message)) {
        getLogger('session').warn(
          { err: message },
          'Appium session died during capture — recreating',
        );
        await this.deps.ensureAppiumSession(true);
        if (isStale()) {
          return { kind: 'aborted' };
        }
        captured = await capture.captureCurrent(captureOptions);
      } else {
        throw err;
      }
    }
    const captureMs = Date.now() - captureStarted;

    if (isStale()) {
      await capture.cleanup(captured.observationId).catch(() => undefined);
      return { kind: 'aborted' };
    }

    const photoDataUrls = captured.images
      .map((img) => img.dataUrl)
      .filter((u): u is string => Boolean(u));

    const identity = snapshotCardIdentity(captured);
    const sameCard = Boolean(
      lastAdvancedIdentity && isSameCardIdentity(identity, lastAdvancedIdentity),
    );

    if (sameCard) {
      getLogger('session').warn(
        {
          displayName: identity.displayName,
          age: identity.age,
          photos: identity.photoHashes.length,
        },
        'Captured same card as last advanced — forcing dislike to move feed',
      );
    }

    return {
      kind: 'captured',
      captured,
      photoDataUrls,
      captureMs,
      sameCard,
    };
  }
}
