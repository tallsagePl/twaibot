import { createHash, randomUUID } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { dialog, nativeImage } from 'electron';
import {
  AddReferenceInputSchema,
  PreferenceSummarySchema,
  UpdateReferenceInputSchema,
  type AddReferenceInput,
  type ReferenceImage,
  type StoredPreferenceSummary,
  type UpdateReferenceInput,
} from '@twinby/contracts';
import { ensureAppDirectories, resolveAppPaths } from '@twinby/config';
import {
  computeReferencesFingerprint,
  deleteReferenceImage,
  getPreferenceProfile,
  getStoredPreferenceSummary,
  insertReferenceImage,
  listReferenceImages,
  saveStoredPreferenceSummary,
  updateReferenceImage,
  type AppDatabase,
} from '@twinby/database';
import { getLogger } from '@twinby/logging';
import { type AiImageInput } from '@twinby/ai-provider';
import { createProviderFromDb } from './ai-handlers';

function requireDb(db: AppDatabase | null): AppDatabase {
  if (!db) {
    throw new Error('Database is not initialized');
  }
  return db;
}

function getPaths(projectRoot: string, userDataPath: string, packaged: boolean) {
  const paths = resolveAppPaths({
    projectRoot,
    userDataPath,
    useUserData: packaged,
  });
  ensureAppDirectories(paths);
  return paths;
}

function toThumbnailDataUrl(thumbnailPath: string): string | undefined {
  if (!existsSync(thumbnailPath)) {
    return undefined;
  }
  try {
    const img = nativeImage.createFromPath(thumbnailPath);
    const png = img.toPNG();
    return `data:image/png;base64,${png.toString('base64')}`;
  } catch {
    return undefined;
  }
}

function withThumbnails(refs: ReferenceImage[]): ReferenceImage[] {
  return refs.map((ref) => ({
    ...ref,
    thumbnailDataUrl: toThumbnailDataUrl(ref.thumbnailPath),
  }));
}

export function listReferences(db: AppDatabase | null): ReferenceImage[] {
  return withThumbnails(listReferenceImages(requireDb(db)));
}

export async function addReference(
  db: AppDatabase | null,
  raw: unknown,
  context: { projectRoot: string; userDataPath: string; packaged: boolean },
): Promise<ReferenceImage[]> {
  const database = requireDb(db);
  const input: AddReferenceInput = AddReferenceInputSchema.parse(raw);
  const paths = getPaths(context.projectRoot, context.userDataPath, context.packaged);

  const picked = await dialog.showOpenDialog({
    title: 'Выберите фото референса (можно несколько)',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] },
    ],
  });

  if (picked.canceled || picked.filePaths.length === 0) {
    throw new Error('Файл не выбран');
  }

  const selected = picked.filePaths;
  const saved: ReferenceImage[] = [];
  const errors: string[] = [];

  for (const sourcePath of selected) {
    try {
      const id = randomUUID();
      const ext = extname(sourcePath).toLowerCase() || '.jpg';
      const destPath = join(paths.references, `${id}${ext}`);
      const thumbPath = join(paths.references, `${id}.thumb.png`);

      copyFileSync(sourcePath, destPath);

      const image = nativeImage.createFromPath(destPath);
      if (image.isEmpty()) {
        unlinkSync(destPath);
        errors.push(`${basename(sourcePath)}: не удалось прочитать`);
        continue;
      }
      const thumb = image.resize({ width: 240, height: 240, quality: 'better' });
      writeFileSync(thumbPath, thumb.toPNG());

      const checksum = createHash('sha256').update(readFileSync(destPath)).digest('hex');

      const row = insertReferenceImage(database, {
        id,
        polarity: input.polarity,
        path: destPath,
        thumbnailPath: thumbPath,
        comment: input.comment,
        weight: input.weight,
        pinned: input.pinned,
        checksum,
      });

      saved.push({
        ...row,
        thumbnailDataUrl: toThumbnailDataUrl(thumbPath),
      });

      getLogger('image').info(
        { id, polarity: input.polarity, name: basename(sourcePath) },
        'Reference image added',
      );
    } catch (error) {
      errors.push(
        `${basename(sourcePath)}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  if (saved.length === 0) {
    throw new Error(
      errors.length > 0
        ? `Не удалось добавить фото: ${errors.join('; ')}`
        : 'Не удалось добавить фото',
    );
  }

  if (errors.length > 0) {
    getLogger('image').warn({ errors }, 'Some reference files failed');
  }

  return saved;
}

export function updateReference(
  db: AppDatabase | null,
  raw: unknown,
): ReferenceImage {
  const database = requireDb(db);
  const input: UpdateReferenceInput = UpdateReferenceInputSchema.parse(raw);
  const updated = updateReferenceImage(database, input);
  return {
    ...updated,
    thumbnailDataUrl: toThumbnailDataUrl(updated.thumbnailPath),
  };
}

export function removeReference(db: AppDatabase | null, id: string): void {
  const database = requireDb(db);
  const removed = deleteReferenceImage(database, id);
  if (!removed) {
    throw new Error('Референс не найден');
  }
  for (const path of [removed.filePath, removed.thumbnailPath]) {
    if (existsSync(path)) {
      try {
        unlinkSync(path);
      } catch (error) {
        getLogger('image').warn({ path, err: String(error) }, 'Failed to delete reference file');
      }
    }
  }
  getLogger('image').info({ id }, 'Reference image removed');
}

export function getSummary(db: AppDatabase | null): StoredPreferenceSummary | null {
  return getStoredPreferenceSummary(requireDb(db));
}

export function saveSummaryManual(
  db: AppDatabase | null,
  raw: unknown,
): StoredPreferenceSummary {
  const database = requireDb(db);
  const summary = PreferenceSummarySchema.parse(raw);
  const refs = listReferenceImages(database);
  const fingerprint = computeReferencesFingerprint(refs);
  const existing = getStoredPreferenceSummary(database);
  return saveStoredPreferenceSummary(database, {
    summary,
    sourceFingerprint: fingerprint,
    model: existing?.model,
    analyzedAt: existing?.analyzedAt ?? new Date().toISOString(),
    latencyMs: existing?.latencyMs,
  });
}

function loadReferenceAsAiImage(ref: ReferenceImage): AiImageInput {
  // Shrink before vision request — full-res photos often cause timeouts.
  const image = nativeImage.createFromPath(ref.filePath);
  if (image.isEmpty()) {
    throw new Error(`Не удалось прочитать ${basename(ref.filePath)}`);
  }
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
  const jpeg = resized.toJPEG(72);
  return {
    label: ref.comment || `${ref.polarity} ${ref.id.slice(0, 8)}`,
    mimeType: 'image/jpeg',
    base64: jpeg.toString('base64'),
  };
}

function pickRefsForAnalysis(refs: ReferenceImage[]): ReferenceImage[] {
  return [...refs].sort((a, b) => {
    if (a.pinned !== b.pinned) {
      return a.pinned ? -1 : 1;
    }
    if (b.weight !== a.weight) {
      return b.weight - a.weight;
    }
    return b.createdAt.localeCompare(a.createdAt);
  });
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function mergePreferenceSummaries(
  parts: Array<{
    positiveVisualPatterns: string[];
    negativeVisualPatterns: string[];
    positivePresentationPatterns: string[];
    negativePresentationPatterns: string[];
    lifestylePreferences: string[];
    bioPreferences: string[];
    hardRejects: string[];
    uncertainties: string[];
  }>,
) {
  const uniq = (lists: string[][]): string[] =>
    [...new Set(lists.flat().map((s) => s.trim()).filter(Boolean))];

  return PreferenceSummarySchema.parse({
    positiveVisualPatterns: uniq(parts.map((p) => p.positiveVisualPatterns)),
    negativeVisualPatterns: uniq(parts.map((p) => p.negativeVisualPatterns)),
    positivePresentationPatterns: uniq(parts.map((p) => p.positivePresentationPatterns)),
    negativePresentationPatterns: uniq(parts.map((p) => p.negativePresentationPatterns)),
    lifestylePreferences: uniq(parts.map((p) => p.lifestylePreferences)),
    bioPreferences: uniq(parts.map((p) => p.bioPreferences)),
    hardRejects: uniq(parts.map((p) => p.hardRejects)),
    uncertainties: uniq(parts.map((p) => p.uncertainties)),
  });
}

/**
 * Runs AI analysis once and stores summary.
 * Skips network call if summary exists, is fresh, and force=false.
 * Large libraries are analyzed in batches and merged.
 */
export async function analyzeReferences(
  db: AppDatabase | null,
  force = false,
): Promise<StoredPreferenceSummary> {
  const database = requireDb(db);
  const refs = listReferenceImages(database);
  if (refs.length === 0) {
    throw new Error('Добавьте хотя бы одно референс-фото перед анализом');
  }

  const fingerprint = computeReferencesFingerprint(refs);
  const existing = getStoredPreferenceSummary(database);
  if (existing && !existing.stale && !force) {
    getLogger('ai').info('Reusing cached preference summary (not stale)');
    return existing;
  }

  const profile = getPreferenceProfile(database);
  const provider = createProviderFromDb(database, { timeoutMs: 180_000 });

  const positiveAll = pickRefsForAnalysis(
    refs.filter((r) => r.polarity === 'positive'),
  );
  const negativeAll = pickRefsForAnalysis(
    refs.filter((r) => r.polarity === 'negative'),
  );

  if (positiveAll.length === 0 && negativeAll.length === 0) {
    throw new Error('Нет валидных референсов для анализа');
  }

  // Keep each vision request small to avoid timeouts; merge batch summaries.
  const BATCH_SIZE = 6;
  const positiveChunks = chunkArray(positiveAll, BATCH_SIZE);
  const negativeChunks = chunkArray(negativeAll, BATCH_SIZE);
  const batchCount = Math.max(positiveChunks.length, negativeChunks.length, 1);

  getLogger('ai').info(
    {
      positiveTotal: positiveAll.length,
      negativeTotal: negativeAll.length,
      batches: batchCount,
      force,
    },
    'Analyzing all reference images in batches',
  );

  try {
    const partials = [];
    let totalLatency = 0;
    let model = '';
    let promptTokens = 0;
    let completionTokens = 0;

    for (let i = 0; i < batchCount; i += 1) {
      const positive = (positiveChunks[i] ?? []).map(loadReferenceAsAiImage);
      const negative = (negativeChunks[i] ?? []).map(loadReferenceAsAiImage);
      if (positive.length === 0 && negative.length === 0) {
        continue;
      }

      getLogger('ai').info(
        { batch: i + 1, of: batchCount, positive: positive.length, negative: negative.length },
        'Reference analysis batch',
      );

      const result = await provider.buildPreferenceSummary({
        preferenceProfile: profile,
        positiveReferences: positive,
        negativeReferences: negative,
      });
      partials.push(result.summary);
      totalLatency += result.latencyMs;
      model = result.model;
      promptTokens += result.promptTokens ?? 0;
      completionTokens += result.completionTokens ?? 0;
    }

    if (partials.length === 0) {
      throw new Error('Не удалось проанализировать референсы');
    }

    const summary = mergePreferenceSummaries(partials);
    const stored = saveStoredPreferenceSummary(database, {
      summary,
      sourceFingerprint: fingerprint,
      model,
      latencyMs: totalLatency,
    });

    getLogger('ai').info(
      { latencyMs: totalLatency, model, batches: partials.length, promptTokens, completionTokens },
      'Preference summary saved from all batches',
    );
    return stored;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    getLogger('ai').error({ err: message }, 'Reference analysis failed');
    throw new Error(message);
  }
}
