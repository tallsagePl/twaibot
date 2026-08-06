import {
  AiConfigInputSchema,
  type AiConfig,
  type AiConfigInput,
  type AiConnectionTest,
  type AiModel,
  type AiVisionTest,
  type ModelCapabilities,
} from '@twinby/contracts';
import { ArionHubAiProvider } from '@twinby/ai-provider';
import {
  getModelCapabilities,
  saveAiConfigRow,
  toPublicAiConfig,
  upsertModelCapabilities,
  type AppDatabase,
} from '@twinby/database';
import { getLogger } from '@twinby/logging';
import { clearApiKey, hasApiKey, readApiKey, saveApiKey } from '../security/secrets';

function requireDb(db: AppDatabase | null): AppDatabase {
  if (!db) {
    throw new Error('Database is not initialized');
  }
  return db;
}

function createProvider(
  db: AppDatabase,
  overrides?: Partial<{
    timeoutMs: number;
    imageDetail: 'low' | 'high' | 'auto';
    maxOutputTokens: number;
  }>,
): ArionHubAiProvider {
  const apiKey = readApiKey(db);
  if (!apiKey) {
    throw new Error('API-ключ ArionHub не задан');
  }
  const publicConfig = toPublicAiConfig(db, true, apiKey);
  return new ArionHubAiProvider({
    baseUrl: publicConfig.baseUrl,
    apiKey,
    primaryModel: publicConfig.primaryModel,
    fallbackModel: publicConfig.fallbackModel,
    timeoutMs: overrides?.timeoutMs ?? publicConfig.timeoutMs,
    maxRetries: publicConfig.maxRetries,
    maxOutputTokens: overrides?.maxOutputTokens ?? publicConfig.maxOutputTokens,
    temperature: publicConfig.temperature,
    responseFormatMode: publicConfig.responseFormatMode,
    imageDetail: overrides?.imageDetail ?? publicConfig.imageDetail,
    fallbackEnabled: publicConfig.fallbackEnabled,
    jsonRepairEnabled: publicConfig.jsonRepairEnabled,
  });
}

/** Shared factory for other IPC handlers (references analysis). */
export function createProviderFromDb(
  db: AppDatabase,
  overrides?: Partial<{
    timeoutMs: number;
    imageDetail: 'low' | 'high' | 'auto';
    maxOutputTokens: number;
  }>,
): ArionHubAiProvider {
  return createProvider(db, overrides);
}

export function getAiConfig(db: AppDatabase | null): AiConfig {
  const database = requireDb(db);
  const key = readApiKey(database);
  return toPublicAiConfig(database, Boolean(key), key);
}

export function saveAiConfig(db: AppDatabase | null, raw: unknown): AiConfig {
  const database = requireDb(db);
  const input: AiConfigInput = AiConfigInputSchema.parse(raw);

  if (input.clearApiKey) {
    clearApiKey(database);
  } else if (input.apiKey) {
    saveApiKey(database, input.apiKey.trim());
    getLogger('security').info('ArionHub API key saved via safeStorage');
  }

  saveAiConfigRow(database, {
    baseUrl: input.baseUrl,
    primaryModel: input.primaryModel,
    fallbackModel: input.fallbackModel,
    configJson: JSON.stringify({
      timeoutMs: input.timeoutMs,
      maxRetries: input.maxRetries,
      maxOutputTokens: input.maxOutputTokens,
      temperature: input.temperature,
      responseFormatMode: input.responseFormatMode,
      maxCandidatePhotos: input.maxCandidatePhotos,
      positiveAnchorsCount: input.positiveAnchorsCount,
      negativeAnchorsCount: input.negativeAnchorsCount,
      imageDetail: input.imageDetail,
      sessionSpendingLimitUsd: input.sessionSpendingLimitUsd,
      dailySpendingLimitUsd: input.dailySpendingLimitUsd,
      usdPer1kTokens: input.usdPer1kTokens,
      fallbackEnabled: input.fallbackEnabled,
      jsonRepairEnabled: input.jsonRepairEnabled,
    }),
  });

  return getAiConfig(database);
}

export async function listAiModels(db: AppDatabase | null): Promise<AiModel[]> {
  const database = requireDb(db);
  if (!hasApiKey(database)) {
    throw new Error('Сначала сохраните API-ключ ArionHub');
  }
  const provider = createProvider(database);
  getLogger('ai').info('Listing ArionHub models');
  return provider.listModels();
}

export async function testAiText(db: AppDatabase | null): Promise<AiConnectionTest> {
  const database = requireDb(db);
  const provider = createProvider(database);
  const result = await provider.testTextConnection();
  const model = result.model ?? getAiConfig(database).primaryModel;
  const previous = getModelCapabilities(database, model);
  upsertModelCapabilities(database, {
    model,
    text: result.ok ? 'supported' : 'failed',
    vision: previous?.vision ?? 'unknown',
    jsonObject: previous?.jsonObject ?? 'unknown',
    testedAt: new Date().toISOString(),
    latencyMs: result.latencyMs,
    error: result.error,
  });
  getLogger('ai').info({ ok: result.ok, latencyMs: result.latencyMs }, 'Text connection test');
  return result;
}

export async function testAiVision(db: AppDatabase | null): Promise<AiVisionTest> {
  const database = requireDb(db);
  const provider = createProvider(database);
  const result = await provider.testVisionConnection();
  const previous = getModelCapabilities(database, result.model ?? getAiConfig(database).primaryModel);
  upsertModelCapabilities(database, {
    model: result.model ?? getAiConfig(database).primaryModel,
    text: previous?.text ?? 'unknown',
    vision: result.ok ? 'supported' : 'failed',
    jsonObject: result.parsedOk ? 'supported' : 'failed',
    testedAt: new Date().toISOString(),
    latencyMs: result.latencyMs,
    error: result.error,
  });
  getLogger('ai').info({ ok: result.ok, latencyMs: result.latencyMs }, 'Vision connection test');
  return result;
}

export function getAiCapabilities(
  db: AppDatabase | null,
  model?: string,
): ModelCapabilities | null {
  const database = requireDb(db);
  const target = model ?? getAiConfig(database).primaryModel;
  return getModelCapabilities(database, target);
}
