export type CloudPhotoProvider = 'google-drive' | 'yandex-disk';

export interface CloudConnection {
  id: string;
  provider: CloudPhotoProvider;
  status: 'connected' | 'disconnected' | 'error';
  displayName?: string;
  connectedAt?: string;
  errorMessage?: string;
}

export interface CloudFolder {
  id: string;
  name: string;
  path?: string;
  parentId?: string;
}

export interface CloudPhotoFile {
  id: string;
  provider: CloudPhotoProvider;
  name: string;
  mimeType?: string;
  sizeBytes?: number;
  modifiedAt: string;
  path?: string;
  folderId?: string;
  checksum?: string;
  previewUrl?: string;
}

export interface ListCloudFilesInput {
  connectionId: string;
  folderId?: string;
  pageToken?: string;
  pageSize?: number;
}

export interface CloudPhotoSource {
  provider: CloudPhotoProvider;
  connect(): Promise<CloudConnection>;
  disconnect(connectionId: string): Promise<void>;
  listFolders(connectionId: string): Promise<CloudFolder[]>;
  listFiles(input: ListCloudFilesInput): AsyncIterable<CloudPhotoFile>;
  downloadPreview(file: CloudPhotoFile): Promise<Buffer>;
  downloadOriginal(file: CloudPhotoFile): Promise<Buffer>;
}

/* --------------------------------- Yandex -------------------------------- */

type YandexDiskInfo = {
  user?: { login?: string; display_name?: string };
};

type YandexResource = {
  name?: string;
  path?: string;
  type?: string;
  resource_id?: string;
  _embedded?: { items?: YandexResource[] };
};

async function yandexFetch<T>(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`https://cloud-api.yandex.net${path}`, {
    ...init,
    headers: {
      Authorization: `OAuth ${token}`,
      Accept: 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(
      `Яндекс Диск: ${response.status}${body ? ` · ${body.slice(0, 200)}` : ''}`,
    );
  }
  return (await response.json()) as T;
}

export async function verifyYandexToken(token: string): Promise<{
  accountLabel: string;
}> {
  const info = await yandexFetch<YandexDiskInfo>(token, '/v1/disk');
  const accountLabel =
    info.user?.display_name?.trim() ||
    info.user?.login?.trim() ||
    'Яндекс Диск';
  return { accountLabel };
}

export async function listYandexFolders(token: string): Promise<CloudFolder[]> {
  const root = await yandexFetch<YandexResource>(
    token,
    `/v1/disk/resources?path=${encodeURIComponent('disk:/')}&limit=200&fields=_embedded.items.name,_embedded.items.path,_embedded.items.type,_embedded.items.resource_id`,
  );
  const folders: CloudFolder[] = [
    { id: 'disk:/', name: 'Весь диск (корень)', path: 'disk:/' },
  ];
  for (const item of root._embedded?.items ?? []) {
    if (item.type !== 'dir' || !item.path) continue;
    folders.push({
      id: item.resource_id || item.path,
      name: item.name || item.path,
      path: item.path,
      parentId: 'disk:/',
    });
  }
  return folders;
}

export type CloudListedPhoto = {
  id: string;
  name: string;
  path?: string;
  modifiedAt: string;
  sizeBytes?: number;
  mimeType?: string;
};

type YandexFlatFile = {
  name?: string;
  path?: string;
  resource_id?: string;
  modified?: string;
  size?: number;
  mime_type?: string;
  media_type?: string;
};

/** List image files; folderPaths empty/`disk:/` → all images (capped). */
export async function listYandexImageFiles(
  token: string,
  folderPaths: string[],
  limit = 500,
): Promise<CloudListedPhoto[]> {
  const useAll =
    folderPaths.length === 0 ||
    folderPaths.some((p) => p === 'disk:/' || p === '/');
  if (useAll) {
    const out: CloudListedPhoto[] = [];
    let offset = 0;
    const pageSize = Math.min(100, Math.max(1, limit));
    while (out.length < limit) {
      const pageLimit = Math.min(pageSize, limit - out.length);
      const data = await yandexFetch<{ items?: YandexFlatFile[] }>(
        token,
        `/v1/disk/resources/files?media_type=image&limit=${pageLimit}&offset=${offset}&fields=items.name,items.path,items.resource_id,items.modified,items.size,items.mime_type`,
      );
      const items = data.items ?? [];
      if (items.length === 0) break;
      for (const item of items) {
        out.push({
          id: item.resource_id || item.path || item.name || randomId(),
          name: item.name || 'photo',
          path: item.path,
          modifiedAt: item.modified || new Date().toISOString(),
          sizeBytes: item.size,
          mimeType: item.mime_type,
        });
        if (out.length >= limit) break;
      }
      offset += items.length;
      if (items.length < pageLimit) break;
    }
    return out;
  }

  const out: CloudListedPhoto[] = [];
  const pageSize = 100;
  for (const folderPath of folderPaths) {
    if (out.length >= limit) break;
    let offset = 0;
    for (;;) {
      if (out.length >= limit) break;
      const data = await yandexFetch<YandexResource>(
        token,
        `/v1/disk/resources?path=${encodeURIComponent(folderPath)}&limit=${pageSize}&offset=${offset}&fields=_embedded.items.name,_embedded.items.path,_embedded.items.type,_embedded.items.resource_id,_embedded.items.modified,_embedded.items.size,_embedded.items.mime_type,_embedded.items.media_type`,
      );
      const items = data._embedded?.items ?? [];
      if (items.length === 0) break;
      for (const item of items) {
        if (item.type !== 'file') continue;
        const media = (item as YandexFlatFile).media_type;
        const mime = (item as YandexFlatFile).mime_type ?? '';
        if (media !== 'image' && !mime.startsWith('image/')) continue;
        out.push({
          id: item.resource_id || item.path || item.name || randomId(),
          name: item.name || 'photo',
          path: item.path,
          modifiedAt:
            (item as YandexFlatFile).modified || new Date().toISOString(),
          sizeBytes: (item as YandexFlatFile).size,
          mimeType: mime || undefined,
        });
        if (out.length >= limit) break;
      }
      offset += items.length;
      if (items.length < pageSize) break;
    }
  }
  return out;
}

function randomId(): string {
  return `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function downloadYandexFile(
  token: string,
  path: string,
): Promise<Buffer> {
  const meta = await yandexFetch<{ href?: string }>(
    token,
    `/v1/disk/resources/download?path=${encodeURIComponent(path)}`,
  );
  if (!meta.href) {
    throw new Error('Яндекс Диск: нет ссылки на скачивание');
  }
  const response = await fetch(meta.href);
  if (!response.ok) {
    throw new Error(`Яндекс Диск download: ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

/**
 * Server-generated JPEG/PNG preview (works for HEIC and other formats Electron can't decode).
 * preview_size: S/M/L/XL/XXL/XXXL or WxH.
 */
export async function downloadYandexPreview(
  token: string,
  path: string,
  previewSize = 'XL',
): Promise<Buffer> {
  const meta = await yandexFetch<{ preview?: string }>(
    token,
    `/v1/disk/resources?path=${encodeURIComponent(path)}&preview_size=${encodeURIComponent(previewSize)}&fields=preview`,
  );
  if (!meta.preview) {
    throw new Error('Яндекс Диск: нет превью для файла');
  }
  const response = await fetch(meta.preview, {
    headers: { Authorization: `OAuth ${token}` },
  });
  if (!response.ok) {
    throw new Error(`Яндекс Диск preview: ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

/* --------------------------------- Google -------------------------------- */

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_DRIVE_API = 'https://www.googleapis.com/drive/v3';

export async function refreshGoogleAccessToken(input: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}): Promise<{ accessToken: string; refreshToken?: string }> {
  const body = new URLSearchParams({
    client_id: input.clientId,
    client_secret: input.clientSecret,
    refresh_token: input.refreshToken,
    grant_type: 'refresh_token',
  });
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(
      `Google OAuth refresh: ${response.status}${text ? ` · ${text.slice(0, 200)}` : ''}`,
    );
  }
  const json = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
  };
  if (!json.access_token) {
    throw new Error('Google OAuth: access_token не получен');
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
  };
}

export async function exchangeGoogleAuthCode(input: {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
}): Promise<{ accessToken: string; refreshToken: string }> {
  const body = new URLSearchParams({
    client_id: input.clientId,
    client_secret: input.clientSecret,
    code: input.code,
    redirect_uri: input.redirectUri,
    grant_type: 'authorization_code',
  });
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(
      `Google OAuth code exchange: ${response.status}${text ? ` · ${text.slice(0, 200)}` : ''}`,
    );
  }
  const json = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
  };
  if (!json.access_token || !json.refresh_token) {
    throw new Error(
      'Google OAuth: нет refresh_token — в Console включите Desktop client и access_type=offline',
    );
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
  };
}

export function buildGoogleAuthUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const params = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    access_type: 'offline',
    prompt: 'consent',
    state: input.state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

async function googleFetch<T>(
  accessToken: string,
  path: string,
): Promise<T> {
  const response = await fetch(`${GOOGLE_DRIVE_API}${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(
      `Google Drive: ${response.status}${body ? ` · ${body.slice(0, 200)}` : ''}`,
    );
  }
  return (await response.json()) as T;
}

export async function verifyGoogleAccessToken(accessToken: string): Promise<{
  accountLabel: string;
}> {
  const about = await googleFetch<{ user?: { emailAddress?: string; displayName?: string } }>(
    accessToken,
    '/about?fields=user(emailAddress,displayName)',
  );
  const accountLabel =
    about.user?.emailAddress?.trim() ||
    about.user?.displayName?.trim() ||
    'Google Drive';
  return { accountLabel };
}

export async function listGoogleFolders(
  accessToken: string,
): Promise<CloudFolder[]> {
  const folders: CloudFolder[] = [
    { id: 'root', name: 'Мой диск (корень)', path: 'root' },
  ];
  let pageToken: string | undefined;
  do {
    const q = encodeURIComponent(
      "mimeType='application/vnd.google-apps.folder' and 'root' in parents and trashed=false",
    );
    const page = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '';
    const data = await googleFetch<{
      files?: Array<{ id?: string; name?: string }>;
      nextPageToken?: string;
    }>(
      accessToken,
      `/files?q=${q}&fields=nextPageToken,files(id,name)&pageSize=100${page}`,
    );
    for (const file of data.files ?? []) {
      if (!file.id) continue;
      folders.push({
        id: file.id,
        name: file.name || file.id,
        path: file.id,
        parentId: 'root',
      });
    }
    pageToken = data.nextPageToken;
  } while (pageToken);
  return folders;
}

export async function downloadGoogleFile(
  accessToken: string,
  fileId: string,
): Promise<Buffer> {
  const response = await fetch(
    `${GOOGLE_DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(
      `Google Drive download: ${response.status}${body ? ` · ${body.slice(0, 160)}` : ''}`,
    );
  }
  return Buffer.from(await response.arrayBuffer());
}

/** Drive thumbnail (JPEG) — usable for HEIC where alt=media can't be decoded locally. */
export async function downloadGoogleThumbnail(
  accessToken: string,
  fileId: string,
  maxEdge = 1000,
): Promise<Buffer> {
  const meta = await googleFetch<{ thumbnailLink?: string }>(
    accessToken,
    `/files/${encodeURIComponent(fileId)}?fields=thumbnailLink`,
  );
  if (!meta.thumbnailLink) {
    throw new Error('Google Drive: нет thumbnail');
  }
  const url = meta.thumbnailLink.replace(/=s\d+/, `=s${maxEdge}`);
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    // Some thumbnail CDNs accept unauthenticated GETs.
    const retry = await fetch(url);
    if (!retry.ok) {
      throw new Error(`Google Drive thumbnail: ${response.status}`);
    }
    return Buffer.from(await retry.arrayBuffer());
  }
  return Buffer.from(await response.arrayBuffer());
}

/**
 * Prefer cloud-generated preview/thumbnail (JPEG), fall back to original bytes.
 * Needed for HEIC/HEIF on Windows where Electron nativeImage cannot decode originals.
 */
export async function downloadCloudRenderableImage(input: {
  provider: CloudPhotoProvider;
  fileId: string;
  path?: string;
  yandexToken?: string;
  googleAccessToken?: string;
}): Promise<Buffer> {
  if (input.provider === 'yandex-disk') {
    if (!input.yandexToken) throw new Error('Нет Yandex token');
    const path = input.path;
    if (!path) throw new Error('Нет path у файла Яндекс Диска');
    try {
      return await downloadYandexPreview(input.yandexToken, path, 'XL');
    } catch {
      return downloadYandexFile(input.yandexToken, path);
    }
  }
  if (!input.googleAccessToken) throw new Error('Нет Google access token');
  try {
    return await downloadGoogleThumbnail(input.googleAccessToken, input.fileId);
  } catch {
    return downloadGoogleFile(input.googleAccessToken, input.fileId);
  }
}

export async function listGoogleImageFiles(
  accessToken: string,
  folderIds: string[],
  limit = 500,
): Promise<CloudListedPhoto[]> {
  const parents =
    folderIds.length === 0 || folderIds.includes('root')
      ? ['root']
      : folderIds;
  const out: CloudListedPhoto[] = [];
  for (const parent of parents) {
    if (out.length >= limit) break;
    let pageToken: string | undefined;
    do {
      const q = encodeURIComponent(
        `mimeType contains 'image/' and '${parent}' in parents and trashed=false`,
      );
      const page = pageToken
        ? `&pageToken=${encodeURIComponent(pageToken)}`
        : '';
      const data = await googleFetch<{
        files?: Array<{
          id?: string;
          name?: string;
          modifiedTime?: string;
          size?: string;
          mimeType?: string;
        }>;
        nextPageToken?: string;
      }>(
        accessToken,
        `/files?q=${q}&fields=nextPageToken,files(id,name,modifiedTime,size,mimeType)&pageSize=100${page}`,
      );
      for (const file of data.files ?? []) {
        if (!file.id) continue;
        out.push({
          id: file.id,
          name: file.name || file.id,
          path: file.id,
          modifiedAt: file.modifiedTime || new Date().toISOString(),
          sizeBytes: file.size ? Number(file.size) : undefined,
          mimeType: file.mimeType,
        });
        if (out.length >= limit) break;
      }
      pageToken = out.length >= limit ? undefined : data.nextPageToken;
    } while (pageToken);
  }
  return out;
}

/* ------------------------------ Source facades ---------------------------- */

export class GoogleDrivePhotoSource {
  readonly provider = 'google-drive' as const;
}

export class YandexDiskPhotoSource {
  readonly provider = 'yandex-disk' as const;
}

export function createCloudPhotoSource(
  provider: CloudPhotoProvider,
): GoogleDrivePhotoSource | YandexDiskPhotoSource {
  if (provider === 'google-drive') return new GoogleDrivePhotoSource();
  return new YandexDiskPhotoSource();
}
