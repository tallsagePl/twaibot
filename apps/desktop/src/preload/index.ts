import { contextBridge, ipcRenderer } from 'electron';

/**
 * Keep channel strings inlined — sandboxed preload cannot require workspace packages.
 * Must stay in sync with @twinby/contracts IPC_CHANNELS.
 */
const IPC = {
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
  CLOUD_INDEX_FINISHED: 'cloud:index-finished',
  ORPHEUS_GENERATE_PROFILE_SETS: 'orpheus:generate-profile-sets',
  ORPHEUS_SUGGEST_PHOTOS: 'orpheus:suggest-photos',
  ORPHEUS_REGENERATE_ALL: 'orpheus:regenerate-all',
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

const api = {
  app: {
    ping(input: { message: string }) {
      return ipcRenderer.invoke(IPC.APP_PING, input);
    },
    getInfo() {
      return ipcRenderer.invoke(IPC.APP_GET_INFO);
    },
    showPathInFolder(path: string) {
      return ipcRenderer.invoke(IPC.APP_SHOW_PATH_IN_FOLDER, path);
    },
  },
  legal: {
    getConsentText() {
      return ipcRenderer.invoke(IPC.LEGAL_GET_CONSENT_TEXT);
    },
    getLatestConsent() {
      return ipcRenderer.invoke(IPC.LEGAL_GET_LATEST);
    },
    acceptConsent(input: { consentVersion: string; accepted: true }) {
      return ipcRenderer.invoke(IPC.LEGAL_ACCEPT, input);
    },
  },
  database: {
    health() {
      return ipcRenderer.invoke(IPC.DATABASE_HEALTH);
    },
  },
  ai: {
    getConfig() {
      return ipcRenderer.invoke(IPC.AI_GET_CONFIG);
    },
    saveConfig(input: unknown) {
      return ipcRenderer.invoke(IPC.AI_SAVE_CONFIG, input);
    },
    listModels() {
      return ipcRenderer.invoke(IPC.AI_LIST_MODELS);
    },
    testTextConnection() {
      return ipcRenderer.invoke(IPC.AI_TEST_TEXT);
    },
    testVisionConnection() {
      return ipcRenderer.invoke(IPC.AI_TEST_VISION);
    },
    getCapabilities(model?: string) {
      return ipcRenderer.invoke(IPC.AI_GET_CAPABILITIES, model);
    },
    analyzeReferences(force?: boolean) {
      return ipcRenderer.invoke(IPC.AI_ANALYZE_REFERENCES, force === true);
    },
  },
  preferences: {
    get() {
      return ipcRenderer.invoke(IPC.PREFERENCES_GET);
    },
    save(input: unknown) {
      return ipcRenderer.invoke(IPC.PREFERENCES_SAVE, input);
    },
    listReferences() {
      return ipcRenderer.invoke(IPC.REFERENCES_LIST);
    },
    addReference(input: unknown) {
      return ipcRenderer.invoke(IPC.REFERENCES_ADD, input);
    },
    updateReference(input: unknown) {
      return ipcRenderer.invoke(IPC.REFERENCES_UPDATE, input);
    },
    removeReference(id: string) {
      return ipcRenderer.invoke(IPC.REFERENCES_REMOVE, id);
    },
    getSummary() {
      return ipcRenderer.invoke(IPC.SUMMARY_GET);
    },
    saveSummary(summary: unknown) {
      return ipcRenderer.invoke(IPC.SUMMARY_SAVE, summary);
    },
  },
  sessions: {
    start(input?: unknown) {
      return ipcRenderer.invoke(IPC.SESSIONS_START, input);
    },
    pause() {
      return ipcRenderer.invoke(IPC.SESSIONS_PAUSE);
    },
    resume() {
      return ipcRenderer.invoke(IPC.SESSIONS_RESUME);
    },
    stop() {
      return ipcRenderer.invoke(IPC.SESSIONS_STOP);
    },
    getState() {
      return ipcRenderer.invoke(IPC.SESSIONS_GET_STATE);
    },
  },
  review: {
    confirm(input: unknown) {
      return ipcRenderer.invoke(IPC.REVIEW_CONFIRM, input);
    },
    skip(captureId: string) {
      return ipcRenderer.invoke(IPC.REVIEW_SKIP, captureId);
    },
  },
  history: {
    list(input?: unknown) {
      return ipcRenderer.invoke(IPC.HISTORY_LIST, input);
    },
    listSessions() {
      return ipcRenderer.invoke(IPC.HISTORY_LIST_SESSIONS);
    },
    listSessionProfiles(input: unknown) {
      return ipcRenderer.invoke(IPC.HISTORY_LIST_SESSION_PROFILES, input);
    },
    saveProfileFeedback(input: unknown) {
      return ipcRenderer.invoke(IPC.HISTORY_SAVE_PROFILE_FEEDBACK, input);
    },
    submitSessionFeedback(input: unknown) {
      return ipcRenderer.invoke(IPC.HISTORY_SUBMIT_SESSION_FEEDBACK, input);
    },
    applySessionFeedback(input: unknown) {
      return ipcRenderer.invoke(IPC.HISTORY_APPLY_SESSION_FEEDBACK, input);
    },
    deleteSession(input: unknown) {
      return ipcRenderer.invoke(IPC.HISTORY_DELETE_SESSION, input);
    },
  },
  environment: {
    runDoctor() {
      return ipcRenderer.invoke(IPC.ENVIRONMENT_RUN_DOCTOR);
    },
    listAvds() {
      return ipcRenderer.invoke(IPC.ENVIRONMENT_LIST_AVDS);
    },
    listDevices() {
      return ipcRenderer.invoke(IPC.ENVIRONMENT_LIST_DEVICES);
    },
  },
  appium: {
    getStatus() {
      return ipcRenderer.invoke(IPC.APPIUM_GET_STATUS);
    },
    startServer() {
      return ipcRenderer.invoke(IPC.APPIUM_START_SERVER);
    },
    stopServer() {
      return ipcRenderer.invoke(IPC.APPIUM_STOP_SERVER);
    },
    createSession(input: unknown) {
      return ipcRenderer.invoke(IPC.APPIUM_CREATE_SESSION, input);
    },
    endSession() {
      return ipcRenderer.invoke(IPC.APPIUM_END_SESSION);
    },
    getSession() {
      return ipcRenderer.invoke(IPC.APPIUM_GET_SESSION);
    },
    takeScreenshot() {
      return ipcRenderer.invoke(IPC.APPIUM_SCREENSHOT);
    },
    getPageSource() {
      return ipcRenderer.invoke(IPC.APPIUM_PAGE_SOURCE);
    },
    getWindowRect() {
      return ipcRenderer.invoke(IPC.APPIUM_WINDOW_RECT);
    },
  },
  twinby: {
    detectPackage() {
      return ipcRenderer.invoke(IPC.TWINBY_DETECT_PACKAGE);
    },
    getLocatorProfile() {
      return ipcRenderer.invoke(IPC.TWINBY_GET_LOCATOR_PROFILE);
    },
    detectScreen(pageSource?: string) {
      return ipcRenderer.invoke(IPC.TWINBY_DETECT_SCREEN, pageSource);
    },
    captureDiscoverySnapshot() {
      return ipcRenderer.invoke(IPC.TWINBY_CAPTURE_DISCOVERY);
    },
    captureCurrentProfile(input?: unknown) {
      return ipcRenderer.invoke(IPC.TWINBY_CAPTURE_PROFILE, input);
    },
    cleanupCapture(observationId: string) {
      return ipcRenderer.invoke(IPC.TWINBY_CLEANUP_CAPTURE, observationId);
    },
    getSessionLimits() {
      return ipcRenderer.invoke(IPC.TWINBY_GET_SESSION_LIMITS);
    },
    saveSessionLimits(input: unknown) {
      return ipcRenderer.invoke(IPC.TWINBY_SAVE_SESSION_LIMITS, input);
    },
  },
  audience: {
    getCurrent() {
      return ipcRenderer.invoke(IPC.AUDIENCE_GET_CURRENT);
    },
    listVersions() {
      return ipcRenderer.invoke(IPC.AUDIENCE_LIST_VERSIONS);
    },
    deleteVersion(id: string) {
      return ipcRenderer.invoke(IPC.AUDIENCE_DELETE_VERSION, id);
    },
    activateVersion(id: string) {
      return ipcRenderer.invoke(IPC.AUDIENCE_ACTIVATE_VERSION, id);
    },
    updateDraft(input: unknown) {
      return ipcRenderer.invoke(IPC.AUDIENCE_UPDATE_DRAFT, input);
    },
    confirmUpdate() {
      return ipcRenderer.invoke(IPC.AUDIENCE_CONFIRM_UPDATE);
    },
    applyCorrection(input: unknown) {
      return ipcRenderer.invoke(IPC.AUDIENCE_APPLY_CORRECTION, input);
    },
    deriveFromEurydice() {
      return ipcRenderer.invoke(IPC.AUDIENCE_DERIVE_FROM_EURYDICE);
    },
  },
  identity: {
    getCurrent() {
      return ipcRenderer.invoke(IPC.IDENTITY_GET_CURRENT);
    },
    listVersions() {
      return ipcRenderer.invoke(IPC.IDENTITY_LIST_VERSIONS);
    },
    deleteVersion(id: string) {
      return ipcRenderer.invoke(IPC.IDENTITY_DELETE_VERSION, id);
    },
    activateVersion(id: string) {
      return ipcRenderer.invoke(IPC.IDENTITY_ACTIVATE_VERSION, id);
    },
    createDraft(input: unknown) {
      return ipcRenderer.invoke(IPC.IDENTITY_CREATE_DRAFT, input);
    },
    analyzeCurrentProfile() {
      return ipcRenderer.invoke(IPC.IDENTITY_ANALYZE_CURRENT_PROFILE);
    },
    addReference(input: unknown) {
      return ipcRenderer.invoke(IPC.IDENTITY_ADD_REFERENCE, input);
    },
    removeReference(id: string) {
      return ipcRenderer.invoke(IPC.IDENTITY_REMOVE_REFERENCE, id);
    },
    confirm() {
      return ipcRenderer.invoke(IPC.IDENTITY_CONFIRM);
    },
  },
  cloud: {
    listConnections() {
      return ipcRenderer.invoke(IPC.CLOUD_LIST_CONNECTIONS);
    },
    getCredentialsStatus() {
      return ipcRenderer.invoke(IPC.CLOUD_GET_CREDENTIALS_STATUS);
    },
    saveCredentials(input: unknown) {
      return ipcRenderer.invoke(IPC.CLOUD_SAVE_CREDENTIALS, input);
    },
    clearCredentials(provider: unknown) {
      return ipcRenderer.invoke(IPC.CLOUD_CLEAR_CREDENTIALS, provider);
    },
    connectGoogle(input?: unknown) {
      return ipcRenderer.invoke(IPC.CLOUD_CONNECT_GOOGLE, input);
    },
    connectYandex(input?: unknown) {
      return ipcRenderer.invoke(IPC.CLOUD_CONNECT_YANDEX, input);
    },
    disconnect(provider: unknown) {
      return ipcRenderer.invoke(IPC.CLOUD_DISCONNECT, provider);
    },
    listFolders(provider: unknown) {
      return ipcRenderer.invoke(IPC.CLOUD_LIST_FOLDERS, provider);
    },
    setSelectedFolders(input: unknown) {
      return ipcRenderer.invoke(IPC.CLOUD_SET_SELECTED_FOLDERS, input);
    },
    searchPhotos(input: unknown) {
      return ipcRenderer.invoke(IPC.CLOUD_SEARCH_PHOTOS, input);
    },
    getIndexStatus() {
      return ipcRenderer.invoke(IPC.CLOUD_GET_INDEX_STATUS);
    },
    discoverStorage(input: unknown) {
      return ipcRenderer.invoke(IPC.CLOUD_DISCOVER_STORAGE, input);
    },
    browseStorage(input: unknown) {
      return ipcRenderer.invoke(IPC.CLOUD_BROWSE_STORAGE, input);
    },
    deleteIndexedPhoto(id: string) {
      return ipcRenderer.invoke(IPC.CLOUD_DELETE_INDEXED_PHOTO, id);
    },
    getPhotoPreview(photoId: string) {
      return ipcRenderer.invoke(IPC.CLOUD_GET_PHOTO_PREVIEW, photoId);
    },
    onIndexFinished(callback: (event: unknown) => void) {
      const listener = (_event: unknown, payload: unknown) => {
        callback(payload);
      };
      ipcRenderer.on(IPC.CLOUD_INDEX_FINISHED, listener);
      return () => {
        ipcRenderer.removeListener(IPC.CLOUD_INDEX_FINISHED, listener);
      };
    },
  },
  orpheus: {
    generateProfileSets(input?: unknown) {
      return ipcRenderer.invoke(IPC.ORPHEUS_GENERATE_PROFILE_SETS, input);
    },
    regenerateAll(input?: unknown) {
      return ipcRenderer.invoke(IPC.ORPHEUS_REGENERATE_ALL, input);
    },
    suggestPhotos(input?: unknown) {
      return ipcRenderer.invoke(IPC.ORPHEUS_SUGGEST_PHOTOS, input);
    },
    regeneratePhotosKeepIdea(input: unknown) {
      return ipcRenderer.invoke(IPC.ORPHEUS_REGENERATE_PHOTOS_KEEP_IDEA, input);
    },
    reorderKeepPhotos(input: unknown) {
      return ipcRenderer.invoke(IPC.ORPHEUS_REORDER_KEEP_PHOTOS, input);
    },
    saveVariant(input: unknown) {
      return ipcRenderer.invoke(IPC.ORPHEUS_SAVE_VARIANT, input);
    },
    auditVariant(input: unknown) {
      return ipcRenderer.invoke(IPC.ORPHEUS_AUDIT_VARIANT, input);
    },
    createPhotoPlan(input?: unknown) {
      return ipcRenderer.invoke(IPC.ORPHEUS_CREATE_PHOTO_PLAN, input);
    },
    requestPhotoEditPreview(input: unknown) {
      return ipcRenderer.invoke(IPC.ORPHEUS_REQUEST_PHOTO_EDIT_PREVIEW, input);
    },
  },
  profileSnapshot: {
    capture() {
      return ipcRenderer.invoke(IPC.PROFILE_SNAPSHOT_CAPTURE);
    },
    getActive() {
      return ipcRenderer.invoke(IPC.PROFILE_SNAPSHOT_GET_ACTIVE);
    },
    list() {
      return ipcRenderer.invoke(IPC.PROFILE_SNAPSHOT_LIST);
    },
    compareToPlan(input: unknown) {
      return ipcRenderer.invoke(IPC.PROFILE_SNAPSHOT_COMPARE_TO_PLAN, input);
    },
    resolvePlanVariant() {
      return ipcRenderer.invoke(IPC.PROFILE_SNAPSHOT_RESOLVE_PLAN_VARIANT);
    },
    delete(id: string) {
      return ipcRenderer.invoke(IPC.PROFILE_SNAPSHOT_DELETE, id);
    },
  },
  experiment: {
    create(input: unknown) {
      return ipcRenderer.invoke(IPC.EXPERIMENT_CREATE, input);
    },
    createFromSnapshot(input?: unknown) {
      return ipcRenderer.invoke(IPC.EXPERIMENT_CREATE_FROM_SNAPSHOT, input ?? {});
    },
    savePreFeedback(input: unknown) {
      return ipcRenderer.invoke(IPC.EXPERIMENT_SAVE_PRE_FEEDBACK, input);
    },
    start(input: unknown) {
      return ipcRenderer.invoke(IPC.EXPERIMENT_START, input);
    },
    getActive() {
      return ipcRenderer.invoke(IPC.EXPERIMENT_GET_ACTIVE);
    },
    recommendStop(experimentId: string) {
      return ipcRenderer.invoke(IPC.EXPERIMENT_RECOMMEND_STOP, experimentId);
    },
    complete(input: unknown) {
      return ipcRenderer.invoke(IPC.EXPERIMENT_COMPLETE, input);
    },
    confirmProfileChange(input: unknown) {
      return ipcRenderer.invoke(IPC.EXPERIMENT_CONFIRM_PROFILE_CHANGE, input);
    },
    getPendingProfileChange() {
      return ipcRenderer.invoke(IPC.EXPERIMENT_GET_PENDING_PROFILE_CHANGE);
    },
    resolvePendingProfileChange(input: unknown) {
      return ipcRenderer.invoke(IPC.EXPERIMENT_RESOLVE_PENDING_PROFILE_CHANGE, input);
    },
    savePostFeedback(input: unknown) {
      return ipcRenderer.invoke(IPC.EXPERIMENT_SAVE_POST_FEEDBACK, input);
    },
    compare(input: unknown) {
      return ipcRenderer.invoke(IPC.EXPERIMENT_COMPARE, input);
    },
  },
  relationships: {
    list(input?: unknown) {
      return ipcRenderer.invoke(IPC.RELATIONSHIPS_LIST, input);
    },
    get(id: string) {
      return ipcRenderer.invoke(IPC.RELATIONSHIPS_GET, id);
    },
    setStage(input: unknown) {
      return ipcRenderer.invoke(IPC.RELATIONSHIPS_SET_STAGE, input);
    },
    applyAudienceCorrection(input: unknown) {
      return ipcRenderer.invoke(IPC.RELATIONSHIPS_APPLY_AUDIENCE_CORRECTION, input);
    },
    close(input: unknown) {
      return ipcRenderer.invoke(IPC.RELATIONSHIPS_CLOSE, input);
    },
  },
  preflight: {
    run(input?: unknown) {
      return ipcRenderer.invoke(IPC.PREFLIGHT_RUN, input);
    },
    getLatest() {
      return ipcRenderer.invoke(IPC.PREFLIGHT_GET_LATEST);
    },
    cancel() {
      return ipcRenderer.invoke(IPC.PREFLIGHT_CANCEL);
    },
  },
};

contextBridge.exposeInMainWorld('desktopApi', api);
