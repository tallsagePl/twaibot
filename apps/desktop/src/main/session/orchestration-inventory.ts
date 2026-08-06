/**
 * Stage 0 baseline gap-map (Orpheus.md §2.3 / §36).
 * Updated as orchestration and product services land.
 */
export type InventoryStatus = 'present' | 'partial' | 'missing' | 'stub';

export interface OrchestrationInventoryItem {
  name: string;
  status: InventoryStatus;
  location?: string;
  notes?: string;
}

/** Session orchestration services (§2.3). */
export const SESSION_ORCHESTRATION_INVENTORY: OrchestrationInventoryItem[] = [
  {
    name: 'DeviceBootstrapService',
    status: 'present',
    location: 'apps/desktop/src/main/session/device-bootstrap-service.ts',
  },
  {
    name: 'TwinbyNavigationService',
    status: 'present',
    location: 'apps/desktop/src/main/session/twinby-navigation-service.ts',
    notes: 'Feed + own-profile/likes/matches/dialogs via discovery locators',
  },
  {
    name: 'PreflightOrchestrator',
    status: 'present',
    location: 'apps/desktop/src/main/session/preflight-orchestrator.ts',
    notes: 'Includes profile-change detection flag + pending experiment prompt',
  },
  {
    name: 'OwnProfileCaptureService',
    status: 'present',
    location: 'apps/desktop/src/main/session/own-profile-capture-service.ts',
    notes: 'Compare/pHash; pending profile-change during running experiment',
  },
  {
    name: 'CandidateCapturePipeline',
    status: 'present',
    location: 'apps/desktop/src/main/session/profile-capture-pipeline.ts',
  },
  {
    name: 'CandidateEvaluationService',
    status: 'present',
    location: 'apps/desktop/src/main/session/candidate-evaluation-service.ts',
  },
  {
    name: 'IncomingLikesScanService',
    status: 'present',
    location: 'apps/desktop/src/main/session/incoming-likes-scan-service.ts',
  },
  {
    name: 'MatchesScanService',
    status: 'present',
    location: 'apps/desktop/src/main/session/matches-scan-service.ts',
  },
  {
    name: 'DialogsScanService',
    status: 'present',
    location: 'apps/desktop/src/main/session/dialogs-scan-service.ts',
  },
  {
    name: 'RelationshipReconciliationService',
    status: 'present',
    location: 'apps/desktop/src/main/session/relationship-reconciliation-service.ts',
  },
  {
    name: 'ActionExecutionService',
    status: 'present',
    location: 'apps/desktop/src/main/session/action-execution-service.ts',
  },
  {
    name: 'SessionLimitService',
    status: 'present',
    location: 'apps/desktop/src/main/session/session-limit-service.ts',
  },
  {
    name: 'SessionRecoveryService',
    status: 'present',
    location: 'apps/desktop/src/main/session/session-recovery-service.ts',
  },
  {
    name: 'HistoryRecorder',
    status: 'present',
    location: 'apps/desktop/src/main/session/history-recorder.ts',
  },
];

/** Product services (§36). */
export const PRODUCT_SERVICE_INVENTORY: OrchestrationInventoryItem[] = [
  {
    name: 'SecureSecretService',
    status: 'partial',
    location: 'apps/desktop/src/main/security/secrets.ts',
  },
  { name: 'AiProviderService', status: 'present', location: 'packages/ai-provider' },
  {
    name: 'AudienceModelService',
    status: 'present',
    location: 'packages/audience-model + audience-handlers',
  },
  {
    name: 'IdentityModelService',
    status: 'present',
    location: 'packages/identity-model + identity-handlers',
  },
  {
    name: 'CloudConnectionService',
    status: 'partial',
    location: 'packages/cloud-photo-sources',
    notes: 'OAuth stubs / desktop browser flow — harden credentials next',
  },
  {
    name: 'GoogleDrivePhotoSource',
    status: 'partial',
    location: 'packages/cloud-photo-sources',
  },
  {
    name: 'YandexDiskPhotoSource',
    status: 'partial',
    location: 'packages/cloud-photo-sources',
  },
  { name: 'PhotoIndexingService', status: 'partial', location: 'packages/photo-index' },
  { name: 'PhotoSearchService', status: 'partial', location: 'packages/photo-index' },
  {
    name: 'PhotoAssessmentService',
    status: 'partial',
    location: 'packages/profile-auditor',
  },
  {
    name: 'ProfileSetGenerator',
    status: 'present',
    location: 'packages/profile-builder',
  },
  {
    name: 'ProfileAuditService',
    status: 'present',
    location: 'packages/profile-auditor',
  },
  {
    name: 'PhotoPlanService',
    status: 'present',
    location: 'packages/profile-builder',
  },
  {
    name: 'OwnProfileVariantService',
    status: 'present',
    location: 'packages/own-profile + orpheus-handlers',
  },
  {
    name: 'OwnProfileCaptureService',
    status: 'present',
    location: 'apps/desktop/src/main/session/own-profile-capture-service.ts',
  },
  {
    name: 'ProfileDeploymentVerifier',
    status: 'present',
    location: 'packages/own-profile comparePlannedToActual',
  },
  {
    name: 'ExperimentService',
    status: 'present',
    location: 'packages/profile-experiments + experiment-handlers',
    notes: 'Pending profile-change confirmation wired (§24.5)',
  },
  {
    name: 'ExperimentMetricsService',
    status: 'present',
    location: 'packages/analytics',
  },
  {
    name: 'ExperimentAnalysisService',
    status: 'partial',
    location: 'experiment-handlers.recommendStop',
  },
  {
    name: 'RelationshipService',
    status: 'present',
    location: 'packages/relationship-tracker + relationship-handlers',
  },
  {
    name: 'LocatorDiscoveryService',
    status: 'partial',
    location: 'packages/locator-discovery + docs/locator-discovery.md',
  },
  {
    name: 'LocatorProfileService',
    status: 'present',
    location: 'packages/twinby-adapter',
  },
];

/** Existing Eurydice IPC groups. */
export const EXISTING_IPC_GROUPS = [
  'app',
  'legal',
  'database',
  'ai',
  'preferences',
  'references',
  'summary',
  'sessions',
  'review',
  'history',
  'environment',
  'appium',
  'twinby',
  'audience',
  'identity',
  'cloud',
  'orpheus',
  'profile-snapshot',
  'experiment',
  'relationships',
  'preflight',
] as const;

/** IPC groups still thin / stubbed vs Orpheus.md §35. */
export const THIN_IPC_GROUPS = ['cloud'] as const;
