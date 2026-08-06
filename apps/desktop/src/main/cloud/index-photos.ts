import { nativeImage } from 'electron';
import type { AiImageInput } from '@twinby/ai-provider';
import type { CloudListedPhoto } from '@twinby/cloud-photo-sources';
import { downloadCloudRenderableImage } from '@twinby/cloud-photo-sources';
import type { CloudProvider } from '@twinby/contracts';
import {
  setIndexedPhotoLocalPreviewPath,
  setIndexedPhotoPerceptualHash,
  upsertIndexedPhotoAsset,
  type AppDatabase,
} from '@twinby/database';
import { SharpImagePipeline } from '@twinby/image-pipeline';
import { getLogger } from '@twinby/logging';
import { createProviderFromDb } from '../ipc/ai-handlers';
import { hasApiKey } from '../security/secrets';
import {
  jpegPreviewFromBuffer,
  looksLikeJpeg,
  writePhotoPreviewFile,
} from './photo-preview';

const AI_BATCH = 3;
const imagePipeline = new SharpImagePipeline();

function bufferToAiImage(buffer: Buffer, label: string): AiImageInput | null {
  const image = nativeImage.createFromBuffer(buffer);
  if (!image.isEmpty()) {
    const { width, height } = image.getSize();
    const maxSide = 768;
    const scale = Math.min(1, maxSide / Math.max(width, height, 1));
    const resized =
      scale < 1
        ? image.resize({
            width: Math.max(1, Math.round(width * scale)),
            height: Math.max(1, Math.round(height * scale)),
            quality: 'better',
          })
        : image;
    return {
      label,
      mimeType: 'image/jpeg',
      base64: resized.toJPEG(72).toString('base64'),
    };
  }
  if (looksLikeJpeg(buffer)) {
    return {
      label,
      mimeType: 'image/jpeg',
      base64: buffer.toString('base64'),
    };
  }
  return null;
}

async function downloadListedRenderable(input: {
  provider: CloudProvider;
  file: CloudListedPhoto;
  yandexToken?: string;
  googleAccessToken?: string;
}): Promise<Buffer> {
  return downloadCloudRenderableImage({
    provider: input.provider,
    fileId: input.file.id,
    path: input.file.path,
    yandexToken: input.yandexToken,
    googleAccessToken: input.googleAccessToken,
  });
}

/**
 * Download + AI-describe listed cloud photos and upsert into local index.
 * Uses cloud JPEG previews (not HEIC originals) so Windows/Electron can decode them.
 */
export async function indexListedCloudPhotos(input: {
  db: AppDatabase;
  provider: CloudProvider;
  files: CloudListedPhoto[];
  yandexToken?: string;
  googleAccessToken?: string;
  previewsDir: string;
}): Promise<{ indexedCount: number; describedCount: number; errors: string[] }> {
  const errors: string[] = [];
  let indexedCount = 0;
  let describedCount = 0;
  const canAi = hasApiKey(input.db);
  if (!canAi) {
    errors.push(
      'API-ключ ИИ не задан — фото попадут в индекс без описаний. Добавьте ключ в Настройки → ИИ.',
    );
  }

  const provider = canAi
    ? createProviderFromDb(input.db, { timeoutMs: 180_000, imageDetail: 'low' })
    : null;

  for (let i = 0; i < input.files.length; i += AI_BATCH) {
    const chunk = input.files.slice(i, i + AI_BATCH);
    const prepared: Array<{
      file: CloudListedPhoto;
      image: AiImageInput | null;
      previewJpeg: Buffer | null;
      downloadError?: string;
    }> = [];

    for (const file of chunk) {
      try {
        const buffer = await downloadListedRenderable({
          provider: input.provider,
          file,
          yandexToken: input.yandexToken,
          googleAccessToken: input.googleAccessToken,
        });
        prepared.push({
          file,
          image: bufferToAiImage(buffer, file.name),
          previewJpeg: jpegPreviewFromBuffer(buffer),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        prepared.push({
          file,
          image: null,
          previewJpeg: null,
          downloadError: message,
        });
        errors.push(`${file.name}: ${message}`);
      }
    }

    let descriptions: Array<{
      description: string;
      signals: string[];
      model?: string;
    }> = prepared.map((p) => ({
      description: p.file.name,
      signals: [],
    }));

    if (provider) {
      const withImages = prepared
        .map((p, idx) => ({ p, idx }))
        .filter((row) => row.p.image);
      if (withImages.length > 0) {
        try {
          const result = await provider.describePhotosForIndex({
            images: withImages.map((row) => row.p.image!),
          });
          withImages.forEach((row, j) => {
            const item = result.items[j];
            if (!item) return;
            descriptions[row.idx] = {
              description: item.description,
              signals: item.signals,
              model: result.model,
            };
            describedCount += 1;
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          errors.push(`AI batch @${i}: ${message}`);
          getLogger('ipc').warn({ err: message }, 'AI photo describe failed');
        }
      }
    }

    for (let j = 0; j < prepared.length; j += 1) {
      const row = prepared[j]!;
      const desc = descriptions[j]!;
      let perceptualHash = '';
      if (row.previewJpeg) {
        try {
          perceptualHash = await imagePipeline.perceptualHash(row.previewJpeg);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          errors.push(`${row.file.name}: pHash — ${message}`);
        }
      }
      const asset = upsertIndexedPhotoAsset(input.db, {
        provider: input.provider,
        externalFileId: row.file.id,
        externalPath: row.file.path,
        fileName: row.file.name,
        sourceModifiedAt: row.file.modifiedAt,
        sourceSizeBytes: row.file.sizeBytes,
        shortDescription: desc.description,
        observedSignals: desc.signals,
        embeddingModel: desc.model,
        perceptualHash: perceptualHash || undefined,
      });
      if (row.previewJpeg) {
        const path = writePhotoPreviewFile(
          input.previewsDir,
          asset.id,
          row.previewJpeg,
        );
        setIndexedPhotoLocalPreviewPath(input.db, asset.id, path);
        if (perceptualHash) {
          setIndexedPhotoPerceptualHash(input.db, asset.id, perceptualHash);
        }
      }
      indexedCount += 1;
    }

    getLogger('ipc').info(
      {
        provider: input.provider,
        done: Math.min(i + chunk.length, input.files.length),
        total: input.files.length,
        describedCount,
      },
      'Cloud index progress',
    );
  }

  return { indexedCount, describedCount, errors: errors.slice(0, 20) };
}
