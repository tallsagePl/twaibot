import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ManagedAppiumClient } from '@twinby/appium-client';
import {
  CaptureProfileOptionsSchema,
  DEFAULT_SESSION_LIMITS,
  SessionLimitsSchema,
  type CaptureProfileOptions,
  type CapturedImage,
  type CapturedProfile,
  type CapturedProfileFields,
  type SessionLimits,
} from '@twinby/contracts';
import {
  DEFAULT_PHOTO_CROP,
  SharpImagePipeline,
  pixelRectFromNormalized,
  type ImagePipeline,
} from '@twinby/image-pipeline';
import {
  ActionRateLimiter,
  LocatorExecutor,
  detectScreenFromPageSource,
  filterTwinbyInterests,
  findLocatorProfile,
  getDefaultLocatorProfile,
  parseBoundsForResourceId,
  readVisibleProfileFromSource,
} from '@twinby/twinby-adapter';

export interface ProfileCaptureDeps {
  client: ManagedAppiumClient;
  captureRoot: string;
  limits?: SessionLimits;
  imagePipeline?: ImagePipeline;
  appVersion?: string;
  deviceId?: string;
}

export interface ProfileCapture {
  captureCurrent(options?: CaptureProfileOptions): Promise<CapturedProfile>;
  cleanup(observationId: string): Promise<void>;
}

const CARD_ID = 'profileFeed-ProfileCard';

export class TwinbyProfileCapture implements ProfileCapture {
  private readonly images: ImagePipeline;
  private readonly limiter: ActionRateLimiter;
  private limits: SessionLimits;

  constructor(private readonly deps: ProfileCaptureDeps) {
    this.images = deps.imagePipeline ?? new SharpImagePipeline();
    this.limits = SessionLimitsSchema.parse(deps.limits ?? DEFAULT_SESSION_LIMITS);
    this.limiter = new ActionRateLimiter(this.limits);
  }

  updateLimits(limits: SessionLimits): void {
    this.limits = SessionLimitsSchema.parse(limits);
    this.limiter.updateLimits(this.limits);
  }

  async captureCurrent(rawOptions?: CaptureProfileOptions): Promise<CapturedProfile> {
    const options = CaptureProfileOptionsSchema.parse(rawOptions ?? {});
    const maxPhotos = options.maxPhotos ?? this.limits.maxPhotosPerProfile;
    // requireAllPhotos: try to page through gallery, but never fail capture on 1-photo cards
    const requireAllPhotos = options.requireAllPhotos ?? this.limits.requireAllPhotos;
    void requireAllPhotos;
    const requireBio = options.requireBio ?? this.limits.requireBio;
    const client = this.deps.client;
    const session = client.getSession();
    if (!session) {
      throw new Error('Нет активной Appium-сессии');
    }

    const observationId = randomUUID();
    const outDir = join(this.deps.captureRoot, observationId);
    mkdirSync(outDir, { recursive: true });

    const warnings: string[] = [];
    let actionsUsed = 0;
    const executor = new LocatorExecutor(client);

    let source = (await client.getPageSource()).source;
    let screen = detectScreenFromPageSource(source);
    if (screen.type !== 'feed') {
      throw new Error(
        `Ожидался экран feed, сейчас: ${screen.type} (${screen.evidence.join(', ') || 'нет evidence'})`,
      );
    }

    const windowRect = await client.getWindowRect();
    const profile =
      findLocatorProfile({
        appVersion: this.deps.appVersion,
        screenWidth: windowRect.width,
        screenHeight: windowRect.height,
      }) ?? getDefaultLocatorProfile();
    if (!profile) {
      throw new Error('Locator profile Twinby не найден');
    }

    let fields = fieldsFromPreview(readVisibleProfileFromSource(source));
    const cardFingerprint = computeCardFingerprint(fields, source);

    // --- photos (burst) ---
    // Phase A: ONLY adb/Appium screencap + tap (no sharp, no pageSource, no waits).
    // Phase B: encode JPEGs after the gallery burst.
    // Main lag was Appium /screenshot + sharp between flips; old Electron also
    // kept stale dist until full restart.
    const images: CapturedImage[] = [];
    const photoCrop = options.photoCrop ?? DEFAULT_PHOTO_CROP;
    const nextPhoto = profile.feed.nextPhotoArea[0];

    const initialCardBounds = parseBoundsForResourceId(source, CARD_ID);
    if (!initialCardBounds) {
      warnings.push('Не найдены bounds ProfileCard — полный screenshot');
    }
    const crop = initialCardBounds
      ? pixelRectFromNormalized(
          {
            left: initialCardBounds.left,
            top: initialCardBounds.top,
            width: initialCardBounds.width,
            height: initialCardBounds.height,
          },
          photoCrop,
        )
      : undefined;

    let nextTap: { x: number; y: number } | null = null;
    if (nextPhoto?.strategy === 'relative-tap' && initialCardBounds) {
      const ofId = nextPhoto.of ?? CARD_ID;
      const tapBounds =
        ofId === CARD_ID
          ? initialCardBounds
          : parseBoundsForResourceId(source, ofId) ?? initialCardBounds;
      if (nextPhoto.xRatio != null && nextPhoto.yRatio != null) {
        nextTap = {
          x: tapBounds.left + tapBounds.width * nextPhoto.xRatio,
          y: tapBounds.top + tapBounds.height * nextPhoto.yRatio,
        };
      }
    } else if (!nextPhoto) {
      warnings.push('nextPhotoArea отсутствует в locator profile');
    }

    const rawPngs: Buffer[] = [];
    const seenQuick: string[] = [];
    const burstStarted = Date.now();
    // Twinby gallery slide ~200–300ms; screenshot mid-animation crops half-frames.
    const settleAfterTapMs = Math.max(280, this.limits.uiCooldownMs || 0);

    for (let index = 0; index < maxPhotos; index++) {
      let png: Buffer;
      try {
        png = await client.takeScreenshotPng();
      } catch (err) {
        warnings.push(
          `Screenshot #${index} failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        break;
      }

      const q = quickBufferFingerprint(png);
      if (seenQuick.includes(q)) {
        warnings.push(
          index === 0
            ? 'Первое фото: fingerprint коллизия'
            : index === 1
              ? 'Одно фото в анкете — дальше не листаем'
              : `Повтор кадра #${index} — стоп`,
        );
        if (index === 0) {
          rawPngs.push(png);
          seenQuick.push(q);
        }
        break;
      }
      seenQuick.push(q);
      rawPngs.push(png);

      if (index + 1 >= maxPhotos || !nextTap) {
        break;
      }

      try {
        await client.tap(nextTap.x, nextTap.y);
        actionsUsed += 1;
        // Wait for slide animation to finish before next screencap
        await sleep(settleAfterTapMs);
      } catch (err) {
        warnings.push(
          `Next photo tap failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        break;
      }
    }

    warnings.push(
      `photo-burst: ${rawPngs.length} кадров за ${Date.now() - burstStarted}ms`,
    );

    // Encode after burst (can run while UI is idle)
    for (let index = 0; index < rawPngs.length; index++) {
      const png = rawPngs[index]!;
      const processed = await this.images.process(
        png,
        join(outDir, `photo-${index}.jpg`),
        {
          maxWidth: options.maxImageDimension,
          maxHeight: options.maxImageDimension,
          quality: options.jpegQuality,
          crop,
          format: 'jpeg',
        },
      );
      const image: CapturedImage = {
        index,
        path: processed.path,
        width: processed.width,
        height: processed.height,
        bytes: processed.bytes,
        sha256: processed.sha256,
        perceptualHash: processed.perceptualHash,
      };
      if (options.includeDataUrls) {
        const data = readFileSync(processed.path);
        image.dataUrl = `data:image/jpeg;base64,${data.toString('base64')}`;
      }
      images.push(image);
    }

    // --- bio / details text (skipped when requireBio=false — saves pageSource) ---
    if (requireBio) {
      source = (await client.getPageSource()).source;
      fields = mergeFields(fields, fieldsFromPreview(readVisibleProfileFromSource(source)));
    }

    if (requireBio && !hasUsefulBio(fields)) {
      try {
        await this.limiter.run(async () => {
          await executor.swipeOnResourceId(CARD_ID, 'up', source);
        });
        actionsUsed += 1;
        await sleep(photoSettleMs(this.limits.uiCooldownMs));
        source = (await client.getPageSource()).source;
        fields = mergeFields(fields, fieldsFromPreview(readVisibleProfileFromSource(source)));
        fields = mergeFields(fields, extractLongTextAsBio(source));
      } catch (err) {
        warnings.push(
          `Скролл для bio не удался: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    if (requireBio && !hasUsefulBio(fields)) {
      const details = profile.feed.detailsButton[0];
      if (details) {
        try {
          await this.limiter.run(async () => {
            await executor.tapLocator(details, source);
          });
          actionsUsed += 1;
          await sleep(photoSettleMs(this.limits.uiCooldownMs + 40));
          source = (await client.getPageSource()).source;
          fields = mergeFields(fields, fieldsFromPreview(readVisibleProfileFromSource(source)));
          fields = mergeFields(fields, extractLongTextAsBio(source));
          // return to feed without liking
          await client.back();
          await sleep(photoSettleMs(this.limits.uiCooldownMs));
        } catch (err) {
          warnings.push(
            `Открытие details не удалось: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      } else {
        warnings.push('detailsButton не обнаружен — полный bio может отсутствовать');
      }
    }

    if (requireBio && !hasUsefulBio(fields)) {
      warnings.push('Bio не найдено на face/scroll/details');
    }

    // Burst capture is fast — skip extra pageSource unless we scrolled for bio.
    let finalFingerprint = cardFingerprint;
    if (requireBio) {
      source = (await client.getPageSource()).source;
      const endFields = fieldsFromPreview(readVisibleProfileFromSource(source));
      finalFingerprint = computeCardFingerprint(
        {
          displayName: endFields.displayName ?? fields.displayName,
          age: endFields.age ?? fields.age,
          distanceKm: endFields.distanceKm ?? fields.distanceKm,
          city: endFields.city ?? fields.city,
        },
        source,
      );
      if (finalFingerprint !== cardFingerprint) {
        warnings.push(
          `Анкета сменилась во время захвата (${fields.displayName ?? '?'} → ${
            endFields.displayName ?? '?'
          }) — используем актуальный fingerprint`,
        );
        fields = mergeFields(fields, endFields);
      }
    }

    const completeness = computeCompleteness(fields, images.length, maxPhotos, requireBio);
    writeFileSync(
      join(outDir, 'meta.json'),
      JSON.stringify(
        {
          observationId,
          fields,
          imageCount: images.length,
          warnings,
          actionsUsed,
        },
        null,
        2,
      ),
      'utf8',
    );

    const result: CapturedProfile = {
      observationId,
      capturedAt: new Date().toISOString(),
      fields,
      images: options.includeDataUrls
        ? images
        : images.map(({ dataUrl: _d, ...rest }) => rest),
      source: {
        appPackage: 'com.twinby',
        appVersion: this.deps.appVersion,
        deviceId: this.deps.deviceId ?? session.udid,
        screenSize: { width: windowRect.width, height: windowRect.height },
      },
      completeness,
      cardFingerprint: finalFingerprint,
      warnings,
      actionsUsed,
    };
    return result;
  }

  async cleanup(observationId: string): Promise<void> {
    const dir = join(this.deps.captureRoot, observationId);
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Emulator-friendly settle after tap/screenshot — no human-like floor. */
function photoSettleMs(uiCooldownMs: number): number {
  return Math.max(15, Math.min(120, uiCooldownMs || 15));
}

/** O(n) sample hash — detect identical frames without sharp between flips. */
function quickBufferFingerprint(buf: Buffer): string {
  const step = Math.max(17, Math.floor(buf.length / 96));
  let h = buf.length >>> 0;
  for (let i = 8; i < buf.length; i += step) {
    h = Math.imul(h ^ buf[i]!, 16777619) >>> 0;
  }
  // Mix head/tail — PNG IHDR + end matter less than compressed IDAT mid-stream
  h = Math.imul(h ^ buf[Math.floor(buf.length / 2)]!, 2246822519) >>> 0;
  return `${buf.length.toString(16)}:${h.toString(16)}`;
}

function fieldsFromPreview(
  preview: ReturnType<typeof readVisibleProfileFromSource>,
): CapturedProfileFields {
  return {
    displayName: preview.displayName,
    age: preview.age,
    distanceKm: preview.distanceKm,
    city: preview.city,
    compatibilityPercent: preview.compatibilityPercent,
    relationshipGoal: preview.goal,
    bio: preview.bioSnippet,
    interests: filterTwinbyInterests(preview.interests ?? []),
    otherVisibleText: preview.otherVisibleText ?? [],
  };
}

function mergeFields(
  base: CapturedProfileFields,
  extra: CapturedProfileFields,
): CapturedProfileFields {
  return {
    displayName: base.displayName ?? extra.displayName,
    age: base.age ?? extra.age,
    distanceKm: base.distanceKm ?? extra.distanceKm,
    city: base.city ?? extra.city,
    compatibilityPercent: base.compatibilityPercent ?? extra.compatibilityPercent,
    relationshipGoal: base.relationshipGoal ?? extra.relationshipGoal,
    bio: pickLonger(base.bio, extra.bio),
    interests: filterTwinbyInterests(unique([...base.interests, ...extra.interests])),
    otherVisibleText: unique([...base.otherVisibleText, ...extra.otherVisibleText]),
  };
}

function extractLongTextAsBio(pageSource: string): CapturedProfileFields {
  const descs = [...pageSource.matchAll(/content-desc="([^"]+)"/g)]
    .map((m) => (m[1] ?? '').replace(/&#10;/g, '\n').trim())
    .filter((d) => d.length >= 40 && !d.includes('navigationBar') && !d.includes('Вкладка'));
  const longest = descs.sort((a, b) => b.length - a.length)[0];
  return {
    interests: [],
    otherVisibleText: [],
    bio: longest,
  };
}

function hasUsefulBio(fields: CapturedProfileFields): boolean {
  return Boolean(fields.bio && fields.bio.trim().length >= 12);
}

function computeCompleteness(
  fields: CapturedProfileFields,
  imageCount: number,
  maxPhotos: number,
  requireBio: boolean,
): CapturedProfile['completeness'] {
  let textScore = 0;
  let textParts = 0;
  const bump = (ok: boolean, weight = 1) => {
    textParts += weight;
    if (ok) {
      textScore += weight;
    }
  };
  bump(Boolean(fields.displayName));
  bump(fields.age != null);
  bump(fields.distanceKm != null);
  bump(fields.compatibilityPercent != null);
  bump(Boolean(fields.relationshipGoal));
  bump(fields.interests.length > 0);
  bump(hasUsefulBio(fields), requireBio ? 2 : 1);
  const text = textParts === 0 ? 0 : textScore / textParts;
  const images = Math.min(1, imageCount / Math.max(1, Math.min(maxPhotos, 3)));
  return {
    text: round2(text),
    images: round2(images),
    overall: round2(text * 0.55 + images * 0.45),
  };
}

export function computeCardFingerprint(
  fields: Pick<CapturedProfileFields, 'displayName' | 'age' | 'distanceKm' | 'city'>,
  _source?: string,
): string {
  // Do NOT include card bounds — they jitter and false-fail identity checks.
  void _source;
  const raw = [
    (fields.displayName ?? '').trim().toLowerCase(),
    fields.age ?? '',
    fields.distanceKm ?? '',
    (fields.city ?? '').trim().toLowerCase(),
  ].join('|');
  return createHash('sha256').update(raw).digest('hex').slice(0, 24);
}

function pickLonger(a?: string, b?: string): string | undefined {
  if (!a) {
    return b;
  }
  if (!b) {
    return a;
  }
  return a.length >= b.length ? a : b;
}

function unique(items: string[]): string[] {
  return [...new Set(items.filter(Boolean))];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** @deprecated */
export class NotImplementedProfileCapture implements ProfileCapture {
  async captureCurrent(): Promise<CapturedProfile> {
    throw new Error('Use TwinbyProfileCapture');
  }
  async cleanup(): Promise<void> {
    throw new Error('Use TwinbyProfileCapture');
  }
}
