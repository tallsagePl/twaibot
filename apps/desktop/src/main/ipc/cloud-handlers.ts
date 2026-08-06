import { BrowserWindow } from 'electron';
import {
  BrowseCloudStorageInputSchema,
  CloudProviderSchema,
  ConnectCloudInputSchema,
  DiscoverCloudStorageInputSchema,
  IPC_CHANNELS,
  PhotoSearchInputSchema,
  SaveCloudCredentialsInputSchema,
  SetSelectedFoldersInputSchema,
  type BrowseCloudStorageResult,
  type CloudConnectionView,
  type CloudCredentialsStatus,
  type CloudFolderView,
  type CloudIndexFinishedEvent,
  type CloudIndexStatusView,
  type CloudProvider,
  type DiscoverCloudStorageResult,
  type GetPhotoPreviewResult,
  type PhotoSearchResult,
} from '@twinby/contracts';
import {
  listGoogleFolders,
  listGoogleImageFiles,
  listYandexFolders,
  listYandexImageFiles,
  refreshGoogleAccessToken,
  verifyGoogleAccessToken,
  verifyYandexToken,
  type CloudListedPhoto,
} from '@twinby/cloud-photo-sources';
import {
  clearCloudProviderBrowsed,
  deleteIndexedPhoto,
  disconnectCloudProvider,
  getCloudIndexStatus,
  listCloudConnections,
  listCloudFolders,
  listIndexedPhotos,
  listPhotoLookGroups,
  markCloudProviderBrowsed,
  replaceCloudFolders,
  replacePhotoLookGroups,
  searchIndexedPhotos,
  setCloudConnectionState,
  setCloudProviderBrowseSummary,
  setSelectedCloudFolders,
  type AppDatabase,
} from '@twinby/database';
import { getLogger } from '@twinby/logging';
import { runGoogleDesktopOAuth } from '../cloud/google-oauth';
import { indexListedCloudPhotos } from '../cloud/index-photos';
import { getIndexedPhotoPreviewDataUrl } from '../cloud/photo-preview';
import { createProviderFromDb } from './ai-handlers';
import {
  CLOUD_SECRET_KEYS,
  clearCloudSecret,
  getCloudCredentialsStatus,
  hasApiKey,
  readCloudSecret,
  saveCloudSecret,
} from '../security/secrets';
import { requireDb } from './db-helpers';

const CLOUD_INDEX_LIMIT = 500;
const CLOUD_BROWSE_BATCH_DEFAULT = 15;

/** Last discovered cloud file IDs (in-memory; cleared on disconnect). */
const discoveredFileIdsByProvider = new Map<CloudProvider, string[]>();

function parseProvider(raw: unknown): CloudProvider {
  return CloudProviderSchema.parse(raw);
}

function providerLabel(provider: CloudProvider): string {
  return provider === 'google-drive' ? 'Google Drive' : 'Яндекс Диск';
}

function broadcastIndexFinished(event: CloudIndexFinishedEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.CLOUD_INDEX_FINISHED, event);
    }
  }
}

function status(db: AppDatabase): CloudCredentialsStatus {
  return getCloudCredentialsStatus(db);
}

function clearDiscovery(provider: CloudProvider): void {
  discoveredFileIdsByProvider.delete(provider);
}

function rememberDiscovery(
  provider: CloudProvider,
  files: CloudListedPhoto[],
): void {
  discoveredFileIdsByProvider.set(
    provider,
    files.map((file) => file.id),
  );
}

/** Match current cloud listing against local index by external file id. */
function discoveryProgress(
  db: AppDatabase,
  provider: CloudProvider,
  fileIds: string[],
): { discoveredTotal: number; matchedIndexed: number; remaining: number } {
  const indexed = indexedExternalIds(db, provider);
  let matchedIndexed = 0;
  for (const id of fileIds) {
    if (indexed.has(id)) matchedIndexed += 1;
  }
  return {
    discoveredTotal: fileIds.length,
    matchedIndexed,
    remaining: fileIds.length - matchedIndexed,
  };
}

/**
 * Rebuild look groups + short AI library summary for Settings UI.
 * Called whenever the cloud listing is fully covered by the local index —
 * not only on the first completion.
 */
async function refreshLibraryAiFeedback(
  db: AppDatabase,
  provider: CloudProvider,
  indexedCount: number,
): Promise<{ summary: string; errors: string[] }> {
  const errors: string[] = [];
  const catalog = listIndexedPhotos(db, [provider], CLOUD_INDEX_LIMIT);
  const describedCount = catalog.filter((p) =>
    p.shortDescription.trim(),
  ).length;

  if (!hasApiKey(db)) {
    return {
      summary: [
        `В индексе ${indexedCount} фото, описано ${describedCount}.`,
        'Готовые образы пока не собраны (нет API-ключа).',
      ].join(' '),
      errors,
    };
  }

  try {
    const ai = createProviderFromDb(db, {
      timeoutMs: 180_000,
      maxOutputTokens: 2000,
    });
    const clustered = await ai.clusterPhotoLooks({
      photos: catalog.slice(0, 80).map((p) => ({
        id: p.id,
        fileName: p.fileName,
        description: p.shortDescription,
        signals: p.observedSignals,
      })),
    });
    replacePhotoLookGroups(db, clustered.groups);
    getLogger('ipc').info(
      { groups: clustered.groups.length, model: clustered.model, provider },
      'Photo look groups updated',
    );

    const looks = listPhotoLookGroups(db);
    try {
      const summarized = await ai.summarizeIndexedLibrary({
        providerLabel: providerLabel(provider),
        indexedCount,
        describedCount,
        lookGroups: looks.map((g) => ({
          name: g.name,
          brief: g.brief,
          moodTags: g.moodTags,
          photoCount: g.photoIds.length,
        })),
      });
      return { summary: summarized.summary, errors };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`Краткий вывод: ${message}`);
      getLogger('ipc').warn({ err: message }, 'summarizeIndexedLibrary failed');
      return {
        summary: [
          `В индексе ${indexedCount} фото, описано ${describedCount}.`,
          'Готовые образы собраны, но краткий вывод не удалось обновить.',
        ].join(' '),
        errors,
      };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(`Группы образов: ${message}`);
    getLogger('ipc').warn({ err: message }, 'clusterPhotoLooks failed');
    return {
      summary: [
        `В индексе ${indexedCount} фото, описано ${describedCount}.`,
        'Готовые образы пока не собраны.',
      ].join(' '),
      errors,
    };
  }
}

async function listProviderImageFiles(input: {
  db: AppDatabase;
  provider: CloudProvider;
  listLimit?: number;
}): Promise<{
  files: CloudListedPhoto[];
  yandexToken?: string;
  googleAccessToken?: string;
}> {
  const { db, provider } = input;
  const listLimit = Math.min(input.listLimit ?? CLOUD_INDEX_LIMIT, CLOUD_INDEX_LIMIT);
  const folders = listCloudFolders(db, provider).filter((f) => f.selected);
  const selectedExternalIds = folders.map((f) => f.externalId);

  if (provider === 'yandex-disk') {
    const yandexToken =
      readCloudSecret(db, CLOUD_SECRET_KEYS.yandexOAuthToken) ?? undefined;
    if (!yandexToken) throw new Error('Нет OAuth token Яндекс Диска');
    const paths =
      selectedExternalIds.length > 0
        ? folders.map((f) => f.path || f.externalId)
        : ['disk:/'];
    const files = await listYandexImageFiles(yandexToken, paths, listLimit);
    return { files, yandexToken };
  }

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
  const googleAccessToken = refreshed.accessToken;
  const folderIds =
    selectedExternalIds.length > 0 ? selectedExternalIds : ['root'];
  const files = await listGoogleImageFiles(
    googleAccessToken,
    folderIds,
    listLimit,
  );
  return { files, googleAccessToken };
}

function indexedExternalIds(
  db: AppDatabase,
  provider: CloudProvider,
): Set<string> {
  return new Set(
    listIndexedPhotos(db, [provider], CLOUD_INDEX_LIMIT).map(
      (photo) => photo.externalFileId,
    ),
  );
}

function mergeIndexStatus(db: AppDatabase): CloudIndexStatusView {
  const base = getCloudIndexStatus(db);
  const discovered: Record<string, number> = {
    ...base.discoveredTotalByProvider,
  };
  const matched: Record<string, number> = {
    ...base.matchedIndexedByProvider,
  };
  const remaining: Record<string, number> = {
    ...base.remainingByProvider,
  };
  for (const [provider, fileIds] of discoveredFileIdsByProvider) {
    const progress = discoveryProgress(db, provider, fileIds);
    discovered[provider] = progress.discoveredTotal;
    matched[provider] = progress.matchedIndexed;
    remaining[provider] = progress.remaining;
  }
  return {
    ...base,
    discoveredTotalByProvider: discovered,
    matchedIndexedByProvider: matched,
    remainingByProvider: remaining,
  };
}

async function syncYandex(db: AppDatabase): Promise<CloudConnectionView> {
  const token = readCloudSecret(db, CLOUD_SECRET_KEYS.yandexOAuthToken);
  if (!token) {
    return setCloudConnectionState(db, 'yandex-disk', {
      connected: false,
      lastError:
        'Нужен OAuth token Яндекс Диска (read-only). Вставьте токен ниже и нажмите «Подключить».',
    });
  }

  try {
    const { accountLabel } = await verifyYandexToken(token);
    const folders = await listYandexFolders(token);
    replaceCloudFolders(
      db,
      'yandex-disk',
      folders.map((f) => ({
        externalId: f.id,
        name: f.name,
        path: f.path,
      })),
    );
    return setCloudConnectionState(db, 'yandex-disk', {
      connected: true,
      accountLabel,
      lastError: undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    getLogger('ipc').warn({ err: message }, 'Yandex connect failed');
    return setCloudConnectionState(db, 'yandex-disk', {
      connected: false,
      lastError: message,
    });
  }
}

async function syncGoogle(db: AppDatabase): Promise<CloudConnectionView> {
  const clientId = readCloudSecret(db, CLOUD_SECRET_KEYS.googleClientId);
  const clientSecret = readCloudSecret(db, CLOUD_SECRET_KEYS.googleClientSecret);
  if (!clientId || !clientSecret) {
    return setCloudConnectionState(db, 'google-drive', {
      connected: false,
      lastError:
        'Нужны OAuth Client ID и Client Secret Google (тип Desktop, Drive readonly).',
    });
  }

  try {
    let refreshToken = readCloudSecret(db, CLOUD_SECRET_KEYS.googleRefreshToken);
    let accessToken: string;

    if (!refreshToken) {
      const tokens = await runGoogleDesktopOAuth({ clientId, clientSecret });
      refreshToken = tokens.refreshToken;
      accessToken = tokens.accessToken;
      saveCloudSecret(db, CLOUD_SECRET_KEYS.googleRefreshToken, refreshToken);
    } else {
      const refreshed = await refreshGoogleAccessToken({
        clientId,
        clientSecret,
        refreshToken,
      });
      accessToken = refreshed.accessToken;
      if (refreshed.refreshToken) {
        saveCloudSecret(
          db,
          CLOUD_SECRET_KEYS.googleRefreshToken,
          refreshed.refreshToken,
        );
      }
    }

    const { accountLabel } = await verifyGoogleAccessToken(accessToken);
    const folders = await listGoogleFolders(accessToken);
    replaceCloudFolders(
      db,
      'google-drive',
      folders.map((f) => ({
        externalId: f.id,
        name: f.name,
        path: f.path,
      })),
    );
    return setCloudConnectionState(db, 'google-drive', {
      connected: true,
      accountLabel,
      lastError: undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    getLogger('ipc').warn({ err: message }, 'Google connect failed');
    return setCloudConnectionState(db, 'google-drive', {
      connected: false,
      lastError: message,
    });
  }
}

export function createCloudHandlers(
  getDb: () => AppDatabase | null,
  getPreviewsDir: () => string,
) {
  return {
    listConnections(): CloudConnectionView[] {
      return listCloudConnections(requireDb(getDb()));
    },
    getCredentialsStatus(): CloudCredentialsStatus {
      return status(requireDb(getDb()));
    },
    saveCredentials(raw: unknown): CloudCredentialsStatus {
      const input = SaveCloudCredentialsInputSchema.parse(raw ?? {});
      const db = requireDb(getDb());
      if (input.googleClientId !== undefined) {
        saveCloudSecret(db, CLOUD_SECRET_KEYS.googleClientId, input.googleClientId);
      }
      if (input.googleClientSecret !== undefined) {
        saveCloudSecret(
          db,
          CLOUD_SECRET_KEYS.googleClientSecret,
          input.googleClientSecret,
        );
      }
      if (input.yandexOAuthToken !== undefined) {
        saveCloudSecret(
          db,
          CLOUD_SECRET_KEYS.yandexOAuthToken,
          input.yandexOAuthToken,
        );
      }
      return status(db);
    },
    clearCredentials(raw: unknown): CloudCredentialsStatus {
      const provider = parseProvider(raw);
      const db = requireDb(getDb());
      if (provider === 'google-drive') {
        clearCloudSecret(db, CLOUD_SECRET_KEYS.googleClientId);
        clearCloudSecret(db, CLOUD_SECRET_KEYS.googleClientSecret);
        clearCloudSecret(db, CLOUD_SECRET_KEYS.googleRefreshToken);
      } else {
        clearCloudSecret(db, CLOUD_SECRET_KEYS.yandexOAuthToken);
      }
      return status(db);
    },
    async connectGoogle(raw?: unknown): Promise<CloudConnectionView> {
      const input = ConnectCloudInputSchema.parse(raw ?? {});
      const db = requireDb(getDb());
      if (input.googleClientId) {
        saveCloudSecret(db, CLOUD_SECRET_KEYS.googleClientId, input.googleClientId);
      }
      if (input.googleClientSecret) {
        saveCloudSecret(
          db,
          CLOUD_SECRET_KEYS.googleClientSecret,
          input.googleClientSecret,
        );
      }
      return syncGoogle(db);
    },
    async connectYandex(raw?: unknown): Promise<CloudConnectionView> {
      const input = ConnectCloudInputSchema.parse(raw ?? {});
      const db = requireDb(getDb());
      if (input.yandexOAuthToken) {
        saveCloudSecret(
          db,
          CLOUD_SECRET_KEYS.yandexOAuthToken,
          input.yandexOAuthToken,
        );
      }
      return syncYandex(db);
    },
    disconnect(raw: unknown): void {
      const provider = parseProvider(raw);
      const db = requireDb(getDb());
      if (provider === 'google-drive') {
        clearCloudSecret(db, CLOUD_SECRET_KEYS.googleClientId);
        clearCloudSecret(db, CLOUD_SECRET_KEYS.googleClientSecret);
        clearCloudSecret(db, CLOUD_SECRET_KEYS.googleRefreshToken);
      } else {
        clearCloudSecret(db, CLOUD_SECRET_KEYS.yandexOAuthToken);
      }
      clearCloudProviderBrowsed(db, provider);
      clearDiscovery(provider);
      disconnectCloudProvider(db, provider);
    },
    listFolders(raw: unknown): CloudFolderView[] {
      return listCloudFolders(requireDb(getDb()), parseProvider(raw));
    },
    setSelectedFolders(raw: unknown): CloudConnectionView {
      const input = SetSelectedFoldersInputSchema.parse(raw);
      return setSelectedCloudFolders(
        requireDb(getDb()),
        input.provider,
        input.folderIds,
      );
    },
    searchPhotos(raw: unknown): PhotoSearchResult {
      const input = PhotoSearchInputSchema.parse(raw);
      return searchIndexedPhotos(requireDb(getDb()), input);
    },
    getIndexStatus() {
      return mergeIndexStatus(requireDb(getDb()));
    },
    async discoverStorage(raw: unknown): Promise<DiscoverCloudStorageResult> {
      const input = DiscoverCloudStorageInputSchema.parse(raw ?? {});
      const db = requireDb(getDb());
      const connection = listCloudConnections(db).find(
        (c) => c.provider === input.provider,
      );
      if (!connection?.connected) {
        throw new Error('Сначала подключите хранилище');
      }

      const { files } = await listProviderImageFiles({
        db,
        provider: input.provider,
        listLimit: CLOUD_INDEX_LIMIT,
      });
      rememberDiscovery(input.provider, files);
      const progress = discoveryProgress(
        db,
        input.provider,
        files.map((file) => file.id),
      );
      if (progress.remaining > 0) {
        // Drop stale final summary while indexing is incomplete.
        setCloudProviderBrowseSummary(db, input.provider, '');
      } else if (progress.matchedIndexed > 0) {
        // Full coverage — rebuild AI feedback every list refresh.
        const feedback = await refreshLibraryAiFeedback(
          db,
          input.provider,
          progress.matchedIndexed,
        );
        setCloudProviderBrowseSummary(db, input.provider, feedback.summary);
      }
      markCloudProviderBrowsed(db, input.provider, new Date().toISOString());
      return {
        provider: input.provider,
        discoveredTotal: progress.discoveredTotal,
        alreadyIndexed: progress.matchedIndexed,
        remaining: progress.remaining,
      };
    },
    async browseStorage(raw: unknown): Promise<BrowseCloudStorageResult> {
      const input = BrowseCloudStorageInputSchema.parse(raw ?? {});
      const db = requireDb(getDb());
      const connection = listCloudConnections(db).find(
        (c) => c.provider === input.provider,
      );
      if (!connection?.connected) {
        throw new Error('Сначала подключите хранилище');
      }

      const batchLimit = Math.min(
        input.limit || CLOUD_BROWSE_BATCH_DEFAULT,
        CLOUD_INDEX_LIMIT,
      );
      let yandexToken: string | undefined;
      let googleAccessToken: string | undefined;
      let allFiles: CloudListedPhoto[] = [];

      try {
        const listed = await listProviderImageFiles({
          db,
          provider: input.provider,
          listLimit: CLOUD_INDEX_LIMIT,
        });
        allFiles = listed.files;
        yandexToken = listed.yandexToken;
        googleAccessToken = listed.googleAccessToken;
        rememberDiscovery(input.provider, allFiles);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        getLogger('ipc').warn({ err: message }, 'browseStorage list failed');
        broadcastIndexFinished({
          provider: input.provider,
          ok: false,
          indexedCount: 0,
          describedCount: 0,
          message: `${providerLabel(input.provider)}: не удалось открыть хранилище — ${message}`,
          errors: [message],
          finishedAt: new Date().toISOString(),
        });
        throw error;
      }

      const fileIds = allFiles.map((file) => file.id);
      const before = discoveryProgress(db, input.provider, fileIds);
      const already = indexedExternalIds(db, input.provider);
      const pending = input.skipIndexed
        ? allFiles.filter((file) => !already.has(file.id))
        : allFiles;
      const batch = pending.slice(0, batchLimit);
      const discoveredTotal = before.discoveredTotal;

      if (batch.length === 0) {
        const totalIndexed = already.size;
        const browsedAt = new Date().toISOString();
        const errors: string[] = [];
        let browseSummary = '';
        if (before.remaining === 0 && before.matchedIndexed > 0) {
          const feedback = await refreshLibraryAiFeedback(
            db,
            input.provider,
            before.matchedIndexed,
          );
          browseSummary = feedback.summary;
          errors.push(...feedback.errors);
        }
        markCloudProviderBrowsed(db, input.provider, browsedAt);
        if (browseSummary) {
          setCloudProviderBrowseSummary(db, input.provider, browseSummary);
        }
        const result: BrowseCloudStorageResult = {
          provider: input.provider,
          indexedCount: 0,
          describedCount: 0,
          totalIndexed,
          discoveredTotal,
          remaining: 0,
          browsedAt,
          errors: errors.slice(0, 20),
        };
        broadcastIndexFinished({
          provider: input.provider,
          ok: true,
          indexedCount: 0,
          describedCount: 0,
          message: `${providerLabel(input.provider)}: новых фото нет — из текущих ${before.matchedIndexed}/${discoveredTotal}`,
          errors: result.errors,
          finishedAt: browsedAt,
        });
        return result;
      }

      try {
        const indexed = await indexListedCloudPhotos({
          db,
          provider: input.provider,
          files: batch,
          yandexToken,
          googleAccessToken,
          previewsDir: getPreviewsDir(),
        });

        const errors = [...indexed.errors];
        const after = discoveryProgress(db, input.provider, fileIds);
        const remaining = after.remaining;
        const totalIndexed = indexedExternalIds(db, input.provider).size;
        let browseSummary = '';

        // Rebuild AI feedback whenever the listing is fully covered — every time.
        if (remaining === 0 && after.matchedIndexed > 0) {
          const feedback = await refreshLibraryAiFeedback(
            db,
            input.provider,
            after.matchedIndexed,
          );
          browseSummary = feedback.summary;
          errors.push(...feedback.errors);
        }

        if (!browseSummary && remaining === 0) {
          browseSummary = [
            `Описаны все ${discoveredTotal} текущих фото в облаке.`,
            'Готовые образы пока не собраны.',
          ].join(' ');
        }

        const browsedAt = new Date().toISOString();
        markCloudProviderBrowsed(db, input.provider, browsedAt);
        setCloudProviderBrowseSummary(db, input.provider, browseSummary);
        const result: BrowseCloudStorageResult = {
          provider: input.provider,
          indexedCount: indexed.indexedCount,
          describedCount: indexed.describedCount,
          totalIndexed,
          discoveredTotal,
          remaining,
          browsedAt,
          errors: errors.slice(0, 20),
        };
        broadcastIndexFinished({
          provider: input.provider,
          ok: true,
          indexedCount: result.indexedCount,
          describedCount: result.describedCount,
          message: `${providerLabel(input.provider)}: +${result.describedCount} описано — из текущих ${after.matchedIndexed}/${discoveredTotal}, новых ${remaining}`,
          errors: result.errors,
          finishedAt: browsedAt,
        });
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        broadcastIndexFinished({
          provider: input.provider,
          ok: false,
          indexedCount: 0,
          describedCount: 0,
          message: `${providerLabel(input.provider)}: индексация прервалась — ${message}`,
          errors: [message],
          finishedAt: new Date().toISOString(),
        });
        throw error;
      }
    },
    deleteIndexedPhoto(id: unknown): void {
      if (typeof id !== 'string' || !id) {
        throw new Error('Некорректный id индексированного фото');
      }
      deleteIndexedPhoto(requireDb(getDb()), id);
    },
    async getPhotoPreview(raw: unknown): Promise<GetPhotoPreviewResult> {
      if (typeof raw !== 'string' || !raw) {
        throw new Error('Некорректный id фото');
      }
      const dataUrl = await getIndexedPhotoPreviewDataUrl({
        db: requireDb(getDb()),
        photoId: raw,
        previewsDir: getPreviewsDir(),
      });
      return { photoId: raw, dataUrl };
    },
    /** Internal helper for stage 7 tests — mark connected without OAuth. */
    markConnectedForDev(
      provider: CloudProvider,
      accountLabel: string,
    ): CloudConnectionView {
      return setCloudConnectionState(requireDb(getDb()), provider, {
        connected: true,
        accountLabel,
      });
    },
  };
}
