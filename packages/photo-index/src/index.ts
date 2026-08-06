export type CloudPhotoProvider = 'google-drive' | 'yandex-disk';

export type PhotoRole =
  | 'main-face'
  | 'full-body'
  | 'lifestyle'
  | 'social'
  | 'intellectual'
  | 'humor'
  | 'conversation-hook'
  | 'activity'
  | 'style'
  | 'emotional'
  | 'trust'
  | 'mystery'
  | 'other';

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
}

export interface IndexedPhotoAsset {
  id: string;
  provider: CloudPhotoProvider;
  externalFileId: string;
  externalPath?: string;
  fileName: string;
  sourceModifiedAt: string;
  sourceSizeBytes?: number;
  checksum?: string;
  perceptualHash: string;
  localPreviewPath: string;
  originalCachePath?: string;
  embedding: number[];
  embeddingModel: string;
  embeddingVersion: string;
  shortDescription: string;
  observedSignals: string[];
  possibleRoles: PhotoRole[];
  risks: string[];
  peopleCount?: number;
  faceVisibility: number;
  bodyVisibility: number;
  technicalQuality: number;
  indexedAt: string;
  deletedFromIndexAt?: string;
}

export interface PhotoSearchInput {
  query?: string;
  embedding?: number[];
  providers?: CloudPhotoProvider[];
  roles?: PhotoRole[];
  minFaceVisibility?: number;
  minTechnicalQuality?: number;
  limit?: number;
}

export interface PhotoSearchHit {
  asset: IndexedPhotoAsset;
  score: number;
}

export interface PhotoSearchResult {
  hits: PhotoSearchHit[];
  totalIndexed: number;
  query: string;
}

export interface PhotoIndexer {
  index(file: CloudPhotoFile): Promise<IndexedPhotoAsset>;
  isKnown(file: CloudPhotoFile): Promise<boolean>;
}

export interface PhotoSearchEngine {
  search(input: PhotoSearchInput): Promise<PhotoSearchResult>;
}

function assetKey(file: Pick<CloudPhotoFile, 'provider' | 'id' | 'modifiedAt' | 'checksum'>): string {
  return [
    file.provider,
    file.id,
    file.modifiedAt,
    file.checksum ?? '',
  ].join('|');
}

function simpleHash(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function textEmbedding(text: string, dims = 8): number[] {
  const vec = Array.from({ length: dims }, () => 0);
  const tokens = text.toLowerCase().split(/[^a-zа-я0-9]+/i).filter(Boolean);
  for (const token of tokens) {
    const h = Number.parseInt(simpleHash(token), 16);
    vec[h % dims]! += 1;
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

function cosine(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i += 1) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    na += av * av;
    nb += bv * bv;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function guessRoles(fileName: string): PhotoRole[] {
  const name = fileName.toLowerCase();
  const roles: PhotoRole[] = [];
  if (/face|портрет|selfie/.test(name)) roles.push('main-face');
  if (/full|body|рост/.test(name)) roles.push('full-body');
  if (/sport|run|gym|актив/.test(name)) roles.push('activity');
  if (/cafe|city|travel|lifestyle/.test(name)) roles.push('lifestyle');
  if (roles.length === 0) roles.push('other');
  return roles;
}

export class InMemoryPhotoIndex implements PhotoIndexer, PhotoSearchEngine {
  private byKey = new Map<string, IndexedPhotoAsset>();
  private byId = new Map<string, IndexedPhotoAsset>();

  async index(file: CloudPhotoFile): Promise<IndexedPhotoAsset> {
    const key = assetKey(file);
    const existing = this.byKey.get(key);
    if (existing) return existing;

    const embedding = textEmbedding(`${file.name} ${file.path ?? ''}`);
    const asset: IndexedPhotoAsset = {
      id: `photo-${simpleHash(key)}`,
      provider: file.provider,
      externalFileId: file.id,
      externalPath: file.path,
      fileName: file.name,
      sourceModifiedAt: file.modifiedAt,
      sourceSizeBytes: file.sizeBytes,
      checksum: file.checksum,
      perceptualHash: simpleHash(`${file.id}:${file.modifiedAt}:${file.checksum ?? ''}`),
      localPreviewPath: `memory://preview/${file.provider}/${file.id}`,
      embedding,
      embeddingModel: 'in-memory-text-v1',
      embeddingVersion: '1',
      shortDescription: file.name,
      observedSignals: [file.name.replace(/\.[^.]+$/, '')],
      possibleRoles: guessRoles(file.name),
      risks: [],
      faceVisibility: /face|портрет|selfie/i.test(file.name) ? 0.9 : 0.4,
      bodyVisibility: /full|body|рост/i.test(file.name) ? 0.85 : 0.3,
      technicalQuality: 0.7,
      indexedAt: new Date().toISOString(),
    };

    this.byKey.set(key, asset);
    this.byId.set(asset.id, asset);
    return asset;
  }

  async isKnown(file: CloudPhotoFile): Promise<boolean> {
    return this.byKey.has(assetKey(file));
  }

  list(): IndexedPhotoAsset[] {
    return [...this.byId.values()].filter((a) => !a.deletedFromIndexAt);
  }

  async search(input: PhotoSearchInput): Promise<PhotoSearchResult> {
    const limit = input.limit ?? 20;
    const query = (input.query ?? '').trim();
    const queryEmbedding = input.embedding ?? (query ? textEmbedding(query) : null);
    const providers = input.providers ? new Set(input.providers) : null;
    const roles = input.roles ? new Set(input.roles) : null;

    const scored: PhotoSearchHit[] = [];
    for (const asset of this.list()) {
      if (providers && !providers.has(asset.provider)) continue;
      if (roles && !asset.possibleRoles.some((r) => roles.has(r))) continue;
      if (
        typeof input.minFaceVisibility === 'number' &&
        asset.faceVisibility < input.minFaceVisibility
      ) {
        continue;
      }
      if (
        typeof input.minTechnicalQuality === 'number' &&
        asset.technicalQuality < input.minTechnicalQuality
      ) {
        continue;
      }

      let score = 0;
      if (queryEmbedding) {
        score = cosine(queryEmbedding, asset.embedding);
      }
      if (query) {
        const hay = `${asset.fileName} ${asset.shortDescription} ${asset.observedSignals.join(' ')}`.toLowerCase();
        if (hay.includes(query.toLowerCase())) score += 0.35;
      }
      if (!query && !queryEmbedding) score = asset.technicalQuality;

      scored.push({ asset, score });
    }

    scored.sort((a, b) => b.score - a.score);
    return {
      hits: scored.slice(0, limit),
      totalIndexed: this.list().length,
      query,
    };
  }
}
