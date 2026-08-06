import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import {
  SharpImagePipeline,
  hammingDistanceHex,
  isSimilarHash,
  pixelRectFromNormalized,
} from './index';

describe('SharpImagePipeline', () => {
  it('crops, resizes and hashes', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'twinby-img-'));
    const input = await sharp({
      create: {
        width: 200,
        height: 300,
        channels: 3,
        background: { r: 40, g: 120, b: 200 },
      },
    })
      .png()
      .toBuffer();

    const pipeline = new SharpImagePipeline();
    const out = await pipeline.process(input, join(dir, 'out.jpg'), {
      maxWidth: 100,
      maxHeight: 100,
      quality: 80,
      crop: { left: 10, top: 10, width: 100, height: 100 },
    });

    expect(out.width).toBeLessThanOrEqual(100);
    expect(out.height).toBeLessThanOrEqual(100);
    expect(out.sha256).toHaveLength(64);
    expect(out.perceptualHash.length).toBeGreaterThan(0);

    const h1 = await pipeline.perceptualHash(input);
    const h2 = await pipeline.perceptualHash(input);
    expect(isSimilarHash(h1, h2)).toBe(true);
    expect(hammingDistanceHex(h1, h2)).toBe(0);

    rmSync(dir, { recursive: true, force: true });
  });

  it('maps normalized crop', () => {
    expect(
      pixelRectFromNormalized(
        { left: 0, top: 0, width: 100, height: 200 },
        { x: 0.1, y: 0.2, width: 0.5, height: 0.25 },
      ),
    ).toEqual({ left: 10, top: 40, width: 50, height: 50 });
  });
});
