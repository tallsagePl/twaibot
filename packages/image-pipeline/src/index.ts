import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import sharp from 'sharp';

export interface NormalizedRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PixelRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ImageProcessOptions {
  maxWidth: number;
  maxHeight: number;
  quality: number;
  /** Absolute crop in source pixel space */
  crop?: PixelRect;
  format?: 'jpeg' | 'webp';
}

export interface ProcessedImage {
  path: string;
  width: number;
  height: number;
  bytes: number;
  sha256: string;
  perceptualHash: string;
}

export interface ImagePipeline {
  process(
    input: Buffer | string,
    outputPath: string,
    options: ImageProcessOptions,
  ): Promise<ProcessedImage>;
  perceptualHash(input: Buffer | string, crop?: PixelRect): Promise<string>;
  sha256(input: Buffer): string;
}

export function pixelRectFromNormalized(
  bounds: PixelRect,
  normalized: NormalizedRect,
): PixelRect {
  return {
    left: Math.round(bounds.left + bounds.width * normalized.x),
    top: Math.round(bounds.top + bounds.height * normalized.y),
    width: Math.round(bounds.width * normalized.width),
    height: Math.round(bounds.height * normalized.height),
  };
}

/**
 * Nearly full ProfileCard — Twinby photo fills the card; aggressive top-only
 * crop was cutting faces. Prefer full frame + lower JPEG quality instead.
 */
export const DEFAULT_PHOTO_CROP: NormalizedRect = {
  x: 0.01,
  y: 0.01,
  width: 0.98,
  height: 0.98,
};

export class SharpImagePipeline implements ImagePipeline {
  sha256(input: Buffer): string {
    return createHash('sha256').update(input).digest('hex');
  }

  async perceptualHash(input: Buffer | string, crop?: PixelRect): Promise<string> {
    let pipeline = sharp(input).rotate();
    if (crop) {
      pipeline = pipeline.extract({
        left: Math.max(0, crop.left),
        top: Math.max(0, crop.top),
        width: Math.max(1, crop.width),
        height: Math.max(1, crop.height),
      });
    }
    const { data, info } = await pipeline
      .greyscale()
      .resize(8, 8, { fit: 'fill' })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const pixels = info.width * info.height;
    let sum = 0;
    for (let i = 0; i < pixels; i++) {
      sum += data[i] ?? 0;
    }
    const avg = sum / pixels;
    let bits = '';
    for (let i = 0; i < pixels; i++) {
      bits += (data[i] ?? 0) >= avg ? '1' : '0';
    }
    return BigInt(`0b${bits}`).toString(16).padStart(16, '0');
  }

  async process(
    input: Buffer | string,
    outputPath: string,
    options: ImageProcessOptions,
  ): Promise<ProcessedImage> {
    mkdirSync(dirname(outputPath), { recursive: true });
    let pipeline = sharp(input).rotate();
    if (options.crop) {
      const meta = await sharp(input).metadata();
      const maxW = meta.width ?? options.crop.left + options.crop.width;
      const maxH = meta.height ?? options.crop.top + options.crop.height;
      const left = clamp(options.crop.left, 0, Math.max(0, maxW - 1));
      const top = clamp(options.crop.top, 0, Math.max(0, maxH - 1));
      const width = clamp(options.crop.width, 1, maxW - left);
      const height = clamp(options.crop.height, 1, maxH - top);
      pipeline = pipeline.extract({ left, top, width, height });
    }

    const format = options.format ?? 'jpeg';
    const resized = pipeline.resize({
      width: options.maxWidth,
      height: options.maxHeight,
      fit: 'inside',
      withoutEnlargement: true,
    });

    const out =
      format === 'webp'
        ? await resized.webp({ quality: options.quality }).toBuffer({ resolveWithObject: true })
        : await resized
            .jpeg({ quality: options.quality, mozjpeg: true })
            .toBuffer({ resolveWithObject: true });

    await sharp(out.data).toFile(outputPath);
    const perceptualHash = await this.perceptualHash(out.data);

    return {
      path: outputPath,
      width: out.info.width,
      height: out.info.height,
      bytes: out.data.byteLength,
      sha256: this.sha256(out.data),
      perceptualHash,
    };
  }
}

export function hammingDistanceHex(a: string, b: string): number {
  const aa = BigInt(`0x${a}`);
  const bb = BigInt(`0x${b}`);
  let x = aa ^ bb;
  let count = 0;
  while (x > 0n) {
    count += Number(x & 1n);
    x >>= 1n;
  }
  return count;
}

/** Same image if Hamming distance of 64-bit aHash is small */
export function isSimilarHash(a: string, b: string, maxDistance = 5): boolean {
  if (a === b) {
    return true;
  }
  try {
    return hammingDistanceHex(a, b) <= maxDistance;
  } catch {
    return false;
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** @deprecated */
export class NotImplementedImagePipeline implements ImagePipeline {
  async process(): Promise<ProcessedImage> {
    throw new Error('Use SharpImagePipeline');
  }
  async perceptualHash(): Promise<string> {
    throw new Error('Use SharpImagePipeline');
  }
  sha256(): string {
    throw new Error('Use SharpImagePipeline');
  }
}
