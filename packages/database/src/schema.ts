import { blob, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  encrypted: integer('encrypted', { mode: 'boolean' }).notNull().default(false),
  updatedAt: text('updated_at').notNull(),
});

export const legalConsents = sqliteTable('legal_consents', {
  id: text('id').primaryKey(),
  consentVersion: text('consent_version').notNull(),
  acceptedAt: text('accepted_at').notNull(),
  appVersion: text('app_version').notNull(),
});

export const aiConfigs = sqliteTable('ai_configs', {
  id: text('id').primaryKey(),
  provider: text('provider').notNull(),
  baseUrl: text('base_url').notNull(),
  primaryModel: text('primary_model').notNull(),
  fallbackModel: text('fallback_model'),
  configJson: text('config_json').notNull(),
  secretId: text('secret_id'),
  updatedAt: text('updated_at').notNull(),
});

export const modelCapabilities = sqliteTable('model_capabilities', {
  model: text('model').primaryKey(),
  textStatus: text('text_status').notNull(),
  visionStatus: text('vision_status').notNull(),
  jsonStatus: text('json_status').notNull(),
  latencyMs: integer('latency_ms'),
  testedAt: text('tested_at').notNull(),
  error: text('error'),
});

export const preferenceProfiles = sqliteTable('preference_profiles', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  hardFiltersJson: text('hard_filters_json').notNull(),
  narrativeJson: text('narrative_json').notNull(),
  weightsJson: text('weights_json').notNull(),
  thresholdsJson: text('thresholds_json').notNull(),
  version: integer('version').notNull().default(1),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const referenceImages = sqliteTable('reference_images', {
  id: text('id').primaryKey(),
  preferenceProfileId: text('preference_profile_id').notNull(),
  polarity: text('polarity').notNull(),
  path: text('path').notNull(),
  thumbnailPath: text('thumbnail_path').notNull(),
  comment: text('comment'),
  tagsJson: text('tags_json').notNull(),
  weight: real('weight').notNull().default(1),
  pinned: integer('pinned', { mode: 'boolean' }).notNull().default(false),
  checksum: text('checksum').notNull(),
  createdAt: text('created_at').notNull(),
});

export const preferenceSummaries = sqliteTable('preference_summaries', {
  id: text('id').primaryKey(),
  preferenceProfileId: text('preference_profile_id').notNull(),
  summaryJson: text('summary_json').notNull(),
  sourceFingerprint: text('source_fingerprint').notNull(),
  model: text('model'),
  analyzedAt: text('analyzed_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  latencyMs: integer('latency_ms'),
});

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  mode: text('mode').notNull(),
  source: text('source').notNull(),
  status: text('status').notNull(),
  startedAt: text('started_at').notNull(),
  stoppedAt: text('stopped_at'),
  countersJson: text('counters_json').notNull(),
  error: text('error'),
  hasDetail: integer('has_detail', { mode: 'boolean' }).notNull().default(false),
});

export const historyEvents = sqliteTable('history_events', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull(),
  createdAt: text('created_at').notNull(),
  fixtureId: text('fixture_id'),
  captureId: text('capture_id').notNull(),
  modelDecision: text('model_decision'),
  userDecision: text('user_decision'),
  decisionSource: text('decision_source').notNull(),
  confidence: real('confidence'),
  reasonsJson: text('reasons_json').notNull(),
  comment: text('comment'),
  latencyMs: integer('latency_ms'),
  model: text('model'),
  preferenceVersion: integer('preference_version'),
  corrected: integer('corrected', { mode: 'boolean' }).notNull().default(false),
  aiRawJson: text('ai_raw_json'),
  autoExecuted: integer('auto_executed', { mode: 'boolean' }).notNull().default(false),
  sessionMode: text('session_mode'),
  effectiveConfidence: real('effective_confidence'),
});

export const historyProfileDetails = sqliteTable('history_profile_details', {
  historyEventId: text('history_event_id').primaryKey(),
  sessionId: text('session_id').notNull(),
  displayName: text('display_name'),
  bio: text('bio'),
  profileText: text('profile_text'),
  modelDecision: text('model_decision'),
  modelExcerpt: text('model_excerpt'),
  photoPathsJson: text('photo_paths_json').notNull(),
  userOverrideDecision: text('user_override_decision'),
  userFeedbackComment: text('user_feedback_comment'),
  feedbackSentAt: text('feedback_sent_at'),
});

/* ------------------------------------------------------------------------ */
/* Orpheus domain tables (preview.md §34.2)                                  */
/* ------------------------------------------------------------------------ */

export const audienceModelVersions = sqliteTable('audience_model_versions', {
  id: text('id').primaryKey(),
  version: integer('version').notNull(),
  codeName: text('code_name').notNull().default(''),
  summary: text('summary').notNull().default(''),
  createdAt: text('created_at').notNull(),
  supersededAt: text('superseded_at'),
  source: text('source').notNull().default('user'),
});

export const audienceSignals = sqliteTable('audience_signals', {
  id: text('id').primaryKey(),
  audienceModelId: text('audience_model_id').notNull(),
  key: text('key').notNull(),
  statement: text('statement').notNull(),
  polarity: text('polarity').notNull(),
  category: text('category'),
  status: text('status').notNull(),
  likelihood: text('likelihood').notNull(),
  confidence: real('confidence').notNull().default(0.5),
  evidenceJson: text('evidence_json').notNull().default('[]'),
  contradictionsJson: text('contradictions_json').notNull().default('[]'),
  sourceRefsJson: text('source_refs_json').notNull().default('[]'),
  createdAt: text('created_at').notNull(),
  lastConfirmedAt: text('last_confirmed_at'),
});

export const audienceFitAssessments = sqliteTable('audience_fit_assessments', {
  id: text('id').primaryKey(),
  relationshipId: text('relationship_id').notNull(),
  audienceModelVersion: integer('audience_model_version').notNull(),
  modelLabel: text('model_label').notNull(),
  modelScore: real('model_score').notNull().default(0),
  modelConfidence: real('model_confidence').notNull().default(0),
  modelReasonsJson: text('model_reasons_json').notNull().default('[]'),
  finalLabel: text('final_label').notNull(),
  correctedByUser: integer('corrected_by_user', { mode: 'boolean' })
    .notNull()
    .default(false),
  correctionReasonsJson: text('correction_reasons_json').notNull().default('[]'),
  correctionComment: text('correction_comment'),
  correctedAt: text('corrected_at'),
  createdAt: text('created_at').notNull(),
});

export const identityModelVersions = sqliteTable('identity_model_versions', {
  id: text('id').primaryKey(),
  version: integer('version').notNull(),
  codeName: text('code_name').notNull().default(''),
  age: integer('age'),
  city: text('city'),
  occupation: text('occupation'),
  professionalArea: text('professional_area'),
  relationshipIntent: text('relationship_intent'),
  aiSummary: text('ai_summary').notNull().default(''),
  positiveReferenceIdsJson: text('positive_reference_ids_json').notNull().default('[]'),
  negativeReferenceIdsJson: text('negative_reference_ids_json').notNull().default('[]'),
  userConfirmedAt: text('user_confirmed_at'),
  createdAt: text('created_at').notNull(),
  supersededAt: text('superseded_at'),
});

export const identitySignals = sqliteTable('identity_signals', {
  id: text('id').primaryKey(),
  identityModelId: text('identity_model_id').notNull(),
  bucket: text('bucket').notNull(),
  key: text('key').notNull(),
  statement: text('statement').notNull(),
  confidence: real('confidence').notNull().default(0.5),
  createdAt: text('created_at').notNull(),
});

export const identityResources = sqliteTable('identity_resources', {
  id: text('id').primaryKey(),
  identityModelId: text('identity_model_id').notNull(),
  description: text('description').notNull(),
  createdAt: text('created_at').notNull(),
});

export const identityConstraints = sqliteTable('identity_constraints', {
  id: text('id').primaryKey(),
  identityModelId: text('identity_model_id').notNull(),
  description: text('description').notNull(),
  severity: text('severity').notNull().default('warning'),
  createdAt: text('created_at').notNull(),
});

export const profileStrategies = sqliteTable('profile_strategies', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  primaryTraitsJson: text('primary_traits_json').notNull().default('[]'),
  secondaryTraitsJson: text('secondary_traits_json').notNull().default('[]'),
  suppressedTraitsJson: text('suppressed_traits_json').notNull().default('[]'),
  forbiddenSignalsJson: text('forbidden_signals_json').notNull().default('[]'),
  intendedFirstImpressionJson: text('intended_first_impression_json')
    .notNull()
    .default('[]'),
  intendedEmotionalToneJson: text('intended_emotional_tone_json')
    .notNull()
    .default('[]'),
  intendedConversationHooksJson: text('intended_conversation_hooks_json')
    .notNull()
    .default('[]'),
  audienceModelVersion: integer('audience_model_version').notNull().default(0),
  identityModelVersion: integer('identity_model_version').notNull().default(0),
  userNotes: text('user_notes'),
  createdAt: text('created_at').notNull(),
});

export const cloudConnections = sqliteTable('cloud_connections', {
  id: text('id').primaryKey(),
  provider: text('provider').notNull(),
  connected: integer('connected', { mode: 'boolean' }).notNull().default(false),
  accountLabel: text('account_label'),
  connectedAt: text('connected_at'),
  disconnectedAt: text('disconnected_at'),
  lastError: text('last_error'),
  selectedFolderIdsJson: text('selected_folder_ids_json').notNull().default('[]'),
  updatedAt: text('updated_at').notNull(),
});

export const cloudFolders = sqliteTable('cloud_folders', {
  id: text('id').primaryKey(),
  connectionId: text('connection_id').notNull(),
  provider: text('provider').notNull(),
  externalId: text('external_id').notNull(),
  name: text('name').notNull(),
  path: text('path'),
  selected: integer('selected', { mode: 'boolean' }).notNull().default(false),
  updatedAt: text('updated_at').notNull(),
});

export const indexedPhotoAssets = sqliteTable('indexed_photo_assets', {
  id: text('id').primaryKey(),
  provider: text('provider').notNull(),
  externalFileId: text('external_file_id').notNull(),
  externalPath: text('external_path'),
  fileName: text('file_name').notNull(),
  sourceModifiedAt: text('source_modified_at').notNull(),
  sourceSizeBytes: integer('source_size_bytes'),
  checksum: text('checksum'),
  perceptualHash: text('perceptual_hash').notNull().default(''),
  localPreviewPath: text('local_preview_path').notNull().default(''),
  originalCachePath: text('original_cache_path'),
  embeddingBlob: blob('embedding_blob', { mode: 'buffer' }),
  embeddingModel: text('embedding_model'),
  embeddingVersion: text('embedding_version'),
  shortDescription: text('short_description').notNull().default(''),
  observedSignalsJson: text('observed_signals_json').notNull().default('[]'),
  possibleRolesJson: text('possible_roles_json').notNull().default('[]'),
  risksJson: text('risks_json').notNull().default('[]'),
  peopleCount: integer('people_count'),
  faceVisibility: real('face_visibility').notNull().default(0),
  bodyVisibility: real('body_visibility').notNull().default(0),
  technicalQuality: real('technical_quality').notNull().default(0),
  indexedAt: text('indexed_at').notNull(),
  deletedFromIndexAt: text('deleted_from_index_at'),
});

/** Overlapping ready-made looks built from indexed photos (AI clustering). */
export const photoLookGroups = sqliteTable('photo_look_groups', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  brief: text('brief').notNull().default(''),
  moodTagsJson: text('mood_tags_json').notNull().default('[]'),
  photoIdsJson: text('photo_ids_json').notNull().default('[]'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const photoAssessments = sqliteTable('photo_assessments', {
  id: text('id').primaryKey(),
  photoAssetId: text('photo_asset_id').notNull(),
  technicalJson: text('technical_json').notNull().default('{}'),
  possibleRolesJson: text('possible_roles_json').notNull().default('[]'),
  strategyFitsJson: text('strategy_fits_json').notNull().default('[]'),
  standaloneStrengthsJson: text('standalone_strengths_json').notNull().default('[]'),
  standaloneRisksJson: text('standalone_risks_json').notNull().default('[]'),
  assessedAt: text('assessed_at').notNull(),
  assessmentVersion: text('assessment_version').notNull().default('v1'),
});

export const profileVariants = sqliteTable('profile_variants', {
  id: text('id').primaryKey(),
  version: integer('version').notNull(),
  name: text('name').notNull(),
  status: text('status').notNull().default('draft'),
  strategyId: text('strategy_id'),
  bio: text('bio').notNull().default(''),
  hypothesis: text('hypothesis').notNull().default(''),
  changeSetId: text('change_set_id'),
  createdAgainstAudienceVersion: integer('created_against_audience_version')
    .notNull()
    .default(0),
  createdAgainstIdentityVersion: integer('created_against_identity_version')
    .notNull()
    .default(0),
  createdAssessmentJson: text('created_assessment_json'),
  expectedPerformanceJson: text('expected_performance_json'),
  verifiedSnapshotId: text('verified_snapshot_id'),
  createdAt: text('created_at').notNull(),
  activatedAt: text('activated_at'),
  deactivatedAt: text('deactivated_at'),
  archivedAt: text('archived_at'),
});

export const profileVariantPhotos = sqliteTable('profile_variant_photos', {
  id: text('id').primaryKey(),
  profileVariantId: text('profile_variant_id').notNull(),
  photoAssetId: text('photo_asset_id').notNull(),
  position: integer('position').notNull().default(0),
  role: text('role'),
  explanation: text('explanation'),
});

export const profileChangeSets = sqliteTable('profile_change_sets', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  changedSignalsJson: text('changed_signals_json').notNull().default('[]'),
  commonHypothesis: text('common_hypothesis').notNull().default(''),
  expectedEffectJson: text('expected_effect_json').notNull().default('{}'),
  createdAt: text('created_at').notNull(),
});

export const profileChangeItems = sqliteTable('profile_change_items', {
  id: text('id').primaryKey(),
  changeSetId: text('change_set_id').notNull(),
  type: text('type').notNull(),
  before: text('before').notNull().default(''),
  after: text('after').notNull().default(''),
});

export const verifiedProfileSnapshots = sqliteTable('verified_profile_snapshots', {
  id: text('id').primaryKey(),
  profileVariantId: text('profile_variant_id'),
  capturedAt: text('captured_at').notNull(),
  bio: text('bio').notNull().default(''),
  occupation: text('occupation'),
  interestsJson: text('interests_json').notNull().default('[]'),
  relationshipGoal: text('relationship_goal'),
  plannedSimilarity: real('planned_similarity'),
  differencesFromPlanJson: text('differences_from_plan_json').notNull().default('[]'),
  deploymentStatus: text('deployment_status').notNull().default('not-verified'),
  source: text('source').notNull().default('twinby-profile-capture'),
});

export const verifiedProfileSnapshotPhotos = sqliteTable(
  'verified_profile_snapshot_photos',
  {
    id: text('id').primaryKey(),
    snapshotId: text('snapshot_id').notNull(),
    position: integer('position').notNull().default(0),
    localPreviewPath: text('local_preview_path').notNull().default(''),
    perceptualHash: text('perceptual_hash').notNull().default(''),
    matchedPhotoAssetId: text('matched_photo_asset_id'),
    matchConfidence: real('match_confidence'),
  },
);

export const profileAssessments = sqliteTable('profile_assessments', {
  id: text('id').primaryKey(),
  profileVariantId: text('profile_variant_id'),
  coherence: real('coherence').notNull().default(0),
  authenticity: real('authenticity').notNull().default(0),
  targetAudienceAlignment: real('target_audience_alignment').notNull().default(0),
  firstImpressionStrength: real('first_impression_strength').notNull().default(0),
  conversationHookStrength: real('conversation_hook_strength').notNull().default(0),
  dominantSignalsJson: text('dominant_signals_json').notNull().default('[]'),
  conflictingSignalsJson: text('conflicting_signals_json').notNull().default('[]'),
  repeatedSignalsJson: text('repeated_signals_json').notNull().default('[]'),
  missingRolesJson: text('missing_roles_json').notNull().default('[]'),
  weakestLinksJson: text('weakest_links_json').notNull().default('[]'),
  unexpectedStrengthsJson: text('unexpected_strengths_json').notNull().default('[]'),
  marginalValuesJson: text('marginal_values_json').notNull().default('[]'),
  createdAt: text('created_at').notNull(),
});

export const profileExperiments = sqliteTable('profile_experiments', {
  id: text('id').primaryKey(),
  profileVariantId: text('profile_variant_id').notNull(),
  status: text('status').notNull().default('draft'),
  minDurationDays: integer('min_duration_days').notNull().default(3),
  targetDurationDays: integer('target_duration_days').notNull().default(5),
  maxDurationDays: integer('max_duration_days').notNull().default(7),
  imperfectDeployment: integer('imperfect_deployment', { mode: 'boolean' })
    .notNull()
    .default(false),
  startedAt: text('started_at'),
  completedAt: text('completed_at'),
  completionReason: text('completion_reason'),
  previousVariantId: text('previous_variant_id'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const experimentPreFeedback = sqliteTable('experiment_pre_feedback', {
  id: text('id').primaryKey(),
  experimentId: text('experiment_id').notNull(),
  botExpectation: text('bot_expectation').notNull().default(''),
  botExpectedMetricsJson: text('bot_expected_metrics_json').notNull().default('{}'),
  userExpectedOutcome: text('user_expected_outcome').notNull().default(''),
  userExpectedMetricsJson: text('user_expected_metrics_json'),
  userAuthenticityRating: real('user_authenticity_rating'),
  userNotes: text('user_notes'),
  createdAt: text('created_at').notNull(),
});

export const experimentPostFeedback = sqliteTable('experiment_post_feedback', {
  id: text('id').primaryKey(),
  experimentId: text('experiment_id').notNull(),
  actualOutcomeSummary: text('actual_outcome_summary').notNull().default(''),
  expectationsMatched: integer('expectations_matched', { mode: 'boolean' })
    .notNull()
    .default(false),
  audienceQualityRating: real('audience_quality_rating'),
  comfortRating: real('comfort_rating'),
  wouldReuse: integer('would_reuse', { mode: 'boolean' }),
  userInterpretation: text('user_interpretation'),
  createdAt: text('created_at').notNull(),
});

export const experimentMetrics = sqliteTable('experiment_metrics', {
  id: text('id').primaryKey(),
  experimentId: text('experiment_id').notNull(),
  activeDays: integer('active_days').notNull().default(0),
  eurydiceSessions: integer('eurydice_sessions').notNull().default(0),
  incomingLikes: integer('incoming_likes').notNull().default(0),
  targetIncomingLikes: integer('target_incoming_likes').notNull().default(0),
  matches: integer('matches').notNull().default(0),
  targetMatches: integer('target_matches').notNull().default(0),
  conversations: integer('conversations').notNull().default(0),
  substantiveConversations: integer('substantive_conversations').notNull().default(0),
  telegramExchanges: integer('telegram_exchanges').notNull().default(0),
  dateProposed: integer('date_proposed').notNull().default(0),
  dateScheduled: integer('date_scheduled').notNull().default(0),
  dateCompleted: integer('date_completed').notNull().default(0),
  calculatedAt: text('calculated_at').notNull(),
});

export const profileInsights = sqliteTable('profile_insights', {
  id: text('id').primaryKey(),
  statement: text('statement').notNull(),
  confidence: real('confidence').notNull().default(0),
  sampleSize: integer('sample_size').notNull().default(0),
  validFrom: text('valid_from').notNull(),
  validUntil: text('valid_until'),
  contextJson: text('context_json').notNull().default('{}'),
  stability: text('stability').notNull().default('temporary'),
  lastConfirmedAt: text('last_confirmed_at').notNull(),
});

export const candidateIdentities = sqliteTable('candidate_identities', {
  id: text('id').primaryKey(),
  name: text('name'),
  age: integer('age'),
  primaryPhotoHash: text('primary_photo_hash'),
  additionalPhotoHashesJson: text('additional_photo_hashes_json').notNull().default('[]'),
  bioFingerprint: text('bio_fingerprint'),
  firstSeenAt: text('first_seen_at').notNull(),
  lastSeenAt: text('last_seen_at').notNull(),
});

export const candidateObservations = sqliteTable('candidate_observations', {
  id: text('id').primaryKey(),
  candidateIdentityId: text('candidate_identity_id').notNull(),
  observedAt: text('observed_at').notNull(),
  source: text('source').notNull().default('twinby-scan'),
  rawEvidenceJson: text('raw_evidence_json').notNull().default('{}'),
  screenType: text('screen_type'),
});

export const currentIncomingLikes = sqliteTable('current_incoming_likes', {
  relationshipId: text('relationship_id').primaryKey(),
  candidateIdentityId: text('candidate_identity_id').notNull(),
  detectedAt: text('detected_at').notNull(),
  lastConfirmedAt: text('last_confirmed_at').notNull(),
});

export const currentMatches = sqliteTable('current_matches', {
  relationshipId: text('relationship_id').primaryKey(),
  candidateIdentityId: text('candidate_identity_id').notNull(),
  matchedAt: text('matched_at').notNull(),
  lastConfirmedAt: text('last_confirmed_at').notNull(),
});

export const currentDialogs = sqliteTable('current_dialogs', {
  relationshipId: text('relationship_id').primaryKey(),
  candidateIdentityId: text('candidate_identity_id').notNull(),
  lastMessageAt: text('last_message_at'),
  rankPosition: integer('rank_position'),
  lastConfirmedAt: text('last_confirmed_at').notNull(),
});

export const relationships = sqliteTable('relationships', {
  id: text('id').primaryKey(),
  candidateIdentityId: text('candidate_identity_id').notNull(),
  origin: text('origin').notNull().default('unknown'),
  currentStage: text('current_stage').notNull().default('incoming-like'),
  modelAudienceFit: text('model_audience_fit').notNull().default('borderline'),
  finalAudienceFit: text('final_audience_fit').notNull().default('borderline'),
  audienceScore: real('audience_score').notNull().default(0),
  audienceConfidence: real('audience_confidence').notNull().default(0),
  modelReasonsJson: text('model_reasons_json').notNull().default('[]'),
  correctedByUser: integer('corrected_by_user', { mode: 'boolean' })
    .notNull()
    .default(false),
  correctionReasonsJson: text('correction_reasons_json').notNull().default('[]'),
  correctionComment: text('correction_comment'),
  attributedProfileSnapshotId: text('attributed_profile_snapshot_id'),
  attributedProfileVariantId: text('attributed_profile_variant_id'),
  experimentId: text('experiment_id'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const relationshipEvents = sqliteTable('relationship_events', {
  id: text('id').primaryKey(),
  relationshipId: text('relationship_id').notNull(),
  type: text('type').notNull(),
  occurredAt: text('occurred_at').notNull(),
  source: text('source').notNull().default('twinby-scan'),
  metadataJson: text('metadata_json'),
});

export const profileVariantAlignments = sqliteTable('profile_variant_alignments', {
  id: text('id').primaryKey(),
  candidateObservationId: text('candidate_observation_id').notNull(),
  profileVariantId: text('profile_variant_id').notNull(),
  semanticAlignment: real('semantic_alignment').notNull().default(0),
  historicalPerformance: real('historical_performance'),
  combinedEstimate: real('combined_estimate').notNull().default(0),
  confidence: real('confidence').notNull().default(0),
  matchedSignalsJson: text('matched_signals_json').notNull().default('[]'),
  conflictingSignalsJson: text('conflicting_signals_json').notNull().default('[]'),
  unknownsJson: text('unknowns_json').notNull().default('[]'),
  historySampleSize: integer('history_sample_size').notNull().default(0),
  createdAt: text('created_at').notNull(),
});

export const efficiencyWeightPolicies = sqliteTable('efficiency_weight_policies', {
  id: text('id').primaryKey(),
  incomingLikeWeight: real('incoming_like_weight').notNull().default(1),
  targetIncomingLikeWeight: real('target_incoming_like_weight').notNull().default(3),
  matchWeight: real('match_weight').notNull().default(1),
  targetMatchWeight: real('target_match_weight').notNull().default(2),
  telegramWeight: real('telegram_weight').notNull().default(4),
  dateWeight: real('date_weight').notNull().default(6),
  source: text('source').notNull().default('default'),
  sampleSize: integer('sample_size').notNull().default(0),
  explanation: text('explanation').notNull().default(''),
  createdAt: text('created_at').notNull(),
});

export const efficiencyComparisonPolicies = sqliteTable(
  'efficiency_comparison_policies',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    configJson: text('config_json').notNull().default('{}'),
    createdAt: text('created_at').notNull(),
  },
);

export const locatorProfiles = sqliteTable('locator_profiles', {
  id: text('id').primaryKey(),
  twinbyVersion: text('twinby_version'),
  deviceModel: text('device_model'),
  screenWidth: integer('screen_width').notNull().default(0),
  screenHeight: integer('screen_height').notNull().default(0),
  orientation: text('orientation').notNull().default('portrait'),
  theme: text('theme'),
  createdAt: text('created_at').notNull(),
  lastValidatedAt: text('last_validated_at'),
});

export const locatorEntries = sqliteTable('locator_entries', {
  id: text('id').primaryKey(),
  locatorProfileId: text('locator_profile_id').notNull(),
  targetKey: text('target_key').notNull(),
  strategy: text('strategy').notNull(),
  value: text('value'),
  xRatio: real('x_ratio'),
  yRatio: real('y_ratio'),
  note: text('note'),
  discoveredAt: text('discovered_at'),
});

export const preflightRuns = sqliteTable('preflight_runs', {
  id: text('id').primaryKey(),
  startedAt: text('started_at').notNull(),
  completedAt: text('completed_at'),
  status: text('status').notNull().default('running'),
  overrideUsed: integer('override_used', { mode: 'boolean' }).notNull().default(false),
  overrideReason: text('override_reason'),
  summaryJson: text('summary_json'),
});

export const preflightRunSteps = sqliteTable('preflight_run_steps', {
  id: text('id').primaryKey(),
  runId: text('run_id').notNull(),
  stepId: text('step_id').notNull(),
  status: text('status').notNull().default('pending'),
  position: integer('position').notNull().default(0),
  startedAt: text('started_at'),
  completedAt: text('completed_at'),
  summary: text('summary'),
  error: text('error'),
});

export const schema = {
  appSettings,
  legalConsents,
  aiConfigs,
  modelCapabilities,
  preferenceProfiles,
  referenceImages,
  preferenceSummaries,
  sessions,
  historyEvents,
  historyProfileDetails,
  audienceModelVersions,
  audienceSignals,
  audienceFitAssessments,
  identityModelVersions,
  identitySignals,
  identityResources,
  identityConstraints,
  profileStrategies,
  cloudConnections,
  cloudFolders,
  indexedPhotoAssets,
  photoAssessments,
  profileVariants,
  profileVariantPhotos,
  profileChangeSets,
  profileChangeItems,
  verifiedProfileSnapshots,
  verifiedProfileSnapshotPhotos,
  profileAssessments,
  profileExperiments,
  experimentPreFeedback,
  experimentPostFeedback,
  experimentMetrics,
  profileInsights,
  candidateIdentities,
  candidateObservations,
  currentIncomingLikes,
  currentMatches,
  currentDialogs,
  relationships,
  relationshipEvents,
  profileVariantAlignments,
  efficiencyWeightPolicies,
  efficiencyComparisonPolicies,
  locatorProfiles,
  locatorEntries,
  preflightRuns,
  preflightRunSteps,
};
