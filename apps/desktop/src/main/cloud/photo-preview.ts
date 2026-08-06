import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { nativeImage } from 'electron';
import {
  downloadCloudRenderableImage,
  refreshGoogleAccessToken,
} from '@twinby/cloud-photo-sources';
import type { CloudProvider } from '@twinby/contracts';
import {
  getIndexedPhotoById,
  setIndexedPhotoLocalPreviewPath,
  type AppDatabase,
} from '@twinby/database';
import { getLogger } from '@twinby/logging';
import { CLOUD_SECRET_KEYS, readCloudSecret } from '../security/secrets';

const PREVIEW_MAX_SIDE = 960;

export function looksLikeJpeg(buffer: Buffer): boolean {
  return (
    buffer.length > 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  );
}

export function jpegPreviewFromBuffer(buffer: Buffer): Buffer | null {
  const image = nativeImage.createFromBuffer(buffer);
  if (!image.isEmpty()) {
    const { width, height } = image.getSize();
    const scale = Math.min(1, PREVIEW_MAX_SIDE / Math.max(width, height, 1));
    const resized =
      scale < 1
        ? image.resize({
            width: Math.max(1, Math.round(width * scale)),
            height: Math.max(1, Math.round(height * scale)),
            quality: 'better',
          })
        : image;
    return Buffer.from(resized.toJPEG(82));
  }
  // Cloud previews are often already JPEG; keep them even if nativeImage fails.
  if (looksLikeJpeg(buffer)) return buffer;
  return null;
}

export function writePhotoPreviewFile(
  previewsDir: string,
  photoId: string,
  jpeg: Buffer,
): string {
  mkdirSync(previewsDir, { recursive: true });
  const path = join(previewsDir, `${photoId}.jpg`);
  writeFileSync(path, jpeg);
  return path;
}

async function resolveGoogleAccessToken(db: AppDatabase): Promise<string> {
  const clientId = readCloudSecret(db, CLOUD_SECRET_KEYS.googleClientId);
  const clientSecret = readCloudSecret(db, CLOUD_SECRET_KEYS.googleClientSecret);
  const refreshToken = readCloudSecret(db, CLOUD_SECRET_KEYS.googleRefreshToken);
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Нет Google OAuth credentials');
  }
  const refreshed = await refreshGoogleAccessToken({
    clientId,
    clientSecret,
    refreshToken,
  });
  return refreshed.accessToken;
}

async function downloadIndexedRenderable(
  db: AppDatabase,
  photo: {
    provider: CloudProvider;
    externalFileId: string;
    externalPath?: string;
    fileName: string;
  },
): Promise<Buffer> {
  if (photo.provider === 'yandex-disk') {
    const token = readCloudSecret(db, CLOUD_SECRET_KEYS.yandexOAuthToken);
    if (!token) throw new Error('Нет Yandex token');
    const path = photo.externalPath;
    if (!path) throw new Error(`Нет path у файла ${photo.fileName}`);
    return downloadCloudRenderableImage({
      provider: 'yandex-disk',
      fileId: photo.externalFileId,
      path,
      yandexToken: token,
    });
  }

  return downloadCloudRenderableImage({
    provider: 'google-drive',
    fileId: photo.externalFileId,
    path: photo.externalPath,
    googleAccessToken: await resolveGoogleAccessToken(db),
  });
}

/**
 * Returns a data URL for an indexed photo preview, downloading/caching if needed.
 */
export async function getIndexedPhotoPreviewDataUrl(input: {
  db: AppDatabase;
  photoId: string;
  previewsDir: string;
}): Promise<string | null> {
  const photo = getIndexedPhotoById(input.db, input.photoId);
  if (!photo || photo.deletedFromIndexAt) return null;

  if (photo.localPreviewPath && existsSync(photo.localPreviewPath)) {
    const bytes = readFileSync(photo.localPreviewPath);
    return `data:image/jpeg;base64,${bytes.toString('base64')}`;
  }

  const cachedPath = join(input.previewsDir, `${photo.id}.jpg`);
  if (existsSync(cachedPath)) {
    setIndexedPhotoLocalPreviewPath(input.db, photo.id, cachedPath);
    const bytes = readFileSync(cachedPath);
    return `data:image/jpeg;base64,${bytes.toString('base64')}`;
  }

  try {
    const renderable = await Promise.race([
      downloadIndexedRenderable(input.db, photo),
      new Promise<Buffer>((_, reject) => {
        setTimeout(() => reject(new Error('Таймаут загрузки превью (25с)')), 25_000);
      }),
    ]);
    const jpeg = jpegPreviewFromBuffer(renderable);
    if (!jpeg) {
      getLogger('ipc').warn(
        { photoId: photo.id, fileName: photo.fileName, bytes: renderable.length },
        'Photo preview decode failed',
      );
      return null;
    }
    const path = writePhotoPreviewFile(input.previewsDir, photo.id, jpeg);
    setIndexedPhotoLocalPreviewPath(input.db, photo.id, path);
    return `data:image/jpeg;base64,${jpeg.toString('base64')}`;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    getLogger('ipc').warn(
      { photoId: photo.id, fileName: photo.fileName, err: message },
      'Photo preview download failed',
    );
    return null;
  }
}
