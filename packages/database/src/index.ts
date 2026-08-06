import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import {
  APP_VERSION,
  AudienceFitAssessmentSchema,
  AudienceModelViewSchema,
  CloudConnectionViewSchema,
  CloudFolderViewSchema,
  CloudIndexStatusViewSchema,
  CloudProviderSchema,
  DEFAULT_ARIONHUB_BASE_URL,
  DEFAULT_FALLBACK_MODEL,
  DEFAULT_PRIMARY_MODEL,
  ExperimentMetricsViewSchema,
  HardFiltersSchema,
  IdentityModelViewSchema,
  IndexedPhotoAssetViewSchema,
  NarrativeSchema,
  PhotoLookGroupViewSchema,
  PhotoSearchResultSchema,
  PreferenceSummarySchema,
  PreflightRunViewSchema,
  ProfileExperimentViewSchema,
  ProfileVariantViewSchema,
  RelationshipViewSchema,
  ThresholdsSchema,
  VerifiedProfileSnapshotViewSchema,
  WeightsSchema,
  type AiConfig,
  type AudienceCorrectionInput,
  type AudienceDraftUpdateInput,
  type AudienceFitAssessment,
  type AudienceFitLabel,
  type AudienceModelView,
  type AudienceSignal,
  type CloseRelationshipInput,
  type CloudConnectionView,
  type CloudFolderView,
  type CloudIndexStatusView,
  type CloudProvider,
  type CompleteExperimentInput,
  type ConfirmProfileChangeInput,
  type CreateExperimentInput,
  type PendingProfileChangeView,
  type ResolvePendingProfileChangeInput,
  type ResolvePendingProfileChangeResult,
  type ExperimentMetricsView,
  type ExperimentPostFeedback,
  type ExperimentPreFeedback,
  type HistoryEvent,
  type HistoryQuery,
  type HistorySessionProfile,
  type HistorySessionSummary,
  type IdentityDraftInput,
  type IdentityModelView,
  type IdentitySignal,
  type IndexedPhotoAssetView,
  type LegalConsent,
  type PhotoLookGroupView,
  type ModelCapabilities,
  type PaginatedHistory,
  type PaginatedHistorySessionProfiles,
  type PhotoSearchInput,
  type PhotoSearchResult,
  type PreferenceProfile,
  type PreferenceProfileInput,
  type PreferenceSummary,
  type PreflightRunView,
  type PreflightStepId,
  type ProfileExperimentView,
  type ProfileVariantStatus,
  type ProfileVariantView,
  type ReferenceImage,
  type ReferencePolarity,
  type RelationshipStage,
  type RelationshipView,
  type SaveVariantInput,
  type SavePostFeedbackInput,
  type SavePreFeedbackInput,
  type SessionCounters,
  type SetRelationshipStageInput,
  type StoredPreferenceSummary,
  type VerifiedProfileSnapshotView,
  maskApiKey,
} from '@twinby/contracts';
import * as schema from './schema';
import {
  aiConfigs,
  audienceFitAssessments,
  audienceModelVersions,
  audienceSignals,
  candidateIdentities,
  cloudConnections,
  cloudFolders,
  currentDialogs,
  currentIncomingLikes,
  currentMatches,
  historyEvents,
  historyProfileDetails,
  identityModelVersions,
  identityConstraints,
  identityResources,
  identitySignals,
  indexedPhotoAssets,
  legalConsents,
  photoLookGroups,
  modelCapabilities,
  preferenceProfiles,
  preferenceSummaries,
  preflightRunSteps,
  preflightRuns,
  profileExperiments,
  experimentMetrics,
  experimentPostFeedback,
  experimentPreFeedback,
  profileVariantPhotos,
  profileVariants,
  referenceImages,
  relationshipEvents,
  relationships,
  sessions,
  verifiedProfileSnapshotPhotos,
  verifiedProfileSnapshots,
} from './schema';

export type AppDatabase = BetterSQLite3Database<typeof schema>;

export interface BootstrapDatabaseResult {
  db: AppDatabase;
  sqlite: Database.Database;
  path: string;
  migrated: boolean;
  /** True when legacy flat history was wiped for the new session format. */
  historyCleared: boolean;
}

const MIGRATIONS_SQL = `
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL,
  encrypted INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS legal_consents (
  id TEXT PRIMARY KEY NOT NULL,
  consent_version TEXT NOT NULL,
  accepted_at TEXT NOT NULL,
  app_version TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_configs (
  id TEXT PRIMARY KEY NOT NULL,
  provider TEXT NOT NULL,
  base_url TEXT NOT NULL,
  primary_model TEXT NOT NULL,
  fallback_model TEXT,
  config_json TEXT NOT NULL,
  secret_id TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS model_capabilities (
  model TEXT PRIMARY KEY NOT NULL,
  text_status TEXT NOT NULL,
  vision_status TEXT NOT NULL,
  json_status TEXT NOT NULL,
  latency_ms INTEGER,
  tested_at TEXT NOT NULL,
  error TEXT
);

CREATE TABLE IF NOT EXISTS preference_profiles (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  hard_filters_json TEXT NOT NULL,
  narrative_json TEXT NOT NULL,
  weights_json TEXT NOT NULL,
  thresholds_json TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reference_images (
  id TEXT PRIMARY KEY NOT NULL,
  preference_profile_id TEXT NOT NULL,
  polarity TEXT NOT NULL,
  path TEXT NOT NULL,
  thumbnail_path TEXT NOT NULL,
  comment TEXT,
  tags_json TEXT NOT NULL,
  weight REAL NOT NULL DEFAULT 1,
  pinned INTEGER NOT NULL DEFAULT 0,
  checksum TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS preference_summaries (
  id TEXT PRIMARY KEY NOT NULL,
  preference_profile_id TEXT NOT NULL,
  summary_json TEXT NOT NULL,
  source_fingerprint TEXT NOT NULL,
  model TEXT,
  analyzed_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  latency_ms INTEGER
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY NOT NULL,
  mode TEXT NOT NULL,
  source TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  stopped_at TEXT,
  counters_json TEXT NOT NULL,
  error TEXT
);

CREATE TABLE IF NOT EXISTS history_events (
  id TEXT PRIMARY KEY NOT NULL,
  session_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  fixture_id TEXT,
  capture_id TEXT NOT NULL,
  model_decision TEXT,
  user_decision TEXT,
  decision_source TEXT NOT NULL,
  confidence REAL,
  reasons_json TEXT NOT NULL,
  comment TEXT,
  latency_ms INTEGER,
  model TEXT,
  preference_version INTEGER,
  corrected INTEGER NOT NULL DEFAULT 0,
  ai_raw_json TEXT
);

CREATE TABLE IF NOT EXISTS history_profile_details (
  history_event_id TEXT PRIMARY KEY NOT NULL,
  session_id TEXT NOT NULL,
  display_name TEXT,
  bio TEXT,
  profile_text TEXT,
  model_decision TEXT,
  model_excerpt TEXT,
  photo_paths_json TEXT NOT NULL,
  user_override_decision TEXT,
  user_feedback_comment TEXT,
  feedback_sent_at TEXT
);

-- Orpheus domain (preview.md §34.2) ----------------------------------------

CREATE TABLE IF NOT EXISTS audience_model_versions (
  id TEXT PRIMARY KEY NOT NULL,
  version INTEGER NOT NULL,
  code_name TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  superseded_at TEXT,
  source TEXT NOT NULL DEFAULT 'user'
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_audience_model_versions_version
  ON audience_model_versions(version);

CREATE TABLE IF NOT EXISTS audience_signals (
  id TEXT PRIMARY KEY NOT NULL,
  audience_model_id TEXT NOT NULL,
  key TEXT NOT NULL,
  statement TEXT NOT NULL,
  polarity TEXT NOT NULL,
  category TEXT,
  status TEXT NOT NULL,
  likelihood TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0.5,
  evidence_json TEXT NOT NULL DEFAULT '[]',
  contradictions_json TEXT NOT NULL DEFAULT '[]',
  source_refs_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  last_confirmed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_audience_signals_model
  ON audience_signals(audience_model_id);

CREATE TABLE IF NOT EXISTS audience_fit_assessments (
  id TEXT PRIMARY KEY NOT NULL,
  relationship_id TEXT NOT NULL,
  audience_model_version INTEGER NOT NULL,
  model_label TEXT NOT NULL,
  model_score REAL NOT NULL DEFAULT 0,
  model_confidence REAL NOT NULL DEFAULT 0,
  model_reasons_json TEXT NOT NULL DEFAULT '[]',
  final_label TEXT NOT NULL,
  corrected_by_user INTEGER NOT NULL DEFAULT 0,
  correction_reasons_json TEXT NOT NULL DEFAULT '[]',
  correction_comment TEXT,
  corrected_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audience_fit_assessments_relationship
  ON audience_fit_assessments(relationship_id);

CREATE TABLE IF NOT EXISTS identity_model_versions (
  id TEXT PRIMARY KEY NOT NULL,
  version INTEGER NOT NULL,
  code_name TEXT NOT NULL DEFAULT '',
  age INTEGER,
  city TEXT,
  occupation TEXT,
  professional_area TEXT,
  relationship_intent TEXT,
  ai_summary TEXT NOT NULL DEFAULT '',
  positive_reference_ids_json TEXT NOT NULL DEFAULT '[]',
  negative_reference_ids_json TEXT NOT NULL DEFAULT '[]',
  user_confirmed_at TEXT,
  created_at TEXT NOT NULL,
  superseded_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_identity_model_versions_version
  ON identity_model_versions(version);

CREATE TABLE IF NOT EXISTS identity_signals (
  id TEXT PRIMARY KEY NOT NULL,
  identity_model_id TEXT NOT NULL,
  bucket TEXT NOT NULL,
  key TEXT NOT NULL,
  statement TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0.5,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_identity_signals_model ON identity_signals(identity_model_id);

CREATE TABLE IF NOT EXISTS identity_resources (
  id TEXT PRIMARY KEY NOT NULL,
  identity_model_id TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_identity_resources_model ON identity_resources(identity_model_id);

CREATE TABLE IF NOT EXISTS identity_constraints (
  id TEXT PRIMARY KEY NOT NULL,
  identity_model_id TEXT NOT NULL,
  description TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warning',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_identity_constraints_model ON identity_constraints(identity_model_id);

CREATE TABLE IF NOT EXISTS profile_strategies (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  primary_traits_json TEXT NOT NULL DEFAULT '[]',
  secondary_traits_json TEXT NOT NULL DEFAULT '[]',
  suppressed_traits_json TEXT NOT NULL DEFAULT '[]',
  forbidden_signals_json TEXT NOT NULL DEFAULT '[]',
  intended_first_impression_json TEXT NOT NULL DEFAULT '[]',
  intended_emotional_tone_json TEXT NOT NULL DEFAULT '[]',
  intended_conversation_hooks_json TEXT NOT NULL DEFAULT '[]',
  audience_model_version INTEGER NOT NULL DEFAULT 0,
  identity_model_version INTEGER NOT NULL DEFAULT 0,
  user_notes TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cloud_connections (
  id TEXT PRIMARY KEY NOT NULL,
  provider TEXT NOT NULL,
  connected INTEGER NOT NULL DEFAULT 0,
  account_label TEXT,
  connected_at TEXT,
  disconnected_at TEXT,
  last_error TEXT,
  selected_folder_ids_json TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cloud_connections_provider
  ON cloud_connections(provider);

CREATE TABLE IF NOT EXISTS cloud_folders (
  id TEXT PRIMARY KEY NOT NULL,
  connection_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  external_id TEXT NOT NULL,
  name TEXT NOT NULL,
  path TEXT,
  selected INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cloud_folders_connection ON cloud_folders(connection_id);

CREATE TABLE IF NOT EXISTS indexed_photo_assets (
  id TEXT PRIMARY KEY NOT NULL,
  provider TEXT NOT NULL,
  external_file_id TEXT NOT NULL,
  external_path TEXT,
  file_name TEXT NOT NULL,
  source_modified_at TEXT NOT NULL,
  source_size_bytes INTEGER,
  checksum TEXT,
  perceptual_hash TEXT NOT NULL DEFAULT '',
  local_preview_path TEXT NOT NULL DEFAULT '',
  original_cache_path TEXT,
  embedding_blob BLOB,
  embedding_model TEXT,
  embedding_version TEXT,
  short_description TEXT NOT NULL DEFAULT '',
  observed_signals_json TEXT NOT NULL DEFAULT '[]',
  possible_roles_json TEXT NOT NULL DEFAULT '[]',
  risks_json TEXT NOT NULL DEFAULT '[]',
  people_count INTEGER,
  face_visibility REAL NOT NULL DEFAULT 0,
  body_visibility REAL NOT NULL DEFAULT 0,
  technical_quality REAL NOT NULL DEFAULT 0,
  indexed_at TEXT NOT NULL,
  deleted_from_index_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_indexed_photo_assets_identity
  ON indexed_photo_assets(provider, external_file_id, source_modified_at);

CREATE TABLE IF NOT EXISTS photo_look_groups (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  brief TEXT NOT NULL DEFAULT '',
  mood_tags_json TEXT NOT NULL DEFAULT '[]',
  photo_ids_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS photo_assessments (
  id TEXT PRIMARY KEY NOT NULL,
  photo_asset_id TEXT NOT NULL,
  technical_json TEXT NOT NULL DEFAULT '{}',
  possible_roles_json TEXT NOT NULL DEFAULT '[]',
  strategy_fits_json TEXT NOT NULL DEFAULT '[]',
  standalone_strengths_json TEXT NOT NULL DEFAULT '[]',
  standalone_risks_json TEXT NOT NULL DEFAULT '[]',
  assessed_at TEXT NOT NULL,
  assessment_version TEXT NOT NULL DEFAULT 'v1'
);
CREATE INDEX IF NOT EXISTS idx_photo_assessments_asset ON photo_assessments(photo_asset_id);

CREATE TABLE IF NOT EXISTS profile_variants (
  id TEXT PRIMARY KEY NOT NULL,
  version INTEGER NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  strategy_id TEXT,
  bio TEXT NOT NULL DEFAULT '',
  hypothesis TEXT NOT NULL DEFAULT '',
  change_set_id TEXT,
  created_against_audience_version INTEGER NOT NULL DEFAULT 0,
  created_against_identity_version INTEGER NOT NULL DEFAULT 0,
  created_assessment_json TEXT,
  expected_performance_json TEXT,
  verified_snapshot_id TEXT,
  created_at TEXT NOT NULL,
  activated_at TEXT,
  deactivated_at TEXT,
  archived_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_profile_variants_status ON profile_variants(status);

CREATE TABLE IF NOT EXISTS profile_variant_photos (
  id TEXT PRIMARY KEY NOT NULL,
  profile_variant_id TEXT NOT NULL,
  photo_asset_id TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  role TEXT,
  explanation TEXT
);
CREATE INDEX IF NOT EXISTS idx_profile_variant_photos_variant
  ON profile_variant_photos(profile_variant_id);

CREATE TABLE IF NOT EXISTS profile_change_sets (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  changed_signals_json TEXT NOT NULL DEFAULT '[]',
  common_hypothesis TEXT NOT NULL DEFAULT '',
  expected_effect_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS profile_change_items (
  id TEXT PRIMARY KEY NOT NULL,
  change_set_id TEXT NOT NULL,
  type TEXT NOT NULL,
  before TEXT NOT NULL DEFAULT '',
  after TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_profile_change_items_set ON profile_change_items(change_set_id);

CREATE TABLE IF NOT EXISTS verified_profile_snapshots (
  id TEXT PRIMARY KEY NOT NULL,
  profile_variant_id TEXT,
  captured_at TEXT NOT NULL,
  bio TEXT NOT NULL DEFAULT '',
  occupation TEXT,
  interests_json TEXT NOT NULL DEFAULT '[]',
  relationship_goal TEXT,
  planned_similarity REAL,
  differences_from_plan_json TEXT NOT NULL DEFAULT '[]',
  deployment_status TEXT NOT NULL DEFAULT 'not-verified',
  source TEXT NOT NULL DEFAULT 'twinby-profile-capture'
);
CREATE INDEX IF NOT EXISTS idx_verified_profile_snapshots_captured
  ON verified_profile_snapshots(captured_at);

CREATE TABLE IF NOT EXISTS verified_profile_snapshot_photos (
  id TEXT PRIMARY KEY NOT NULL,
  snapshot_id TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  local_preview_path TEXT NOT NULL DEFAULT '',
  perceptual_hash TEXT NOT NULL DEFAULT '',
  matched_photo_asset_id TEXT,
  match_confidence REAL
);
CREATE INDEX IF NOT EXISTS idx_verified_profile_snapshot_photos_snapshot
  ON verified_profile_snapshot_photos(snapshot_id);

CREATE TABLE IF NOT EXISTS profile_assessments (
  id TEXT PRIMARY KEY NOT NULL,
  profile_variant_id TEXT,
  coherence REAL NOT NULL DEFAULT 0,
  authenticity REAL NOT NULL DEFAULT 0,
  target_audience_alignment REAL NOT NULL DEFAULT 0,
  first_impression_strength REAL NOT NULL DEFAULT 0,
  conversation_hook_strength REAL NOT NULL DEFAULT 0,
  dominant_signals_json TEXT NOT NULL DEFAULT '[]',
  conflicting_signals_json TEXT NOT NULL DEFAULT '[]',
  repeated_signals_json TEXT NOT NULL DEFAULT '[]',
  missing_roles_json TEXT NOT NULL DEFAULT '[]',
  weakest_links_json TEXT NOT NULL DEFAULT '[]',
  unexpected_strengths_json TEXT NOT NULL DEFAULT '[]',
  marginal_values_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_profile_assessments_variant
  ON profile_assessments(profile_variant_id);

CREATE TABLE IF NOT EXISTS profile_experiments (
  id TEXT PRIMARY KEY NOT NULL,
  profile_variant_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  min_duration_days INTEGER NOT NULL DEFAULT 3,
  target_duration_days INTEGER NOT NULL DEFAULT 5,
  max_duration_days INTEGER NOT NULL DEFAULT 7,
  imperfect_deployment INTEGER NOT NULL DEFAULT 0,
  started_at TEXT,
  completed_at TEXT,
  completion_reason TEXT,
  previous_variant_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_profile_experiments_status ON profile_experiments(status);

CREATE TABLE IF NOT EXISTS experiment_pre_feedback (
  id TEXT PRIMARY KEY NOT NULL,
  experiment_id TEXT NOT NULL,
  bot_expectation TEXT NOT NULL DEFAULT '',
  bot_expected_metrics_json TEXT NOT NULL DEFAULT '{}',
  user_expected_outcome TEXT NOT NULL DEFAULT '',
  user_expected_metrics_json TEXT,
  user_authenticity_rating REAL,
  user_notes TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_experiment_pre_feedback_experiment
  ON experiment_pre_feedback(experiment_id);

CREATE TABLE IF NOT EXISTS experiment_post_feedback (
  id TEXT PRIMARY KEY NOT NULL,
  experiment_id TEXT NOT NULL,
  actual_outcome_summary TEXT NOT NULL DEFAULT '',
  expectations_matched INTEGER NOT NULL DEFAULT 0,
  audience_quality_rating REAL,
  comfort_rating REAL,
  would_reuse INTEGER,
  user_interpretation TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_experiment_post_feedback_experiment
  ON experiment_post_feedback(experiment_id);

CREATE TABLE IF NOT EXISTS experiment_metrics (
  id TEXT PRIMARY KEY NOT NULL,
  experiment_id TEXT NOT NULL,
  active_days INTEGER NOT NULL DEFAULT 0,
  eurydice_sessions INTEGER NOT NULL DEFAULT 0,
  incoming_likes INTEGER NOT NULL DEFAULT 0,
  target_incoming_likes INTEGER NOT NULL DEFAULT 0,
  matches INTEGER NOT NULL DEFAULT 0,
  target_matches INTEGER NOT NULL DEFAULT 0,
  conversations INTEGER NOT NULL DEFAULT 0,
  substantive_conversations INTEGER NOT NULL DEFAULT 0,
  telegram_exchanges INTEGER NOT NULL DEFAULT 0,
  date_proposed INTEGER NOT NULL DEFAULT 0,
  date_scheduled INTEGER NOT NULL DEFAULT 0,
  date_completed INTEGER NOT NULL DEFAULT 0,
  calculated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_experiment_metrics_experiment ON experiment_metrics(experiment_id);

CREATE TABLE IF NOT EXISTS profile_insights (
  id TEXT PRIMARY KEY NOT NULL,
  statement TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0,
  sample_size INTEGER NOT NULL DEFAULT 0,
  valid_from TEXT NOT NULL,
  valid_until TEXT,
  context_json TEXT NOT NULL DEFAULT '{}',
  stability TEXT NOT NULL DEFAULT 'temporary',
  last_confirmed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS candidate_identities (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT,
  age INTEGER,
  primary_photo_hash TEXT,
  additional_photo_hashes_json TEXT NOT NULL DEFAULT '[]',
  bio_fingerprint TEXT,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS candidate_observations (
  id TEXT PRIMARY KEY NOT NULL,
  candidate_identity_id TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'twinby-scan',
  raw_evidence_json TEXT NOT NULL DEFAULT '{}',
  screen_type TEXT
);
CREATE INDEX IF NOT EXISTS idx_candidate_observations_identity
  ON candidate_observations(candidate_identity_id);

CREATE TABLE IF NOT EXISTS current_incoming_likes (
  relationship_id TEXT PRIMARY KEY NOT NULL,
  candidate_identity_id TEXT NOT NULL,
  detected_at TEXT NOT NULL,
  last_confirmed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS current_matches (
  relationship_id TEXT PRIMARY KEY NOT NULL,
  candidate_identity_id TEXT NOT NULL,
  matched_at TEXT NOT NULL,
  last_confirmed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS current_dialogs (
  relationship_id TEXT PRIMARY KEY NOT NULL,
  candidate_identity_id TEXT NOT NULL,
  last_message_at TEXT,
  rank_position INTEGER,
  last_confirmed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS relationships (
  id TEXT PRIMARY KEY NOT NULL,
  candidate_identity_id TEXT NOT NULL,
  origin TEXT NOT NULL DEFAULT 'unknown',
  current_stage TEXT NOT NULL DEFAULT 'incoming-like',
  model_audience_fit TEXT NOT NULL DEFAULT 'borderline',
  final_audience_fit TEXT NOT NULL DEFAULT 'borderline',
  audience_score REAL NOT NULL DEFAULT 0,
  audience_confidence REAL NOT NULL DEFAULT 0,
  model_reasons_json TEXT NOT NULL DEFAULT '[]',
  corrected_by_user INTEGER NOT NULL DEFAULT 0,
  correction_reasons_json TEXT NOT NULL DEFAULT '[]',
  correction_comment TEXT,
  attributed_profile_snapshot_id TEXT,
  attributed_profile_variant_id TEXT,
  experiment_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_relationships_stage ON relationships(current_stage);
CREATE INDEX IF NOT EXISTS idx_relationships_candidate ON relationships(candidate_identity_id);

CREATE TABLE IF NOT EXISTS relationship_events (
  id TEXT PRIMARY KEY NOT NULL,
  relationship_id TEXT NOT NULL,
  type TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'twinby-scan',
  metadata_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_relationship_events_relationship
  ON relationship_events(relationship_id);

CREATE TABLE IF NOT EXISTS profile_variant_alignments (
  id TEXT PRIMARY KEY NOT NULL,
  candidate_observation_id TEXT NOT NULL,
  profile_variant_id TEXT NOT NULL,
  semantic_alignment REAL NOT NULL DEFAULT 0,
  historical_performance REAL,
  combined_estimate REAL NOT NULL DEFAULT 0,
  confidence REAL NOT NULL DEFAULT 0,
  matched_signals_json TEXT NOT NULL DEFAULT '[]',
  conflicting_signals_json TEXT NOT NULL DEFAULT '[]',
  unknowns_json TEXT NOT NULL DEFAULT '[]',
  history_sample_size INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS efficiency_weight_policies (
  id TEXT PRIMARY KEY NOT NULL,
  incoming_like_weight REAL NOT NULL DEFAULT 1,
  target_incoming_like_weight REAL NOT NULL DEFAULT 3,
  match_weight REAL NOT NULL DEFAULT 1,
  target_match_weight REAL NOT NULL DEFAULT 2,
  telegram_weight REAL NOT NULL DEFAULT 4,
  date_weight REAL NOT NULL DEFAULT 6,
  source TEXT NOT NULL DEFAULT 'default',
  sample_size INTEGER NOT NULL DEFAULT 0,
  explanation TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS efficiency_comparison_policies (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  config_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS locator_profiles (
  id TEXT PRIMARY KEY NOT NULL,
  twinby_version TEXT,
  device_model TEXT,
  screen_width INTEGER NOT NULL DEFAULT 0,
  screen_height INTEGER NOT NULL DEFAULT 0,
  orientation TEXT NOT NULL DEFAULT 'portrait',
  theme TEXT,
  created_at TEXT NOT NULL,
  last_validated_at TEXT
);

CREATE TABLE IF NOT EXISTS locator_entries (
  id TEXT PRIMARY KEY NOT NULL,
  locator_profile_id TEXT NOT NULL,
  target_key TEXT NOT NULL,
  strategy TEXT NOT NULL,
  value TEXT,
  x_ratio REAL,
  y_ratio REAL,
  note TEXT,
  discovered_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_locator_entries_profile ON locator_entries(locator_profile_id);

CREATE TABLE IF NOT EXISTS preflight_runs (
  id TEXT PRIMARY KEY NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  status TEXT NOT NULL DEFAULT 'running',
  override_used INTEGER NOT NULL DEFAULT 0,
  override_reason TEXT,
  summary_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_preflight_runs_started ON preflight_runs(started_at);

CREATE TABLE IF NOT EXISTS preflight_run_steps (
  id TEXT PRIMARY KEY NOT NULL,
  run_id TEXT NOT NULL,
  step_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  position INTEGER NOT NULL DEFAULT 0,
  started_at TEXT,
  completed_at TEXT,
  summary TEXT,
  error TEXT
);
CREATE INDEX IF NOT EXISTS idx_preflight_run_steps_run ON preflight_run_steps(run_id);
`;

const HISTORY_V2_CLEARED_KEY = 'history_v2_cleared';

function migrateHistoryAuditColumns(sqlite: InstanceType<typeof Database>): void {
  const cols = sqlite
    .prepare(`PRAGMA table_info(history_events)`)
    .all() as Array<{ name: string }>;
  const names = new Set(cols.map((c) => c.name));
  if (!names.has('auto_executed')) {
    sqlite.exec(
      `ALTER TABLE history_events ADD COLUMN auto_executed INTEGER NOT NULL DEFAULT 0`,
    );
  }
  if (!names.has('session_mode')) {
    sqlite.exec(`ALTER TABLE history_events ADD COLUMN session_mode TEXT`);
  }
  if (!names.has('effective_confidence')) {
    sqlite.exec(`ALTER TABLE history_events ADD COLUMN effective_confidence REAL`);
  }
}

function migrateSessionDetailColumns(sqlite: InstanceType<typeof Database>): void {
  const cols = sqlite
    .prepare(`PRAGMA table_info(sessions)`)
    .all() as Array<{ name: string }>;
  const names = new Set(cols.map((c) => c.name));
  if (!names.has('has_detail')) {
    sqlite.exec(
      `ALTER TABLE sessions ADD COLUMN has_detail INTEGER NOT NULL DEFAULT 0`,
    );
  }
}

function migrateModelCodeNameColumns(sqlite: InstanceType<typeof Database>): void {
  const audienceCols = sqlite
    .prepare(`PRAGMA table_info(audience_model_versions)`)
    .all() as Array<{ name: string }>;
  if (!audienceCols.some((c) => c.name === 'code_name')) {
    sqlite.exec(
      `ALTER TABLE audience_model_versions ADD COLUMN code_name TEXT NOT NULL DEFAULT ''`,
    );
  }
  const identityCols = sqlite
    .prepare(`PRAGMA table_info(identity_model_versions)`)
    .all() as Array<{ name: string }>;
  if (!identityCols.some((c) => c.name === 'code_name')) {
    sqlite.exec(
      `ALTER TABLE identity_model_versions ADD COLUMN code_name TEXT NOT NULL DEFAULT ''`,
    );
  }
}

function migrateExperimentImperfectColumn(
  sqlite: InstanceType<typeof Database>,
): void {
  const cols = sqlite
    .prepare(`PRAGMA table_info(profile_experiments)`)
    .all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === 'imperfect_deployment')) {
    sqlite.exec(
      `ALTER TABLE profile_experiments ADD COLUMN imperfect_deployment INTEGER NOT NULL DEFAULT 0`,
    );
  }
}

function wipeLegacyHistoryOnce(
  db: AppDatabase,
  sqlite: InstanceType<typeof Database>,
): boolean {
  const flag = getSetting(db, HISTORY_V2_CLEARED_KEY);
  if (flag === '1') {
    return false;
  }
  sqlite.exec(`DELETE FROM history_profile_details`);
  sqlite.exec(`DELETE FROM history_events`);
  sqlite.exec(`DELETE FROM sessions`);
  setSetting(db, HISTORY_V2_CLEARED_KEY, '1');
  return true;
}

const DEFAULT_AI_CONFIG_JSON = {
  timeoutMs: 180_000,
  maxRetries: 2,
  maxOutputTokens: 1024,
  temperature: 0.2,
  responseFormatMode: 'json-object' as const,
  maxCandidatePhotos: 3,
  positiveAnchorsCount: 3,
  negativeAnchorsCount: 3,
  imageDetail: 'low' as const,
  usdPer1kTokens: 0.002,
  fallbackEnabled: true,
  jsonRepairEnabled: true,
};

export function bootstrapDatabase(dbPath: string): BootstrapDatabaseResult {
  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.exec(MIGRATIONS_SQL);
  migrateHistoryAuditColumns(sqlite);
  migrateSessionDetailColumns(sqlite);
  migrateModelCodeNameColumns(sqlite);
  migrateExperimentImperfectColumn(sqlite);

  const db = drizzle(sqlite, { schema });
  ensureDefaultAiConfig(db);
  ensureDefaultPreferenceProfile(db);
  ensureDefaultAudienceModel(db);
  ensureDefaultIdentityModel(db);
  ensureDefaultCloudConnections(db);
  const historyCleared = wipeLegacyHistoryOnce(db, sqlite);

  return {
    db,
    sqlite,
    path: dbPath,
    migrated: true,
    historyCleared,
  };
}

function ensureDefaultAiConfig(db: AppDatabase): void {
  const existing = db.select().from(aiConfigs).limit(1).get();
  if (existing) {
    return;
  }
  const now = new Date().toISOString();
  db.insert(aiConfigs)
    .values({
      id: 'default',
      provider: 'arionhub',
      baseUrl: DEFAULT_ARIONHUB_BASE_URL,
      primaryModel: DEFAULT_PRIMARY_MODEL,
      fallbackModel: DEFAULT_FALLBACK_MODEL,
      configJson: JSON.stringify(DEFAULT_AI_CONFIG_JSON),
      secretId: 'ai.api_key',
      updatedAt: now,
    })
    .run();
}

/** Aggressive auto: almost always like/dislike without asking. */
const AUTO_THRESHOLDS_AGGRESSIVE = {
  likeScore: 50,
  dislikeScore: 49,
  autoLikeScore: 0,
  autoDislikeScore: 100,
  minConfidence: 0,
} as const;

const WEIGHTS_VISUAL_FIRST = {
  visual: 0.65,
  presentation: 0.15,
  bio: 0.08,
  interests: 0.06,
  compatibility: 0.04,
  distance: 0.02,
} as const;

const UNCERTAINTY_BODY_STRICT =
  'Почти никогда не выбирать review. При сомнении по телосложению/hardReject → dislike. Like только если лицо и силуэт явно близки к позитивным референсам.';

function migratePreferenceDefaultsIfNeeded(
  db: AppDatabase,
  row: {
    id: string;
    thresholdsJson: string;
    weightsJson: string;
    narrativeJson: string;
    version: number;
  },
): { thresholdsJson: string; weightsJson: string; narrativeJson: string } {
  const thresholds = ThresholdsSchema.parse(JSON.parse(row.thresholdsJson));
  const weights = WeightsSchema.parse(JSON.parse(row.weightsJson));
  const narrative = NarrativeSchema.parse(JSON.parse(row.narrativeJson));

  const needsAggressiveAuto =
    thresholds.minConfidence > 0 ||
    thresholds.autoLikeScore > 0 ||
    thresholds.autoDislikeScore < 100 ||
    thresholds.likeScore !== AUTO_THRESHOLDS_AGGRESSIVE.likeScore;
  const needsVisualWeights = weights.visual < 0.62;

  const nextThresholds = needsAggressiveAuto
    ? ThresholdsSchema.parse({ ...thresholds, ...AUTO_THRESHOLDS_AGGRESSIVE })
    : thresholds;
  const nextWeights = needsVisualWeights
    ? WeightsSchema.parse({ ...weights, ...WEIGHTS_VISUAL_FIRST })
    : weights;

  let nextNarrative = narrative;
  const uncertaintyNeedsUpdate =
    !narrative.uncertaintyPolicy?.trim() ||
    /review/i.test(narrative.uncertaintyPolicy) ||
    /красота\s*→\s*like|красота -> like/i.test(narrative.uncertaintyPolicy);
  if (!narrative.priorities?.trim() || uncertaintyNeedsUpdate) {
    nextNarrative = NarrativeSchema.parse({
      ...narrative,
      priorities:
        narrative.priorities?.trim() ||
        'Главное — физическая внешность (лицо + телосложение) и сходство с позитивными референсами. Стиль/образ вторичен.',
      uncertaintyPolicy: UNCERTAINTY_BODY_STRICT,
    });
  }

  const thresholdsJson = JSON.stringify(nextThresholds);
  const weightsJson = JSON.stringify(nextWeights);
  const narrativeJson = JSON.stringify(nextNarrative);

  if (
    needsAggressiveAuto ||
    needsVisualWeights ||
    narrativeJson !== row.narrativeJson
  ) {
    db.update(preferenceProfiles)
      .set({
        thresholdsJson,
        weightsJson,
        narrativeJson,
        version: row.version + 1,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(preferenceProfiles.id, row.id))
      .run();
  }

  return { thresholdsJson, weightsJson, narrativeJson };
}

function ensureDefaultPreferenceProfile(db: AppDatabase): void {
  const existing = db.select().from(preferenceProfiles).limit(1).get();
  if (!existing) {
    const now = new Date().toISOString();
    db.insert(preferenceProfiles)
      .values({
        id: 'default',
        name: 'Основной',
        hardFiltersJson: JSON.stringify(HardFiltersSchema.parse({})),
        narrativeJson: JSON.stringify(NarrativeSchema.parse({})),
        weightsJson: JSON.stringify(WeightsSchema.parse(WEIGHTS_VISUAL_FIRST)),
        thresholdsJson: JSON.stringify(
          ThresholdsSchema.parse(AUTO_THRESHOLDS_AGGRESSIVE),
        ),
        version: 1,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return;
  }

  try {
    migratePreferenceDefaultsIfNeeded(db, existing);
  } catch {
    /* keep stored profile */
  }
}

export function getLatestConsent(db: AppDatabase): LegalConsent | null {
  const row = db
    .select()
    .from(legalConsents)
    .orderBy(desc(legalConsents.acceptedAt))
    .limit(1)
    .get();

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    consentVersion: row.consentVersion,
    acceptedAt: row.acceptedAt,
    appVersion: row.appVersion,
  };
}

export function acceptConsent(
  db: AppDatabase,
  input: { consentVersion: string },
): LegalConsent {
  const consent: LegalConsent = {
    id: randomUUID(),
    consentVersion: input.consentVersion,
    acceptedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
  };

  db.insert(legalConsents)
    .values({
      id: consent.id,
      consentVersion: consent.consentVersion,
      acceptedAt: consent.acceptedAt,
      appVersion: consent.appVersion,
    })
    .run();

  return consent;
}

export function setSetting(
  db: AppDatabase,
  key: string,
  value: string,
  encrypted = false,
): void {
  const updatedAt = new Date().toISOString();
  const existing = db
    .select()
    .from(schema.appSettings)
    .where(eq(schema.appSettings.key, key))
    .get();

  if (existing) {
    db.update(schema.appSettings)
      .set({ value, encrypted, updatedAt })
      .where(eq(schema.appSettings.key, key))
      .run();
    return;
  }

  db.insert(schema.appSettings)
    .values({ key, value, encrypted, updatedAt })
    .run();
}

export function getSetting(db: AppDatabase, key: string): string | null {
  const row = db
    .select()
    .from(schema.appSettings)
    .where(eq(schema.appSettings.key, key))
    .get();
  return row?.value ?? null;
}

export function deleteSetting(db: AppDatabase, key: string): void {
  db.delete(schema.appSettings).where(eq(schema.appSettings.key, key)).run();
}

export function getAiConfigRow(db: AppDatabase) {
  return db.select().from(aiConfigs).where(eq(aiConfigs.id, 'default')).get();
}

export function toPublicAiConfig(
  db: AppDatabase,
  hasApiKey: boolean,
  apiKeyPlainForMask?: string | null,
): AiConfig {
  const row = getAiConfigRow(db);
  if (!row) {
    throw new Error('AI config missing');
  }
  const cfg = JSON.parse(row.configJson) as typeof DEFAULT_AI_CONFIG_JSON & {
    sessionSpendingLimitUsd?: number;
    dailySpendingLimitUsd?: number;
    usdPer1kTokens?: number;
  };

  return {
    id: row.id,
    provider: 'arionhub',
    baseUrl: row.baseUrl,
    primaryModel: row.primaryModel,
    fallbackModel: row.fallbackModel ?? undefined,
    timeoutMs: cfg.timeoutMs,
    maxRetries: cfg.maxRetries,
    maxOutputTokens: cfg.maxOutputTokens,
    temperature: cfg.temperature,
    responseFormatMode: cfg.responseFormatMode,
    maxCandidatePhotos: cfg.maxCandidatePhotos,
    positiveAnchorsCount: cfg.positiveAnchorsCount,
    negativeAnchorsCount: cfg.negativeAnchorsCount,
    imageDetail: cfg.imageDetail,
    sessionSpendingLimitUsd: cfg.sessionSpendingLimitUsd,
    dailySpendingLimitUsd: cfg.dailySpendingLimitUsd,
    usdPer1kTokens: cfg.usdPer1kTokens ?? 0.002,
    fallbackEnabled: cfg.fallbackEnabled,
    jsonRepairEnabled: cfg.jsonRepairEnabled,
    hasApiKey,
    apiKeyMasked: apiKeyPlainForMask ? maskApiKey(apiKeyPlainForMask) : null,
    updatedAt: row.updatedAt,
  };
}

const AI_DAILY_SPEND_KEY = 'ai_daily_spend_v1';

export function getDailyAiSpendUsd(db: AppDatabase): number {
  const raw = getSetting(db, AI_DAILY_SPEND_KEY);
  if (!raw) {
    return 0;
  }
  try {
    const parsed = JSON.parse(raw) as { date?: string; usd?: number };
    const today = new Date().toISOString().slice(0, 10);
    if (parsed.date !== today) {
      return 0;
    }
    return typeof parsed.usd === 'number' && parsed.usd > 0 ? parsed.usd : 0;
  } catch {
    return 0;
  }
}

export function addDailyAiSpendUsd(db: AppDatabase, deltaUsd: number): number {
  if (!(deltaUsd > 0)) {
    return getDailyAiSpendUsd(db);
  }
  const today = new Date().toISOString().slice(0, 10);
  const next = getDailyAiSpendUsd(db) + deltaUsd;
  setSetting(db, AI_DAILY_SPEND_KEY, JSON.stringify({ date: today, usd: next }));
  return next;
}

export function saveAiConfigRow(
  db: AppDatabase,
  input: {
    baseUrl: string;
    primaryModel: string;
    fallbackModel?: string;
    configJson: string;
  },
): void {
  const updatedAt = new Date().toISOString();
  db.update(aiConfigs)
    .set({
      baseUrl: input.baseUrl,
      primaryModel: input.primaryModel,
      fallbackModel: input.fallbackModel ?? null,
      configJson: input.configJson,
      updatedAt,
    })
    .where(eq(aiConfigs.id, 'default'))
    .run();
}

export function upsertModelCapabilities(
  db: AppDatabase,
  caps: ModelCapabilities,
): void {
  const existing = db
    .select()
    .from(modelCapabilities)
    .where(eq(modelCapabilities.model, caps.model))
    .get();

  const values = {
    model: caps.model,
    textStatus: caps.text,
    visionStatus: caps.vision,
    jsonStatus: caps.jsonObject,
    latencyMs: caps.latencyMs ?? null,
    testedAt: caps.testedAt,
    error: caps.error ?? null,
  };

  if (existing) {
    db.update(modelCapabilities)
      .set(values)
      .where(eq(modelCapabilities.model, caps.model))
      .run();
    return;
  }

  db.insert(modelCapabilities).values(values).run();
}

export function getModelCapabilities(
  db: AppDatabase,
  model: string,
): ModelCapabilities | null {
  const row = db
    .select()
    .from(modelCapabilities)
    .where(eq(modelCapabilities.model, model))
    .get();
  if (!row) {
    return null;
  }
  return {
    model: row.model,
    text: row.textStatus as ModelCapabilities['text'],
    vision: row.visionStatus as ModelCapabilities['vision'],
    jsonObject: row.jsonStatus as ModelCapabilities['jsonObject'],
    testedAt: row.testedAt,
    latencyMs: row.latencyMs ?? undefined,
    error: row.error ?? undefined,
  };
}

export function getPreferenceProfile(db: AppDatabase): PreferenceProfile {
  const row = db
    .select()
    .from(preferenceProfiles)
    .where(eq(preferenceProfiles.id, 'default'))
    .get();
  if (!row) {
    throw new Error('Preference profile missing');
  }
  const migrated = migratePreferenceDefaultsIfNeeded(db, row);
  return {
    id: row.id,
    name: row.name,
    hardFilters: HardFiltersSchema.parse(JSON.parse(row.hardFiltersJson)),
    narrative: NarrativeSchema.parse(JSON.parse(migrated.narrativeJson)),
    weights: WeightsSchema.parse(JSON.parse(migrated.weightsJson)),
    thresholds: ThresholdsSchema.parse(JSON.parse(migrated.thresholdsJson)),
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function savePreferenceProfile(
  db: AppDatabase,
  input: PreferenceProfileInput,
): PreferenceProfile {
  const current = getPreferenceProfile(db);
  const updatedAt = new Date().toISOString();
  const next = {
    name: input.name ?? current.name,
    hardFilters: HardFiltersSchema.parse({
      ...current.hardFilters,
      ...input.hardFilters,
    }),
    narrative: NarrativeSchema.parse({
      ...current.narrative,
      ...input.narrative,
    }),
    weights: WeightsSchema.parse({
      ...current.weights,
      ...input.weights,
    }),
    thresholds: ThresholdsSchema.parse({
      ...current.thresholds,
      ...input.thresholds,
    }),
    version: current.version + 1,
  };

  db.update(preferenceProfiles)
    .set({
      name: next.name,
      hardFiltersJson: JSON.stringify(next.hardFilters),
      narrativeJson: JSON.stringify(next.narrative),
      weightsJson: JSON.stringify(next.weights),
      thresholdsJson: JSON.stringify(next.thresholds),
      version: next.version,
      updatedAt,
    })
    .where(eq(preferenceProfiles.id, 'default'))
    .run();

  return getPreferenceProfile(db);
}

export function computeReferencesFingerprint(
  refs: Array<{ id: string; checksum: string; polarity: string }>,
): string {
  return refs
    .map((r) => `${r.id}:${r.checksum}:${r.polarity}`)
    .sort()
    .join('|');
}

function mapReferenceRow(row: typeof referenceImages.$inferSelect): ReferenceImage {
  return {
    id: row.id,
    preferenceProfileId: row.preferenceProfileId,
    polarity: row.polarity as ReferencePolarity,
    filePath: row.path,
    thumbnailPath: row.thumbnailPath,
    comment: row.comment ?? undefined,
    tags: JSON.parse(row.tagsJson) as string[],
    weight: row.weight,
    pinned: row.pinned,
    checksum: row.checksum,
    createdAt: row.createdAt,
  };
}

export function listReferenceImages(db: AppDatabase): ReferenceImage[] {
  const rows = db
    .select()
    .from(referenceImages)
    .orderBy(desc(referenceImages.createdAt))
    .all();
  return rows.map(mapReferenceRow);
}

export function insertReferenceImage(
  db: AppDatabase,
  input: {
    id: string;
    polarity: ReferencePolarity;
    path: string;
    thumbnailPath: string;
    comment?: string;
    tags?: string[];
    weight?: number;
    pinned?: boolean;
    checksum: string;
  },
): ReferenceImage {
  const createdAt = new Date().toISOString();
  db.insert(referenceImages)
    .values({
      id: input.id,
      preferenceProfileId: 'default',
      polarity: input.polarity,
      path: input.path,
      thumbnailPath: input.thumbnailPath,
      comment: input.comment ?? null,
      tagsJson: JSON.stringify(input.tags ?? []),
      weight: input.weight ?? 1,
      pinned: input.pinned ?? false,
      checksum: input.checksum,
      createdAt,
    })
    .run();
  const row = db
    .select()
    .from(referenceImages)
    .where(eq(referenceImages.id, input.id))
    .get();
  if (!row) {
    throw new Error('Failed to insert reference');
  }
  return mapReferenceRow(row);
}

export function updateReferenceImage(
  db: AppDatabase,
  input: {
    id: string;
    comment?: string;
    weight?: number;
    pinned?: boolean;
    polarity?: ReferencePolarity;
  },
): ReferenceImage {
  const existing = db
    .select()
    .from(referenceImages)
    .where(eq(referenceImages.id, input.id))
    .get();
  if (!existing) {
    throw new Error('Референс не найден');
  }
  db.update(referenceImages)
    .set({
      comment: input.comment !== undefined ? input.comment : existing.comment,
      weight: input.weight ?? existing.weight,
      pinned: input.pinned ?? existing.pinned,
      polarity: input.polarity ?? existing.polarity,
    })
    .where(eq(referenceImages.id, input.id))
    .run();
  const row = db
    .select()
    .from(referenceImages)
    .where(eq(referenceImages.id, input.id))
    .get();
  if (!row) {
    throw new Error('Референс не найден после обновления');
  }
  return mapReferenceRow(row);
}

export function deleteReferenceImage(db: AppDatabase, id: string): ReferenceImage | null {
  const existing = db
    .select()
    .from(referenceImages)
    .where(eq(referenceImages.id, id))
    .get();
  if (!existing) {
    return null;
  }
  db.delete(referenceImages).where(eq(referenceImages.id, id)).run();
  return mapReferenceRow(existing);
}

export function getStoredPreferenceSummary(
  db: AppDatabase,
): StoredPreferenceSummary | null {
  const row = db
    .select()
    .from(preferenceSummaries)
    .where(eq(preferenceSummaries.id, 'default'))
    .get();
  if (!row) {
    return null;
  }
  const refs = listReferenceImages(db);
  const fingerprint = computeReferencesFingerprint(refs);
  return {
    id: row.id,
    preferenceProfileId: row.preferenceProfileId,
    summary: PreferenceSummarySchema.parse(JSON.parse(row.summaryJson)),
    sourceFingerprint: row.sourceFingerprint,
    model: row.model ?? undefined,
    analyzedAt: row.analyzedAt,
    updatedAt: row.updatedAt,
    stale: row.sourceFingerprint !== fingerprint,
    latencyMs: row.latencyMs ?? undefined,
  };
}

export function saveStoredPreferenceSummary(
  db: AppDatabase,
  input: {
    summary: PreferenceSummary;
    sourceFingerprint: string;
    model?: string;
    latencyMs?: number;
    analyzedAt?: string;
  },
): StoredPreferenceSummary {
  const now = new Date().toISOString();
  const analyzedAt = input.analyzedAt ?? now;
  const existing = db
    .select()
    .from(preferenceSummaries)
    .where(eq(preferenceSummaries.id, 'default'))
    .get();

  const values = {
    id: 'default',
    preferenceProfileId: 'default',
    summaryJson: JSON.stringify(PreferenceSummarySchema.parse(input.summary)),
    sourceFingerprint: input.sourceFingerprint,
    model: input.model ?? null,
    analyzedAt,
    updatedAt: now,
    latencyMs: input.latencyMs ?? null,
  };

  if (existing) {
    db.update(preferenceSummaries)
      .set(values)
      .where(eq(preferenceSummaries.id, 'default'))
      .run();
  } else {
    db.insert(preferenceSummaries).values(values).run();
  }

  const stored = getStoredPreferenceSummary(db);
  if (!stored) {
    throw new Error('Failed to save preference summary');
  }
  return stored;
}

export function insertSession(
  db: AppDatabase,
  input: {
    id: string;
    mode: string;
    source: string;
    status: string;
    startedAt: string;
    counters: SessionCounters;
    hasDetail?: boolean;
  },
): void {
  db.insert(sessions)
    .values({
      id: input.id,
      mode: input.mode,
      source: input.source,
      status: input.status,
      startedAt: input.startedAt,
      stoppedAt: null,
      countersJson: JSON.stringify(input.counters),
      error: null,
      hasDetail: input.hasDetail ?? false,
    })
    .run();
}

export function listDetailedSessionIds(db: AppDatabase): string[] {
  return db
    .select({ id: sessions.id })
    .from(sessions)
    .where(eq(sessions.hasDetail, true))
    .all()
    .map((row) => row.id);
}

export function clearSessionHasDetail(db: AppDatabase, sessionId: string): void {
  db.update(sessions)
    .set({ hasDetail: false })
    .where(eq(sessions.id, sessionId))
    .run();
}

export function deleteHistoryProfileDetailsForSession(
  db: AppDatabase,
  sessionId: string,
): void {
  db.delete(historyProfileDetails)
    .where(eq(historyProfileDetails.sessionId, sessionId))
    .run();
}

/** Remove session row + all history events for that session. */
export function deleteHistorySession(db: AppDatabase, sessionId: string): void {
  deleteHistoryProfileDetailsForSession(db, sessionId);
  db.delete(historyEvents).where(eq(historyEvents.sessionId, sessionId)).run();
  db.delete(sessions).where(eq(sessions.id, sessionId)).run();
}

export function insertHistoryProfileDetail(
  db: AppDatabase,
  input: {
    historyEventId: string;
    sessionId: string;
    displayName?: string;
    bio?: string;
    profileText?: string;
    modelDecision?: string;
    modelExcerpt?: string;
    photoPaths: string[];
  },
): void {
  db.insert(historyProfileDetails)
    .values({
      historyEventId: input.historyEventId,
      sessionId: input.sessionId,
      displayName: input.displayName ?? null,
      bio: input.bio ?? null,
      profileText: input.profileText ?? null,
      modelDecision: input.modelDecision ?? null,
      modelExcerpt: input.modelExcerpt ?? null,
      photoPathsJson: JSON.stringify(input.photoPaths),
      userOverrideDecision: null,
      userFeedbackComment: null,
      feedbackSentAt: null,
    })
    .run();
}

export function updateHistoryProfileFeedback(
  db: AppDatabase,
  input: {
    eventId: string;
    decision?: 'agree' | 'like' | 'dislike';
    comment?: string;
  },
): void {
  const existing = db
    .select()
    .from(historyProfileDetails)
    .where(eq(historyProfileDetails.historyEventId, input.eventId))
    .get();
  if (!existing) {
    throw new Error('Подробности анкеты не найдены — доступны только для последней сессии');
  }
  db.update(historyProfileDetails)
    .set({
      userOverrideDecision:
        input.decision !== undefined
          ? input.decision
          : existing.userOverrideDecision,
      userFeedbackComment:
        input.comment !== undefined
          ? input.comment || null
          : existing.userFeedbackComment,
    })
    .where(eq(historyProfileDetails.historyEventId, input.eventId))
    .run();
}

export function markHistoryFeedbackSent(
  db: AppDatabase,
  sessionId: string,
  sentAt: string,
): void {
  const rows = db
    .select()
    .from(historyProfileDetails)
    .where(eq(historyProfileDetails.sessionId, sessionId))
    .all()
    .filter((row) => row.userOverrideDecision || row.userFeedbackComment);
  for (const row of rows) {
    db.update(historyProfileDetails)
      .set({ feedbackSentAt: sentAt })
      .where(eq(historyProfileDetails.historyEventId, row.historyEventId))
      .run();
  }
}

export function listHistorySessions(db: AppDatabase): HistorySessionSummary[] {
  const rows = db
    .select()
    .from(sessions)
    .orderBy(desc(sessions.startedAt))
    .all();

  return rows.map((row) => {
    const counters = JSON.parse(row.countersJson) as SessionCounters;
    const start = new Date(row.startedAt).getTime();
    const end = row.stoppedAt ? new Date(row.stoppedAt).getTime() : Date.now();
    const profileCount = db
      .select()
      .from(historyEvents)
      .where(eq(historyEvents.sessionId, row.id))
      .all().length;
    return {
      id: row.id,
      mode: row.mode as HistorySessionSummary['mode'],
      source: row.source as HistorySessionSummary['source'],
      status: row.status,
      startedAt: row.startedAt,
      stoppedAt: row.stoppedAt ?? undefined,
      durationMs: Math.max(0, end - start),
      viewed: counters.viewed ?? 0,
      likes: counters.likes ?? 0,
      dislikes: counters.dislikes ?? 0,
      errors: counters.errors ?? 0,
      hasDetail: Boolean(row.hasDetail),
      profileCount,
    };
  });
}

export function listSessionProfiles(
  db: AppDatabase,
  query: { sessionId: string; limit: number; offset: number },
  resolvePhotoDataUrls: (paths: string[]) => string[],
): PaginatedHistorySessionProfiles {
  const all = db
    .select()
    .from(historyEvents)
    .where(eq(historyEvents.sessionId, query.sessionId))
    .orderBy(asc(historyEvents.createdAt))
    .all();

  const slice = all.slice(query.offset, query.offset + query.limit);
  const items: HistorySessionProfile[] = slice.map((row) => {
    const detail = db
      .select()
      .from(historyProfileDetails)
      .where(eq(historyProfileDetails.historyEventId, row.id))
      .get();
    const photoPaths = detail
      ? (JSON.parse(detail.photoPathsJson) as string[])
      : [];
    return {
      id: row.id,
      sessionId: row.sessionId,
      createdAt: row.createdAt,
      fixtureId: row.fixtureId ?? undefined,
      captureId: row.captureId,
      modelDecision: (row.modelDecision as HistorySessionProfile['modelDecision']) ?? undefined,
      userDecision: (row.userDecision as HistorySessionProfile['userDecision']) ?? undefined,
      decisionSource: row.decisionSource as HistorySessionProfile['decisionSource'],
      reasons: JSON.parse(row.reasonsJson) as string[],
      autoExecuted: Boolean(row.autoExecuted),
      corrected: Boolean(row.corrected),
      displayName: detail?.displayName ?? undefined,
      bio: detail?.bio ?? undefined,
      profileText: detail?.profileText ?? undefined,
      modelExcerpt: detail?.modelExcerpt ?? undefined,
      photoDataUrls: detail ? resolvePhotoDataUrls(photoPaths) : [],
      userOverrideDecision:
        (detail?.userOverrideDecision as 'agree' | 'like' | 'dislike' | null) ??
        undefined,
      userFeedbackComment: detail?.userFeedbackComment ?? undefined,
      feedbackSentAt: detail?.feedbackSentAt ?? undefined,
      hasDetail: Boolean(detail),
    };
  });

  return {
    sessionId: query.sessionId,
    total: all.length,
    items,
  };
}

export function getHistoryProfileDetailRow(
  db: AppDatabase,
  eventId: string,
) {
  return db
    .select()
    .from(historyProfileDetails)
    .where(eq(historyProfileDetails.historyEventId, eventId))
    .get();
}

export function getHistorySessionProfile(
  db: AppDatabase,
  eventId: string,
  resolvePhotoDataUrls: (paths: string[]) => string[],
): HistorySessionProfile | null {
  const row = db
    .select()
    .from(historyEvents)
    .where(eq(historyEvents.id, eventId))
    .get();
  if (!row) {
    return null;
  }
  const detail = db
    .select()
    .from(historyProfileDetails)
    .where(eq(historyProfileDetails.historyEventId, row.id))
    .get();
  const photoPaths = detail ? (JSON.parse(detail.photoPathsJson) as string[]) : [];
  return {
    id: row.id,
    sessionId: row.sessionId,
    createdAt: row.createdAt,
    fixtureId: row.fixtureId ?? undefined,
    captureId: row.captureId,
    modelDecision: (row.modelDecision as HistorySessionProfile['modelDecision']) ?? undefined,
    userDecision: (row.userDecision as HistorySessionProfile['userDecision']) ?? undefined,
    decisionSource: row.decisionSource as HistorySessionProfile['decisionSource'],
    reasons: JSON.parse(row.reasonsJson) as string[],
    autoExecuted: Boolean(row.autoExecuted),
    corrected: Boolean(row.corrected),
    displayName: detail?.displayName ?? undefined,
    bio: detail?.bio ?? undefined,
    profileText: detail?.profileText ?? undefined,
    modelExcerpt: detail?.modelExcerpt ?? undefined,
    photoDataUrls: detail ? resolvePhotoDataUrls(photoPaths) : [],
    userOverrideDecision:
      (detail?.userOverrideDecision as 'agree' | 'like' | 'dislike' | null) ?? undefined,
    userFeedbackComment: detail?.userFeedbackComment ?? undefined,
    feedbackSentAt: detail?.feedbackSentAt ?? undefined,
    hasDetail: Boolean(detail),
  };
}

export function listSessionFeedbackItems(db: AppDatabase, sessionId: string) {
  return db
    .select()
    .from(historyProfileDetails)
    .where(eq(historyProfileDetails.sessionId, sessionId))
    .all()
    .filter((row) => row.userOverrideDecision || row.userFeedbackComment)
    .map((row) => {
      const override = row.userOverrideDecision as
        | 'agree'
        | 'like'
        | 'dislike'
        | null;
      const modelDecision = row.modelDecision as 'like' | 'dislike' | 'review' | null;
      let userDecision: 'like' | 'dislike' | undefined;
      let agreed = false;
      if (override === 'agree') {
        agreed = true;
        userDecision =
          modelDecision === 'like' || modelDecision === 'dislike'
            ? modelDecision
            : undefined;
      } else if (override === 'like' || override === 'dislike') {
        userDecision = override;
      }
      return {
        eventId: row.historyEventId,
        displayName: row.displayName ?? undefined,
        bio: row.bio ?? undefined,
        modelDecision: row.modelDecision ?? undefined,
        modelExcerpt: row.modelExcerpt ?? undefined,
        userDecision,
        agreed,
        comment: row.userFeedbackComment ?? undefined,
        photoPaths: JSON.parse(row.photoPathsJson) as string[],
      };
    });
}

export function updateSessionRow(
  db: AppDatabase,
  input: {
    id: string;
    status: string;
    counters: SessionCounters;
    stoppedAt?: string | null;
    error?: string | null;
  },
): void {
  db.update(sessions)
    .set({
      status: input.status,
      countersJson: JSON.stringify(input.counters),
      stoppedAt: input.stoppedAt ?? null,
      error: input.error ?? null,
    })
    .where(eq(sessions.id, input.id))
    .run();
}

export function insertHistoryEvent(
  db: AppDatabase,
  event: Omit<HistoryEvent, 'id' | 'createdAt'> & {
    id?: string;
    createdAt?: string;
    aiRawJson?: string;
  },
): HistoryEvent {
  const id = event.id ?? randomUUID();
  const createdAt = event.createdAt ?? new Date().toISOString();
  db.insert(historyEvents)
    .values({
      id,
      sessionId: event.sessionId,
      createdAt,
      fixtureId: event.fixtureId ?? null,
      captureId: event.captureId,
      modelDecision: event.modelDecision ?? null,
      userDecision: event.userDecision ?? null,
      decisionSource: event.decisionSource,
      confidence: event.confidence ?? null,
      reasonsJson: JSON.stringify(event.reasons ?? []),
      comment: event.comment ?? null,
      latencyMs: event.latencyMs ?? null,
      model: event.model ?? null,
      preferenceVersion: event.preferenceVersion ?? null,
      corrected: event.corrected ?? false,
      aiRawJson: event.aiRawJson ?? null,
      autoExecuted: event.autoExecuted ?? false,
      sessionMode: event.sessionMode ?? null,
      effectiveConfidence: event.effectiveConfidence ?? null,
    })
    .run();

  return {
    id,
    sessionId: event.sessionId,
    createdAt,
    fixtureId: event.fixtureId,
    captureId: event.captureId,
    modelDecision: event.modelDecision,
    userDecision: event.userDecision,
    decisionSource: event.decisionSource,
    confidence: event.confidence,
    effectiveConfidence: event.effectiveConfidence,
    reasons: event.reasons ?? [],
    comment: event.comment,
    latencyMs: event.latencyMs,
    model: event.model,
    preferenceVersion: event.preferenceVersion,
    corrected: event.corrected ?? false,
    autoExecuted: event.autoExecuted ?? false,
    sessionMode: event.sessionMode,
  };
}

export function listHistoryEvents(
  db: AppDatabase,
  query: HistoryQuery = { limit: 50, offset: 0 },
): PaginatedHistory {
  const all = db
    .select()
    .from(historyEvents)
    .orderBy(desc(historyEvents.createdAt))
    .all()
    .filter((row) => (query.sessionId ? row.sessionId === query.sessionId : true));

  const slice = all.slice(query.offset, query.offset + query.limit);
  return {
    total: all.length,
    items: slice.map((row) => ({
      id: row.id,
      sessionId: row.sessionId,
      createdAt: row.createdAt,
      fixtureId: row.fixtureId ?? undefined,
      captureId: row.captureId,
      modelDecision: (row.modelDecision as HistoryEvent['modelDecision']) ?? undefined,
      userDecision: (row.userDecision as HistoryEvent['userDecision']) ?? undefined,
      decisionSource: row.decisionSource as HistoryEvent['decisionSource'],
      confidence: row.confidence ?? undefined,
      reasons: JSON.parse(row.reasonsJson) as string[],
      comment: row.comment ?? undefined,
      latencyMs: row.latencyMs ?? undefined,
      model: row.model ?? undefined,
      preferenceVersion: row.preferenceVersion ?? undefined,
      corrected: Boolean(row.corrected),
      autoExecuted: Boolean(row.autoExecuted),
      sessionMode: (row.sessionMode as HistoryEvent['sessionMode']) ?? undefined,
      effectiveConfidence: row.effectiveConfidence ?? undefined,
    })),
  };
}

/**
 * Recent like/dislike/corrections for in-context learning in evaluate prompts.
 * Prefers history feedback overrides, then rows with comments/corrections.
 */
export function listRecentUserFeedback(
  db: AppDatabase,
  limit = 20,
): Array<{
  userDecision: 'like' | 'dislike' | 'skip';
  modelDecision?: 'like' | 'dislike' | 'review';
  corrected: boolean;
  comment?: string;
  label?: string;
  reasons: string[];
}> {
  const out: Array<{
    userDecision: 'like' | 'dislike' | 'skip';
    modelDecision?: 'like' | 'dislike' | 'review';
    corrected: boolean;
    comment?: string;
    label?: string;
    reasons: string[];
  }> = [];

  const detailRows = db
    .select()
    .from(historyProfileDetails)
    .all()
    .filter((row) => row.userOverrideDecision || row.userFeedbackComment)
    .reverse();

  for (const row of detailRows) {
    const override = row.userOverrideDecision as 'agree' | 'like' | 'dislike' | null;
    if (!override) {
      continue;
    }
    const modelDecision =
      (row.modelDecision as 'like' | 'dislike' | 'review' | null) ?? undefined;
    if (override === 'agree') {
      if (modelDecision !== 'like' && modelDecision !== 'dislike') {
        continue;
      }
      out.push({
        userDecision: modelDecision,
        modelDecision,
        corrected: false,
        comment: row.userFeedbackComment ?? 'Пользователь подтвердил решение модели',
        label: row.displayName ?? undefined,
        reasons: row.modelExcerpt ? [row.modelExcerpt] : [],
      });
    } else {
      out.push({
        userDecision: override,
        modelDecision,
        corrected: true,
        comment: row.userFeedbackComment ?? undefined,
        label: row.displayName ?? undefined,
        reasons: row.modelExcerpt ? [row.modelExcerpt] : [],
      });
    }
    if (out.length >= limit) {
      return out;
    }
  }

  const rows = db
    .select()
    .from(historyEvents)
    .orderBy(desc(historyEvents.createdAt))
    .all();

  for (const row of rows) {
    const userDecision = row.userDecision as 'like' | 'dislike' | 'skip' | null;
    if (!userDecision || userDecision === 'skip') {
      continue;
    }
    if (row.autoExecuted && !row.corrected && !row.comment) {
      continue;
    }
    const reasons = JSON.parse(row.reasonsJson) as string[];
    out.push({
      userDecision,
      modelDecision: (row.modelDecision as 'like' | 'dislike' | 'review' | null) ?? undefined,
      corrected: Boolean(row.corrected),
      comment: row.comment ?? undefined,
      label: row.fixtureId ?? undefined,
      reasons,
    });
    if (out.length >= limit) {
      break;
    }
  }

  return out;
}

/* ========================================================================== */
/* Orpheus domain repositories (preview.md §7-29, §34)                        */
/* ========================================================================== */

function nowIso(): string {
  return new Date().toISOString();
}

function parseJsonArray<T = unknown>(raw: string | null | undefined): T[] {
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function parseJsonObject<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) {
    return fallback;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function parseJsonOptional<T>(raw: string | null | undefined): T | undefined {
  if (!raw) {
    return undefined;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

/* -------------------------------- Audience ------------------------------- */

function mapAudienceSignalRow(row: typeof audienceSignals.$inferSelect): AudienceSignal {
  return {
    id: row.id,
    key: row.key,
    statement: row.statement,
    polarity: row.polarity as AudienceSignal['polarity'],
    category: (row.category as AudienceSignal['category']) ?? undefined,
    status: row.status as AudienceSignal['status'],
    likelihood: row.likelihood as AudienceSignal['likelihood'],
    confidence: row.confidence,
    evidence: parseJsonArray<string>(row.evidenceJson),
    contradictions: parseJsonArray<string>(row.contradictionsJson),
    sourceRefs: parseJsonArray<string>(row.sourceRefsJson),
    createdAt: row.createdAt,
    lastConfirmedAt: row.lastConfirmedAt ?? undefined,
  };
}

function buildAudienceModelView(
  db: AppDatabase,
  row: typeof audienceModelVersions.$inferSelect,
): AudienceModelView {
  const signals = db
    .select()
    .from(audienceSignals)
    .where(eq(audienceSignals.audienceModelId, row.id))
    .all()
    .map(mapAudienceSignalRow);
  const byPolarity = (polarity: string) => signals.filter((s) => s.polarity === polarity);
  const byCategory = (category: string) => signals.filter((s) => s.category === category);

  const visualCore = byCategory('visual-core');
  const visualCoreIds = new Set(visualCore.map((s) => s.id));
  // Likes (+) exclude core (✓) so the four UI groups stay disjoint.
  const positiveSignals = byPolarity('positive').filter((s) => !visualCoreIds.has(s.id));

  return AudienceModelViewSchema.parse({
    id: row.id,
    version: row.version,
    codeName: row.codeName ?? '',
    summary: row.summary,
    positiveSignals,
    negativeSignals: byPolarity('negative'),
    hardRejects: byPolarity('hard-reject'),
    toleratedVariations: byPolarity('tolerated'),
    visualCore,
    presentationPatterns: byCategory('presentation-pattern'),
    secondaryInterests: byCategory('secondary-interest'),
    source: row.source ?? 'user',
    createdAt: row.createdAt,
    supersededAt: row.supersededAt ?? undefined,
  });
}

function ensureDefaultAudienceModel(db: AppDatabase): void {
  const existing = db.select().from(audienceModelVersions).limit(1).get();
  if (existing) {
    return;
  }
  db.insert(audienceModelVersions)
    .values({
      id: randomUUID(),
      version: 1,
      summary: '',
      createdAt: nowIso(),
      supersededAt: null,
      source: 'default',
    })
    .run();
}

function nextAudienceModelVersionNumber(db: AppDatabase): number {
  const latest = db
    .select()
    .from(audienceModelVersions)
    .orderBy(desc(audienceModelVersions.version))
    .limit(1)
    .get();
  return (latest?.version ?? 0) + 1;
}

function getCurrentAudienceModelVersionRow(db: AppDatabase) {
  const open = db
    .select()
    .from(audienceModelVersions)
    .where(isNull(audienceModelVersions.supersededAt))
    .orderBy(desc(audienceModelVersions.version))
    .all();
  if (open.length > 0) {
    const [current, ...extras] = open;
    if (extras.length > 0) {
      const now = nowIso();
      for (const extra of extras) {
        db.update(audienceModelVersions)
          .set({ supersededAt: now })
          .where(eq(audienceModelVersions.id, extra.id))
          .run();
      }
    }
    return current!;
  }

  const row = db
    .select()
    .from(audienceModelVersions)
    .orderBy(desc(audienceModelVersions.version))
    .limit(1)
    .get();
  if (!row) {
    throw new Error('Модель аудитории не инициализирована');
  }
  if (row.supersededAt) {
    db.update(audienceModelVersions)
      .set({ supersededAt: null })
      .where(eq(audienceModelVersions.id, row.id))
      .run();
    return { ...row, supersededAt: null };
  }
  return row;
}

export function getCurrentAudienceModel(db: AppDatabase): AudienceModelView {
  return buildAudienceModelView(db, getCurrentAudienceModelVersionRow(db));
}

export function listAudienceModelVersions(db: AppDatabase): AudienceModelView[] {
  const rows = db
    .select()
    .from(audienceModelVersions)
    .orderBy(desc(audienceModelVersions.version))
    .all();
  return rows.map((row) => buildAudienceModelView(db, row));
}

export function deleteAudienceModelVersion(db: AppDatabase, id: string): void {
  const row = db
    .select()
    .from(audienceModelVersions)
    .where(eq(audienceModelVersions.id, id))
    .get();
  if (!row) {
    throw new Error('Версия Audience не найдена');
  }
  const total = db.select().from(audienceModelVersions).all().length;
  if (total <= 1) {
    throw new Error('Нельзя удалить единственную версию Audience');
  }

  db.delete(audienceSignals)
    .where(eq(audienceSignals.audienceModelId, id))
    .run();
  db.delete(audienceModelVersions)
    .where(eq(audienceModelVersions.id, id))
    .run();

  ensureDefaultAudienceModel(db);
  const current = db
    .select()
    .from(audienceModelVersions)
    .orderBy(desc(audienceModelVersions.version))
    .limit(1)
    .get();
  if (current?.supersededAt) {
    db.update(audienceModelVersions)
      .set({ supersededAt: null })
      .where(eq(audienceModelVersions.id, current.id))
      .run();
  }
}

/** Make a past Audience version the current confirmed draft (no clone). */
export function activateAudienceModelVersion(
  db: AppDatabase,
  id: string,
): AudienceModelView {
  const source = db
    .select()
    .from(audienceModelVersions)
    .where(eq(audienceModelVersions.id, id))
    .get();
  if (!source) {
    throw new Error('Версия Audience не найдена');
  }

  const current = getCurrentAudienceModelVersionRow(db);
  const now = nowIso();

  if (source.id !== current.id) {
    db.update(audienceModelVersions)
      .set({ supersededAt: now })
      .where(eq(audienceModelVersions.id, current.id))
      .run();
  }

  db.update(audienceModelVersions)
    .set({ source: 'user-confirmed', supersededAt: null })
    .where(eq(audienceModelVersions.id, source.id))
    .run();

  return buildAudienceModelView(db, getCurrentAudienceModelVersionRow(db));
}

function normalizeComparableText(value: string | null | undefined): string {
  return (value ?? '').trim();
}

function sortedStatements(items: string[]): string[] {
  return items.map((s) => s.trim()).filter(Boolean).sort((a, b) => a.localeCompare(b));
}

function sameStringLists(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

export function updateAudienceDraft(
  db: AppDatabase,
  input: AudienceDraftUpdateInput,
): AudienceModelView {
  const current = getCurrentAudienceModelVersionRow(db);
  const now = nowIso();
  const nextCodeName =
    input.codeName !== undefined
      ? input.codeName.trim()
      : normalizeComparableText(current.codeName);
  const nextSummary =
    input.summary !== undefined ? input.summary : current.summary;
  const signalOps =
    input.removeSignalIds.length > 0 || input.addSignals.length > 0;
  const fieldsChanged =
    nextCodeName !== normalizeComparableText(current.codeName) ||
    normalizeComparableText(nextSummary) !==
      normalizeComparableText(current.summary) ||
    signalOps;

  if (!fieldsChanged) {
    return buildAudienceModelView(db, current);
  }

  // Don't mutate a confirmed version in place — fork a new draft first.
  let targetId = current.id;
  if (current.source === 'user-confirmed') {
    const newId = randomUUID();
    db.insert(audienceModelVersions)
      .values({
        id: newId,
        version: nextAudienceModelVersionNumber(db),
        codeName: nextCodeName,
        summary: nextSummary,
        createdAt: now,
        supersededAt: null,
        source: 'user',
      })
      .run();
    const signalRows = db
      .select()
      .from(audienceSignals)
      .where(eq(audienceSignals.audienceModelId, current.id))
      .all();
    for (const row of signalRows) {
      db.insert(audienceSignals)
        .values({ ...row, id: randomUUID(), audienceModelId: newId })
        .run();
    }
    db.update(audienceModelVersions)
      .set({ supersededAt: now })
      .where(eq(audienceModelVersions.id, current.id))
      .run();
    targetId = newId;
  }

  for (const id of input.removeSignalIds) {
    db.delete(audienceSignals)
      .where(
        and(eq(audienceSignals.id, id), eq(audienceSignals.audienceModelId, targetId)),
      )
      .run();
  }

  for (const signal of input.addSignals) {
    db.insert(audienceSignals)
      .values({
        id: randomUUID(),
        audienceModelId: targetId,
        key: signal.key,
        statement: signal.statement,
        polarity: signal.polarity,
        category: signal.category ?? null,
        status: signal.status,
        likelihood: signal.likelihood,
        confidence: signal.confidence,
        evidenceJson: JSON.stringify(signal.evidence),
        contradictionsJson: JSON.stringify(signal.contradictions),
        sourceRefsJson: JSON.stringify(signal.sourceRefs),
        createdAt: now,
        lastConfirmedAt: null,
      })
      .run();
  }

  // Fork path already wrote next codeName/summary; only patch in-place edits.
  if (targetId === current.id) {
    const patch: { summary?: string; codeName?: string } = {};
    if (input.summary !== undefined) {
      patch.summary = input.summary;
    }
    if (input.codeName !== undefined) {
      patch.codeName = input.codeName.trim();
    }
    if (Object.keys(patch).length > 0) {
      db.update(audienceModelVersions)
        .set(patch)
        .where(eq(audienceModelVersions.id, targetId))
        .run();
    }
  }

  return buildAudienceModelView(db, getCurrentAudienceModelVersionRow(db));
}

export function confirmAudienceUpdate(db: AppDatabase): AudienceModelView {
  const current = getCurrentAudienceModelVersionRow(db);
  // Confirm in place — do not clone an identical version.
  if (current.source === 'user-confirmed') {
    return buildAudienceModelView(db, current);
  }
  db.update(audienceModelVersions)
    .set({ source: 'user-confirmed' })
    .where(eq(audienceModelVersions.id, current.id))
    .run();
  return buildAudienceModelView(db, getCurrentAudienceModelVersionRow(db));
}

/* -------------------------------- Identity ------------------------------- */

function mapIdentitySignalRow(row: typeof identitySignals.$inferSelect): IdentitySignal {
  return {
    id: row.id,
    key: row.key,
    statement: row.statement,
    confidence: row.confidence,
    createdAt: row.createdAt,
  };
}

function buildIdentityModelView(
  db: AppDatabase,
  row: typeof identityModelVersions.$inferSelect,
): IdentityModelView {
  const signalRows = db
    .select()
    .from(identitySignals)
    .where(eq(identitySignals.identityModelId, row.id))
    .all();
  const byBucket = (bucket: string) =>
    signalRows.filter((s) => s.bucket === bucket).map(mapIdentitySignalRow);

  const resourceRows = db
    .select()
    .from(identityResources)
    .where(eq(identityResources.identityModelId, row.id))
    .all();
  const constraintRows = db
    .select()
    .from(identityConstraints)
    .where(eq(identityConstraints.identityModelId, row.id))
    .all();

  return IdentityModelViewSchema.parse({
    id: row.id,
    version: row.version,
    codeName: row.codeName ?? '',
    age: row.age ?? undefined,
    city: row.city ?? undefined,
    occupation: row.occupation ?? undefined,
    professionalArea: row.professionalArea ?? undefined,
    currentSelf: byBucket('currentSelf'),
    amplifiableTraits: byBucket('amplifiableTraits'),
    desiredPresentation: byBucket('desiredPresentation'),
    explicitNonIdentity: byBucket('explicitNonIdentity'),
    realInterests: byBucket('realInterests'),
    lifestyle: byBucket('lifestyle'),
    relationshipIntent: row.relationshipIntent ?? undefined,
    resources: resourceRows.map((r) => r.description),
    constraints: constraintRows.map((r) => r.description),
    authenticityRules: [],
    positiveReferenceIds: parseJsonArray<string>(row.positiveReferenceIdsJson),
    negativeReferenceIds: parseJsonArray<string>(row.negativeReferenceIdsJson),
    aiSummary: row.aiSummary,
    userConfirmedAt: row.userConfirmedAt ?? undefined,
    createdAt: row.createdAt,
    supersededAt: row.supersededAt ?? undefined,
  });
}

function ensureDefaultIdentityModel(db: AppDatabase): void {
  const existing = db.select().from(identityModelVersions).limit(1).get();
  if (existing) {
    return;
  }
  db.insert(identityModelVersions)
    .values({
      id: randomUUID(),
      version: 1,
      aiSummary: '',
      positiveReferenceIdsJson: '[]',
      negativeReferenceIdsJson: '[]',
      createdAt: nowIso(),
      supersededAt: null,
    })
    .run();
}

function nextIdentityModelVersionNumber(db: AppDatabase): number {
  const latest = db
    .select()
    .from(identityModelVersions)
    .orderBy(desc(identityModelVersions.version))
    .limit(1)
    .get();
  return (latest?.version ?? 0) + 1;
}

function getCurrentIdentityModelVersionRow(db: AppDatabase) {
  const open = db
    .select()
    .from(identityModelVersions)
    .where(isNull(identityModelVersions.supersededAt))
    .orderBy(desc(identityModelVersions.version))
    .all();
  if (open.length > 0) {
    const [current, ...extras] = open;
    if (extras.length > 0) {
      const now = nowIso();
      for (const extra of extras) {
        db.update(identityModelVersions)
          .set({ supersededAt: now })
          .where(eq(identityModelVersions.id, extra.id))
          .run();
      }
    }
    return current!;
  }

  const row = db
    .select()
    .from(identityModelVersions)
    .orderBy(desc(identityModelVersions.version))
    .limit(1)
    .get();
  if (!row) {
    throw new Error('Модель личности не инициализирована');
  }
  if (row.supersededAt) {
    db.update(identityModelVersions)
      .set({ supersededAt: null })
      .where(eq(identityModelVersions.id, row.id))
      .run();
    return { ...row, supersededAt: null };
  }
  return row;
}

export function getCurrentIdentityModel(db: AppDatabase): IdentityModelView {
  return buildIdentityModelView(db, getCurrentIdentityModelVersionRow(db));
}

export function listIdentityModelVersions(db: AppDatabase): IdentityModelView[] {
  const rows = db
    .select()
    .from(identityModelVersions)
    .orderBy(desc(identityModelVersions.version))
    .all();
  return rows.map((row) => buildIdentityModelView(db, row));
}

export function deleteIdentityModelVersion(db: AppDatabase, id: string): void {
  const row = db
    .select()
    .from(identityModelVersions)
    .where(eq(identityModelVersions.id, id))
    .get();
  if (!row) {
    throw new Error('Версия Identity не найдена');
  }
  const total = db.select().from(identityModelVersions).all().length;
  if (total <= 1) {
    throw new Error('Нельзя удалить единственную версию Identity');
  }

  db.delete(identitySignals)
    .where(eq(identitySignals.identityModelId, id))
    .run();
  db.delete(identityResources)
    .where(eq(identityResources.identityModelId, id))
    .run();
  db.delete(identityConstraints)
    .where(eq(identityConstraints.identityModelId, id))
    .run();
  db.delete(identityModelVersions)
    .where(eq(identityModelVersions.id, id))
    .run();

  ensureDefaultIdentityModel(db);
  const current = db
    .select()
    .from(identityModelVersions)
    .orderBy(desc(identityModelVersions.version))
    .limit(1)
    .get();
  if (current?.supersededAt) {
    db.update(identityModelVersions)
      .set({ supersededAt: null })
      .where(eq(identityModelVersions.id, current.id))
      .run();
  }
}

/** Make a past Identity version the current confirmed draft (no clone). */
export function activateIdentityModelVersion(
  db: AppDatabase,
  id: string,
): IdentityModelView {
  const source = db
    .select()
    .from(identityModelVersions)
    .where(eq(identityModelVersions.id, id))
    .get();
  if (!source) {
    throw new Error('Версия Identity не найдена');
  }

  const current = getCurrentIdentityModelVersionRow(db);
  const now = nowIso();

  if (source.id !== current.id) {
    db.update(identityModelVersions)
      .set({ supersededAt: now })
      .where(eq(identityModelVersions.id, current.id))
      .run();
  }

  db.update(identityModelVersions)
    .set({ userConfirmedAt: now, supersededAt: null })
    .where(eq(identityModelVersions.id, source.id))
    .run();

  return buildIdentityModelView(db, getCurrentIdentityModelVersionRow(db));
}

export function createIdentityDraft(
  db: AppDatabase,
  input: IdentityDraftInput,
): IdentityModelView {
  const current = getCurrentIdentityModelVersionRow(db);
  const currentView = buildIdentityModelView(db, current);
  const now = nowIso();

  const nextCodeName =
    input.codeName !== undefined
      ? input.codeName.trim()
      : normalizeComparableText(current.codeName);
  const nextCity =
    input.city !== undefined ? input.city.trim() || undefined : current.city ?? undefined;
  const nextOccupation =
    input.occupation !== undefined
      ? input.occupation.trim() || undefined
      : current.occupation ?? undefined;
  const nextProfessionalArea =
    input.professionalArea !== undefined
      ? input.professionalArea.trim() || undefined
      : current.professionalArea ?? undefined;
  const nextIntent =
    input.relationshipIntent !== undefined
      ? input.relationshipIntent.trim() || undefined
      : current.relationshipIntent ?? undefined;
  const nextSummary =
    input.freeformText !== undefined ? input.freeformText : current.aiSummary;
  // Form often omits lifestyle/resources/constraints (sends []). Preserve current
  // unless the caller explicitly provides values.
  const lifestyleItems =
    input.lifestyle.length > 0
      ? input.lifestyle
      : currentView.lifestyle.map((s) => s.statement);
  const resourceItems =
    input.resources.length > 0 ? input.resources : [...currentView.resources];
  const constraintItems =
    input.constraints.length > 0
      ? input.constraints
      : [...currentView.constraints];
  const nextInterests = sortedStatements(input.realInterests);
  const nextLifestyle = sortedStatements(lifestyleItems);
  const nextNonIdentity = sortedStatements(input.explicitNonIdentity);
  const nextResources = sortedStatements(resourceItems);
  const nextConstraints = sortedStatements(constraintItems);

  const unchanged =
    nextCodeName === normalizeComparableText(currentView.codeName) &&
    normalizeComparableText(nextCity) ===
      normalizeComparableText(currentView.city) &&
    normalizeComparableText(nextOccupation) ===
      normalizeComparableText(currentView.occupation) &&
    normalizeComparableText(nextProfessionalArea) ===
      normalizeComparableText(currentView.professionalArea) &&
    normalizeComparableText(nextIntent) ===
      normalizeComparableText(currentView.relationshipIntent) &&
    normalizeComparableText(nextSummary) ===
      normalizeComparableText(currentView.aiSummary) &&
    sameStringLists(
      nextInterests,
      sortedStatements(currentView.realInterests.map((s) => s.statement)),
    ) &&
    sameStringLists(
      nextLifestyle,
      sortedStatements(currentView.lifestyle.map((s) => s.statement)),
    ) &&
    sameStringLists(
      nextNonIdentity,
      sortedStatements(currentView.explicitNonIdentity.map((s) => s.statement)),
    ) &&
    sameStringLists(nextResources, sortedStatements(currentView.resources)) &&
    sameStringLists(nextConstraints, sortedStatements(currentView.constraints));

  if (unchanged) {
    return currentView;
  }

  const newId = randomUUID();

  db.insert(identityModelVersions)
    .values({
      id: newId,
      version: nextIdentityModelVersionNumber(db),
      codeName: nextCodeName,
      age: input.age ?? current.age,
      city: nextCity ?? null,
      occupation: nextOccupation ?? null,
      professionalArea: nextProfessionalArea ?? null,
      relationshipIntent: nextIntent ?? null,
      aiSummary: nextSummary,
      positiveReferenceIdsJson: current.positiveReferenceIdsJson,
      negativeReferenceIdsJson: current.negativeReferenceIdsJson,
      userConfirmedAt: null,
      createdAt: now,
      supersededAt: null,
    })
    .run();

  const insertBucket = (bucket: string, items: string[]) => {
    for (const statement of items) {
      db.insert(identitySignals)
        .values({
          id: randomUUID(),
          identityModelId: newId,
          bucket,
          key: bucket,
          statement,
          confidence: 0.6,
          createdAt: now,
        })
        .run();
    }
  };
  insertBucket('realInterests', input.realInterests);
  insertBucket('lifestyle', lifestyleItems);
  insertBucket('explicitNonIdentity', input.explicitNonIdentity);

  for (const description of resourceItems) {
    db.insert(identityResources)
      .values({ id: randomUUID(), identityModelId: newId, description, createdAt: now })
      .run();
  }
  for (const description of constraintItems) {
    db.insert(identityConstraints)
      .values({
        id: randomUUID(),
        identityModelId: newId,
        description,
        severity: 'warning',
        createdAt: now,
      })
      .run();
  }

  db.update(identityModelVersions)
    .set({ supersededAt: now })
    .where(eq(identityModelVersions.id, current.id))
    .run();

  return buildIdentityModelView(db, getCurrentIdentityModelVersionRow(db));
}

export function addIdentityReference(
  db: AppDatabase,
  input: { polarity: 'positive' | 'negative'; referenceId: string },
): IdentityModelView {
  const current = getCurrentIdentityModelVersionRow(db);
  if (input.polarity === 'positive') {
    const ids = parseJsonArray<string>(current.positiveReferenceIdsJson);
    if (!ids.includes(input.referenceId)) {
      ids.push(input.referenceId);
    }
    db.update(identityModelVersions)
      .set({ positiveReferenceIdsJson: JSON.stringify(ids) })
      .where(eq(identityModelVersions.id, current.id))
      .run();
  } else {
    const ids = parseJsonArray<string>(current.negativeReferenceIdsJson);
    if (!ids.includes(input.referenceId)) {
      ids.push(input.referenceId);
    }
    db.update(identityModelVersions)
      .set({ negativeReferenceIdsJson: JSON.stringify(ids) })
      .where(eq(identityModelVersions.id, current.id))
      .run();
  }
  return buildIdentityModelView(db, getCurrentIdentityModelVersionRow(db));
}

export function removeIdentityReference(
  db: AppDatabase,
  referenceId: string,
): IdentityModelView {
  const current = getCurrentIdentityModelVersionRow(db);
  const positive = parseJsonArray<string>(current.positiveReferenceIdsJson).filter(
    (id) => id !== referenceId,
  );
  const negative = parseJsonArray<string>(current.negativeReferenceIdsJson).filter(
    (id) => id !== referenceId,
  );
  db.update(identityModelVersions)
    .set({
      positiveReferenceIdsJson: JSON.stringify(positive),
      negativeReferenceIdsJson: JSON.stringify(negative),
    })
    .where(eq(identityModelVersions.id, current.id))
    .run();
  return buildIdentityModelView(db, getCurrentIdentityModelVersionRow(db));
}

export function confirmIdentityModel(db: AppDatabase): IdentityModelView {
  const current = getCurrentIdentityModelVersionRow(db);
  db.update(identityModelVersions)
    .set({ userConfirmedAt: nowIso() })
    .where(eq(identityModelVersions.id, current.id))
    .run();
  return buildIdentityModelView(db, getCurrentIdentityModelVersionRow(db));
}

/* --------------------------------- Cloud --------------------------------- */

const CLOUD_PROVIDERS = CloudProviderSchema.options;

function mapCloudConnectionRow(
  row: typeof cloudConnections.$inferSelect,
): CloudConnectionView {
  return CloudConnectionViewSchema.parse({
    id: row.id,
    provider: row.provider,
    connected: row.connected,
    accountLabel: row.accountLabel ?? undefined,
    connectedAt: row.connectedAt ?? undefined,
    disconnectedAt: row.disconnectedAt ?? undefined,
    lastError: row.lastError ?? undefined,
    selectedFolderIds: parseJsonArray<string>(row.selectedFolderIdsJson),
    updatedAt: row.updatedAt,
  });
}

function ensureDefaultCloudConnections(db: AppDatabase): void {
  for (const provider of CLOUD_PROVIDERS) {
    const existing = db
      .select()
      .from(cloudConnections)
      .where(eq(cloudConnections.provider, provider))
      .get();
    if (!existing) {
      db.insert(cloudConnections)
        .values({
          id: randomUUID(),
          provider,
          connected: false,
          selectedFolderIdsJson: '[]',
          updatedAt: nowIso(),
        })
        .run();
    }
  }
}

export function listCloudConnections(db: AppDatabase): CloudConnectionView[] {
  return db.select().from(cloudConnections).all().map(mapCloudConnectionRow);
}

export function setCloudConnectionState(
  db: AppDatabase,
  provider: CloudProvider,
  input: { connected: boolean; accountLabel?: string; lastError?: string },
): CloudConnectionView {
  const now = nowIso();
  db.update(cloudConnections)
    .set({
      connected: input.connected,
      accountLabel: input.accountLabel ?? null,
      connectedAt: input.connected ? now : null,
      disconnectedAt: input.connected ? null : now,
      lastError: input.lastError ?? null,
      updatedAt: now,
    })
    .where(eq(cloudConnections.provider, provider))
    .run();
  const row = db
    .select()
    .from(cloudConnections)
    .where(eq(cloudConnections.provider, provider))
    .get();
  if (!row) {
    throw new Error('Облачное подключение не найдено');
  }
  return mapCloudConnectionRow(row);
}

export function disconnectCloudProvider(
  db: AppDatabase,
  provider: CloudProvider,
): CloudConnectionView {
  return setCloudConnectionState(db, provider, { connected: false });
}

export function listCloudFolders(
  db: AppDatabase,
  provider: CloudProvider,
): CloudFolderView[] {
  return db
    .select()
    .from(cloudFolders)
    .where(eq(cloudFolders.provider, provider))
    .all()
    .map((row) =>
      CloudFolderViewSchema.parse({
        id: row.id,
        connectionId: row.connectionId,
        provider: row.provider,
        externalId: row.externalId,
        name: row.name,
        path: row.path ?? undefined,
        selected: row.selected,
      }),
    );
}

/** Replace cached folder list for a provider; keeps previous selection when possible. */
export function replaceCloudFolders(
  db: AppDatabase,
  provider: CloudProvider,
  folders: Array<{ externalId: string; name: string; path?: string }>,
): CloudFolderView[] {
  const connection = db
    .select()
    .from(cloudConnections)
    .where(eq(cloudConnections.provider, provider))
    .get();
  if (!connection) {
    throw new Error('Облачное подключение не найдено');
  }

  const previousSelected = new Set(
    db
      .select()
      .from(cloudFolders)
      .where(and(eq(cloudFolders.provider, provider), eq(cloudFolders.selected, true)))
      .all()
      .map((row) => row.externalId),
  );

  db.delete(cloudFolders).where(eq(cloudFolders.provider, provider)).run();

  const now = nowIso();
  const selectedIds: string[] = [];
  for (const folder of folders) {
    const id = randomUUID();
    const selected = previousSelected.has(folder.externalId);
    if (selected) selectedIds.push(id);
    db.insert(cloudFolders)
      .values({
        id,
        connectionId: connection.id,
        provider,
        externalId: folder.externalId,
        name: folder.name,
        path: folder.path ?? null,
        selected,
        updatedAt: now,
      })
      .run();
  }

  db.update(cloudConnections)
    .set({
      selectedFolderIdsJson: JSON.stringify(selectedIds),
      updatedAt: now,
    })
    .where(eq(cloudConnections.provider, provider))
    .run();

  return listCloudFolders(db, provider);
}

export function setSelectedCloudFolders(
  db: AppDatabase,
  provider: CloudProvider,
  folderIds: string[],
): CloudConnectionView {
  const now = nowIso();
  db.update(cloudFolders)
    .set({ selected: false, updatedAt: now })
    .where(eq(cloudFolders.provider, provider))
    .run();
  for (const id of folderIds) {
    db.update(cloudFolders)
      .set({ selected: true, updatedAt: now })
      .where(and(eq(cloudFolders.provider, provider), eq(cloudFolders.id, id)))
      .run();
  }
  db.update(cloudConnections)
    .set({ selectedFolderIdsJson: JSON.stringify(folderIds), updatedAt: now })
    .where(eq(cloudConnections.provider, provider))
    .run();
  const row = db
    .select()
    .from(cloudConnections)
    .where(eq(cloudConnections.provider, provider))
    .get();
  if (!row) {
    throw new Error('Облачное подключение не найдено');
  }
  return mapCloudConnectionRow(row);
}

/* ------------------------------- Photo index ------------------------------ */

function mapIndexedPhotoAssetRow(
  row: typeof indexedPhotoAssets.$inferSelect,
): IndexedPhotoAssetView {
  return IndexedPhotoAssetViewSchema.parse({
    id: row.id,
    provider: row.provider,
    externalFileId: row.externalFileId,
    externalPath: row.externalPath ?? undefined,
    fileName: row.fileName,
    sourceModifiedAt: row.sourceModifiedAt,
    sourceSizeBytes: row.sourceSizeBytes ?? undefined,
    checksum: row.checksum ?? undefined,
    perceptualHash: row.perceptualHash,
    localPreviewPath: row.localPreviewPath,
    originalCachePath: row.originalCachePath ?? undefined,
    embeddingModel: row.embeddingModel ?? undefined,
    embeddingVersion: row.embeddingVersion ?? undefined,
    shortDescription: row.shortDescription,
    observedSignals: parseJsonArray<string>(row.observedSignalsJson),
    possibleRoles: parseJsonArray<string>(row.possibleRolesJson),
    risks: parseJsonArray<string>(row.risksJson),
    peopleCount: row.peopleCount ?? undefined,
    faceVisibility: row.faceVisibility,
    bodyVisibility: row.bodyVisibility,
    technicalQuality: row.technicalQuality,
    indexedAt: row.indexedAt,
    deletedFromIndexAt: row.deletedFromIndexAt ?? undefined,
  });
}

function cloudBrowsedSettingKey(provider: CloudProvider): string {
  return `cloud.${provider}.browsed_at`;
}

function cloudBrowseSummarySettingKey(provider: CloudProvider): string {
  return `cloud.${provider}.browse_summary`;
}

export function markCloudProviderBrowsed(
  db: AppDatabase,
  provider: CloudProvider,
  at = nowIso(),
): void {
  setSetting(db, cloudBrowsedSettingKey(provider), at);
}

export function getCloudProviderBrowsedAt(
  db: AppDatabase,
  provider: CloudProvider,
): string | undefined {
  return getSetting(db, cloudBrowsedSettingKey(provider)) ?? undefined;
}

export function setCloudProviderBrowseSummary(
  db: AppDatabase,
  provider: CloudProvider,
  summary: string,
): void {
  setSetting(db, cloudBrowseSummarySettingKey(provider), summary.trim().slice(0, 2000));
}

export function getCloudProviderBrowseSummary(
  db: AppDatabase,
  provider: CloudProvider,
): string | undefined {
  return getSetting(db, cloudBrowseSummarySettingKey(provider)) ?? undefined;
}

export function clearCloudProviderBrowsed(
  db: AppDatabase,
  provider: CloudProvider,
): void {
  deleteSetting(db, cloudBrowsedSettingKey(provider));
  deleteSetting(db, cloudBrowseSummarySettingKey(provider));
}

export function getCloudIndexStatus(db: AppDatabase): CloudIndexStatusView {
  const rows = db
    .select()
    .from(indexedPhotoAssets)
    .all()
    .filter((row) => !row.deletedFromIndexAt);
  const byProvider: Record<string, number> = {};
  for (const row of rows) {
    byProvider[row.provider] = (byProvider[row.provider] ?? 0) + 1;
  }
  const browsedAtByProvider: Record<string, string> = {};
  const browseSummaryByProvider: Record<string, string> = {};
  for (const provider of CLOUD_PROVIDERS) {
    const at = getCloudProviderBrowsedAt(db, provider);
    if (at) browsedAtByProvider[provider] = at;
    const summary = getCloudProviderBrowseSummary(db, provider);
    if (summary) browseSummaryByProvider[provider] = summary;
  }
  return CloudIndexStatusViewSchema.parse({
    totalIndexed: rows.length,
    byProvider,
    connections: listCloudConnections(db),
    browsedAtByProvider,
    browseSummaryByProvider,
    errors: [],
  });
}

export function searchIndexedPhotos(
  db: AppDatabase,
  input: PhotoSearchInput,
): PhotoSearchResult {
  const all = db.select().from(indexedPhotoAssets).all();
  const query = input.query.trim().toLowerCase();
  const providers = input.providers;
  const filtered = all.filter((row) => {
    if (!input.includeDeleted && row.deletedFromIndexAt) {
      return false;
    }
    if (providers && providers.length > 0 && !providers.includes(row.provider as CloudProvider)) {
      return false;
    }
    if (!query) {
      return true;
    }
    const haystack =
      `${row.shortDescription} ${row.fileName} ${row.observedSignalsJson}`.toLowerCase();
    return haystack.includes(query);
  });

  return PhotoSearchResultSchema.parse({
    query: input.query,
    items: filtered.slice(0, input.limit).map(mapIndexedPhotoAssetRow),
    totalIndexed: all.filter((row) => !row.deletedFromIndexAt).length,
    searchedAt: nowIso(),
  });
}

export function deleteIndexedPhoto(db: AppDatabase, id: string): void {
  const existing = db
    .select()
    .from(indexedPhotoAssets)
    .where(eq(indexedPhotoAssets.id, id))
    .get();
  if (!existing) {
    throw new Error('Фото не найдено в индексе');
  }
  db.delete(indexedPhotoAssets).where(eq(indexedPhotoAssets.id, id)).run();
}

export function upsertIndexedPhotoAsset(
  db: AppDatabase,
  input: {
    provider: CloudProvider;
    externalFileId: string;
    externalPath?: string;
    fileName: string;
    sourceModifiedAt: string;
    sourceSizeBytes?: number;
    shortDescription?: string;
    observedSignals?: string[];
    embeddingModel?: string;
    localPreviewPath?: string;
    perceptualHash?: string;
  },
): IndexedPhotoAssetView {
  const existing = db
    .select()
    .from(indexedPhotoAssets)
    .where(
      and(
        eq(indexedPhotoAssets.provider, input.provider),
        eq(indexedPhotoAssets.externalFileId, input.externalFileId),
      ),
    )
    .get();
  const now = nowIso();
  const signalsJson =
    input.observedSignals !== undefined
      ? JSON.stringify(input.observedSignals)
      : undefined;
  if (existing) {
    db.update(indexedPhotoAssets)
      .set({
        externalPath: input.externalPath ?? null,
        fileName: input.fileName,
        sourceModifiedAt: input.sourceModifiedAt,
        sourceSizeBytes: input.sourceSizeBytes ?? null,
        shortDescription: input.shortDescription ?? existing.shortDescription,
        observedSignalsJson: signalsJson ?? existing.observedSignalsJson,
        embeddingModel: input.embeddingModel ?? existing.embeddingModel,
        localPreviewPath:
          input.localPreviewPath ?? existing.localPreviewPath ?? '',
        perceptualHash:
          input.perceptualHash && input.perceptualHash.length > 0
            ? input.perceptualHash
            : existing.perceptualHash,
        deletedFromIndexAt: null,
        indexedAt: now,
      })
      .where(eq(indexedPhotoAssets.id, existing.id))
      .run();
    const row = db
      .select()
      .from(indexedPhotoAssets)
      .where(eq(indexedPhotoAssets.id, existing.id))
      .get();
    return mapIndexedPhotoAssetRow(row!);
  }

  const id = randomUUID();
  db.insert(indexedPhotoAssets)
    .values({
      id,
      provider: input.provider,
      externalFileId: input.externalFileId,
      externalPath: input.externalPath ?? null,
      fileName: input.fileName,
      sourceModifiedAt: input.sourceModifiedAt,
      sourceSizeBytes: input.sourceSizeBytes ?? null,
      perceptualHash: input.perceptualHash ?? '',
      localPreviewPath: input.localPreviewPath ?? '',
      shortDescription: input.shortDescription ?? input.fileName,
      observedSignalsJson: signalsJson ?? '[]',
      possibleRolesJson: '[]',
      risksJson: '[]',
      embeddingModel: input.embeddingModel ?? null,
      faceVisibility: 0,
      bodyVisibility: 0,
      technicalQuality: 0,
      indexedAt: now,
    })
    .run();
  const row = db
    .select()
    .from(indexedPhotoAssets)
    .where(eq(indexedPhotoAssets.id, id))
    .get();
  return mapIndexedPhotoAssetRow(row!);
}

export function getIndexedPhotoById(
  db: AppDatabase,
  id: string,
): IndexedPhotoAssetView | null {
  const row = db
    .select()
    .from(indexedPhotoAssets)
    .where(eq(indexedPhotoAssets.id, id))
    .get();
  return row ? mapIndexedPhotoAssetRow(row) : null;
}

export function setIndexedPhotoLocalPreviewPath(
  db: AppDatabase,
  id: string,
  localPreviewPath: string,
): void {
  db.update(indexedPhotoAssets)
    .set({ localPreviewPath })
    .where(eq(indexedPhotoAssets.id, id))
    .run();
}

export function setIndexedPhotoPerceptualHash(
  db: AppDatabase,
  id: string,
  perceptualHash: string,
): void {
  if (!perceptualHash.trim()) return;
  db.update(indexedPhotoAssets)
    .set({ perceptualHash: perceptualHash.trim() })
    .where(eq(indexedPhotoAssets.id, id))
    .run();
}

export function listIndexedPhotos(
  db: AppDatabase,
  providers?: CloudProvider[],
  limit = 100,
): IndexedPhotoAssetView[] {
  const rows = db
    .select()
    .from(indexedPhotoAssets)
    .all()
    .filter((row) => {
      if (row.deletedFromIndexAt) return false;
      if (providers && providers.length > 0) {
        return providers.includes(row.provider as CloudProvider);
      }
      return true;
    })
    .slice(0, limit);
  return rows.map(mapIndexedPhotoAssetRow);
}

function mapPhotoLookGroupRow(
  row: typeof photoLookGroups.$inferSelect,
): PhotoLookGroupView {
  return PhotoLookGroupViewSchema.parse({
    id: row.id,
    name: row.name,
    brief: row.brief,
    moodTags: parseJsonArray<string>(row.moodTagsJson),
    photoIds: parseJsonArray<string>(row.photoIdsJson),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export function listPhotoLookGroups(db: AppDatabase): PhotoLookGroupView[] {
  return db
    .select()
    .from(photoLookGroups)
    .orderBy(desc(photoLookGroups.updatedAt))
    .all()
    .map(mapPhotoLookGroupRow);
}

/** Replace all look groups with a fresh clustering result. */
export function replacePhotoLookGroups(
  db: AppDatabase,
  groups: Array<{
    name: string;
    brief: string;
    moodTags: string[];
    photoIds: string[];
  }>,
): PhotoLookGroupView[] {
  const now = nowIso();
  db.delete(photoLookGroups).run();
  for (const group of groups) {
    if (!group.name.trim() || group.photoIds.length === 0) continue;
    db.insert(photoLookGroups)
      .values({
        id: randomUUID(),
        name: group.name.trim().slice(0, 120),
        brief: group.brief.trim().slice(0, 2000),
        moodTagsJson: JSON.stringify(group.moodTags.slice(0, 12)),
        photoIdsJson: JSON.stringify(group.photoIds.slice(0, 24)),
        createdAt: now,
        updatedAt: now,
      })
      .run();
  }
  return listPhotoLookGroups(db);
}


/* ----------------------------- Profile variants ---------------------------- */

function mapProfileVariantRow(
  db: AppDatabase,
  row: typeof profileVariants.$inferSelect,
): ProfileVariantView {
  const photoRows = db
    .select()
    .from(profileVariantPhotos)
    .where(eq(profileVariantPhotos.profileVariantId, row.id))
    .orderBy(asc(profileVariantPhotos.position))
    .all();

  return ProfileVariantViewSchema.parse({
    id: row.id,
    version: row.version,
    name: row.name,
    status: row.status,
    strategyId: row.strategyId ?? undefined,
    bio: row.bio,
    hypothesis: row.hypothesis,
    changeSetId: row.changeSetId ?? undefined,
    photoIds: photoRows.map((p) => p.photoAssetId),
    createdAgainstAudienceVersion: row.createdAgainstAudienceVersion,
    createdAgainstIdentityVersion: row.createdAgainstIdentityVersion,
    authenticityAssessment: parseJsonOptional(row.createdAssessmentJson),
    expectedPerformance: parseJsonOptional(row.expectedPerformanceJson),
    verifiedSnapshotId: row.verifiedSnapshotId ?? undefined,
    createdAt: row.createdAt,
    activatedAt: row.activatedAt ?? undefined,
    deactivatedAt: row.deactivatedAt ?? undefined,
    archivedAt: row.archivedAt ?? undefined,
  });
}

export function listProfileVariants(db: AppDatabase): ProfileVariantView[] {
  return db
    .select()
    .from(profileVariants)
    .orderBy(desc(profileVariants.createdAt))
    .all()
    .map((row) => mapProfileVariantRow(db, row));
}

export function getProfileVariant(
  db: AppDatabase,
  id: string,
): ProfileVariantView | null {
  const row = db.select().from(profileVariants).where(eq(profileVariants.id, id)).get();
  return row ? mapProfileVariantRow(db, row) : null;
}

export function getActiveProfileVariant(db: AppDatabase): ProfileVariantView | null {
  const row = db
    .select()
    .from(profileVariants)
    .where(eq(profileVariants.status, 'active'))
    .orderBy(desc(profileVariants.activatedAt))
    .limit(1)
    .get();
  return row ? mapProfileVariantRow(db, row) : null;
}

export function saveProfileVariant(
  db: AppDatabase,
  input: SaveVariantInput,
): ProfileVariantView {
  const now = nowIso();
  const maxVersionRow = db
    .select()
    .from(profileVariants)
    .orderBy(desc(profileVariants.version))
    .limit(1)
    .get();
  const nextVersion = (maxVersionRow?.version ?? 0) + 1;
  const id = randomUUID();

  db.insert(profileVariants)
    .values({
      id,
      version: nextVersion,
      name: input.name,
      status: 'draft',
      strategyId: input.strategyId ?? null,
      bio: input.bio,
      hypothesis: input.hypothesis,
      changeSetId: null,
      createdAgainstAudienceVersion: input.createdAgainstAudienceVersion,
      createdAgainstIdentityVersion: input.createdAgainstIdentityVersion,
      createdAssessmentJson: null,
      expectedPerformanceJson: input.expectedPerformance
        ? JSON.stringify(input.expectedPerformance)
        : null,
      verifiedSnapshotId: null,
      createdAt: now,
      activatedAt: null,
      deactivatedAt: null,
      archivedAt: null,
    })
    .run();

  input.photoIds.forEach((photoAssetId, index) => {
    const roleEntry = input.photoRoles.find((r) => r.photoId === photoAssetId);
    db.insert(profileVariantPhotos)
      .values({
        id: randomUUID(),
        profileVariantId: id,
        photoAssetId,
        position: index,
        role: roleEntry?.role ?? null,
        explanation: roleEntry?.explanation ?? null,
      })
      .run();
  });

  const view = getProfileVariant(db, id);
  if (!view) {
    throw new Error('Failed to save profile variant');
  }
  return view;
}

export function setProfileVariantStatus(
  db: AppDatabase,
  id: string,
  status: ProfileVariantStatus,
): ProfileVariantView {
  const now = nowIso();
  db.update(profileVariants).set({ status }).where(eq(profileVariants.id, id)).run();
  if (status === 'active') {
    db.update(profileVariants)
      .set({ activatedAt: now })
      .where(eq(profileVariants.id, id))
      .run();
  }
  if (status === 'paused' || status === 'archived') {
    db.update(profileVariants)
      .set({ deactivatedAt: now })
      .where(eq(profileVariants.id, id))
      .run();
  }
  if (status === 'archived') {
    db.update(profileVariants)
      .set({ archivedAt: now })
      .where(eq(profileVariants.id, id))
      .run();
  }
  const view = getProfileVariant(db, id);
  if (!view) {
    throw new Error('Вариант профиля не найден');
  }
  return view;
}

/* --------------------------- Verified snapshots ---------------------------- */

function mapVerifiedSnapshotRow(
  db: AppDatabase,
  row: typeof verifiedProfileSnapshots.$inferSelect,
): VerifiedProfileSnapshotView {
  const photoRows = db
    .select()
    .from(verifiedProfileSnapshotPhotos)
    .where(eq(verifiedProfileSnapshotPhotos.snapshotId, row.id))
    .orderBy(asc(verifiedProfileSnapshotPhotos.position))
    .all();

  return VerifiedProfileSnapshotViewSchema.parse({
    id: row.id,
    profileVariantId: row.profileVariantId ?? undefined,
    capturedAt: row.capturedAt,
    photos: photoRows.map((p) => ({
      position: p.position,
      localPreviewPath: p.localPreviewPath,
      perceptualHash: p.perceptualHash,
      matchedPhotoAssetId: p.matchedPhotoAssetId ?? undefined,
      matchConfidence: p.matchConfidence ?? undefined,
    })),
    bio: row.bio,
    occupation: row.occupation ?? undefined,
    interests: parseJsonArray<string>(row.interestsJson),
    relationshipGoal: row.relationshipGoal ?? undefined,
    plannedSimilarity: row.plannedSimilarity ?? undefined,
    differencesFromPlan: parseJsonArray<string>(row.differencesFromPlanJson),
    deploymentStatus: row.deploymentStatus,
    source: row.source,
  });
}

export function listVerifiedSnapshots(db: AppDatabase): VerifiedProfileSnapshotView[] {
  return db
    .select()
    .from(verifiedProfileSnapshots)
    .orderBy(desc(verifiedProfileSnapshots.capturedAt))
    .all()
    .map((row) => mapVerifiedSnapshotRow(db, row));
}

export function getActiveVerifiedSnapshot(
  db: AppDatabase,
): VerifiedProfileSnapshotView | null {
  const row = db
    .select()
    .from(verifiedProfileSnapshots)
    .orderBy(desc(verifiedProfileSnapshots.capturedAt))
    .limit(1)
    .get();
  return row ? mapVerifiedSnapshotRow(db, row) : null;
}

export function getVerifiedSnapshot(
  db: AppDatabase,
  id: string,
): VerifiedProfileSnapshotView | null {
  const row = db
    .select()
    .from(verifiedProfileSnapshots)
    .where(eq(verifiedProfileSnapshots.id, id))
    .get();
  return row ? mapVerifiedSnapshotRow(db, row) : null;
}

export function insertVerifiedProfileSnapshot(
  db: AppDatabase,
  input: {
    profileVariantId?: string;
    bio: string;
    occupation?: string;
    interests?: string[];
    relationshipGoal?: string;
    plannedSimilarity?: number;
    differencesFromPlan?: string[];
    deploymentStatus: string;
    photos: Array<{
      position: number;
      localPreviewPath: string;
      perceptualHash: string;
      matchedPhotoAssetId?: string;
      matchConfidence?: number;
    }>;
  },
): VerifiedProfileSnapshotView {
  const id = randomUUID();
  db.insert(verifiedProfileSnapshots)
    .values({
      id,
      profileVariantId: input.profileVariantId ?? null,
      capturedAt: nowIso(),
      bio: input.bio,
      occupation: input.occupation ?? null,
      interestsJson: JSON.stringify(input.interests ?? []),
      relationshipGoal: input.relationshipGoal ?? null,
      plannedSimilarity: input.plannedSimilarity ?? null,
      differencesFromPlanJson: JSON.stringify(input.differencesFromPlan ?? []),
      deploymentStatus: input.deploymentStatus,
      source: 'twinby-profile-capture',
    })
    .run();
  for (const photo of input.photos) {
    db.insert(verifiedProfileSnapshotPhotos)
      .values({
        id: randomUUID(),
        snapshotId: id,
        position: photo.position,
        localPreviewPath: photo.localPreviewPath,
        perceptualHash: photo.perceptualHash,
        matchedPhotoAssetId: photo.matchedPhotoAssetId ?? null,
        matchConfidence: photo.matchConfidence ?? null,
      })
      .run();
  }
  const view = getVerifiedSnapshot(db, id);
  if (!view) {
    throw new Error('Failed to insert verified snapshot');
  }
  return view;
}

export function deleteVerifiedSnapshot(db: AppDatabase, id: string): void {
  const existing = db
    .select()
    .from(verifiedProfileSnapshots)
    .where(eq(verifiedProfileSnapshots.id, id))
    .get();
  if (!existing) {
    throw new Error('Слепок профиля не найден');
  }
  db.delete(verifiedProfileSnapshotPhotos)
    .where(eq(verifiedProfileSnapshotPhotos.snapshotId, id))
    .run();
  db.delete(verifiedProfileSnapshots).where(eq(verifiedProfileSnapshots.id, id)).run();
}

/** Persist cloud-asset matches onto snapshot photo rows (re-match after re-index). */
export function updateVerifiedSnapshotPhotoMatches(
  db: AppDatabase,
  snapshotId: string,
  photos: Array<{
    position: number;
    matchedPhotoAssetId?: string;
    matchConfidence?: number;
  }>,
): VerifiedProfileSnapshotView {
  const existing = db
    .select()
    .from(verifiedProfileSnapshots)
    .where(eq(verifiedProfileSnapshots.id, snapshotId))
    .get();
  if (!existing) {
    throw new Error('Слепок профиля не найден');
  }
  for (const photo of photos) {
    db.update(verifiedProfileSnapshotPhotos)
      .set({
        matchedPhotoAssetId: photo.matchedPhotoAssetId ?? null,
        matchConfidence: photo.matchConfidence ?? null,
      })
      .where(
        and(
          eq(verifiedProfileSnapshotPhotos.snapshotId, snapshotId),
          eq(verifiedProfileSnapshotPhotos.position, photo.position),
        ),
      )
      .run();
  }
  const view = getVerifiedSnapshot(db, snapshotId);
  if (!view) {
    throw new Error('Слепок не найден после обновления match');
  }
  return view;
}

/** Persist plan-vs-actual comparison onto an existing verified snapshot. */
export function updateVerifiedSnapshotDeployment(
  db: AppDatabase,
  input: {
    snapshotId: string;
    profileVariantId?: string;
    deploymentStatus: string;
    plannedSimilarity: number;
    differencesFromPlan: string[];
  },
): VerifiedProfileSnapshotView {
  const existing = db
    .select()
    .from(verifiedProfileSnapshots)
    .where(eq(verifiedProfileSnapshots.id, input.snapshotId))
    .get();
  if (!existing) {
    throw new Error('Слепок профиля не найден');
  }
  db.update(verifiedProfileSnapshots)
    .set({
      profileVariantId: input.profileVariantId ?? existing.profileVariantId,
      deploymentStatus: input.deploymentStatus,
      plannedSimilarity: input.plannedSimilarity,
      differencesFromPlanJson: JSON.stringify(input.differencesFromPlan),
    })
    .where(eq(verifiedProfileSnapshots.id, input.snapshotId))
    .run();
  const view = getVerifiedSnapshot(db, input.snapshotId);
  if (!view) {
    throw new Error('Слепок не найден после обновления deployment');
  }
  return view;
}

/**
 * Variant used as the Orpheus plan for deployment verification:
 * open experiment → active variant → latest draft/testing.
 */
export function resolvePlanProfileVariant(
  db: AppDatabase,
): ProfileVariantView | null {
  const open = getActiveExperiment(db);
  if (open) {
    const fromExperiment = getProfileVariant(db, open.profileVariantId);
    if (fromExperiment) return fromExperiment;
  }
  const active = getActiveProfileVariant(db);
  if (active) return active;
  const latest = db
    .select()
    .from(profileVariants)
    .orderBy(desc(profileVariants.createdAt))
    .limit(1)
    .get();
  return latest ? mapProfileVariantRow(db, latest) : null;
}

/* -------------------------------- Experiments ------------------------------ */

function mapExperimentMetricsRow(
  row: typeof experimentMetrics.$inferSelect,
): ExperimentMetricsView {
  return ExperimentMetricsViewSchema.parse({
    activeDays: row.activeDays,
    eurydiceSessions: row.eurydiceSessions,
    incomingLikes: row.incomingLikes,
    targetIncomingLikes: row.targetIncomingLikes,
    matches: row.matches,
    targetMatches: row.targetMatches,
    conversations: row.conversations,
    substantiveConversations: row.substantiveConversations,
    telegramExchanges: row.telegramExchanges,
    dateProposed: row.dateProposed,
    dateScheduled: row.dateScheduled,
    dateCompleted: row.dateCompleted,
  });
}

function mapProfileExperimentRow(
  db: AppDatabase,
  row: typeof profileExperiments.$inferSelect,
): ProfileExperimentView {
  const preRow = db
    .select()
    .from(experimentPreFeedback)
    .where(eq(experimentPreFeedback.experimentId, row.id))
    .get();
  const postRow = db
    .select()
    .from(experimentPostFeedback)
    .where(eq(experimentPostFeedback.experimentId, row.id))
    .get();
  const metricsRow = db
    .select()
    .from(experimentMetrics)
    .where(eq(experimentMetrics.experimentId, row.id))
    .orderBy(desc(experimentMetrics.calculatedAt))
    .limit(1)
    .get();

  return ProfileExperimentViewSchema.parse({
    id: row.id,
    profileVariantId: row.profileVariantId,
    status: row.status,
    minDurationDays: row.minDurationDays,
    targetDurationDays: row.targetDurationDays,
    maxDurationDays: row.maxDurationDays,
    imperfectDeployment: Boolean(row.imperfectDeployment),
    startedAt: row.startedAt ?? undefined,
    completedAt: row.completedAt ?? undefined,
    completionReason: row.completionReason ?? undefined,
    preFeedback: preRow
      ? {
          experimentId: row.id,
          botExpectation: preRow.botExpectation,
          botExpectedMetrics: parseJsonObject(preRow.botExpectedMetricsJson, {
            confidence: 0,
            assumptions: [] as string[],
          }),
          userExpectedOutcome: preRow.userExpectedOutcome,
          userExpectedMetrics: parseJsonOptional(preRow.userExpectedMetricsJson),
          userAuthenticityRating: preRow.userAuthenticityRating ?? undefined,
          userNotes: preRow.userNotes ?? undefined,
        }
      : undefined,
    postFeedback: postRow
      ? {
          experimentId: row.id,
          actualOutcomeSummary: postRow.actualOutcomeSummary,
          expectationsMatched: postRow.expectationsMatched,
          audienceQualityRating: postRow.audienceQualityRating ?? undefined,
          comfortRating: postRow.comfortRating ?? undefined,
          wouldReuse: postRow.wouldReuse ?? undefined,
          userInterpretation: postRow.userInterpretation ?? undefined,
        }
      : undefined,
    metrics: metricsRow ? mapExperimentMetricsRow(metricsRow) : undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export function createExperiment(
  db: AppDatabase,
  input: CreateExperimentInput,
): ProfileExperimentView {
  const running = db
    .select()
    .from(profileExperiments)
    .where(eq(profileExperiments.status, 'running'))
    .get();
  if (running) {
    throw new Error(
      'Уже есть активный запущенный тест — завершите его перед созданием нового',
    );
  }
  const now = nowIso();
  const id = randomUUID();
  db.insert(profileExperiments)
    .values({
      id,
      profileVariantId: input.profileVariantId,
      status: 'draft',
      minDurationDays: input.minDurationDays,
      targetDurationDays: input.targetDurationDays,
      maxDurationDays: input.maxDurationDays,
      imperfectDeployment: false,
      startedAt: null,
      completedAt: null,
      completionReason: null,
      previousVariantId: null,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  const view = getExperiment(db, id);
  if (!view) {
    throw new Error('Failed to create experiment');
  }
  return view;
}

export function getExperiment(db: AppDatabase, id: string): ProfileExperimentView | null {
  const row = db
    .select()
    .from(profileExperiments)
    .where(eq(profileExperiments.id, id))
    .get();
  return row ? mapProfileExperimentRow(db, row) : null;
}

export function getActiveExperiment(db: AppDatabase): ProfileExperimentView | null {
  const running = db
    .select()
    .from(profileExperiments)
    .where(eq(profileExperiments.status, 'running'))
    .get();
  if (running) {
    return mapProfileExperimentRow(db, running);
  }
  // Keep draft/ready visible so the user can start after create.
  const open = db
    .select()
    .from(profileExperiments)
    .all()
    .filter((row) => row.status === 'draft' || row.status === 'ready')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  return open ? mapProfileExperimentRow(db, open) : null;
}

/**
 * Build a profile variant from a Twinby verified snapshot (baseline / mid-test change).
 */
export function createVariantFromVerifiedSnapshot(
  db: AppDatabase,
  snapshotId: string,
  opts?: { name?: string; hypothesis?: string },
): ProfileVariantView {
  const snapshot = getVerifiedSnapshot(db, snapshotId);
  if (!snapshot) {
    throw new Error('Слепок профиля не найден');
  }

  const audience = getCurrentAudienceModel(db);
  const identity = getCurrentIdentityModel(db);
  const photoIds = snapshot.photos
    .slice()
    .sort((a, b) => a.position - b.position)
    .map(
      (p) =>
        p.matchedPhotoAssetId || p.perceptualHash || `snap-photo-${p.position}`,
    );

  const variant = saveProfileVariant(db, {
    name:
      opts?.name ??
      `Текущий Twinby · ${new Date(snapshot.capturedAt).toLocaleString('ru-RU')}`,
    bio: snapshot.bio?.trim() || '—',
    hypothesis:
      opts?.hypothesis ??
      'Baseline: фактическая анкета Twinby на момент создания эксперимента',
    photoIds,
    photoRoles: [],
    createdAgainstAudienceVersion: audience.version,
    createdAgainstIdentityVersion: identity.version,
  });

  db.update(profileVariants)
    .set({ verifiedSnapshotId: snapshot.id })
    .where(eq(profileVariants.id, variant.id))
    .run();

  db.update(verifiedProfileSnapshots)
    .set({
      profileVariantId: variant.id,
      // Plan = fact for a baseline taken from the live profile.
      deploymentStatus: 'matches-plan',
      plannedSimilarity: 1,
      differencesFromPlanJson: JSON.stringify([]),
    })
    .where(eq(verifiedProfileSnapshots.id, snapshot.id))
    .run();

  const view = getProfileVariant(db, variant.id);
  if (!view) {
    throw new Error('Не удалось создать вариант из слепка');
  }
  return view;
}

/** Create draft experiment from the current (or given) Twinby snapshot. */
export function createExperimentFromSnapshot(
  db: AppDatabase,
  input: {
    snapshotId?: string;
    minDurationDays?: number;
    targetDurationDays?: number;
    maxDurationDays?: number;
  } = {},
): ProfileExperimentView {
  const snapshot = input.snapshotId
    ? getVerifiedSnapshot(db, input.snapshotId)
    : getActiveVerifiedSnapshot(db);
  if (!snapshot) {
    throw new Error('Нет слепка Twinby — сначала снимите слепок профиля');
  }

  const variant = createVariantFromVerifiedSnapshot(db, snapshot.id);
  return createExperiment(db, {
    profileVariantId: variant.id,
    minDurationDays: input.minDurationDays ?? 3,
    targetDurationDays: input.targetDurationDays ?? 5,
    maxDurationDays: input.maxDurationDays ?? 7,
  });
}

export function listExperimentsByIds(
  db: AppDatabase,
  ids: string[],
): ProfileExperimentView[] {
  return db
    .select()
    .from(profileExperiments)
    .all()
    .filter((row) => ids.includes(row.id))
    .map((row) => mapProfileExperimentRow(db, row));
}

export function saveExperimentPreFeedback(
  db: AppDatabase,
  input: SavePreFeedbackInput,
): ProfileExperimentView {
  const experiment = db
    .select()
    .from(profileExperiments)
    .where(eq(profileExperiments.id, input.experimentId))
    .get();
  if (!experiment) {
    throw new Error('Эксперимент не найден');
  }
  const existing = db
    .select()
    .from(experimentPreFeedback)
    .where(eq(experimentPreFeedback.experimentId, input.experimentId))
    .get();
  const now = nowIso();
  const values = {
    experimentId: input.experimentId,
    botExpectation: existing?.botExpectation ?? '',
    botExpectedMetricsJson:
      existing?.botExpectedMetricsJson ?? JSON.stringify({ confidence: 0, assumptions: [] }),
    userExpectedOutcome: input.userExpectedOutcome,
    userExpectedMetricsJson: input.userExpectedMetrics
      ? JSON.stringify(input.userExpectedMetrics)
      : null,
    userAuthenticityRating: input.userAuthenticityRating ?? null,
    userNotes: input.userNotes ?? null,
    createdAt: now,
  };
  if (existing) {
    db.update(experimentPreFeedback)
      .set(values)
      .where(eq(experimentPreFeedback.experimentId, input.experimentId))
      .run();
  } else {
    db.insert(experimentPreFeedback)
      .values({ id: randomUUID(), ...values })
      .run();
  }
  db.update(profileExperiments)
    .set({ status: 'ready', updatedAt: now })
    .where(eq(profileExperiments.id, input.experimentId))
    .run();
  const view = getExperiment(db, input.experimentId);
  if (!view) {
    throw new Error('Experiment missing after feedback save');
  }
  return view;
}

export function startExperiment(
  db: AppDatabase,
  id: string,
  options: { allowImperfectDeployment?: boolean } = {},
): ProfileExperimentView {
  const experiment = db
    .select()
    .from(profileExperiments)
    .where(eq(profileExperiments.id, id))
    .get();
  if (!experiment) {
    throw new Error('Эксперимент не найден');
  }
  const running = db
    .select()
    .from(profileExperiments)
    .where(eq(profileExperiments.status, 'running'))
    .get();
  if (running && running.id !== id) {
    throw new Error('Уже есть активный запущенный тест');
  }

  const snapshot = getActiveVerifiedSnapshot(db);
  const deployment = snapshot?.deploymentStatus ?? 'not-verified';
  if (deployment === 'not-verified') {
    throw new Error(
      'Сначала снимите слепок Twinby и сверьте его с планом анкеты',
    );
  }
  if (deployment === 'does-not-match') {
    throw new Error(
      'Twinby не совпадает с планом — поправьте анкету или снимите новый слепок',
    );
  }
  const imperfect = deployment === 'partially-matches';
  if (imperfect && !options.allowImperfectDeployment) {
    throw new Error(
      'Профиль совпадает с планом лишь частично. Подтвердите старт с пометкой imperfect deployment.',
    );
  }

  const now = nowIso();
  db.update(profileExperiments)
    .set({
      status: 'running',
      startedAt: now,
      updatedAt: now,
      imperfectDeployment: imperfect,
    })
    .where(eq(profileExperiments.id, id))
    .run();
  setProfileVariantStatus(db, experiment.profileVariantId, 'testing');
  const view = getExperiment(db, id);
  if (!view) {
    throw new Error('Experiment missing after start');
  }
  return view;
}

export function completeExperiment(
  db: AppDatabase,
  input: CompleteExperimentInput,
): ProfileExperimentView {
  const experiment = db
    .select()
    .from(profileExperiments)
    .where(eq(profileExperiments.id, input.experimentId))
    .get();
  if (!experiment) {
    throw new Error('Эксперимент не найден');
  }
  const now = nowIso();
  db.update(profileExperiments)
    .set({
      status: input.reason,
      completedAt: now,
      completionReason: input.reason,
      updatedAt: now,
    })
    .where(eq(profileExperiments.id, input.experimentId))
    .run();
  const view = getExperiment(db, input.experimentId);
  if (!view) {
    throw new Error('Experiment missing after completion');
  }
  return view;
}

export function saveExperimentPostFeedback(
  db: AppDatabase,
  input: SavePostFeedbackInput,
): ProfileExperimentView {
  const experiment = db
    .select()
    .from(profileExperiments)
    .where(eq(profileExperiments.id, input.experimentId))
    .get();
  if (!experiment) {
    throw new Error('Эксперимент не найден');
  }
  const existing = db
    .select()
    .from(experimentPostFeedback)
    .where(eq(experimentPostFeedback.experimentId, input.experimentId))
    .get();
  const now = nowIso();
  const values = {
    experimentId: input.experimentId,
    actualOutcomeSummary: input.actualOutcomeSummary,
    expectationsMatched: input.expectationsMatched,
    audienceQualityRating: input.audienceQualityRating ?? null,
    comfortRating: input.comfortRating ?? null,
    wouldReuse: input.wouldReuse ?? null,
    userInterpretation: input.userInterpretation ?? null,
    createdAt: now,
  };
  if (existing) {
    db.update(experimentPostFeedback)
      .set(values)
      .where(eq(experimentPostFeedback.experimentId, input.experimentId))
      .run();
  } else {
    db.insert(experimentPostFeedback)
      .values({ id: randomUUID(), ...values })
      .run();
  }
  const view = getExperiment(db, input.experimentId);
  if (!view) {
    throw new Error('Experiment missing after post feedback save');
  }
  return view;
}

export function confirmProfileChangeDuringExperiment(
  db: AppDatabase,
  input: ConfirmProfileChangeInput,
): ProfileExperimentView {
  const experiment = db
    .select()
    .from(profileExperiments)
    .where(eq(profileExperiments.id, input.experimentId))
    .get();
  if (!experiment) {
    throw new Error('Эксперимент не найден');
  }
  const now = nowIso();
  db.update(profileExperiments)
    .set({
      status: 'stopped-profile-changed',
      completedAt: now,
      completionReason: 'stopped-profile-changed',
      previousVariantId: experiment.profileVariantId,
      updatedAt: now,
    })
    .where(eq(profileExperiments.id, input.experimentId))
    .run();
  setProfileVariantStatus(db, experiment.profileVariantId, 'paused');
  setProfileVariantStatus(db, input.newProfileVariantId, 'active');
  const view = getExperiment(db, input.experimentId);
  if (!view) {
    throw new Error('Experiment missing after profile change confirmation');
  }
  return view;
}

const PENDING_PROFILE_CHANGE_KEY = 'pending_profile_change_v1';

export function getPendingProfileChange(
  db: AppDatabase,
): PendingProfileChangeView | null {
  const raw = getSetting(db, PENDING_PROFILE_CHANGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as PendingProfileChangeView;
    if (
      typeof parsed.experimentId !== 'string' ||
      typeof parsed.newSnapshotId !== 'string' ||
      typeof parsed.reason !== 'string' ||
      typeof parsed.detectedAt !== 'string'
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function setPendingProfileChange(
  db: AppDatabase,
  pending: PendingProfileChangeView,
): void {
  setSetting(db, PENDING_PROFILE_CHANGE_KEY, JSON.stringify(pending));
}

export function clearPendingProfileChange(db: AppDatabase): void {
  deleteSetting(db, PENDING_PROFILE_CHANGE_KEY);
}

/**
 * §24.5: ask user first. Intentional → new variant from snapshot + stop test.
 * Not intentional → clear pending, keep running experiment.
 */
export function resolvePendingProfileChange(
  db: AppDatabase,
  input: ResolvePendingProfileChangeInput,
): ResolvePendingProfileChangeResult {
  const pending = getPendingProfileChange(db);
  if (!pending) {
    return {
      pendingCleared: true,
      message: 'Нет ожидающего подтверждения изменения профиля',
    };
  }

  if (!input.intentional) {
    clearPendingProfileChange(db);
    return {
      pendingCleared: true,
      message:
        'Изменение не подтверждено — текущий тест продолжается. ' +
        'При необходимости верните Twinby-анкету к тестовому варианту.',
    };
  }

  const snapshot = getVerifiedSnapshot(db, pending.newSnapshotId);
  if (!snapshot) {
    clearPendingProfileChange(db);
    throw new Error('Новый слепок профиля не найден');
  }

  const variant = createVariantFromVerifiedSnapshot(db, snapshot.id, {
    name: `Twinby ${new Date(snapshot.capturedAt).toLocaleString('ru-RU')}`,
    hypothesis: input.reason ?? pending.reason,
  });

  const experiment = confirmProfileChangeDuringExperiment(db, {
    experimentId: pending.experimentId,
    newProfileVariantId: variant.id,
    reason: input.reason ?? pending.reason,
  });
  clearPendingProfileChange(db);

  return {
    pendingCleared: true,
    experiment,
    newVariantId: variant.id,
    message:
      'Тест остановлен из‑за подтверждённого изменения профиля. ' +
      'Создан новый вариант — можно запустить новый эксперимент.',
  };
}

/* ------------------------------- Relationships ----------------------------- */

export function upsertCandidateIdentity(
  db: AppDatabase,
  input: {
    id?: string;
    name?: string;
    age?: number;
    primaryPhotoHash?: string;
    bioFingerprint?: string;
  },
): string {
  const now = nowIso();
  const id = input.id ?? randomUUID();
  const existing = db
    .select()
    .from(candidateIdentities)
    .where(eq(candidateIdentities.id, id))
    .get();
  if (existing) {
    db.update(candidateIdentities)
      .set({ lastSeenAt: now })
      .where(eq(candidateIdentities.id, id))
      .run();
    return id;
  }
  db.insert(candidateIdentities)
    .values({
      id,
      name: input.name ?? null,
      age: input.age ?? null,
      primaryPhotoHash: input.primaryPhotoHash ?? null,
      additionalPhotoHashesJson: '[]',
      bioFingerprint: input.bioFingerprint ?? null,
      firstSeenAt: now,
      lastSeenAt: now,
    })
    .run();
  return id;
}

function mapRelationshipRow(row: typeof relationships.$inferSelect): RelationshipView {
  return RelationshipViewSchema.parse({
    id: row.id,
    candidateIdentityId: row.candidateIdentityId,
    origin: row.origin,
    currentStage: row.currentStage,
    audienceFit: {
      modelLabel: row.modelAudienceFit,
      modelScore: row.audienceScore,
      modelConfidence: row.audienceConfidence,
      modelReasons: parseJsonArray<string>(row.modelReasonsJson),
      finalLabel: row.finalAudienceFit,
      correctedByUser: row.correctedByUser,
      correctionReasons: parseJsonArray<string>(row.correctionReasonsJson),
      correctionComment: row.correctionComment ?? undefined,
    },
    attributedProfileSnapshotId: row.attributedProfileSnapshotId ?? undefined,
    attributedProfileVariantId: row.attributedProfileVariantId ?? undefined,
    experimentId: row.experimentId ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export function createRelationship(
  db: AppDatabase,
  input: {
    id?: string;
    candidateIdentityId: string;
    origin?: 'incoming-like-first' | 'outgoing-like-first' | 'unknown';
    currentStage?: RelationshipStage;
    modelAudienceFit?: AudienceFitLabel;
    modelScore?: number;
    modelConfidence?: number;
    modelReasons?: string[];
    attributedProfileSnapshotId?: string;
    attributedProfileVariantId?: string;
  },
): RelationshipView {
  const now = nowIso();
  const id = input.id ?? randomUUID();
  db.insert(relationships)
    .values({
      id,
      candidateIdentityId: input.candidateIdentityId,
      origin: input.origin ?? 'unknown',
      currentStage: input.currentStage ?? 'incoming-like',
      modelAudienceFit: input.modelAudienceFit ?? 'borderline',
      finalAudienceFit: input.modelAudienceFit ?? 'borderline',
      audienceScore: input.modelScore ?? 0,
      audienceConfidence: input.modelConfidence ?? 0,
      modelReasonsJson: JSON.stringify(input.modelReasons ?? []),
      correctedByUser: false,
      correctionReasonsJson: '[]',
      correctionComment: null,
      attributedProfileSnapshotId: input.attributedProfileSnapshotId ?? null,
      attributedProfileVariantId: input.attributedProfileVariantId ?? null,
      experimentId: null,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return getRelationship(db, id);
}

export function listRelationships(
  db: AppDatabase,
  query: { stage?: RelationshipStage; limit: number; offset: number },
): RelationshipView[] {
  const rows = db
    .select()
    .from(relationships)
    .orderBy(desc(relationships.updatedAt))
    .all()
    .filter((row) => (query.stage ? row.currentStage === query.stage : true));
  return rows.slice(query.offset, query.offset + query.limit).map(mapRelationshipRow);
}

export function getRelationship(db: AppDatabase, id: string): RelationshipView {
  const row = db.select().from(relationships).where(eq(relationships.id, id)).get();
  if (!row) {
    throw new Error('Отношение не найдено');
  }
  return mapRelationshipRow(row);
}

const RELATIONSHIP_EVENT_TYPE_BY_STAGE: Record<RelationshipStage, string> = {
  'incoming-like': 'incoming-like-detected',
  matched: 'matched',
  'conversation-started': 'conversation-started',
  'substantive-conversation': 'substantive-conversation',
  'telegram-exchanged': 'telegram-exchanged',
  'date-proposed': 'date-proposed',
  'date-scheduled': 'date-scheduled',
  'date-completed': 'date-completed',
  closed: 'closed',
};

export function setRelationshipStage(
  db: AppDatabase,
  input: SetRelationshipStageInput,
): RelationshipView {
  const existing = db
    .select()
    .from(relationships)
    .where(eq(relationships.id, input.relationshipId))
    .get();
  if (!existing) {
    throw new Error('Отношение не найдено');
  }
  const now = nowIso();
  db.update(relationships)
    .set({ currentStage: input.stage, updatedAt: now })
    .where(eq(relationships.id, input.relationshipId))
    .run();
  db.insert(relationshipEvents)
    .values({
      id: randomUUID(),
      relationshipId: input.relationshipId,
      type: RELATIONSHIP_EVENT_TYPE_BY_STAGE[input.stage],
      occurredAt: now,
      source: 'user-feedback',
      metadataJson: input.comment ? JSON.stringify({ comment: input.comment }) : null,
    })
    .run();
  return getRelationship(db, input.relationshipId);
}

export function applyAudienceCorrectionToRelationship(
  db: AppDatabase,
  input: AudienceCorrectionInput,
): RelationshipView {
  const existing = db
    .select()
    .from(relationships)
    .where(eq(relationships.id, input.relationshipId))
    .get();
  if (!existing) {
    throw new Error('Отношение не найдено');
  }
  const now = nowIso();
  db.update(relationships)
    .set({
      finalAudienceFit: input.finalLabel,
      correctedByUser: true,
      correctionReasonsJson: JSON.stringify(input.correctionReasons),
      correctionComment: input.correctionComment ?? null,
      updatedAt: now,
    })
    .where(eq(relationships.id, input.relationshipId))
    .run();

  const current = getCurrentAudienceModelVersionRow(db);
  db.insert(audienceFitAssessments)
    .values({
      id: randomUUID(),
      relationshipId: input.relationshipId,
      audienceModelVersion: current.version,
      modelLabel: existing.modelAudienceFit,
      modelScore: existing.audienceScore,
      modelConfidence: existing.audienceConfidence,
      modelReasonsJson: existing.modelReasonsJson,
      finalLabel: input.finalLabel,
      correctedByUser: true,
      correctionReasonsJson: JSON.stringify(input.correctionReasons),
      correctionComment: input.correctionComment ?? null,
      correctedAt: now,
      createdAt: now,
    })
    .run();

  return getRelationship(db, input.relationshipId);
}

export function closeRelationship(
  db: AppDatabase,
  input: CloseRelationshipInput,
): RelationshipView {
  return setRelationshipStage(db, {
    relationshipId: input.relationshipId,
    stage: 'closed',
    comment: input.reason,
  });
}

export function upsertCurrentIncomingLike(
  db: AppDatabase,
  input: { relationshipId: string; candidateIdentityId: string },
): void {
  const now = nowIso();
  const existing = db
    .select()
    .from(currentIncomingLikes)
    .where(eq(currentIncomingLikes.relationshipId, input.relationshipId))
    .get();
  if (existing) {
    db.update(currentIncomingLikes)
      .set({ lastConfirmedAt: now })
      .where(eq(currentIncomingLikes.relationshipId, input.relationshipId))
      .run();
    return;
  }
  db.insert(currentIncomingLikes)
    .values({
      relationshipId: input.relationshipId,
      candidateIdentityId: input.candidateIdentityId,
      detectedAt: now,
      lastConfirmedAt: now,
    })
    .run();
}

export function removeCurrentIncomingLike(db: AppDatabase, relationshipId: string): void {
  db.delete(currentIncomingLikes)
    .where(eq(currentIncomingLikes.relationshipId, relationshipId))
    .run();
}

export function listCurrentIncomingLikes(db: AppDatabase) {
  return db.select().from(currentIncomingLikes).all();
}

export function upsertCurrentMatch(
  db: AppDatabase,
  input: { relationshipId: string; candidateIdentityId: string },
): void {
  const now = nowIso();
  const existing = db
    .select()
    .from(currentMatches)
    .where(eq(currentMatches.relationshipId, input.relationshipId))
    .get();
  if (existing) {
    db.update(currentMatches)
      .set({ lastConfirmedAt: now })
      .where(eq(currentMatches.relationshipId, input.relationshipId))
      .run();
    return;
  }
  db.insert(currentMatches)
    .values({
      relationshipId: input.relationshipId,
      candidateIdentityId: input.candidateIdentityId,
      matchedAt: now,
      lastConfirmedAt: now,
    })
    .run();
}

export function removeCurrentMatch(db: AppDatabase, relationshipId: string): void {
  db.delete(currentMatches).where(eq(currentMatches.relationshipId, relationshipId)).run();
}

export function listCurrentMatches(db: AppDatabase) {
  return db.select().from(currentMatches).all();
}

export function upsertCurrentDialog(
  db: AppDatabase,
  input: {
    relationshipId: string;
    candidateIdentityId: string;
    rankPosition?: number;
    lastMessageAt?: string;
  },
): void {
  const now = nowIso();
  const existing = db
    .select()
    .from(currentDialogs)
    .where(eq(currentDialogs.relationshipId, input.relationshipId))
    .get();
  if (existing) {
    db.update(currentDialogs)
      .set({
        lastConfirmedAt: now,
        rankPosition: input.rankPosition ?? existing.rankPosition,
        lastMessageAt: input.lastMessageAt ?? existing.lastMessageAt,
      })
      .where(eq(currentDialogs.relationshipId, input.relationshipId))
      .run();
    return;
  }
  db.insert(currentDialogs)
    .values({
      relationshipId: input.relationshipId,
      candidateIdentityId: input.candidateIdentityId,
      lastMessageAt: input.lastMessageAt ?? null,
      rankPosition: input.rankPosition ?? null,
      lastConfirmedAt: now,
    })
    .run();
}

export function removeCurrentDialog(db: AppDatabase, relationshipId: string): void {
  db.delete(currentDialogs).where(eq(currentDialogs.relationshipId, relationshipId)).run();
}

export function listCurrentDialogs(db: AppDatabase) {
  return db.select().from(currentDialogs).all();
}

/* -------------------------------- Preflight -------------------------------- */

const PREFLIGHT_STEP_ORDER: PreflightStepId[] = [
  'own-profile',
  'dialogs',
  'matches',
  'likes',
  'reconciliation',
];

function mapPreflightRunRow(
  db: AppDatabase,
  row: typeof preflightRuns.$inferSelect,
): PreflightRunView {
  const stepRows = db
    .select()
    .from(preflightRunSteps)
    .where(eq(preflightRunSteps.runId, row.id))
    .orderBy(asc(preflightRunSteps.position))
    .all();

  return PreflightRunViewSchema.parse({
    id: row.id,
    startedAt: row.startedAt,
    completedAt: row.completedAt ?? undefined,
    status: row.status,
    overrideUsed: row.overrideUsed,
    overrideReason: row.overrideReason ?? undefined,
    steps: stepRows.map((s) => ({
      id: s.id,
      runId: s.runId,
      stepId: s.stepId,
      status: s.status,
      position: s.position,
      startedAt: s.startedAt ?? undefined,
      completedAt: s.completedAt ?? undefined,
      summary: s.summary ?? undefined,
      error: s.error ?? undefined,
    })),
  });
}

export function getLatestPreflightRun(db: AppDatabase): PreflightRunView | null {
  const row = db
    .select()
    .from(preflightRuns)
    .orderBy(desc(preflightRuns.startedAt))
    .limit(1)
    .get();
  return row ? mapPreflightRunRow(db, row) : null;
}

export function startPreflightRun(
  db: AppDatabase,
  input: { overrideUsed: boolean; overrideReason?: string },
): PreflightRunView {
  const now = nowIso();
  const id = randomUUID();
  db.insert(preflightRuns)
    .values({
      id,
      startedAt: now,
      completedAt: null,
      status: 'running',
      overrideUsed: input.overrideUsed,
      overrideReason: input.overrideReason ?? null,
      summaryJson: null,
    })
    .run();
  PREFLIGHT_STEP_ORDER.forEach((stepId, index) => {
    db.insert(preflightRunSteps)
      .values({
        id: randomUUID(),
        runId: id,
        stepId,
        status: 'pending',
        position: index,
        startedAt: null,
        completedAt: null,
        summary: null,
        error: null,
      })
      .run();
  });
  const view = getLatestPreflightRun(db);
  if (!view) {
    throw new Error('Failed to start preflight run');
  }
  return view;
}

export function cancelLatestPreflightRun(db: AppDatabase): PreflightRunView | null {
  const row = db
    .select()
    .from(preflightRuns)
    .orderBy(desc(preflightRuns.startedAt))
    .limit(1)
    .get();
  if (!row || row.status !== 'running') {
    return row ? mapPreflightRunRow(db, row) : null;
  }
  const now = nowIso();
  db.update(preflightRuns)
    .set({ status: 'cancelled', completedAt: now })
    .where(eq(preflightRuns.id, row.id))
    .run();
  return getLatestPreflightRun(db);
}

export { schema };
