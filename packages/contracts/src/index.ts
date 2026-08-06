import { z } from 'zod';

export const APP_VERSION = '0.1.0';
export const CONSENT_TEXT_VERSION = '1.0.0';

export const CONSENT_TEXT = `Я понимаю, что автоматизация может нарушать правила Twinby,
может привести к ограничению функций или удалению аккаунта.
Я запускаю приложение на собственном аккаунте и принимаю риск.`;

export const DEFAULT_ARIONHUB_BASE_URL = 'https://arionhub.pro/v1';
export const DEFAULT_PRIMARY_MODEL = 'claude-sonnet-5';
export const DEFAULT_FALLBACK_MODEL = 'gpt-5.5';

/** Twinby / BlueStacks Appium defaults */
export const TWINBY_APP_PACKAGE = 'com.twinby';
export const TWINBY_APP_ACTIVITY = 'com.twinby/.MainActivity';
export const BLUESTACKS_ADB_UDID = '127.0.0.1:5555';
export const BLUESTACKS_DEVICE_NAME = 'BlueStacks';
export const DEFAULT_APPIUM_NEW_COMMAND_TIMEOUT = 300;

export function isBlueStacksUdid(udid: string): boolean {
  return /^127\.0\.0\.1:\d+$/i.test(udid) || /bluestacks/i.test(udid);
}

export function pickPreferredAndroidDevice<
  T extends { udid: string; state: string },
>(devices: T[]): T | undefined {
  const online = devices.filter((d) => d.state === 'device');
  return (
    online.find((d) => d.udid === BLUESTACKS_ADB_UDID) ??
    online.find((d) => isBlueStacksUdid(d.udid)) ??
    online[0]
  );
}

export function resolveAppiumSessionDefaults(input: {
  udid: string;
  appPackage?: string;
  appActivity?: string;
  deviceName?: string;
  noReset?: boolean;
  newCommandTimeout?: number;
}): {
  udid: string;
  appPackage: string;
  appActivity: string;
  deviceName: string;
  noReset: boolean;
  newCommandTimeout: number;
} {
  const appPackage = input.appPackage?.trim() || TWINBY_APP_PACKAGE;
  const isTwinby = appPackage === TWINBY_APP_PACKAGE;
  return {
    udid: input.udid,
    appPackage,
    appActivity:
      input.appActivity?.trim() ||
      (isTwinby ? TWINBY_APP_ACTIVITY : `${appPackage}/.MainActivity`),
    deviceName:
      input.deviceName?.trim() ||
      (isBlueStacksUdid(input.udid) ? BLUESTACKS_DEVICE_NAME : 'Android Emulator'),
    noReset: input.noReset ?? true,
    newCommandTimeout:
      input.newCommandTimeout ?? DEFAULT_APPIUM_NEW_COMMAND_TIMEOUT,
  };
}

export const AppErrorSchema = z.object({
  code: z.string(),
  category: z.string(),
  userMessage: z.string(),
  technicalMessage: z.string(),
  recoverable: z.boolean(),
  suggestedAction: z.string().optional(),
});
export type AppErrorShape = z.infer<typeof AppErrorSchema>;

export const PingRequestSchema = z.object({
  message: z.string().min(1).max(200),
});
export type PingRequest = z.infer<typeof PingRequestSchema>;

export const PingResponseSchema = z.object({
  ok: z.literal(true),
  echo: z.string(),
  appVersion: z.string(),
  timestamp: z.string(),
});
export type PingResponse = z.infer<typeof PingResponseSchema>;

export const AppInfoSchema = z.object({
  name: z.string(),
  version: z.string(),
  consentTextVersion: z.string(),
  dataDir: z.string(),
});
export type AppInfo = z.infer<typeof AppInfoSchema>;

export const LegalConsentSchema = z.object({
  id: z.string(),
  consentVersion: z.string(),
  acceptedAt: z.string(),
  appVersion: z.string(),
});
export type LegalConsent = z.infer<typeof LegalConsentSchema>;

export const AcceptConsentInputSchema = z.object({
  consentVersion: z.literal(CONSENT_TEXT_VERSION),
  accepted: z.literal(true),
});
export type AcceptConsentInput = z.infer<typeof AcceptConsentInputSchema>;

export const DatabaseHealthSchema = z.object({
  ok: z.boolean(),
  path: z.string(),
  migrated: z.boolean(),
});
export type DatabaseHealth = z.infer<typeof DatabaseHealthSchema>;

export const SwipeDecisionSchema = z.enum(['like', 'dislike', 'review']);
export type SwipeDecision = z.infer<typeof SwipeDecisionSchema>;

export const SessionModeSchema = z.enum([
  'recommendation-only',
  'auto-high-confidence',
]);
export type SessionMode = z.infer<typeof SessionModeSchema>;

export const CapabilityStatusSchema = z.enum(['supported', 'failed', 'unknown']);
export type CapabilityStatus = z.infer<typeof CapabilityStatusSchema>;

export const AiConfigSchema = z.object({
  id: z.string(),
  provider: z.literal('arionhub'),
  baseUrl: z.string().url(),
  primaryModel: z.string().min(1),
  fallbackModel: z.string().optional(),
  timeoutMs: z.number().int().min(1000).max(300_000),
  maxRetries: z.number().int().min(0).max(5),
  maxOutputTokens: z.number().int().min(64).max(8192),
  temperature: z.number().min(0).max(2),
  responseFormatMode: z.enum(['json-object', 'prompt-json']),
  maxCandidatePhotos: z.number().int().min(1).max(10),
  positiveAnchorsCount: z.number().int().min(0).max(8),
  negativeAnchorsCount: z.number().int().min(0).max(8),
  imageDetail: z.enum(['low', 'high', 'auto']),
  sessionSpendingLimitUsd: z.number().min(0).optional(),
  dailySpendingLimitUsd: z.number().min(0).optional(),
  /** Rough estimate for spend caps when provider has no USD usage API. */
  usdPer1kTokens: z.number().min(0).max(10).default(0.002),
  fallbackEnabled: z.boolean(),
  jsonRepairEnabled: z.boolean(),
  hasApiKey: z.boolean(),
  apiKeyMasked: z.string().nullable(),
  updatedAt: z.string(),
});
export type AiConfig = z.infer<typeof AiConfigSchema>;

export const AiConfigInputSchema = z.object({
  baseUrl: z.string().url().default(DEFAULT_ARIONHUB_BASE_URL),
  primaryModel: z.string().min(1).default(DEFAULT_PRIMARY_MODEL),
  fallbackModel: z.string().optional(),
  timeoutMs: z.number().int().min(1000).max(300_000).default(180_000),
  maxRetries: z.number().int().min(0).max(5).default(2),
  maxOutputTokens: z.number().int().min(64).max(8192).default(1024),
  temperature: z.number().min(0).max(2).default(0.2),
  responseFormatMode: z.enum(['json-object', 'prompt-json']).default('json-object'),
  maxCandidatePhotos: z.number().int().min(1).max(10).default(3),
  positiveAnchorsCount: z.number().int().min(0).max(8).default(3),
  negativeAnchorsCount: z.number().int().min(0).max(8).default(3),
  imageDetail: z.enum(['low', 'high', 'auto']).default('low'),
  sessionSpendingLimitUsd: z.number().min(0).optional(),
  dailySpendingLimitUsd: z.number().min(0).optional(),
  usdPer1kTokens: z.number().min(0).max(10).default(0.002),
  fallbackEnabled: z.boolean().default(true),
  jsonRepairEnabled: z.boolean().default(true),
  apiKey: z.string().min(8).optional(),
  clearApiKey: z.boolean().optional(),
});
export type AiConfigInput = z.infer<typeof AiConfigInputSchema>;

export const AiModelSchema = z.object({
  id: z.string(),
  ownedBy: z.string().optional(),
});
export type AiModel = z.infer<typeof AiModelSchema>;

export const AiConnectionTestSchema = z.object({
  ok: z.boolean(),
  latencyMs: z.number(),
  model: z.string().optional(),
  contentPreview: z.string().optional(),
  error: z.string().optional(),
  userMessage: z.string().optional(),
});
export type AiConnectionTest = z.infer<typeof AiConnectionTestSchema>;

export const AiVisionTestSchema = z.object({
  ok: z.boolean(),
  latencyMs: z.number(),
  model: z.string().optional(),
  parsedOk: z.boolean().optional(),
  contentPreview: z.string().optional(),
  error: z.string().optional(),
  userMessage: z.string().optional(),
});
export type AiVisionTest = z.infer<typeof AiVisionTestSchema>;

export const ModelCapabilitiesSchema = z.object({
  model: z.string(),
  text: CapabilityStatusSchema,
  vision: CapabilityStatusSchema,
  jsonObject: CapabilityStatusSchema,
  testedAt: z.string(),
  latencyMs: z.number().optional(),
  error: z.string().optional(),
});
export type ModelCapabilities = z.infer<typeof ModelCapabilitiesSchema>;

export const AiDecisionSchema = z.object({
  action: SwipeDecisionSchema,
  overallScore: z.number().min(0).max(100),
  confidence: z.number().min(0).max(1),
  breakdown: z.object({
    visualFit: z.number().min(0).max(100).nullable(),
    presentationFit: z.number().min(0).max(100).nullable(),
    bioFit: z.number().min(0).max(100).nullable(),
    interestsFit: z.number().min(0).max(100).nullable(),
    compatibilityFit: z.number().min(0).max(100).nullable(),
    distanceFit: z.number().min(0).max(100).nullable(),
  }),
  matchedPreferences: z.array(z.string()).max(6),
  concerns: z.array(z.string()).max(6),
  uncertainties: z.array(z.string()).max(6),
  shortReason: z.string().max(500),
  evidenceCompleteness: z.number().min(0).max(1),
});
export type AiDecision = z.infer<typeof AiDecisionSchema>;

/** Layer A — factual observations from photos/bio. No like/dislike. */
export const VisibilityLevelSchema = z.enum(['clear', 'partial', 'none', 'unclear']);
export type VisibilityLevel = z.infer<typeof VisibilityLevelSchema>;

export const BodyTypeHintSchema = z.enum([
  'petite',
  'slim',
  'average',
  'curvy',
  'athletic',
  'plus',
  'unknown',
]);
export type BodyTypeHint = z.infer<typeof BodyTypeHintSchema>;

export const ProfileEvidenceObservationsSchema = z.object({
  faceVisibility: VisibilityLevelSchema,
  bodyVisibility: VisibilityLevelSchema,
  bodyTypeHint: BodyTypeHintSchema.default('unknown'),
  photoTypes: z.array(z.string().max(40)).max(8).default([]),
  presentation: z.array(z.string().max(40)).max(8).default([]),
  bioSignals: z.array(z.string().max(60)).max(8).default([]),
  notableVisual: z.array(z.string().max(80)).max(8).default([]),
});
export type ProfileEvidenceObservations = z.infer<
  typeof ProfileEvidenceObservationsSchema
>;

export const ProfileEvidenceSchema = z.object({
  observations: ProfileEvidenceObservationsSchema,
  uncertainties: z.array(z.string().max(160)).max(8).default([]),
  evidenceCompleteness: z.number().min(0).max(1),
});
export type ProfileEvidence = z.infer<typeof ProfileEvidenceSchema>;

/** Stored in history ai_raw_json when using two-stage pipeline. */
export const TwoStageAiRawSchema = z.object({
  pipeline: z.literal('two-stage'),
  evidence: ProfileEvidenceSchema,
  decision: AiDecisionSchema,
  models: z.object({
    extraction: z.string(),
    decision: z.string(),
  }),
});
export type TwoStageAiRaw = z.infer<typeof TwoStageAiRawSchema>;

export const HardFiltersSchema = z.object({
  minAge: z.number().int().min(18).max(99).optional(),
  maxAge: z.number().int().min(18).max(99).optional(),
  maxDistanceKm: z.number().min(0).max(500).optional(),
  minCompatibilityPercent: z.number().min(0).max(100).optional(),
  requireBio: z.boolean().default(false),
  allowedRelationshipGoals: z.array(z.string()).default([]),
  blockedKeywords: z.array(z.string()).default([]),
  preferredKeywords: z.array(z.string()).default([]),
});

export const NarrativeSchema = z.object({
  likedDescription: z.string().max(4000).default(''),
  dislikedDescription: z.string().max(4000).default(''),
  priorities: z
    .string()
    .max(2000)
    .default(
      'Главное — физическая внешность (лицо + телосложение) и сходство с позитивными референсами. Стиль/образ вторичен. HardRejects по фигуре — строгий veto.',
    ),
  hardRejects: z.string().max(2000).default(''),
  uncertaintyPolicy: z
    .string()
    .max(2000)
    .default(
      'Почти никогда не выбирать review. При сомнении по телосложению/hardReject → dislike. Like только если лицо и силуэт явно близки к позитивным референсам.',
    ),
  /** Short skill tags: likes (+). Free-form text stays in likedDescription. */
  likedSkills: z.array(z.string().max(200)).default([]),
  /** Short skill tags: dislikes (−). */
  dislikedSkills: z.array(z.string().max(200)).default([]),
  /** Short skill tags: especially important (✓). */
  importantSkills: z.array(z.string().max(200)).default([]),
  /** Short skill tags: stop-signals (✕). */
  stopSkills: z.array(z.string().max(200)).default([]),
});
export type Narrative = z.infer<typeof NarrativeSchema>;

export const WeightsSchema = z.object({
  /** Face + body vs references — dominant */
  visual: z.number().min(0).max(1).default(0.65),
  /** Style/outfit/vibe — must not override body hard rejects */
  presentation: z.number().min(0).max(1).default(0.15),
  bio: z.number().min(0).max(1).default(0.08),
  interests: z.number().min(0).max(1).default(0.06),
  compatibility: z.number().min(0).max(1).default(0.04),
  distance: z.number().min(0).max(1).default(0.02),
});

export const ThresholdsSchema = z.object({
  /** Soft label only — auto mode ignores gray zone */
  likeScore: z.number().min(0).max(100).default(50),
  dislikeScore: z.number().min(0).max(100).default(49),
  /** Auto-like when score >= this. 0 = any like */
  autoLikeScore: z.number().min(0).max(100).default(0),
  /** Auto-dislike when score <= this. 100 = any dislike */
  autoDislikeScore: z.number().min(0).max(100).default(100),
  /** 0 = never block auto on confidence */
  minConfidence: z.number().min(0).max(1).default(0),
});

export const PreferenceProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  hardFilters: HardFiltersSchema,
  narrative: NarrativeSchema,
  weights: WeightsSchema,
  thresholds: ThresholdsSchema,
  version: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type PreferenceProfile = z.infer<typeof PreferenceProfileSchema>;

export const PreferenceProfileInputSchema = z.object({
  name: z.string().min(1).max(120).default('Основной'),
  hardFilters: HardFiltersSchema.partial().optional(),
  narrative: NarrativeSchema.partial().optional(),
  weights: WeightsSchema.partial().optional(),
  thresholds: ThresholdsSchema.partial().optional(),
});
export type PreferenceProfileInput = z.infer<typeof PreferenceProfileInputSchema>;

export const ReferencePolaritySchema = z.enum(['positive', 'negative']);
export type ReferencePolarity = z.infer<typeof ReferencePolaritySchema>;

export const ReferenceImageSchema = z.object({
  id: z.string(),
  preferenceProfileId: z.string(),
  polarity: ReferencePolaritySchema,
  filePath: z.string(),
  thumbnailPath: z.string(),
  thumbnailDataUrl: z.string().optional(),
  comment: z.string().optional(),
  tags: z.array(z.string()).default([]),
  weight: z.number().min(0).max(1).default(1),
  pinned: z.boolean().default(false),
  checksum: z.string(),
  createdAt: z.string(),
});
export type ReferenceImage = z.infer<typeof ReferenceImageSchema>;

export const AddReferenceInputSchema = z.object({
  polarity: ReferencePolaritySchema,
  comment: z.string().max(500).optional(),
  weight: z.number().min(0).max(1).optional(),
  pinned: z.boolean().optional(),
});
export type AddReferenceInput = z.infer<typeof AddReferenceInputSchema>;

export const UpdateReferenceInputSchema = z.object({
  id: z.string().min(1),
  comment: z.string().max(500).optional(),
  weight: z.number().min(0).max(1).optional(),
  pinned: z.boolean().optional(),
  polarity: ReferencePolaritySchema.optional(),
});
export type UpdateReferenceInput = z.infer<typeof UpdateReferenceInputSchema>;

export const PreferenceSummarySchema = z.object({
  positiveVisualPatterns: z.array(z.string()).default([]),
  negativeVisualPatterns: z.array(z.string()).default([]),
  positivePresentationPatterns: z.array(z.string()).default([]),
  negativePresentationPatterns: z.array(z.string()).default([]),
  lifestylePreferences: z.array(z.string()).default([]),
  bioPreferences: z.array(z.string()).default([]),
  hardRejects: z.array(z.string()).default([]),
  uncertainties: z.array(z.string()).default([]),
});
export type PreferenceSummary = z.infer<typeof PreferenceSummarySchema>;

export const StoredPreferenceSummarySchema = z.object({
  id: z.string(),
  preferenceProfileId: z.string(),
  summary: PreferenceSummarySchema,
  sourceFingerprint: z.string(),
  model: z.string().optional(),
  analyzedAt: z.string(),
  updatedAt: z.string(),
  stale: z.boolean(),
  latencyMs: z.number().optional(),
});
export type StoredPreferenceSummary = z.infer<typeof StoredPreferenceSummarySchema>;

export const SessionStatusSchema = z.enum([
  'idle',
  'validating-environment',
  'starting-emulator',
  'waiting-for-device',
  'starting-appium',
  'connecting',
  'opening-twinby',
  'ready',
  'capturing-profile',
  'evaluating',
  'awaiting-review',
  'executing-action',
  'cooldown',
  'recovering',
  'paused',
  'stopping',
  'stopped',
  'error',
]);
export type SessionStatus = z.infer<typeof SessionStatusSchema>;

export const SessionSourceSchema = z.enum(['mock', 'live']);
export type SessionSource = z.infer<typeof SessionSourceSchema>;

export const SessionCountersSchema = z.object({
  viewed: z.number().int().nonnegative(),
  likes: z.number().int().nonnegative(),
  dislikes: z.number().int().nonnegative(),
  reviews: z.number().int().nonnegative(),
  skips: z.number().int().nonnegative(),
  errors: z.number().int().nonnegative(),
});
export type SessionCounters = z.infer<typeof SessionCountersSchema>;

export const CurrentCandidateSchema = z.object({
  captureId: z.string(),
  /** Mock fixture id, or live observation short id */
  fixtureId: z.string(),
  observationId: z.string().optional(),
  displayName: z.string().optional(),
  age: z.number().optional(),
  distanceKm: z.number().optional(),
  bio: z.string().optional(),
  interests: z.array(z.string()).default([]),
  goal: z.string().optional(),
  compatibilityPercent: z.number().optional(),
  photoDataUrls: z.array(z.string()).default([]),
  cardFingerprint: z.string().optional(),
  captureWarnings: z.array(z.string()).default([]),
  modelDecision: SwipeDecisionSchema.optional(),
  modelConfidence: z.number().optional(),
  modelReasons: z.array(z.string()).default([]),
  overallScore: z.number().optional(),
  decisionSource: z.enum(['hard_filter', 'ai', 'user', 'fallback', 'auto']).optional(),
  finalDecision: SwipeDecisionSchema.optional(),
  requiresConfirmation: z.boolean().optional(),
  evaluating: z.boolean().optional(),
  latencyMs: z.number().optional(),
  model: z.string().optional(),
  effectiveConfidence: z.number().optional(),
  autoEligible: z.boolean().optional(),
});
export type CurrentCandidate = z.infer<typeof CurrentCandidateSchema>;

export const SessionViewStateSchema = z.object({
  sessionId: z.string().nullable(),
  status: SessionStatusSchema,
  mode: SessionModeSchema,
  source: SessionSourceSchema,
  counters: SessionCountersSchema,
  startedAt: z.string().optional(),
  stoppedAt: z.string().optional(),
  errorMessage: z.string().optional(),
  totalProfiles: z.number().int().nonnegative(),
  remainingProfiles: z.number().int().nonnegative(),
  current: CurrentCandidateSchema.optional(),
});
export type SessionViewState = z.infer<typeof SessionViewStateSchema>;

export const StartSessionInputSchema = z.object({
  mode: SessionModeSchema.default('recommendation-only'),
  source: SessionSourceSchema.default('mock'),
  udid: z.string().min(1).optional(),
  appPackage: z.string().default('com.twinby'),
  maxProfiles: z.number().int().min(1).max(350).optional(),
  /** Explicit manual override for preflight (§19). Required until locator discovery lands. */
  skipPreflight: z.boolean().default(false),
  skipPreflightReason: z.string().max(500).optional(),
});
export type StartSessionInput = z.input<typeof StartSessionInputSchema>;

export const SwipeActionSchema = z.enum(['like', 'dislike']);
export type SwipeAction = z.infer<typeof SwipeActionSchema>;

export const ReviewDecisionInputSchema = z.object({
  captureId: z.string().min(1),
  decision: SwipeDecisionSchema,
  comment: z.string().max(1000).optional(),
  corrected: z.boolean().default(false),
});
export type ReviewDecisionInput = z.infer<typeof ReviewDecisionInputSchema>;

export const HistoryEventSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  createdAt: z.string(),
  fixtureId: z.string().optional(),
  captureId: z.string(),
  modelDecision: SwipeDecisionSchema.optional(),
  userDecision: z.union([SwipeDecisionSchema, z.literal('skip')]).optional(),
  decisionSource: z.enum(['hard_filter', 'ai', 'user', 'fallback', 'skip', 'auto']),
  confidence: z.number().optional(),
  effectiveConfidence: z.number().optional(),
  reasons: z.array(z.string()).default([]),
  comment: z.string().optional(),
  latencyMs: z.number().optional(),
  model: z.string().optional(),
  preferenceVersion: z.number().optional(),
  corrected: z.boolean().default(false),
  autoExecuted: z.boolean().default(false),
  sessionMode: SessionModeSchema.optional(),
});
export type HistoryEvent = z.infer<typeof HistoryEventSchema>;

export const HistoryQuerySchema = z.object({
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).default(0),
  sessionId: z.string().optional(),
});
export type HistoryQuery = z.infer<typeof HistoryQuerySchema>;

export const PaginatedHistorySchema = z.object({
  items: z.array(HistoryEventSchema),
  total: z.number().int().nonnegative(),
});
export type PaginatedHistory = z.infer<typeof PaginatedHistorySchema>;

export const HistorySessionSummarySchema = z.object({
  id: z.string(),
  mode: SessionModeSchema,
  source: SessionSourceSchema,
  status: z.string(),
  startedAt: z.string(),
  stoppedAt: z.string().optional(),
  durationMs: z.number().int().nonnegative(),
  viewed: z.number().int().nonnegative(),
  likes: z.number().int().nonnegative(),
  dislikes: z.number().int().nonnegative(),
  errors: z.number().int().nonnegative(),
  hasDetail: z.boolean(),
  profileCount: z.number().int().nonnegative(),
});
export type HistorySessionSummary = z.infer<typeof HistorySessionSummarySchema>;

export const HistorySessionProfileSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  createdAt: z.string(),
  fixtureId: z.string().optional(),
  captureId: z.string(),
  modelDecision: SwipeDecisionSchema.optional(),
  userDecision: z.union([SwipeDecisionSchema, z.literal('skip')]).optional(),
  decisionSource: z.enum(['hard_filter', 'ai', 'user', 'fallback', 'skip', 'auto']),
  reasons: z.array(z.string()).default([]),
  autoExecuted: z.boolean().default(false),
  corrected: z.boolean().default(false),
  displayName: z.string().optional(),
  bio: z.string().optional(),
  profileText: z.string().optional(),
  modelExcerpt: z.string().optional(),
  photoDataUrls: z.array(z.string()).default([]),
  /** agree = bot was right; like/dislike = user correction */
  userOverrideDecision: z.enum(['agree', 'like', 'dislike']).optional(),
  userFeedbackComment: z.string().optional(),
  feedbackSentAt: z.string().optional(),
  hasDetail: z.boolean(),
});
export type HistorySessionProfile = z.infer<typeof HistorySessionProfileSchema>;

export const HistorySessionProfilesQuerySchema = z.object({
  sessionId: z.string().min(1),
  limit: z.number().int().min(1).max(50).default(20),
  offset: z.number().int().min(0).default(0),
});
export type HistorySessionProfilesQuery = z.infer<typeof HistorySessionProfilesQuerySchema>;

export const PaginatedHistorySessionProfilesSchema = z.object({
  items: z.array(HistorySessionProfileSchema),
  total: z.number().int().nonnegative(),
  sessionId: z.string(),
});
export type PaginatedHistorySessionProfiles = z.infer<
  typeof PaginatedHistorySessionProfilesSchema
>;

export const HistoryFeedbackDecisionSchema = z.enum(['agree', 'like', 'dislike']);
export type HistoryFeedbackDecision = z.infer<typeof HistoryFeedbackDecisionSchema>;

export const SaveHistoryProfileFeedbackSchema = z.object({
  eventId: z.string().min(1),
  decision: HistoryFeedbackDecisionSchema.optional(),
  comment: z.string().max(2000).optional(),
});
export type SaveHistoryProfileFeedback = z.infer<typeof SaveHistoryProfileFeedbackSchema>;

export const SessionFeedbackNarrativePatchSchema = z.object({
  likedDescription: z.string().max(4000).optional(),
  dislikedDescription: z.string().max(4000).optional(),
  priorities: z.string().max(2000).optional(),
  hardRejects: z.string().max(2000).optional(),
  uncertaintyPolicy: z.string().max(2000).optional(),
});
export type SessionFeedbackNarrativePatch = z.infer<
  typeof SessionFeedbackNarrativePatchSchema
>;

export const SessionFeedbackAnalysisSchema = z.object({
  sessionId: z.string(),
  understanding: z.string(),
  agreePrompt: z.string(),
  lessons: z.array(z.string()).default([]),
  narrativePatch: SessionFeedbackNarrativePatchSchema.default({}),
  itemsReviewed: z.number().int().nonnegative(),
});
export type SessionFeedbackAnalysis = z.infer<typeof SessionFeedbackAnalysisSchema>;

export const SubmitSessionFeedbackSchema = z.object({
  sessionId: z.string().min(1),
  /** Extra note when user asks the model to rethink the summary. */
  revisionNote: z.string().max(4000).optional(),
  previousUnderstanding: z.string().max(4000).optional(),
});
export type SubmitSessionFeedback = z.infer<typeof SubmitSessionFeedbackSchema>;

export const ApplySessionFeedbackSchema = z.object({
  sessionId: z.string().min(1),
  accept: z.boolean(),
  narrativePatch: SessionFeedbackNarrativePatchSchema.optional(),
});
export type ApplySessionFeedback = z.infer<typeof ApplySessionFeedbackSchema>;

export const DeleteHistorySessionSchema = z.object({
  sessionId: z.string().min(1),
});
export type DeleteHistorySession = z.infer<typeof DeleteHistorySessionSchema>;

export const EnvironmentItemStatusSchema = z.enum(['ok', 'warning', 'error', 'unknown']);
export type EnvironmentItemStatus = z.infer<typeof EnvironmentItemStatusSchema>;

export const EnvironmentReportItemSchema = z.object({
  id: z.string(),
  label: z.string(),
  status: EnvironmentItemStatusSchema,
  detail: z.string(),
  fixCommand: z.string().optional(),
  path: z.string().optional(),
  version: z.string().optional(),
});
export type EnvironmentReportItem = z.infer<typeof EnvironmentReportItemSchema>;

export const EnvironmentReportSchema = z.object({
  ok: z.boolean(),
  checkedAt: z.string(),
  items: z.array(EnvironmentReportItemSchema),
});
export type EnvironmentReport = z.infer<typeof EnvironmentReportSchema>;

export const AndroidVirtualDeviceSchema = z.object({
  name: z.string(),
  path: z.string().optional(),
});
export type AndroidVirtualDevice = z.infer<typeof AndroidVirtualDeviceSchema>;

export const AndroidDeviceSchema = z.object({
  udid: z.string(),
  state: z.enum(['device', 'offline', 'unauthorized', 'unknown']),
  isEmulator: z.boolean(),
});
export type AndroidDevice = z.infer<typeof AndroidDeviceSchema>;

export const AppiumServerStatusSchema = z.object({
  running: z.boolean(),
  ready: z.boolean(),
  url: z.string(),
  owned: z.boolean(),
  pid: z.number().int().optional(),
  version: z.string().optional(),
  error: z.string().optional(),
});
export type AppiumServerStatus = z.infer<typeof AppiumServerStatusSchema>;

export const CreateAppiumSessionInputSchema = z.object({
  udid: z.string().min(1),
  appPackage: z.string().min(1).optional(),
  appActivity: z.string().min(1).optional(),
  noReset: z.boolean().default(true),
  deviceName: z.string().optional(),
  newCommandTimeout: z
    .number()
    .int()
    .min(0)
    .max(3600)
    .default(DEFAULT_APPIUM_NEW_COMMAND_TIMEOUT),
});
export type CreateAppiumSessionInput = z.infer<typeof CreateAppiumSessionInputSchema>;

export const AppiumSessionInfoSchema = z.object({
  sessionId: z.string(),
  udid: z.string(),
  capabilities: z.record(z.unknown()).optional(),
});
export type AppiumSessionInfo = z.infer<typeof AppiumSessionInfoSchema>;

export const AppiumScreenshotSchema = z.object({
  mimeType: z.literal('image/png'),
  base64: z.string(),
  dataUrl: z.string(),
});
export type AppiumScreenshot = z.infer<typeof AppiumScreenshotSchema>;

export const AppiumPageSourceSchema = z.object({
  source: z.string(),
  savedPath: z.string().optional(),
  length: z.number().int().nonnegative(),
});
export type AppiumPageSource = z.infer<typeof AppiumPageSourceSchema>;

export const AppiumWindowRectSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});
export type AppiumWindowRect = z.infer<typeof AppiumWindowRectSchema>;

export const LocatorStrategySchema = z.enum([
  'accessibility-id',
  'resource-id',
  'text',
  'xpath',
  'relative-tap',
]);
export type LocatorStrategy = z.infer<typeof LocatorStrategySchema>;

export const LocatorSchema = z.object({
  strategy: LocatorStrategySchema,
  value: z.string().optional(),
  of: z.string().optional(),
  xRatio: z.number().min(0).max(1).optional(),
  yRatio: z.number().min(0).max(1).optional(),
  note: z.string().optional(),
  discoveredAt: z.string().optional(),
});
export type Locator = z.infer<typeof LocatorSchema>;

export const TwinbyScreenTypeSchema = z.enum([
  'feed',
  'profile-details',
  'photo-viewer',
  'match-dialog',
  'premium-dialog',
  'no-profiles',
  'network-error',
  'login',
  'verification',
  'update-required',
  'android-permission',
  'chats',
  /** Opened 1:1 chat thread (not the chats list) */
  'conversation',
  'likes',
  'matches-list',
  'own-profile-hub',
  'own-profile-edit',
  'own-profile-preview',
  'unknown',
]);
export type TwinbyScreenType = z.infer<typeof TwinbyScreenTypeSchema>;

export const DetectedScreenSchema = z.object({
  type: TwinbyScreenTypeSchema,
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.string()),
});
export type DetectedScreen = z.infer<typeof DetectedScreenSchema>;

export const ActionResultSchema = z.object({
  ok: z.boolean(),
  action: SwipeActionSchema,
  screenAfter: DetectedScreenSchema,
  recovered: z.boolean().default(false),
  identityMatched: z.boolean().default(true),
  message: z.string().optional(),
});
export type ActionResult = z.infer<typeof ActionResultSchema>;

export const LocatorProfileSchema = z.object({
  id: z.string(),
  appPackage: z.string(),
  appVersion: z.string().optional(),
  screenWidth: z.number().optional(),
  screenHeight: z.number().optional(),
  density: z.number().optional(),
  discoveredAt: z.string().optional(),
  notes: z.array(z.string()).default([]),
  feed: z.object({
    root: z.array(LocatorSchema).default([]),
    likeButton: z.array(LocatorSchema).default([]),
    dislikeButton: z.array(LocatorSchema).default([]),
    superlikeButton: z.array(LocatorSchema).default([]),
    rewindButton: z.array(LocatorSchema).default([]),
    compatibilityButton: z.array(LocatorSchema).default([]),
    detailsButton: z.array(LocatorSchema).default([]),
    name: z.array(LocatorSchema).default([]),
    age: z.array(LocatorSchema).default([]),
    distance: z.array(LocatorSchema).default([]),
    compatibility: z.array(LocatorSchema).default([]),
    bio: z.array(LocatorSchema).default([]),
    interests: z.array(LocatorSchema).default([]),
    nextPhotoArea: z.array(LocatorSchema).default([]),
    photoIndicator: z.array(LocatorSchema).default([]),
  }),
  overlays: z.object({
    matchDialog: z.array(LocatorSchema).default([]),
    premiumDialog: z.array(LocatorSchema).default([]),
    updateDialog: z.array(LocatorSchema).default([]),
    errorDialog: z.array(LocatorSchema).default([]),
    noProfiles: z.array(LocatorSchema).default([]),
  }),
  navigation: z
    .object({
      /** Tab 1 — чаты и мэтчи */
      chat: z.array(LocatorSchema).default([]),
      /** Tab 2 — входящие лайки */
      likes: z.array(LocatorSchema).default([]),
      /** Tab 3 — лента анкет */
      feed: z.array(LocatorSchema).default([]),
      /** Tab 4 — Games / карточки — не используем в продукте */
      games: z.array(LocatorSchema).default([]),
      /** Tab 5 — профиль и настройки */
      profile: z.array(LocatorSchema).default([]),
      /** Чаты → «Все» у блока «Новые пары» */
      allMatchesLink: z.array(LocatorSchema).default([]),
      /** Список «Новые пары» / все мэтчи */
      matchesListRoot: z.array(LocatorSchema).default([]),
      /** Хаб профиля: аватар слева сверху (~первая треть) */
      ownProfileAvatar: z.array(LocatorSchema).default([]),
      /** Экран редактирования анкеты («Мои фото», «Био») */
      ownProfileEditRoot: z.array(LocatorSchema).default([]),
      /** Кнопка «Просмотр» справа сверху на экране редактирования */
      ownProfilePreviewButton: z.array(LocatorSchema).default([]),
    })
    .default({}),
});
export type LocatorProfile = z.infer<typeof LocatorProfileSchema>;

/** Pace presets — turbo = emulator max speed (no human-like delays). */
export const SpeedPresetSchema = z.enum(['safe', 'balanced', 'fast', 'turbo']);
export type SpeedPreset = z.infer<typeof SpeedPresetSchema>;

export const SessionLimitsSchema = z.object({
  /** Pace profile — applies rate limits + photo caps */
  speedPreset: SpeedPresetSchema.default('turbo'),
  /** Only hard session stop for unattended runs */
  maxProfiles: z.number().int().min(1).max(350).default(350),
  /** 0 = unlimited */
  maxLikes: z.number().int().min(0).max(5000).default(0),
  /** 0 = unlimited */
  maxDislikes: z.number().int().min(0).max(5000).default(0),
  /** 0 = unlimited auto swipes */
  maxAutoActions: z.number().int().min(0).max(5000).default(0),
  maxActionsPerMinute: z.number().int().min(1).max(120).default(120),
  minActionIntervalMs: z.number().int().min(0).max(60_000).default(0),
  maxPhotosPerProfile: z.number().int().min(1).max(20).default(8),
  /** How many captured photos to send to the model (UI may keep more) */
  maxPhotosForAi: z.number().int().min(1).max(6).default(5),
  /** Collect every unique photo until repeat/end/timeout */
  requireAllPhotos: z.boolean().default(true),
  /** Open/scroll for bio when not on card face — off in turbo (photos first) */
  requireBio: z.boolean().default(false),
  uiCooldownMs: z.number().int().min(0).max(30_000).default(280),
  /** 0 = no duration limit */
  maxSessionDurationMin: z.number().int().min(0).max(10_080).default(0),
  stopOnRepeatedErrors: z.number().int().min(1).max(20).default(3),
});
export type SessionLimits = z.infer<typeof SessionLimitsSchema>;

export const DEFAULT_SESSION_LIMITS: SessionLimits = SessionLimitsSchema.parse({});

/** Pace presets — merge onto current limits (keeps maxLikes / duration etc.) */
export const SPEED_PRESET_VALUES: Record<
  SpeedPreset,
  Pick<
    SessionLimits,
    | 'speedPreset'
    | 'maxActionsPerMinute'
    | 'minActionIntervalMs'
    | 'maxPhotosPerProfile'
    | 'maxPhotosForAi'
    | 'requireAllPhotos'
    | 'requireBio'
    | 'uiCooldownMs'
  >
> = {
  safe: {
    speedPreset: 'safe',
    maxActionsPerMinute: 12,
    minActionIntervalMs: 2500,
    maxPhotosPerProfile: 10,
    maxPhotosForAi: 6,
    requireAllPhotos: true,
    requireBio: true,
    uiCooldownMs: 400,
  },
  balanced: {
    speedPreset: 'balanced',
    maxActionsPerMinute: 20,
    minActionIntervalMs: 1000,
    maxPhotosPerProfile: 6,
    maxPhotosForAi: 3,
    requireAllPhotos: true,
    requireBio: true,
    uiCooldownMs: 220,
  },
  fast: {
    speedPreset: 'fast',
    maxActionsPerMinute: 45,
    minActionIntervalMs: 180,
    maxPhotosPerProfile: 5,
    maxPhotosForAi: 3,
    requireAllPhotos: true,
    requireBio: false,
    uiCooldownMs: 60,
  },
  /** Emulator: no human pacing — flip photos / screenshots as fast as UI allows */
  turbo: {
    speedPreset: 'turbo',
    maxActionsPerMinute: 120,
    minActionIntervalMs: 0,
    maxPhotosPerProfile: 8,
    maxPhotosForAi: 5,
    requireAllPhotos: true,
    requireBio: false,
    /** Used as settle floor after photo tap (animation) */
    uiCooldownMs: 280,
  },
};

export function applySpeedPreset(
  current: SessionLimits,
  preset: SpeedPreset,
): SessionLimits {
  return SessionLimitsSchema.parse({
    ...current,
    ...SPEED_PRESET_VALUES[preset],
  });
}

export const NormalizedRectSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0).max(1),
  height: z.number().min(0).max(1),
});
export type NormalizedRect = z.infer<typeof NormalizedRectSchema>;

export const CapturedImageSchema = z.object({
  index: z.number().int().nonnegative(),
  path: z.string(),
  dataUrl: z.string().optional(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  bytes: z.number().int().nonnegative(),
  sha256: z.string(),
  perceptualHash: z.string(),
});
export type CapturedImage = z.infer<typeof CapturedImageSchema>;

export const CapturedProfileFieldsSchema = z.object({
  displayName: z.string().optional(),
  age: z.number().int().optional(),
  distanceKm: z.number().optional(),
  city: z.string().optional(),
  compatibilityPercent: z.number().optional(),
  relationshipGoal: z.string().optional(),
  bio: z.string().optional(),
  interests: z.array(z.string()).default([]),
  otherVisibleText: z.array(z.string()).default([]),
});
export type CapturedProfileFields = z.infer<typeof CapturedProfileFieldsSchema>;

export const CapturedProfileSchema = z.object({
  observationId: z.string(),
  capturedAt: z.string(),
  fields: CapturedProfileFieldsSchema,
  images: z.array(CapturedImageSchema).default([]),
  source: z.object({
    appPackage: z.string(),
    appVersion: z.string().optional(),
    deviceId: z.string(),
    screenSize: z
      .object({
        width: z.number(),
        height: z.number(),
      })
      .optional(),
  }),
  completeness: z.object({
    text: z.number().min(0).max(1),
    images: z.number().min(0).max(1),
    overall: z.number().min(0).max(1),
  }),
  cardFingerprint: z.string(),
  warnings: z.array(z.string()).default([]),
  actionsUsed: z.number().int().nonnegative().default(0),
});
export type CapturedProfile = z.infer<typeof CapturedProfileSchema>;

export const CaptureProfileOptionsSchema = z.object({
  maxPhotos: z.number().int().min(1).max(20).optional(),
  requireAllPhotos: z.boolean().optional(),
  requireBio: z.boolean().optional(),
  includeDataUrls: z.boolean().default(true),
  photoCrop: NormalizedRectSchema.optional(),
  /** Smaller + lower quality — prefer full card frame over aggressive crop */
  maxImageDimension: z.number().int().min(256).max(2048).default(512),
  jpegQuality: z.number().int().min(30).max(95).default(52),
});
export type CaptureProfileOptions = z.input<typeof CaptureProfileOptionsSchema>;

export const TwinbyPackageInfoSchema = z.object({
  packageName: z.string().nullable(),
  versionName: z.string().optional(),
  versionCode: z.string().optional(),
  installed: z.boolean(),
});
export type TwinbyPackageInfo = z.infer<typeof TwinbyPackageInfoSchema>;

/** Visible fields parsed from page source without taps (stage 8). */
export const TwinbyProfilePreviewSchema = z.object({
  displayName: z.string().optional(),
  age: z.number().int().optional(),
  distanceKm: z.number().optional(),
  city: z.string().optional(),
  compatibilityPercent: z.number().optional(),
  goal: z.string().optional(),
  /** Free-text bio when present on face card; often empty until details (stage 9). */
  bioSnippet: z.string().optional(),
  bioVisibleOnFace: z.boolean().default(false),
  interests: z.array(z.string()).default([]),
  otherVisibleText: z.array(z.string()).default([]),
});
export type TwinbyProfilePreview = z.infer<typeof TwinbyProfilePreviewSchema>;

export const DiscoverySnapshotSchema = z.object({
  capturedAt: z.string(),
  udid: z.string(),
  packageName: z.string(),
  appVersion: z.string().optional(),
  windowRect: AppiumWindowRectSchema.optional(),
  screenshotDataUrl: z.string().optional(),
  screenshotPath: z.string().optional(),
  pageSourcePath: z.string().optional(),
  pageSourceLength: z.number().int().nonnegative(),
  detectedScreen: DetectedScreenSchema,
  resourceIds: z.array(z.string()).default([]),
  contentDescs: z.array(z.string()).default([]),
  locatorProfileId: z.string().optional(),
  profilePreview: TwinbyProfilePreviewSchema.optional(),
});
export type DiscoverySnapshot = z.infer<typeof DiscoverySnapshotSchema>;

// ============================================================================
// Orpheus domain — audience, identity, cloud photo library, profile builder,
// verified snapshots, experiments, relationships, preflight (preview.md §7-29, §34-35)
// ============================================================================

export const AppErrorCodeSchema = z.enum([
  'AI_KEY_MISSING',
  'AI_CAPABILITY_UNSUPPORTED',
  'AI_INVALID_RESPONSE',
  'AI_BUDGET_EXCEEDED',
  'APPIUM_UNAVAILABLE',
  'DEVICE_NOT_CONNECTED',
  'TWINBY_SCREEN_UNKNOWN',
  'LOCATOR_NOT_FOUND',
  'PROFILE_CAPTURE_FAILED',
  'CLOUD_AUTH_FAILED',
  'CLOUD_PERMISSION_DENIED',
  'CLOUD_CONNECTION_NOT_FOUND',
  'CLOUD_FOLDER_NOT_FOUND',
  'PHOTO_INDEX_FAILED',
  'PHOTO_NOT_FOUND',
  'EXPERIMENT_ALREADY_RUNNING',
  'EXPERIMENT_NOT_FOUND',
  'EXPERIMENT_NOT_RUNNING',
  'PROFILE_NOT_VERIFIED',
  'PROFILE_VARIANT_NOT_FOUND',
  'RELATIONSHIP_NOT_FOUND',
  'AUDIENCE_MODEL_NOT_FOUND',
  'IDENTITY_MODEL_NOT_FOUND',
  'PREFLIGHT_ALREADY_RUNNING',
  'NOT_IMPLEMENTED',
  'DATABASE_MIGRATION_FAILED',
]);
export type AppErrorCode = z.infer<typeof AppErrorCodeSchema>;

/* ---------------------------------------------------------------------- */
/* Shared enums                                                            */
/* ---------------------------------------------------------------------- */

export const AudienceFitLabelSchema = z.enum([
  'core',
  'acceptable',
  'borderline',
  'outside',
]);
export type AudienceFitLabel = z.infer<typeof AudienceFitLabelSchema>;

export const AudienceFitLabelText: Record<AudienceFitLabel, string> = {
  core: 'Ядро аудитории',
  acceptable: 'Подходит',
  borderline: 'На границе',
  outside: 'Вне аудитории',
};

export const EvidenceStatusSchema = z.enum([
  'observed',
  'claimed',
  'inferred',
  'validated',
]);
export type EvidenceStatus = z.infer<typeof EvidenceStatusSchema>;

export const EvidenceLikelihoodSchema = z.enum(['unlikely', 'possible', 'probable']);
export type EvidenceLikelihood = z.infer<typeof EvidenceLikelihoodSchema>;

export const AudienceSignalPolaritySchema = z.enum([
  'positive',
  'negative',
  'hard-reject',
  'tolerated',
]);
export type AudienceSignalPolarity = z.infer<typeof AudienceSignalPolaritySchema>;

export const AudienceSignalCategorySchema = z.enum([
  'visual-core',
  'presentation-pattern',
  'secondary-interest',
]);
export type AudienceSignalCategory = z.infer<typeof AudienceSignalCategorySchema>;

export const AudienceCorrectionReasonSchema = z.enum([
  'appearance-misread',
  'combination-missed',
  'text-overweighted',
  'negative-signal-missed',
  'positive-signal-missed',
  'other',
]);
export type AudienceCorrectionReason = z.infer<typeof AudienceCorrectionReasonSchema>;

export const RelationshipStageSchema = z.enum([
  'incoming-like',
  'matched',
  'conversation-started',
  'substantive-conversation',
  'telegram-exchanged',
  'date-proposed',
  'date-scheduled',
  'date-completed',
  'closed',
]);
export type RelationshipStage = z.infer<typeof RelationshipStageSchema>;

export const RelationshipEventTypeSchema = z.enum([
  'incoming-like-detected',
  'matched',
  'conversation-started',
  'substantive-conversation',
  'telegram-exchanged',
  'date-proposed',
  'date-scheduled',
  'date-completed',
  'closed',
]);
export type RelationshipEventType = z.infer<typeof RelationshipEventTypeSchema>;

export const RelationshipOriginSchema = z.enum([
  'incoming-like-first',
  'outgoing-like-first',
  'unknown',
]);
export type RelationshipOrigin = z.infer<typeof RelationshipOriginSchema>;

export const ProfileVariantStatusSchema = z.enum([
  'draft',
  'ready',
  'recommended',
  'active',
  'testing',
  'paused',
  'archived',
]);
export type ProfileVariantStatus = z.infer<typeof ProfileVariantStatusSchema>;

export const ExperimentStatusSchema = z.enum([
  'draft',
  'ready',
  'running',
  'completed',
  'stopped-early-positive',
  'stopped-early-negative',
  'stopped-by-user',
  'stopped-profile-changed',
  'insufficient-data',
]);
export type ExperimentStatus = z.infer<typeof ExperimentStatusSchema>;

export const DeploymentStatusSchema = z.enum([
  'not-verified',
  'matches-plan',
  'partially-matches',
  'does-not-match',
]);
export type DeploymentStatus = z.infer<typeof DeploymentStatusSchema>;

export const CloudProviderSchema = z.enum(['google-drive', 'yandex-disk']);
export type CloudProvider = z.infer<typeof CloudProviderSchema>;

export const PhotoRoleSchema = z.enum([
  'main-face',
  'full-body',
  'lifestyle',
  'social',
  'intellectual',
  'humor',
  'conversation-hook',
  'activity',
  'style',
  'emotional',
  'trust',
  'mystery',
  'other',
]);
export type PhotoRole = z.infer<typeof PhotoRoleSchema>;

export const PreflightStepIdSchema = z.enum([
  'own-profile',
  'dialogs',
  'matches',
  'likes',
  'reconciliation',
]);
export type PreflightStepId = z.infer<typeof PreflightStepIdSchema>;

export const PreflightStepStatusSchema = z.enum([
  'pending',
  'running',
  'completed',
  'failed',
  'skipped',
]);
export type PreflightStepStatus = z.infer<typeof PreflightStepStatusSchema>;

export const PreflightRunStatusSchema = z.enum([
  'running',
  'completed',
  'failed',
  'cancelled',
]);
export type PreflightRunStatus = z.infer<typeof PreflightRunStatusSchema>;

/* ---------------------------------------------------------------------- */
/* 7. Audience Model                                                       */
/* ---------------------------------------------------------------------- */

export const AudienceSignalSchema = z.object({
  id: z.string(),
  key: z.string(),
  statement: z.string(),
  polarity: AudienceSignalPolaritySchema,
  category: AudienceSignalCategorySchema.optional(),
  status: EvidenceStatusSchema,
  likelihood: EvidenceLikelihoodSchema,
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.string()).default([]),
  contradictions: z.array(z.string()).default([]),
  sourceRefs: z.array(z.string()).default([]),
  createdAt: z.string(),
  lastConfirmedAt: z.string().optional(),
});
export type AudienceSignal = z.infer<typeof AudienceSignalSchema>;

export const AudienceModelViewSchema = z.object({
  id: z.string(),
  version: z.number().int(),
  /** Short human label for this draft/version. */
  codeName: z.string().default(''),
  summary: z.string().default(''),
  positiveSignals: z.array(AudienceSignalSchema).default([]),
  negativeSignals: z.array(AudienceSignalSchema).default([]),
  hardRejects: z.array(AudienceSignalSchema).default([]),
  toleratedVariations: z.array(AudienceSignalSchema).default([]),
  visualCore: z.array(AudienceSignalSchema).default([]),
  presentationPatterns: z.array(AudienceSignalSchema).default([]),
  secondaryInterests: z.array(AudienceSignalSchema).default([]),
  /** Version provenance: default | user | user-confirmed | ai | … */
  source: z.string().default('user'),
  createdAt: z.string(),
  supersededAt: z.string().optional(),
});
export type AudienceModelView = z.infer<typeof AudienceModelViewSchema>;

export const AudienceDraftSignalInputSchema = z.object({
  key: z.string().min(1),
  statement: z.string().min(1),
  polarity: AudienceSignalPolaritySchema,
  category: AudienceSignalCategorySchema.optional(),
  status: EvidenceStatusSchema.default('claimed'),
  likelihood: EvidenceLikelihoodSchema.default('possible'),
  confidence: z.number().min(0).max(1).default(0.5),
  evidence: z.array(z.string()).default([]),
  contradictions: z.array(z.string()).default([]),
  sourceRefs: z.array(z.string()).default([]),
});
export type AudienceDraftSignalInput = z.infer<typeof AudienceDraftSignalInputSchema>;

export const AudienceDraftUpdateInputSchema = z.object({
  codeName: z.string().max(120).optional(),
  summary: z.string().max(4000).optional(),
  addSignals: z.array(AudienceDraftSignalInputSchema).default([]),
  removeSignalIds: z.array(z.string()).default([]),
});
export type AudienceDraftUpdateInput = z.infer<typeof AudienceDraftUpdateInputSchema>;

/** AI-derived Audience draft from Eurydice preferences / reference summary. */
export const AudienceFromEurydiceAnalysisSchema = z.object({
  summary: z.string().min(1).max(4000),
  /** Especially important / core signals (UI: ✓). */
  importantSignals: z.array(z.string().max(200)).default([]),
  /** Likes (UI: +). */
  positiveSignals: z.array(z.string().max(200)).default([]),
  /** Dislikes (UI: −). */
  negativeSignals: z.array(z.string().max(200)).default([]),
  /** Stop-signals / hard veto (UI: ✕). */
  hardRejects: z.array(z.string().max(200)).default([]),
});
export type AudienceFromEurydiceAnalysis = z.infer<
  typeof AudienceFromEurydiceAnalysisSchema
>;

export const AudienceFitAssessmentSchema = z.object({
  modelLabel: AudienceFitLabelSchema,
  modelScore: z.number(),
  modelConfidence: z.number().min(0).max(1),
  modelReasons: z.array(z.string()).default([]),
  finalLabel: AudienceFitLabelSchema,
  correctedByUser: z.boolean().default(false),
  correctionReasons: z.array(AudienceCorrectionReasonSchema).default([]),
  correctionComment: z.string().optional(),
  correctedAt: z.string().optional(),
});
export type AudienceFitAssessment = z.infer<typeof AudienceFitAssessmentSchema>;

export const AudienceCorrectionInputSchema = z.object({
  relationshipId: z.string().min(1),
  finalLabel: AudienceFitLabelSchema,
  correctionReasons: z.array(AudienceCorrectionReasonSchema).min(1),
  correctionComment: z.string().max(2000).optional(),
});
export type AudienceCorrectionInput = z.infer<typeof AudienceCorrectionInputSchema>;

/* ---------------------------------------------------------------------- */
/* 8. Identity Model                                                       */
/* ---------------------------------------------------------------------- */

export const IdentitySignalSchema = z.object({
  id: z.string(),
  key: z.string(),
  statement: z.string(),
  confidence: z.number().min(0).max(1),
  createdAt: z.string(),
});
export type IdentitySignal = z.infer<typeof IdentitySignalSchema>;

export const IdentityModelViewSchema = z.object({
  id: z.string(),
  version: z.number().int(),
  /** Short human label for this draft/version. */
  codeName: z.string().default(''),
  age: z.number().int().optional(),
  city: z.string().optional(),
  occupation: z.string().optional(),
  professionalArea: z.string().optional(),
  currentSelf: z.array(IdentitySignalSchema).default([]),
  amplifiableTraits: z.array(IdentitySignalSchema).default([]),
  desiredPresentation: z.array(IdentitySignalSchema).default([]),
  explicitNonIdentity: z.array(IdentitySignalSchema).default([]),
  realInterests: z.array(IdentitySignalSchema).default([]),
  lifestyle: z.array(IdentitySignalSchema).default([]),
  relationshipIntent: z.string().optional(),
  resources: z.array(z.string()).default([]),
  constraints: z.array(z.string()).default([]),
  authenticityRules: z.array(z.string()).default([]),
  positiveReferenceIds: z.array(z.string()).default([]),
  negativeReferenceIds: z.array(z.string()).default([]),
  aiSummary: z.string().default(''),
  userConfirmedAt: z.string().optional(),
  createdAt: z.string(),
  supersededAt: z.string().optional(),
});
export type IdentityModelView = z.infer<typeof IdentityModelViewSchema>;

export const IdentityDraftInputSchema = z.object({
  codeName: z.string().max(120).optional(),
  age: z.number().int().min(18).max(99).optional(),
  city: z.string().max(120).optional(),
  occupation: z.string().max(200).optional(),
  professionalArea: z.string().max(200).optional(),
  relationshipIntent: z.string().max(500).optional(),
  freeformText: z.string().max(4000).optional(),
  realInterests: z.array(z.string().max(200)).default([]),
  lifestyle: z.array(z.string().max(200)).default([]),
  explicitNonIdentity: z.array(z.string().max(200)).default([]),
  resources: z.array(z.string().max(200)).default([]),
  constraints: z.array(z.string().max(200)).default([]),
});
export type IdentityDraftInput = z.infer<typeof IdentityDraftInputSchema>;

/** Structured AI output when drafting Identity from a Twinby own-profile snapshot. */
export const IdentitySnapshotAnalysisSchema = z.object({
  age: z.number().int().min(18).max(99).nullable().optional(),
  city: z.string().max(120).nullable().optional(),
  occupation: z.string().max(200).nullable().optional(),
  professionalArea: z.string().max(200).nullable().optional(),
  relationshipIntent: z.string().max(500).nullable().optional(),
  freeformText: z.string().max(4000).nullable().optional(),
  realInterests: z.array(z.string().max(200)).default([]),
  lifestyle: z.array(z.string().max(200)).default([]),
  explicitNonIdentity: z.array(z.string().max(200)).default([]),
  resources: z.array(z.string().max(200)).default([]),
  constraints: z.array(z.string().max(200)).default([]),
  uncertainties: z.array(z.string().max(300)).default([]),
});
export type IdentitySnapshotAnalysis = z.infer<typeof IdentitySnapshotAnalysisSchema>;

export const AddIdentityReferenceInputSchema = z.object({
  polarity: z.enum(['positive', 'negative']),
  filePath: z.string().min(1),
  comment: z.string().max(500).optional(),
});
export type AddIdentityReferenceInput = z.infer<typeof AddIdentityReferenceInputSchema>;

export const IdentityConflictSchema = z.object({
  id: z.string(),
  profileVariantId: z.string().optional(),
  signal: z.string(),
  conflictingIdentityRuleId: z.string(),
  severity: z.enum(['warning', 'blocking']),
  explanation: z.string(),
});
export type IdentityConflict = z.infer<typeof IdentityConflictSchema>;

/* ---------------------------------------------------------------------- */
/* 9-10. Profile Strategy & Cloud photo library                            */
/* ---------------------------------------------------------------------- */

export const ProfileStrategyViewSchema = z.object({
  id: z.string(),
  name: z.string(),
  primaryTraits: z.array(z.string()).default([]),
  secondaryTraits: z.array(z.string()).default([]),
  suppressedTraits: z.array(z.string()).default([]),
  forbiddenSignals: z.array(z.string()).default([]),
  intendedFirstImpression: z.array(z.string()).default([]),
  intendedEmotionalTone: z.array(z.string()).default([]),
  intendedConversationHooks: z.array(z.string()).default([]),
  audienceModelVersion: z.number().int(),
  identityModelVersion: z.number().int(),
  userNotes: z.string().optional(),
  createdAt: z.string(),
});
export type ProfileStrategyView = z.infer<typeof ProfileStrategyViewSchema>;

export const CloudConnectionViewSchema = z.object({
  id: z.string(),
  provider: CloudProviderSchema,
  connected: z.boolean(),
  accountLabel: z.string().optional(),
  connectedAt: z.string().optional(),
  disconnectedAt: z.string().optional(),
  lastError: z.string().optional(),
  selectedFolderIds: z.array(z.string()).default([]),
  updatedAt: z.string(),
});
export type CloudConnectionView = z.infer<typeof CloudConnectionViewSchema>;

export const CloudFolderViewSchema = z.object({
  id: z.string(),
  connectionId: z.string(),
  provider: CloudProviderSchema,
  externalId: z.string(),
  name: z.string(),
  path: z.string().optional(),
  selected: z.boolean().default(false),
});
export type CloudFolderView = z.infer<typeof CloudFolderViewSchema>;

export const ConnectCloudInputSchema = z.object({
  accountLabel: z.string().max(200).optional(),
  /** One-shot: encrypted in main, never returned to renderer. */
  googleClientId: z.string().max(500).optional(),
  googleClientSecret: z.string().max(500).optional(),
  yandexOAuthToken: z.string().max(4000).optional(),
});
export type ConnectCloudInput = z.infer<typeof ConnectCloudInputSchema>;

export const CloudCredentialsStatusSchema = z.object({
  google: z.object({
    hasClientId: z.boolean(),
    hasClientSecret: z.boolean(),
    hasRefreshToken: z.boolean(),
  }),
  yandex: z.object({
    hasOAuthToken: z.boolean(),
  }),
});
export type CloudCredentialsStatus = z.infer<typeof CloudCredentialsStatusSchema>;

export const SaveCloudCredentialsInputSchema = z.object({
  googleClientId: z.string().max(500).optional(),
  googleClientSecret: z.string().max(500).optional(),
  yandexOAuthToken: z.string().max(4000).optional(),
});
export type SaveCloudCredentialsInput = z.infer<
  typeof SaveCloudCredentialsInputSchema
>;

export const SetSelectedFoldersInputSchema = z.object({
  provider: CloudProviderSchema,
  folderIds: z.array(z.string()).default([]),
});
export type SetSelectedFoldersInput = z.infer<typeof SetSelectedFoldersInputSchema>;

export const IndexedPhotoAssetViewSchema = z.object({
  id: z.string(),
  provider: CloudProviderSchema,
  externalFileId: z.string(),
  externalPath: z.string().optional(),
  fileName: z.string(),
  sourceModifiedAt: z.string(),
  sourceSizeBytes: z.number().int().optional(),
  checksum: z.string().optional(),
  perceptualHash: z.string(),
  localPreviewPath: z.string(),
  originalCachePath: z.string().optional(),
  embeddingModel: z.string().optional(),
  embeddingVersion: z.string().optional(),
  shortDescription: z.string().default(''),
  observedSignals: z.array(z.string()).default([]),
  possibleRoles: z.array(PhotoRoleSchema).default([]),
  risks: z.array(z.string()).default([]),
  peopleCount: z.number().int().optional(),
  faceVisibility: z.number().min(0).max(1).default(0),
  bodyVisibility: z.number().min(0).max(1).default(0),
  technicalQuality: z.number().min(0).max(1).default(0),
  indexedAt: z.string(),
  deletedFromIndexAt: z.string().optional(),
});
export type IndexedPhotoAssetView = z.infer<typeof IndexedPhotoAssetViewSchema>;

export const PhotoSearchInputSchema = z.object({
  query: z.string().min(1).max(500),
  providers: z.array(CloudProviderSchema).optional(),
  limit: z.number().int().min(1).max(100).default(30),
  includeDeleted: z.boolean().default(false),
});
export type PhotoSearchInput = z.infer<typeof PhotoSearchInputSchema>;

export const PhotoSearchResultSchema = z.object({
  query: z.string(),
  items: z.array(IndexedPhotoAssetViewSchema),
  totalIndexed: z.number().int().nonnegative(),
  searchedAt: z.string(),
});
export type PhotoSearchResult = z.infer<typeof PhotoSearchResultSchema>;

export const CloudIndexStatusViewSchema = z.object({
  totalIndexed: z.number().int().nonnegative(),
  byProvider: z.record(z.number().int().nonnegative()),
  connections: z.array(CloudConnectionViewSchema),
  /** ISO timestamps when «просмотр хранилища» finished per provider. */
  browsedAtByProvider: z.record(z.string()).default({}),
  /** Short AI summary of the library after browse, per provider. */
  browseSummaryByProvider: z.record(z.string()).default({}),
  /**
   * Last discovered photo totals in cloud (capped at index limit), per provider.
   * Filled after «Проиндексировать» / discoverStorage.
   */
  discoveredTotalByProvider: z.record(z.number().int().nonnegative()).default({}),
  /**
   * How many of the currently discovered cloud file IDs are already in the local index.
   * Identity-based (not totalIndexed − discovered).
   */
  matchedIndexedByProvider: z.record(z.number().int().nonnegative()).default({}),
  /**
   * Discovered cloud file IDs that are not in the local index yet.
   * Drives the «Просмотреть N фото» button.
   */
  remainingByProvider: z.record(z.number().int().nonnegative()).default({}),
  lastSearchAt: z.string().optional(),
  errors: z.array(z.string()).default([]),
});
export type CloudIndexStatusView = z.infer<typeof CloudIndexStatusViewSchema>;

export const DiscoverCloudStorageInputSchema = z.object({
  provider: CloudProviderSchema,
});
export type DiscoverCloudStorageInput = z.infer<
  typeof DiscoverCloudStorageInputSchema
>;

export const DiscoverCloudStorageResultSchema = z.object({
  provider: CloudProviderSchema,
  /** Photos found in selected folders / disk (capped). */
  discoveredTotal: z.number().int().nonnegative(),
  alreadyIndexed: z.number().int().nonnegative(),
  remaining: z.number().int().nonnegative(),
});
export type DiscoverCloudStorageResult = z.infer<
  typeof DiscoverCloudStorageResultSchema
>;

export const BrowseCloudStorageInputSchema = z.object({
  provider: CloudProviderSchema,
  /** Batch size for AI describe + index (small steps). */
  limit: z.number().int().min(1).max(500).default(15),
  /** Skip files already present in the local index. */
  skipIndexed: z.boolean().default(true),
});
export type BrowseCloudStorageInput = z.infer<typeof BrowseCloudStorageInputSchema>;

export const BrowseCloudStorageResultSchema = z.object({
  provider: CloudProviderSchema,
  indexedCount: z.number().int().nonnegative(),
  describedCount: z.number().int().nonnegative().default(0),
  /** Running total for this provider after the batch. */
  totalIndexed: z.number().int().nonnegative().default(0),
  discoveredTotal: z.number().int().nonnegative().default(0),
  remaining: z.number().int().nonnegative().default(0),
  browsedAt: z.string(),
  errors: z.array(z.string()).default([]),
});
export type BrowseCloudStorageResult = z.infer<
  typeof BrowseCloudStorageResultSchema
>;

/** Pushed from main when cloud photo indexing finishes (user may be on another page). */
export const CloudIndexFinishedEventSchema = z.object({
  provider: CloudProviderSchema,
  ok: z.boolean(),
  indexedCount: z.number().int().nonnegative().default(0),
  describedCount: z.number().int().nonnegative().default(0),
  message: z.string(),
  errors: z.array(z.string()).default([]),
  finishedAt: z.string(),
});
export type CloudIndexFinishedEvent = z.infer<
  typeof CloudIndexFinishedEventSchema
>;

export const SuggestPhotosInputSchema = z.object({
  profileSetId: z.string().optional(),
  setName: z.string().max(200).optional(),
  brief: z.string().max(4000).optional(),
  desiredPhotoVision: z.string().max(4000).optional(),
  limit: z.number().int().min(1).max(6).default(6),
  providers: z.array(CloudProviderSchema).optional(),
});
export type SuggestPhotosInput = z.infer<typeof SuggestPhotosInputSchema>;

export const SuggestPhotosResultSchema = z.object({
  needsStorage: z.boolean(),
  photos: z.array(IndexedPhotoAssetViewSchema).default([]),
  /** photoId → data URL (or null if preview could not be built). */
  previews: z.record(z.string().nullable()).default({}),
  message: z.string().optional(),
});
export type SuggestPhotosResult = z.infer<typeof SuggestPhotosResultSchema>;

export const PhotoLookGroupViewSchema = z.object({
  id: z.string(),
  name: z.string(),
  brief: z.string().default(''),
  moodTags: z.array(z.string()).default([]),
  photoIds: z.array(z.string()).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type PhotoLookGroupView = z.infer<typeof PhotoLookGroupViewSchema>;

export const GetPhotoPreviewResultSchema = z.object({
  photoId: z.string(),
  dataUrl: z.string().nullable(),
});
export type GetPhotoPreviewResult = z.infer<typeof GetPhotoPreviewResultSchema>;

/* ---------------------------------------------------------------------- */
/* 13-14. Profile Builder & Photo Plan                                     */
/* ---------------------------------------------------------------------- */

export const AuthenticityAssessmentSchema = z.object({
  identityPreservationScore: z.number().min(0).max(1),
  strategyAmplificationScore: z.number().min(0).max(1),
  directlySupportedSignalCount: z.number().int().nonnegative(),
  amplifiedSignalCount: z.number().int().nonnegative(),
  misleadingSignalCount: z.number().int().nonnegative(),
  fabricatedSignalCount: z.number().int().nonnegative(),
  blockingConflicts: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
});
export type AuthenticityAssessment = z.infer<typeof AuthenticityAssessmentSchema>;

export const MetricRangeSchema = z.object({
  low: z.number(),
  median: z.number().optional(),
  high: z.number(),
});
export type MetricRange = z.infer<typeof MetricRangeSchema>;

export const ExpectedPerformanceSchema = z.object({
  incomingLikesPerDay: MetricRangeSchema.optional(),
  targetIncomingLikesPerDay: MetricRangeSchema.optional(),
  matchesPerSession: MetricRangeSchema.optional(),
  targetMatchesPerSession: MetricRangeSchema.optional(),
  telegramConversion: MetricRangeSchema.optional(),
  confidence: z.number().min(0).max(1),
  assumptions: z.array(z.string()).default([]),
});
export type ExpectedPerformance = z.infer<typeof ExpectedPerformanceSchema>;

export const ProfileGenerationConstraintsSchema = z.object({
  pinnedPhotoIds: z.array(z.string()).default([]),
  forbiddenPhotoIds: z.array(z.string()).default([]),
  allowedMainPhotoIds: z.array(z.string()).optional(),
  pinnedBio: z.string().max(2000).optional(),
  pinnedStrategyId: z.string().optional(),
  freeformNote: z.string().max(2000).optional(),
});
export type ProfileGenerationConstraints = z.infer<
  typeof ProfileGenerationConstraintsSchema
>;

export const ProposedProfileSetSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Short profile text for Twinby bio field. */
  bio: z.string(),
  /** Strategy brief: what this type should convey / what to put into the set. */
  brief: z.string().default(''),
  /** What photos should look like for this type (mood / story / roles). */
  desiredPhotoVision: z.string().default(''),
  strategy: ProfileStrategyViewSchema,
  photoIds: z.array(z.string()),
  photoRoles: z.array(
    z.object({
      photoId: z.string(),
      role: PhotoRoleSchema,
      explanation: z.string(),
    }),
  ),
  strengths: z.array(z.string()).default([]),
  weaknesses: z.array(z.string()).default([]),
  killerFeatures: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  authenticityAssessment: AuthenticityAssessmentSchema,
  expectedPerformance: ExpectedPerformanceSchema,
});
export type ProposedProfileSet = z.infer<typeof ProposedProfileSetSchema>;

export const RegenerateAllInputSchema = z.object({
  constraints: ProfileGenerationConstraintsSchema.optional(),
});
export type RegenerateAllInput = z.infer<typeof RegenerateAllInputSchema>;

export const RegeneratePhotosKeepIdeaInputSchema = z.object({
  profileSetId: z.string().min(1),
  constraints: ProfileGenerationConstraintsSchema.optional(),
});
export type RegeneratePhotosKeepIdeaInput = z.infer<
  typeof RegeneratePhotosKeepIdeaInputSchema
>;

export const ReorderKeepPhotosInputSchema = z.object({
  profileSetId: z.string().min(1),
  photoIds: z.array(z.string()).min(1),
});
export type ReorderKeepPhotosInput = z.infer<typeof ReorderKeepPhotosInputSchema>;

export const SaveVariantInputSchema = z.object({
  profileSetId: z.string().optional(),
  name: z.string().min(1).max(200),
  strategyId: z.string().optional(),
  bio: z.string().min(1).max(2000),
  hypothesis: z.string().max(2000).default(''),
  photoIds: z.array(z.string()).default([]),
  photoRoles: z
    .array(
      z.object({
        photoId: z.string(),
        role: PhotoRoleSchema,
        explanation: z.string().optional(),
      }),
    )
    .default([]),
  createdAgainstAudienceVersion: z.number().int().default(0),
  createdAgainstIdentityVersion: z.number().int().default(0),
  expectedPerformance: ExpectedPerformanceSchema.optional(),
});
export type SaveVariantInput = z.infer<typeof SaveVariantInputSchema>;

export const ProfileVariantViewSchema = z.object({
  id: z.string(),
  version: z.number().int(),
  name: z.string(),
  status: ProfileVariantStatusSchema,
  strategyId: z.string().optional(),
  bio: z.string(),
  hypothesis: z.string().default(''),
  changeSetId: z.string().optional(),
  photoIds: z.array(z.string()).default([]),
  createdAgainstAudienceVersion: z.number().int().default(0),
  createdAgainstIdentityVersion: z.number().int().default(0),
  authenticityAssessment: AuthenticityAssessmentSchema.optional(),
  expectedPerformance: ExpectedPerformanceSchema.optional(),
  verifiedSnapshotId: z.string().optional(),
  createdAt: z.string(),
  activatedAt: z.string().optional(),
  deactivatedAt: z.string().optional(),
  archivedAt: z.string().optional(),
});
export type ProfileVariantView = z.infer<typeof ProfileVariantViewSchema>;

export const AuditVariantInputSchema = z.object({
  profileVariantId: z.string().min(1),
});
export type AuditVariantInput = z.infer<typeof AuditVariantInputSchema>;

export const ProfileAssessmentViewSchema = z.object({
  id: z.string(),
  profileVariantId: z.string().optional(),
  coherence: z.number().min(0).max(1),
  authenticity: z.number().min(0).max(1),
  targetAudienceAlignment: z.number().min(0).max(1),
  firstImpressionStrength: z.number().min(0).max(1),
  conversationHookStrength: z.number().min(0).max(1),
  dominantSignals: z.array(z.string()).default([]),
  conflictingSignals: z.array(z.string()).default([]),
  repeatedSignals: z.array(z.string()).default([]),
  missingRoles: z.array(z.string()).default([]),
  createdAt: z.string(),
});
export type ProfileAssessmentView = z.infer<typeof ProfileAssessmentViewSchema>;

export const PhotoTaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  goal: z.string(),
  targetRole: PhotoRoleSchema,
  strategyId: z.string().optional(),
  expectedImpact: z.enum(['low', 'medium', 'high']),
  effort: z.object({
    money: z.enum(['none', 'low', 'medium', 'high']),
    time: z.enum(['low', 'medium', 'high']),
    coordination: z.enum(['low', 'medium', 'high']),
  }),
  feasibility: z.number().min(0).max(1),
  locationIdea: z.string().default(''),
  timeOfDayIdea: z.string().optional(),
  clothingIdea: z.string().default(''),
  poseIdea: z.string().default(''),
  emotionIdea: z.string().default(''),
  photographerIdea: z.string().default(''),
  minimalVersion: z.string().default(''),
  improvedVersion: z.string().default(''),
  whyNeeded: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
});
export type PhotoTask = z.infer<typeof PhotoTaskSchema>;

export const PhotoPlanViewSchema = z.object({
  id: z.string(),
  profileVariantId: z.string().optional(),
  tasks: z.array(PhotoTaskSchema).default([]),
  createdAt: z.string(),
});
export type PhotoPlanView = z.infer<typeof PhotoPlanViewSchema>;

export const CreatePhotoPlanInputSchema = z.object({
  profileVariantId: z.string().optional(),
});
export type CreatePhotoPlanInput = z.infer<typeof CreatePhotoPlanInputSchema>;

export const RequestPhotoEditPreviewInputSchema = z.object({
  photoAssetId: z.string().min(1),
  editKind: z.enum([
    'crop',
    'exposure',
    'white-balance',
    'horizon',
    'noise',
    'background-blur',
  ]),
});
export type RequestPhotoEditPreviewInput = z.infer<
  typeof RequestPhotoEditPreviewInputSchema
>;

export const PhotoEditPreviewViewSchema = z.object({
  photoAssetId: z.string(),
  editKind: z.string(),
  previewPath: z.string().optional(),
  expectedEffect: z.string(),
  risk: z.string(),
});
export type PhotoEditPreviewView = z.infer<typeof PhotoEditPreviewViewSchema>;

/* ---------------------------------------------------------------------- */
/* 18. Verified profile snapshot                                           */
/* ---------------------------------------------------------------------- */

export const VerifiedProfileSnapshotViewSchema = z.object({
  id: z.string(),
  profileVariantId: z.string().optional(),
  capturedAt: z.string(),
  photos: z.array(
    z.object({
      position: z.number().int(),
      localPreviewPath: z.string(),
      perceptualHash: z.string(),
      matchedPhotoAssetId: z.string().optional(),
      matchConfidence: z.number().min(0).max(1).optional(),
    }),
  ).default([]),
  bio: z.string(),
  occupation: z.string().optional(),
  interests: z.array(z.string()).default([]),
  relationshipGoal: z.string().optional(),
  plannedSimilarity: z.number().min(0).max(1).optional(),
  differencesFromPlan: z.array(z.string()).default([]),
  deploymentStatus: DeploymentStatusSchema,
  source: z.literal('twinby-profile-capture'),
});
export type VerifiedProfileSnapshotView = z.infer<
  typeof VerifiedProfileSnapshotViewSchema
>;

/** Result of own-profile capture (§19.1): immutable snapshot only when changed. */
export const OwnProfileCaptureResultViewSchema = z.object({
  snapshot: VerifiedProfileSnapshotViewSchema,
  changed: z.boolean(),
  reason: z.string().optional(),
  pendingProfileChange: z.boolean().default(false),
});
export type OwnProfileCaptureResultView = z.infer<
  typeof OwnProfileCaptureResultViewSchema
>;

/**
 * Detected Twinby profile change while an experiment is running (§24.5).
 * Auto-stop only after user confirms the change was intentional.
 */
export const PendingProfileChangeViewSchema = z.object({
  experimentId: z.string(),
  previousSnapshotId: z.string().optional(),
  newSnapshotId: z.string(),
  reason: z.string(),
  detectedAt: z.string(),
});
export type PendingProfileChangeView = z.infer<
  typeof PendingProfileChangeViewSchema
>;

export const ResolvePendingProfileChangeInputSchema = z.object({
  /** true = intentional change → stop experiment; false = keep experiment. */
  intentional: z.boolean(),
  reason: z.string().max(2000).optional(),
});
export type ResolvePendingProfileChangeInput = z.infer<
  typeof ResolvePendingProfileChangeInputSchema
>;

export const CompareToPlanInputSchema = z.object({
  snapshotId: z.string().min(1),
  /** Defaults to open experiment / active / latest variant. */
  profileVariantId: z.string().min(1).optional(),
});
export type CompareToPlanInput = z.infer<typeof CompareToPlanInputSchema>;

/* ---------------------------------------------------------------------- */
/* 24-25. Experiments & metrics                                            */
/* ---------------------------------------------------------------------- */

export const ExperimentMetricsViewSchema = z.object({
  activeDays: z.number().int().nonnegative().default(0),
  eurydiceSessions: z.number().int().nonnegative().default(0),
  incomingLikes: z.number().int().nonnegative().default(0),
  targetIncomingLikes: z.number().int().nonnegative().default(0),
  matches: z.number().int().nonnegative().default(0),
  targetMatches: z.number().int().nonnegative().default(0),
  conversations: z.number().int().nonnegative().default(0),
  substantiveConversations: z.number().int().nonnegative().default(0),
  telegramExchanges: z.number().int().nonnegative().default(0),
  dateProposed: z.number().int().nonnegative().default(0),
  dateScheduled: z.number().int().nonnegative().default(0),
  dateCompleted: z.number().int().nonnegative().default(0),
});
export type ExperimentMetricsView = z.infer<typeof ExperimentMetricsViewSchema>;

export const ExperimentPreFeedbackSchema = z.object({
  experimentId: z.string(),
  botExpectation: z.string().default(''),
  botExpectedMetrics: ExpectedPerformanceSchema,
  userExpectedOutcome: z.string().default(''),
  userExpectedMetrics: ExpectedPerformanceSchema.partial().optional(),
  userAuthenticityRating: z.number().min(0).max(1).optional(),
  userNotes: z.string().optional(),
});
export type ExperimentPreFeedback = z.infer<typeof ExperimentPreFeedbackSchema>;

export const SavePreFeedbackInputSchema = z.object({
  experimentId: z.string().min(1),
  userExpectedOutcome: z.string().max(2000),
  userExpectedMetrics: ExpectedPerformanceSchema.partial().optional(),
  userAuthenticityRating: z.number().min(0).max(1).optional(),
  userNotes: z.string().max(2000).optional(),
});
export type SavePreFeedbackInput = z.infer<typeof SavePreFeedbackInputSchema>;

export const ExperimentPostFeedbackSchema = z.object({
  experimentId: z.string(),
  actualOutcomeSummary: z.string().default(''),
  expectationsMatched: z.boolean().default(false),
  audienceQualityRating: z.number().min(0).max(1).optional(),
  comfortRating: z.number().min(0).max(1).optional(),
  wouldReuse: z.boolean().optional(),
  userInterpretation: z.string().optional(),
});
export type ExperimentPostFeedback = z.infer<typeof ExperimentPostFeedbackSchema>;

export const SavePostFeedbackInputSchema = z.object({
  experimentId: z.string().min(1),
  actualOutcomeSummary: z.string().max(2000),
  expectationsMatched: z.boolean(),
  audienceQualityRating: z.number().min(0).max(1).optional(),
  comfortRating: z.number().min(0).max(1).optional(),
  wouldReuse: z.boolean().optional(),
  userInterpretation: z.string().max(2000).optional(),
});
export type SavePostFeedbackInput = z.infer<typeof SavePostFeedbackInputSchema>;

export const CreateExperimentInputSchema = z.object({
  profileVariantId: z.string().min(1),
  minDurationDays: z.number().int().min(1).max(30).default(3),
  targetDurationDays: z.number().int().min(1).max(30).default(5),
  maxDurationDays: z.number().int().min(1).max(60).default(7),
});
export type CreateExperimentInput = z.infer<typeof CreateExperimentInputSchema>;

/** Create a baseline experiment from the current Twinby verified snapshot. */
export const CreateExperimentFromSnapshotInputSchema = z.object({
  /** Defaults to the latest active verified snapshot. */
  snapshotId: z.string().min(1).optional(),
  minDurationDays: z.number().int().min(1).max(30).default(3),
  targetDurationDays: z.number().int().min(1).max(30).default(5),
  maxDurationDays: z.number().int().min(1).max(60).default(7),
});
export type CreateExperimentFromSnapshotInput = z.input<
  typeof CreateExperimentFromSnapshotInputSchema
>;

export const ExperimentCompletionReasonSchema = z.enum([
  'completed',
  'stopped-early-positive',
  'stopped-early-negative',
  'stopped-by-user',
  'stopped-profile-changed',
  'insufficient-data',
]);
export type ExperimentCompletionReason = z.infer<
  typeof ExperimentCompletionReasonSchema
>;

export const CompleteExperimentInputSchema = z.object({
  experimentId: z.string().min(1),
  reason: ExperimentCompletionReasonSchema,
});
export type CompleteExperimentInput = z.infer<typeof CompleteExperimentInputSchema>;

export const ConfirmProfileChangeInputSchema = z.object({
  experimentId: z.string().min(1),
  newProfileVariantId: z.string().min(1),
  reason: z.string().max(2000).optional(),
});
export type ConfirmProfileChangeInput = z.infer<
  typeof ConfirmProfileChangeInputSchema
>;

export const ProfileExperimentViewSchema = z.object({
  id: z.string(),
  profileVariantId: z.string(),
  status: ExperimentStatusSchema,
  minDurationDays: z.number().int(),
  targetDurationDays: z.number().int(),
  maxDurationDays: z.number().int(),
  /** True when started with partially-matches deployment (§18.5). */
  imperfectDeployment: z.boolean().default(false),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  completionReason: ExperimentCompletionReasonSchema.optional(),
  preFeedback: ExperimentPreFeedbackSchema.optional(),
  postFeedback: ExperimentPostFeedbackSchema.optional(),
  metrics: ExperimentMetricsViewSchema.optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ProfileExperimentView = z.infer<typeof ProfileExperimentViewSchema>;

export const StartExperimentInputSchema = z.object({
  experimentId: z.string().min(1),
  /** Required when active snapshot is only partially-matches. */
  allowImperfectDeployment: z.boolean().default(false),
});
export type StartExperimentInput = z.input<typeof StartExperimentInputSchema>;

export const ResolvePendingProfileChangeResultSchema = z.object({
  pendingCleared: z.boolean(),
  experiment: ProfileExperimentViewSchema.optional(),
  newVariantId: z.string().optional(),
  message: z.string(),
});
export type ResolvePendingProfileChangeResult = z.infer<
  typeof ResolvePendingProfileChangeResultSchema
>;

export const CompareExperimentsInputSchema = z.object({
  experimentIds: z.array(z.string()).min(1).max(10),
});
export type CompareExperimentsInput = z.infer<typeof CompareExperimentsInputSchema>;

export const RecommendStopViewSchema = z.object({
  experimentId: z.string(),
  recommendation: z.enum([
    'stop-positive',
    'stop-negative',
    'continue',
    'extend',
    'revert',
  ]),
  explanation: z.string(),
  confidence: z.number().min(0).max(1),
});
export type RecommendStopView = z.infer<typeof RecommendStopViewSchema>;

/* ---------------------------------------------------------------------- */
/* 21-23. Relationships                                                    */
/* ---------------------------------------------------------------------- */

export const RelationshipViewSchema = z.object({
  id: z.string(),
  candidateIdentityId: z.string(),
  origin: RelationshipOriginSchema,
  currentStage: RelationshipStageSchema,
  audienceFit: AudienceFitAssessmentSchema,
  attributedProfileSnapshotId: z.string().optional(),
  attributedProfileVariantId: z.string().optional(),
  experimentId: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type RelationshipView = z.infer<typeof RelationshipViewSchema>;

export const RelationshipEventViewSchema = z.object({
  id: z.string(),
  relationshipId: z.string(),
  type: RelationshipEventTypeSchema,
  occurredAt: z.string(),
  source: z.enum(['twinby-scan', 'user-feedback']),
  metadata: z.record(z.unknown()).optional(),
});
export type RelationshipEventView = z.infer<typeof RelationshipEventViewSchema>;

export const SetRelationshipStageInputSchema = z.object({
  relationshipId: z.string().min(1),
  stage: RelationshipStageSchema,
  comment: z.string().max(1000).optional(),
});
export type SetRelationshipStageInput = z.infer<typeof SetRelationshipStageInputSchema>;

export const CloseRelationshipInputSchema = z.object({
  relationshipId: z.string().min(1),
  reason: z.string().max(1000).optional(),
});
export type CloseRelationshipInput = z.infer<typeof CloseRelationshipInputSchema>;

export const ListRelationshipsQuerySchema = z.object({
  stage: RelationshipStageSchema.optional(),
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).default(0),
});
export type ListRelationshipsQuery = z.infer<typeof ListRelationshipsQuerySchema>;

/* ---------------------------------------------------------------------- */
/* 19. Preflight                                                           */
/* ---------------------------------------------------------------------- */

export const PreflightStepViewSchema = z.object({
  id: z.string(),
  runId: z.string(),
  stepId: PreflightStepIdSchema,
  status: PreflightStepStatusSchema,
  position: z.number().int(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  summary: z.string().optional(),
  error: z.string().optional(),
});
export type PreflightStepView = z.infer<typeof PreflightStepViewSchema>;

export const PreflightRunViewSchema = z.object({
  id: z.string(),
  startedAt: z.string(),
  completedAt: z.string().optional(),
  status: PreflightRunStatusSchema,
  overrideUsed: z.boolean().default(false),
  overrideReason: z.string().optional(),
  steps: z.array(PreflightStepViewSchema).default([]),
  /** Set when own-profile step detected a Twinby change (§19.1). */
  profileChanged: z.boolean().optional(),
  profileChangeReason: z.string().optional(),
  pendingProfileChange: PendingProfileChangeViewSchema.optional(),
});
export type PreflightRunView = z.infer<typeof PreflightRunViewSchema>;

export const RunPreflightInputSchema = z.object({
  override: z.boolean().default(false),
  overrideReason: z.string().max(500).optional(),
});
export type RunPreflightInput = z.infer<typeof RunPreflightInputSchema>;

export interface DesktopApi {
  app: {
    ping(input: PingRequest): Promise<PingResponse>;
    getInfo(): Promise<AppInfo>;
    /** Reveal a local file/folder in the OS file manager. */
    showPathInFolder(path: string): Promise<{ ok: true }>;
  };
  legal: {
    getConsentText(): Promise<{ version: string; text: string }>;
    getLatestConsent(): Promise<LegalConsent | null>;
    acceptConsent(input: AcceptConsentInput): Promise<LegalConsent>;
  };
  database: {
    health(): Promise<DatabaseHealth>;
  };
  ai: {
    getConfig(): Promise<AiConfig>;
    saveConfig(input: AiConfigInput): Promise<AiConfig>;
    listModels(): Promise<AiModel[]>;
    testTextConnection(): Promise<AiConnectionTest>;
    testVisionConnection(): Promise<AiVisionTest>;
    getCapabilities(model?: string): Promise<ModelCapabilities | null>;
    analyzeReferences(force?: boolean): Promise<StoredPreferenceSummary>;
  };
  preferences: {
    get(): Promise<PreferenceProfile>;
    save(input: PreferenceProfileInput): Promise<PreferenceProfile>;
    listReferences(): Promise<ReferenceImage[]>;
    addReference(input: AddReferenceInput): Promise<ReferenceImage[]>;
    updateReference(input: UpdateReferenceInput): Promise<ReferenceImage>;
    removeReference(id: string): Promise<void>;
    getSummary(): Promise<StoredPreferenceSummary | null>;
    saveSummary(summary: PreferenceSummary): Promise<StoredPreferenceSummary>;
  };
  sessions: {
    start(input?: StartSessionInput): Promise<SessionViewState>;
    pause(): Promise<SessionViewState>;
    resume(): Promise<SessionViewState>;
    stop(): Promise<SessionViewState>;
    getState(): Promise<SessionViewState>;
  };
  review: {
    confirm(input: ReviewDecisionInput): Promise<SessionViewState>;
    skip(captureId: string): Promise<SessionViewState>;
  };
  history: {
    list(input?: HistoryQuery): Promise<PaginatedHistory>;
    listSessions(): Promise<HistorySessionSummary[]>;
    listSessionProfiles(
      input: HistorySessionProfilesQuery,
    ): Promise<PaginatedHistorySessionProfiles>;
    saveProfileFeedback(input: SaveHistoryProfileFeedback): Promise<HistorySessionProfile>;
    submitSessionFeedback(input: SubmitSessionFeedback): Promise<SessionFeedbackAnalysis>;
    applySessionFeedback(input: ApplySessionFeedback): Promise<PreferenceProfile>;
    deleteSession(input: DeleteHistorySession): Promise<void>;
  };
  environment: {
    runDoctor(): Promise<EnvironmentReport>;
    listAvds(): Promise<AndroidVirtualDevice[]>;
    listDevices(): Promise<AndroidDevice[]>;
  };
  appium: {
    getStatus(): Promise<AppiumServerStatus>;
    startServer(): Promise<AppiumServerStatus>;
    stopServer(): Promise<AppiumServerStatus>;
    createSession(input: CreateAppiumSessionInput): Promise<AppiumSessionInfo>;
    endSession(): Promise<void>;
    getSession(): Promise<AppiumSessionInfo | null>;
    takeScreenshot(): Promise<AppiumScreenshot>;
    getPageSource(): Promise<AppiumPageSource>;
    getWindowRect(): Promise<AppiumWindowRect>;
  };
  twinby: {
    detectPackage(): Promise<TwinbyPackageInfo>;
    getLocatorProfile(): Promise<LocatorProfile | null>;
    detectScreen(pageSource?: string): Promise<DetectedScreen>;
    captureDiscoverySnapshot(): Promise<DiscoverySnapshot>;
    captureCurrentProfile(options?: CaptureProfileOptions): Promise<CapturedProfile>;
    cleanupCapture(observationId: string): Promise<void>;
    getSessionLimits(): Promise<SessionLimits>;
    saveSessionLimits(input: Partial<SessionLimits>): Promise<SessionLimits>;
  };
  audience: {
    getCurrent(): Promise<AudienceModelView>;
    listVersions(): Promise<AudienceModelView[]>;
    deleteVersion(id: string): Promise<void>;
    /** Make a past version the current confirmed Audience. */
    activateVersion(id: string): Promise<AudienceModelView>;
    updateDraft(input: AudienceDraftUpdateInput): Promise<AudienceModelView>;
    confirmUpdate(): Promise<AudienceModelView>;
    applyCorrection(input: AudienceCorrectionInput): Promise<RelationshipView>;
    deriveFromEurydice(): Promise<AudienceModelView>;
  };
  identity: {
    getCurrent(): Promise<IdentityModelView>;
    listVersions(): Promise<IdentityModelView[]>;
    deleteVersion(id: string): Promise<void>;
    /** Make a past version the current confirmed Identity. */
    activateVersion(id: string): Promise<IdentityModelView>;
    createDraft(input: IdentityDraftInput): Promise<IdentityModelView>;
    analyzeCurrentProfile(): Promise<IdentityModelView>;
    addReference(input: AddIdentityReferenceInput): Promise<IdentityModelView>;
    removeReference(id: string): Promise<IdentityModelView>;
    confirm(): Promise<IdentityModelView>;
  };
  cloud: {
    listConnections(): Promise<CloudConnectionView[]>;
    getCredentialsStatus(): Promise<CloudCredentialsStatus>;
    saveCredentials(input: SaveCloudCredentialsInput): Promise<CloudCredentialsStatus>;
    clearCredentials(provider: CloudProvider): Promise<CloudCredentialsStatus>;
    connectGoogle(input?: ConnectCloudInput): Promise<CloudConnectionView>;
    connectYandex(input?: ConnectCloudInput): Promise<CloudConnectionView>;
    disconnect(provider: CloudProvider): Promise<void>;
    listFolders(provider: CloudProvider): Promise<CloudFolderView[]>;
    setSelectedFolders(input: SetSelectedFoldersInput): Promise<CloudConnectionView>;
    searchPhotos(input: PhotoSearchInput): Promise<PhotoSearchResult>;
    getIndexStatus(): Promise<CloudIndexStatusView>;
    discoverStorage(
      input: DiscoverCloudStorageInput,
    ): Promise<DiscoverCloudStorageResult>;
    browseStorage(input: BrowseCloudStorageInput): Promise<BrowseCloudStorageResult>;
    deleteIndexedPhoto(id: string): Promise<void>;
    getPhotoPreview(photoId: string): Promise<GetPhotoPreviewResult>;
    /** Subscribe to indexing-finished push; returns unsubscribe. */
    onIndexFinished(
      callback: (event: CloudIndexFinishedEvent) => void,
    ): () => void;
  };
  orpheus: {
    generateProfileSets(
      input?: ProfileGenerationConstraints,
    ): Promise<ProposedProfileSet[]>;
    regenerateAll(input?: RegenerateAllInput): Promise<ProposedProfileSet[]>;
    regeneratePhotosKeepIdea(
      input: RegeneratePhotosKeepIdeaInput,
    ): Promise<ProposedProfileSet>;
    reorderKeepPhotos(input: ReorderKeepPhotosInput): Promise<ProposedProfileSet>;
    suggestPhotos(input?: SuggestPhotosInput): Promise<SuggestPhotosResult>;
    saveVariant(input: SaveVariantInput): Promise<ProfileVariantView>;
    auditVariant(input: AuditVariantInput): Promise<ProfileAssessmentView>;
    createPhotoPlan(input?: CreatePhotoPlanInput): Promise<PhotoPlanView>;
    requestPhotoEditPreview(
      input: RequestPhotoEditPreviewInput,
    ): Promise<PhotoEditPreviewView>;
  };
  profileSnapshot: {
    capture(): Promise<OwnProfileCaptureResultView>;
    getActive(): Promise<VerifiedProfileSnapshotView | null>;
    list(): Promise<VerifiedProfileSnapshotView[]>;
    compareToPlan(input: CompareToPlanInput): Promise<VerifiedProfileSnapshotView>;
    /** Variant used as Orpheus plan for deployment verification. */
    resolvePlanVariant(): Promise<ProfileVariantView | null>;
    delete(id: string): Promise<void>;
  };
  experiment: {
    create(input: CreateExperimentInput): Promise<ProfileExperimentView>;
    /** Baseline test from current Twinby snapshot (variant + experiment draft). */
    createFromSnapshot(
      input?: CreateExperimentFromSnapshotInput,
    ): Promise<ProfileExperimentView>;
    savePreFeedback(input: SavePreFeedbackInput): Promise<ProfileExperimentView>;
    start(input: StartExperimentInput | string): Promise<ProfileExperimentView>;
    getActive(): Promise<ProfileExperimentView | null>;
    recommendStop(experimentId: string): Promise<RecommendStopView>;
    complete(input: CompleteExperimentInput): Promise<ProfileExperimentView>;
    confirmProfileChange(
      input: ConfirmProfileChangeInput,
    ): Promise<ProfileExperimentView>;
    getPendingProfileChange(): Promise<PendingProfileChangeView | null>;
    resolvePendingProfileChange(
      input: ResolvePendingProfileChangeInput,
    ): Promise<ResolvePendingProfileChangeResult>;
    savePostFeedback(input: SavePostFeedbackInput): Promise<ProfileExperimentView>;
    compare(input: CompareExperimentsInput): Promise<ProfileExperimentView[]>;
  };
  relationships: {
    list(input?: ListRelationshipsQuery): Promise<RelationshipView[]>;
    get(id: string): Promise<RelationshipView>;
    setStage(input: SetRelationshipStageInput): Promise<RelationshipView>;
    applyAudienceCorrection(input: AudienceCorrectionInput): Promise<RelationshipView>;
    close(input: CloseRelationshipInput): Promise<RelationshipView>;
  };
  preflight: {
    run(input?: RunPreflightInput): Promise<PreflightRunView>;
    getLatest(): Promise<PreflightRunView | null>;
    cancel(): Promise<PreflightRunView | null>;
  };
}

export const IPC_CHANNELS = {
  APP_PING: 'app:ping',
  APP_GET_INFO: 'app:getInfo',
  APP_SHOW_PATH_IN_FOLDER: 'app:showPathInFolder',
  LEGAL_GET_CONSENT_TEXT: 'legal:getConsentText',
  LEGAL_GET_LATEST: 'legal:getLatestConsent',
  LEGAL_ACCEPT: 'legal:acceptConsent',
  DATABASE_HEALTH: 'database:health',
  AI_GET_CONFIG: 'ai:getConfig',
  AI_SAVE_CONFIG: 'ai:saveConfig',
  AI_LIST_MODELS: 'ai:listModels',
  AI_TEST_TEXT: 'ai:testTextConnection',
  AI_TEST_VISION: 'ai:testVisionConnection',
  AI_GET_CAPABILITIES: 'ai:getCapabilities',
  AI_ANALYZE_REFERENCES: 'ai:analyzeReferences',
  PREFERENCES_GET: 'preferences:get',
  PREFERENCES_SAVE: 'preferences:save',
  REFERENCES_LIST: 'references:list',
  REFERENCES_ADD: 'references:add',
  REFERENCES_UPDATE: 'references:update',
  REFERENCES_REMOVE: 'references:remove',
  SUMMARY_GET: 'summary:get',
  SUMMARY_SAVE: 'summary:save',
  SESSIONS_START: 'sessions:start',
  SESSIONS_PAUSE: 'sessions:pause',
  SESSIONS_RESUME: 'sessions:resume',
  SESSIONS_STOP: 'sessions:stop',
  SESSIONS_GET_STATE: 'sessions:getState',
  REVIEW_CONFIRM: 'review:confirm',
  REVIEW_SKIP: 'review:skip',
  HISTORY_LIST: 'history:list',
  HISTORY_LIST_SESSIONS: 'history:listSessions',
  HISTORY_LIST_SESSION_PROFILES: 'history:listSessionProfiles',
  HISTORY_SAVE_PROFILE_FEEDBACK: 'history:saveProfileFeedback',
  HISTORY_SUBMIT_SESSION_FEEDBACK: 'history:submitSessionFeedback',
  HISTORY_APPLY_SESSION_FEEDBACK: 'history:applySessionFeedback',
  HISTORY_DELETE_SESSION: 'history:deleteSession',
  ENVIRONMENT_RUN_DOCTOR: 'environment:runDoctor',
  ENVIRONMENT_LIST_AVDS: 'environment:listAvds',
  ENVIRONMENT_LIST_DEVICES: 'environment:listDevices',
  APPIUM_GET_STATUS: 'appium:getStatus',
  APPIUM_START_SERVER: 'appium:startServer',
  APPIUM_STOP_SERVER: 'appium:stopServer',
  APPIUM_CREATE_SESSION: 'appium:createSession',
  APPIUM_END_SESSION: 'appium:endSession',
  APPIUM_GET_SESSION: 'appium:getSession',
  APPIUM_SCREENSHOT: 'appium:takeScreenshot',
  APPIUM_PAGE_SOURCE: 'appium:getPageSource',
  APPIUM_WINDOW_RECT: 'appium:getWindowRect',
  TWINBY_DETECT_PACKAGE: 'twinby:detectPackage',
  TWINBY_GET_LOCATOR_PROFILE: 'twinby:getLocatorProfile',
  TWINBY_DETECT_SCREEN: 'twinby:detectScreen',
  TWINBY_CAPTURE_DISCOVERY: 'twinby:captureDiscoverySnapshot',
  TWINBY_CAPTURE_PROFILE: 'twinby:captureCurrentProfile',
  TWINBY_CLEANUP_CAPTURE: 'twinby:cleanupCapture',
  TWINBY_GET_SESSION_LIMITS: 'twinby:getSessionLimits',
  TWINBY_SAVE_SESSION_LIMITS: 'twinby:saveSessionLimits',

  AUDIENCE_GET_CURRENT: 'audience:get-current',
  AUDIENCE_LIST_VERSIONS: 'audience:list-versions',
  AUDIENCE_DELETE_VERSION: 'audience:delete-version',
  AUDIENCE_ACTIVATE_VERSION: 'audience:activate-version',
  AUDIENCE_UPDATE_DRAFT: 'audience:update-draft',
  AUDIENCE_CONFIRM_UPDATE: 'audience:confirm-update',
  AUDIENCE_APPLY_CORRECTION: 'audience:apply-correction',
  AUDIENCE_DERIVE_FROM_EURYDICE: 'audience:derive-from-eurydice',

  IDENTITY_GET_CURRENT: 'identity:get-current',
  IDENTITY_LIST_VERSIONS: 'identity:list-versions',
  IDENTITY_DELETE_VERSION: 'identity:delete-version',
  IDENTITY_ACTIVATE_VERSION: 'identity:activate-version',
  IDENTITY_CREATE_DRAFT: 'identity:create-draft',
  IDENTITY_ANALYZE_CURRENT_PROFILE: 'identity:analyze-current-profile',
  IDENTITY_ADD_REFERENCE: 'identity:add-reference',
  IDENTITY_REMOVE_REFERENCE: 'identity:remove-reference',
  IDENTITY_CONFIRM: 'identity:confirm',

  CLOUD_LIST_CONNECTIONS: 'cloud:list-connections',
  CLOUD_GET_CREDENTIALS_STATUS: 'cloud:get-credentials-status',
  CLOUD_SAVE_CREDENTIALS: 'cloud:save-credentials',
  CLOUD_CLEAR_CREDENTIALS: 'cloud:clear-credentials',
  CLOUD_CONNECT_GOOGLE: 'cloud:connect-google',
  CLOUD_CONNECT_YANDEX: 'cloud:connect-yandex',
  CLOUD_DISCONNECT: 'cloud:disconnect',
  CLOUD_LIST_FOLDERS: 'cloud:list-folders',
  CLOUD_SET_SELECTED_FOLDERS: 'cloud:set-selected-folders',
  CLOUD_SEARCH_PHOTOS: 'cloud:search-photos',
  CLOUD_GET_INDEX_STATUS: 'cloud:get-index-status',
  CLOUD_DISCOVER_STORAGE: 'cloud:discover-storage',
  CLOUD_BROWSE_STORAGE: 'cloud:browse-storage',
  CLOUD_DELETE_INDEXED_PHOTO: 'cloud:delete-indexed-photo',
  CLOUD_GET_PHOTO_PREVIEW: 'cloud:get-photo-preview',
  /** Main → renderer push (not invoke). */
  CLOUD_INDEX_FINISHED: 'cloud:index-finished',

  ORPHEUS_GENERATE_PROFILE_SETS: 'orpheus:generate-profile-sets',
  ORPHEUS_REGENERATE_ALL: 'orpheus:regenerate-all',
  ORPHEUS_SUGGEST_PHOTOS: 'orpheus:suggest-photos',
  ORPHEUS_REGENERATE_PHOTOS_KEEP_IDEA: 'orpheus:regenerate-photos-keep-idea',
  ORPHEUS_REORDER_KEEP_PHOTOS: 'orpheus:reorder-keep-photos',
  ORPHEUS_SAVE_VARIANT: 'orpheus:save-variant',
  ORPHEUS_AUDIT_VARIANT: 'orpheus:audit-variant',
  ORPHEUS_CREATE_PHOTO_PLAN: 'orpheus:create-photo-plan',
  ORPHEUS_REQUEST_PHOTO_EDIT_PREVIEW: 'orpheus:request-photo-edit-preview',

  PROFILE_SNAPSHOT_CAPTURE: 'profile-snapshot:capture',
  PROFILE_SNAPSHOT_GET_ACTIVE: 'profile-snapshot:get-active',
  PROFILE_SNAPSHOT_LIST: 'profile-snapshot:list',
  PROFILE_SNAPSHOT_COMPARE_TO_PLAN: 'profile-snapshot:compare-to-plan',
  PROFILE_SNAPSHOT_RESOLVE_PLAN_VARIANT: 'profile-snapshot:resolve-plan-variant',
  PROFILE_SNAPSHOT_DELETE: 'profile-snapshot:delete',

  EXPERIMENT_CREATE: 'experiment:create',
  EXPERIMENT_CREATE_FROM_SNAPSHOT: 'experiment:create-from-snapshot',
  EXPERIMENT_SAVE_PRE_FEEDBACK: 'experiment:save-pre-feedback',
  EXPERIMENT_START: 'experiment:start',
  EXPERIMENT_GET_ACTIVE: 'experiment:get-active',
  EXPERIMENT_RECOMMEND_STOP: 'experiment:recommend-stop',
  EXPERIMENT_COMPLETE: 'experiment:complete',
  EXPERIMENT_CONFIRM_PROFILE_CHANGE: 'experiment:confirm-profile-change',
  EXPERIMENT_GET_PENDING_PROFILE_CHANGE: 'experiment:get-pending-profile-change',
  EXPERIMENT_RESOLVE_PENDING_PROFILE_CHANGE:
    'experiment:resolve-pending-profile-change',
  EXPERIMENT_SAVE_POST_FEEDBACK: 'experiment:save-post-feedback',
  EXPERIMENT_COMPARE: 'experiment:compare',

  RELATIONSHIPS_LIST: 'relationships:list',
  RELATIONSHIPS_GET: 'relationships:get',
  RELATIONSHIPS_SET_STAGE: 'relationships:set-stage',
  RELATIONSHIPS_APPLY_AUDIENCE_CORRECTION: 'relationships:apply-audience-correction',
  RELATIONSHIPS_CLOSE: 'relationships:close',

  PREFLIGHT_RUN: 'preflight:run',
  PREFLIGHT_GET_LATEST: 'preflight:get-latest',
  PREFLIGHT_CANCEL: 'preflight:cancel',
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

export function maskApiKey(apiKey: string): string {
  if (apiKey.length <= 8) {
    return '••••••••';
  }
  return `${apiKey.slice(0, 3)}…${apiKey.slice(-4)}`;
}
