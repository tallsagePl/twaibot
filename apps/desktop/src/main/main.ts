import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  APP_VERSION,
  CONSENT_TEXT,
  CONSENT_TEXT_VERSION,
  IPC_CHANNELS,
  PingRequestSchema,
  AcceptConsentInputSchema,
  type AppInfo,
  type DatabaseHealth,
  type LegalConsent,
  type PingResponse,
} from '@twinby/contracts';
import { z } from 'zod';
import {
  APP_NAME,
  ensureAppDirectories,
  resolveAppPaths,
} from '@twinby/config';
import {
  acceptConsent,
  bootstrapDatabase,
  getLatestConsent,
  type AppDatabase,
} from '@twinby/database';
import { createRootLogger, getLogger } from '@twinby/logging';
import {
  getAiCapabilities,
  getAiConfig,
  listAiModels,
  saveAiConfig,
  testAiText,
  testAiVision,
} from './ipc/ai-handlers';
import { getPreferences, savePreferences } from './ipc/preferences-handlers';
import { wipeAllHistoryFiles } from './session/history-detail-store';
import {
  addReference,
  analyzeReferences,
  getSummary,
  listReferences,
  removeReference,
  saveSummaryManual,
  updateReference,
} from './ipc/references-handlers';
import { createSessionFacade } from './ipc/session-handlers';
import { createHistoryHandlers } from './ipc/history-handlers';
import { createAppiumHandlers } from './ipc/appium-handlers';
import { createTwinbyHandlers } from './ipc/twinby-handlers';
import { createAudienceHandlers } from './ipc/audience-handlers';
import { createIdentityHandlers } from './ipc/identity-handlers';
import { createCloudHandlers } from './ipc/cloud-handlers';
import { createOrpheusHandlers } from './ipc/orpheus-handlers';
import { createSnapshotHandlers } from './ipc/snapshot-handlers';
import { createExperimentHandlers } from './ipc/experiment-handlers';
import { createRelationshipHandlers } from './ipc/relationship-handlers';
import { createPreflightHandlers } from './ipc/preflight-handlers';
import {
  AndroidEnvironment,
} from '@twinby/android-environment';

let mainWindow: BrowserWindow | null = null;
let db: AppDatabase | null = null;
let dbPath = '';

function requireDb(): AppDatabase {
  if (!db) {
    throw new Error('Database is not initialized');
  }
  return db;
}

const ALLOWED_EXTERNAL_URLS = new Set([
  'https://twinby.ru/legal/user-agreement',
  'https://arionhub.pro/docs',
  'https://arionhub.pro/docs?section=quick-start',
  'https://arionhub.pro/',
]);

function getProjectRoot(): string {
  return join(app.getAppPath(), app.isPackaged ? '.' : '../..');
}

function bootstrap(): void {
  const paths = resolveAppPaths({
    projectRoot: getProjectRoot(),
    userDataPath: app.getPath('userData'),
    useUserData: app.isPackaged,
  });
  ensureAppDirectories(paths);
  createRootLogger({ logsDir: paths.logs, name: 'desktop-main' });

  const boot = bootstrapDatabase(paths.database);
  db = boot.db;
  dbPath = boot.path;
  if (boot.historyCleared) {
    wipeAllHistoryFiles(paths.history);
  }

  getLogger('app').info(
    { dataDir: paths.data, database: paths.database, historyCleared: boot.historyCleared },
    'Application bootstrap complete',
  );
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    title: APP_NAME,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
    getLogger('app').error({ code, desc, url }, 'Renderer failed to load');
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const allowed =
      ALLOWED_EXTERNAL_URLS.has(url) || url.startsWith('https://arionhub.pro/');
    if (allowed) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowed =
      url.startsWith('http://localhost') ||
      url.startsWith('http://127.0.0.1') ||
      url.startsWith('file://') ||
      ALLOWED_EXTERNAL_URLS.has(url) ||
      url.startsWith('https://arionhub.pro/');
    if (!allowed) {
      event.preventDefault();
    }
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

function registerIpc(): void {
  ipcMain.handle(IPC_CHANNELS.APP_PING, async (_event, raw: unknown): Promise<PingResponse> => {
    const input = PingRequestSchema.parse(raw);
    getLogger('ipc').info({ channel: IPC_CHANNELS.APP_PING }, 'ping');
    return {
      ok: true,
      echo: input.message,
      appVersion: APP_VERSION,
      timestamp: new Date().toISOString(),
    };
  });

  ipcMain.handle(IPC_CHANNELS.APP_GET_INFO, async (): Promise<AppInfo> => {
    const paths = resolveAppPaths({
      projectRoot: getProjectRoot(),
      userDataPath: app.getPath('userData'),
      useUserData: app.isPackaged,
    });
    return {
      name: APP_NAME,
      version: APP_VERSION,
      consentTextVersion: CONSENT_TEXT_VERSION,
      dataDir: paths.data,
    };
  });

  ipcMain.handle(
    IPC_CHANNELS.APP_SHOW_PATH_IN_FOLDER,
    async (_event, raw: unknown): Promise<{ ok: true }> => {
      const targetPath = z.string().min(1).parse(raw);
      if (!existsSync(targetPath)) {
        throw new Error('Путь не найден');
      }
      shell.showItemInFolder(targetPath);
      return { ok: true };
    },
  );

  ipcMain.handle(IPC_CHANNELS.LEGAL_GET_CONSENT_TEXT, async () => ({
    version: CONSENT_TEXT_VERSION,
    text: CONSENT_TEXT,
  }));

  ipcMain.handle(
    IPC_CHANNELS.LEGAL_GET_LATEST,
    async (): Promise<LegalConsent | null> => {
      if (!db) {
        throw new Error('Database is not initialized');
      }
      return getLatestConsent(db);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.LEGAL_ACCEPT,
    async (_event, raw: unknown): Promise<LegalConsent> => {
      if (!db) {
        throw new Error('Database is not initialized');
      }
      const input = AcceptConsentInputSchema.parse(raw);
      const consent = acceptConsent(db, { consentVersion: input.consentVersion });
      getLogger('security').info(
        { consentVersion: consent.consentVersion },
        'Legal consent accepted',
      );
      return consent;
    },
  );

  ipcMain.handle(IPC_CHANNELS.DATABASE_HEALTH, async (): Promise<DatabaseHealth> => ({
    ok: Boolean(db),
    path: dbPath,
    migrated: Boolean(db),
  }));

  ipcMain.handle(IPC_CHANNELS.AI_GET_CONFIG, async () => getAiConfig(db));
  ipcMain.handle(IPC_CHANNELS.AI_SAVE_CONFIG, async (_event, raw: unknown) =>
    saveAiConfig(db, raw),
  );
  ipcMain.handle(IPC_CHANNELS.AI_LIST_MODELS, async () => listAiModels(db));
  ipcMain.handle(IPC_CHANNELS.AI_TEST_TEXT, async () => testAiText(db));
  ipcMain.handle(IPC_CHANNELS.AI_TEST_VISION, async () => testAiVision(db));
  ipcMain.handle(IPC_CHANNELS.AI_GET_CAPABILITIES, async (_event, model?: unknown) =>
    getAiCapabilities(db, typeof model === 'string' ? model : undefined),
  );
  ipcMain.handle(IPC_CHANNELS.AI_ANALYZE_REFERENCES, async (_event, force?: unknown) =>
    analyzeReferences(db, force === true),
  );

  ipcMain.handle(IPC_CHANNELS.PREFERENCES_GET, async () => getPreferences(db));
  ipcMain.handle(IPC_CHANNELS.PREFERENCES_SAVE, async (_event, raw: unknown) =>
    savePreferences(db, raw),
  );

  ipcMain.handle(IPC_CHANNELS.REFERENCES_LIST, async () => listReferences(db));
  ipcMain.handle(IPC_CHANNELS.REFERENCES_ADD, async (_event, raw: unknown) =>
    addReference(db, raw, {
      projectRoot: getProjectRoot(),
      userDataPath: app.getPath('userData'),
      packaged: app.isPackaged,
    }),
  );
  ipcMain.handle(IPC_CHANNELS.REFERENCES_UPDATE, async (_event, raw: unknown) =>
    updateReference(db, raw),
  );
  ipcMain.handle(IPC_CHANNELS.REFERENCES_REMOVE, async (_event, id: unknown) => {
    if (typeof id !== 'string') {
      throw new Error('Invalid reference id');
    }
    removeReference(db, id);
  });
  ipcMain.handle(IPC_CHANNELS.SUMMARY_GET, async () => getSummary(db));
  ipcMain.handle(IPC_CHANNELS.SUMMARY_SAVE, async (_event, raw: unknown) =>
    saveSummaryManual(db, raw),
  );

  const sessions = createSessionFacade(requireDb, getProjectRoot);
  ipcMain.handle(IPC_CHANNELS.SESSIONS_START, async (_event, raw?: unknown) =>
    sessions.start(raw),
  );
  ipcMain.handle(IPC_CHANNELS.SESSIONS_PAUSE, async () => sessions.pause());
  ipcMain.handle(IPC_CHANNELS.SESSIONS_RESUME, async () => sessions.resume());
  ipcMain.handle(IPC_CHANNELS.SESSIONS_STOP, async () => sessions.stop());
  ipcMain.handle(IPC_CHANNELS.SESSIONS_GET_STATE, async () => sessions.getState());
  ipcMain.handle(IPC_CHANNELS.REVIEW_CONFIRM, async (_event, raw: unknown) =>
    sessions.confirm(raw),
  );
  ipcMain.handle(IPC_CHANNELS.REVIEW_SKIP, async (_event, captureId: unknown) =>
    sessions.skip(captureId),
  );
  ipcMain.handle(IPC_CHANNELS.HISTORY_LIST, async (_event, raw?: unknown) =>
    sessions.listHistory(raw),
  );

  const history = createHistoryHandlers(requireDb, getProjectRoot);
  ipcMain.handle(IPC_CHANNELS.HISTORY_LIST_SESSIONS, async () => history.listSessions());
  ipcMain.handle(IPC_CHANNELS.HISTORY_LIST_SESSION_PROFILES, async (_event, raw: unknown) =>
    history.listSessionProfiles(raw),
  );
  ipcMain.handle(IPC_CHANNELS.HISTORY_SAVE_PROFILE_FEEDBACK, async (_event, raw: unknown) =>
    history.saveProfileFeedback(raw),
  );
  ipcMain.handle(IPC_CHANNELS.HISTORY_SUBMIT_SESSION_FEEDBACK, async (_event, raw: unknown) =>
    history.submitSessionFeedback(raw),
  );
  ipcMain.handle(IPC_CHANNELS.HISTORY_APPLY_SESSION_FEEDBACK, async (_event, raw: unknown) =>
    history.applySessionFeedback(raw),
  );
  ipcMain.handle(IPC_CHANNELS.HISTORY_DELETE_SESSION, async (_event, raw: unknown) =>
    history.deleteSession(raw),
  );

  const environment = new AndroidEnvironment();
  ipcMain.handle(IPC_CHANNELS.ENVIRONMENT_RUN_DOCTOR, async () => {
    getLogger('environment').info('Running environment doctor');
    return environment.runDoctor();
  });
  ipcMain.handle(IPC_CHANNELS.ENVIRONMENT_LIST_AVDS, async () => environment.listAvds());
  ipcMain.handle(IPC_CHANNELS.ENVIRONMENT_LIST_DEVICES, async () =>
    environment.listDevices(),
  );

  const appium = createAppiumHandlers(getProjectRoot);
  ipcMain.handle(IPC_CHANNELS.APPIUM_GET_STATUS, async () => appium.getStatus());
  ipcMain.handle(IPC_CHANNELS.APPIUM_START_SERVER, async () => appium.startServer());
  ipcMain.handle(IPC_CHANNELS.APPIUM_STOP_SERVER, async () => appium.stopServer());
  ipcMain.handle(IPC_CHANNELS.APPIUM_CREATE_SESSION, async (_event, raw: unknown) =>
    appium.createSession(raw),
  );
  ipcMain.handle(IPC_CHANNELS.APPIUM_END_SESSION, async () => appium.endSession());
  ipcMain.handle(IPC_CHANNELS.APPIUM_GET_SESSION, async () => appium.getSession());
  ipcMain.handle(IPC_CHANNELS.APPIUM_SCREENSHOT, async () => appium.takeScreenshot());
  ipcMain.handle(IPC_CHANNELS.APPIUM_PAGE_SOURCE, async () => appium.getPageSource());
  ipcMain.handle(IPC_CHANNELS.APPIUM_WINDOW_RECT, async () => appium.getWindowRect());

  const twinby = createTwinbyHandlers(() => db, getProjectRoot);
  ipcMain.handle(IPC_CHANNELS.TWINBY_DETECT_PACKAGE, async () => twinby.detectPackage());
  ipcMain.handle(IPC_CHANNELS.TWINBY_GET_LOCATOR_PROFILE, async () =>
    twinby.getLocatorProfile(),
  );
  ipcMain.handle(IPC_CHANNELS.TWINBY_DETECT_SCREEN, async (_event, pageSource?: unknown) =>
    twinby.detectScreen(pageSource),
  );
  ipcMain.handle(IPC_CHANNELS.TWINBY_CAPTURE_DISCOVERY, async () =>
    twinby.captureDiscoverySnapshot(),
  );
  ipcMain.handle(IPC_CHANNELS.TWINBY_CAPTURE_PROFILE, async (_event, raw?: unknown) =>
    twinby.captureCurrentProfile(raw),
  );
  ipcMain.handle(IPC_CHANNELS.TWINBY_CLEANUP_CAPTURE, async (_event, id: unknown) =>
    twinby.cleanupCapture(id),
  );
  ipcMain.handle(IPC_CHANNELS.TWINBY_GET_SESSION_LIMITS, async () => twinby.getSessionLimits());
  ipcMain.handle(IPC_CHANNELS.TWINBY_SAVE_SESSION_LIMITS, async (_event, raw: unknown) =>
    twinby.saveSessionLimits(raw),
  );

  const audience = createAudienceHandlers(() => db);
  ipcMain.handle(IPC_CHANNELS.AUDIENCE_GET_CURRENT, async () => audience.getCurrent());
  ipcMain.handle(IPC_CHANNELS.AUDIENCE_LIST_VERSIONS, async () => audience.listVersions());
  ipcMain.handle(IPC_CHANNELS.AUDIENCE_DELETE_VERSION, async (_event, id: unknown) =>
    audience.deleteVersion(id),
  );
  ipcMain.handle(IPC_CHANNELS.AUDIENCE_ACTIVATE_VERSION, async (_event, id: unknown) =>
    audience.activateVersion(id),
  );
  ipcMain.handle(IPC_CHANNELS.AUDIENCE_UPDATE_DRAFT, async (_event, raw: unknown) =>
    audience.updateDraft(raw),
  );
  ipcMain.handle(IPC_CHANNELS.AUDIENCE_CONFIRM_UPDATE, async () => audience.confirmUpdate());
  ipcMain.handle(IPC_CHANNELS.AUDIENCE_APPLY_CORRECTION, async (_event, raw: unknown) =>
    audience.applyCorrection(raw),
  );
  ipcMain.handle(IPC_CHANNELS.AUDIENCE_DERIVE_FROM_EURYDICE, async () =>
    audience.deriveFromEurydice(),
  );

  const identity = createIdentityHandlers(() => db);
  ipcMain.handle(IPC_CHANNELS.IDENTITY_GET_CURRENT, async () => identity.getCurrent());
  ipcMain.handle(IPC_CHANNELS.IDENTITY_LIST_VERSIONS, async () => identity.listVersions());
  ipcMain.handle(IPC_CHANNELS.IDENTITY_DELETE_VERSION, async (_event, id: unknown) =>
    identity.deleteVersion(id),
  );
  ipcMain.handle(IPC_CHANNELS.IDENTITY_ACTIVATE_VERSION, async (_event, id: unknown) =>
    identity.activateVersion(id),
  );
  ipcMain.handle(IPC_CHANNELS.IDENTITY_CREATE_DRAFT, async (_event, raw: unknown) =>
    identity.createDraft(raw),
  );
  ipcMain.handle(IPC_CHANNELS.IDENTITY_ANALYZE_CURRENT_PROFILE, async () =>
    identity.analyzeCurrentProfile(),
  );
  ipcMain.handle(IPC_CHANNELS.IDENTITY_ADD_REFERENCE, async (_event, raw: unknown) =>
    identity.addReference(raw),
  );
  ipcMain.handle(IPC_CHANNELS.IDENTITY_REMOVE_REFERENCE, async (_event, id: unknown) =>
    identity.removeReference(id),
  );
  ipcMain.handle(IPC_CHANNELS.IDENTITY_CONFIRM, async () => identity.confirm());

  const resolvePaths = () =>
    resolveAppPaths({
      projectRoot: getProjectRoot(),
      userDataPath: app.getPath('userData'),
      useUserData: app.isPackaged,
    });
  const cloud = createCloudHandlers(
    () => db,
    () => join(resolvePaths().data, 'cloud-previews'),
  );
  ipcMain.handle(IPC_CHANNELS.CLOUD_LIST_CONNECTIONS, async () => cloud.listConnections());
  ipcMain.handle(IPC_CHANNELS.CLOUD_GET_CREDENTIALS_STATUS, async () =>
    cloud.getCredentialsStatus(),
  );
  ipcMain.handle(IPC_CHANNELS.CLOUD_SAVE_CREDENTIALS, async (_event, raw: unknown) =>
    cloud.saveCredentials(raw),
  );
  ipcMain.handle(IPC_CHANNELS.CLOUD_CLEAR_CREDENTIALS, async (_event, raw: unknown) =>
    cloud.clearCredentials(raw),
  );
  ipcMain.handle(IPC_CHANNELS.CLOUD_CONNECT_GOOGLE, async (_event, raw?: unknown) =>
    cloud.connectGoogle(raw),
  );
  ipcMain.handle(IPC_CHANNELS.CLOUD_CONNECT_YANDEX, async (_event, raw?: unknown) =>
    cloud.connectYandex(raw),
  );
  ipcMain.handle(IPC_CHANNELS.CLOUD_DISCONNECT, async (_event, raw: unknown) =>
    cloud.disconnect(raw),
  );
  ipcMain.handle(IPC_CHANNELS.CLOUD_LIST_FOLDERS, async (_event, raw: unknown) =>
    cloud.listFolders(raw),
  );
  ipcMain.handle(IPC_CHANNELS.CLOUD_SET_SELECTED_FOLDERS, async (_event, raw: unknown) =>
    cloud.setSelectedFolders(raw),
  );
  ipcMain.handle(IPC_CHANNELS.CLOUD_SEARCH_PHOTOS, async (_event, raw: unknown) =>
    cloud.searchPhotos(raw),
  );
  ipcMain.handle(IPC_CHANNELS.CLOUD_GET_INDEX_STATUS, async () => cloud.getIndexStatus());
  ipcMain.handle(IPC_CHANNELS.CLOUD_DISCOVER_STORAGE, async (_event, raw: unknown) =>
    cloud.discoverStorage(raw),
  );
  ipcMain.handle(IPC_CHANNELS.CLOUD_BROWSE_STORAGE, async (_event, raw: unknown) =>
    cloud.browseStorage(raw),
  );
  ipcMain.handle(IPC_CHANNELS.CLOUD_DELETE_INDEXED_PHOTO, async (_event, id: unknown) =>
    cloud.deleteIndexedPhoto(id),
  );
  ipcMain.handle(IPC_CHANNELS.CLOUD_GET_PHOTO_PREVIEW, async (_event, id: unknown) =>
    cloud.getPhotoPreview(id),
  );

  const orpheus = createOrpheusHandlers(() => db);
  ipcMain.handle(IPC_CHANNELS.ORPHEUS_GENERATE_PROFILE_SETS, async (_event, raw?: unknown) =>
    orpheus.generateProfileSets(raw),
  );
  ipcMain.handle(IPC_CHANNELS.ORPHEUS_REGENERATE_ALL, async (_event, raw?: unknown) =>
    orpheus.regenerateAll(raw),
  );
  ipcMain.handle(IPC_CHANNELS.ORPHEUS_SUGGEST_PHOTOS, async (_event, raw?: unknown) =>
    orpheus.suggestPhotos(raw),
  );
  ipcMain.handle(
    IPC_CHANNELS.ORPHEUS_REGENERATE_PHOTOS_KEEP_IDEA,
    async (_event, raw: unknown) => orpheus.regeneratePhotosKeepIdea(raw),
  );
  ipcMain.handle(IPC_CHANNELS.ORPHEUS_REORDER_KEEP_PHOTOS, async (_event, raw: unknown) =>
    orpheus.reorderKeepPhotos(raw),
  );
  ipcMain.handle(IPC_CHANNELS.ORPHEUS_SAVE_VARIANT, async (_event, raw: unknown) =>
    orpheus.saveVariant(raw),
  );
  ipcMain.handle(IPC_CHANNELS.ORPHEUS_AUDIT_VARIANT, async (_event, raw: unknown) =>
    orpheus.auditVariant(raw),
  );
  ipcMain.handle(IPC_CHANNELS.ORPHEUS_CREATE_PHOTO_PLAN, async (_event, raw?: unknown) =>
    orpheus.createPhotoPlan(raw),
  );
  ipcMain.handle(
    IPC_CHANNELS.ORPHEUS_REQUEST_PHOTO_EDIT_PREVIEW,
    async (_event, raw: unknown) => orpheus.requestPhotoEditPreview(raw),
  );

  const snapshots = createSnapshotHandlers(() => db, getProjectRoot);
  ipcMain.handle(IPC_CHANNELS.PROFILE_SNAPSHOT_CAPTURE, async () => snapshots.capture());
  ipcMain.handle(IPC_CHANNELS.PROFILE_SNAPSHOT_GET_ACTIVE, async () => snapshots.getActive());
  ipcMain.handle(IPC_CHANNELS.PROFILE_SNAPSHOT_LIST, async () => snapshots.list());
  ipcMain.handle(
    IPC_CHANNELS.PROFILE_SNAPSHOT_COMPARE_TO_PLAN,
    async (_event, raw: unknown) => snapshots.compareToPlan(raw),
  );
  ipcMain.handle(IPC_CHANNELS.PROFILE_SNAPSHOT_RESOLVE_PLAN_VARIANT, async () =>
    snapshots.resolvePlanVariant(),
  );
  ipcMain.handle(IPC_CHANNELS.PROFILE_SNAPSHOT_DELETE, async (_event, id: unknown) =>
    snapshots.delete(id),
  );

  const experiments = createExperimentHandlers(() => db);
  ipcMain.handle(IPC_CHANNELS.EXPERIMENT_CREATE, async (_event, raw: unknown) =>
    experiments.create(raw),
  );
  ipcMain.handle(
    IPC_CHANNELS.EXPERIMENT_CREATE_FROM_SNAPSHOT,
    async (_event, raw?: unknown) => experiments.createFromSnapshot(raw),
  );
  ipcMain.handle(IPC_CHANNELS.EXPERIMENT_SAVE_PRE_FEEDBACK, async (_event, raw: unknown) =>
    experiments.savePreFeedback(raw),
  );
  ipcMain.handle(IPC_CHANNELS.EXPERIMENT_START, async (_event, id: unknown) =>
    experiments.start(id),
  );
  ipcMain.handle(IPC_CHANNELS.EXPERIMENT_GET_ACTIVE, async () => experiments.getActive());
  ipcMain.handle(IPC_CHANNELS.EXPERIMENT_RECOMMEND_STOP, async (_event, id: unknown) =>
    experiments.recommendStop(id),
  );
  ipcMain.handle(IPC_CHANNELS.EXPERIMENT_COMPLETE, async (_event, raw: unknown) =>
    experiments.complete(raw),
  );
  ipcMain.handle(
    IPC_CHANNELS.EXPERIMENT_CONFIRM_PROFILE_CHANGE,
    async (_event, raw: unknown) => experiments.confirmProfileChange(raw),
  );
  ipcMain.handle(IPC_CHANNELS.EXPERIMENT_GET_PENDING_PROFILE_CHANGE, async () =>
    experiments.getPendingProfileChange(),
  );
  ipcMain.handle(
    IPC_CHANNELS.EXPERIMENT_RESOLVE_PENDING_PROFILE_CHANGE,
    async (_event, raw: unknown) => experiments.resolvePendingProfileChange(raw),
  );
  ipcMain.handle(IPC_CHANNELS.EXPERIMENT_SAVE_POST_FEEDBACK, async (_event, raw: unknown) =>
    experiments.savePostFeedback(raw),
  );
  ipcMain.handle(IPC_CHANNELS.EXPERIMENT_COMPARE, async (_event, raw: unknown) =>
    experiments.compare(raw),
  );

  const relationships = createRelationshipHandlers(() => db);
  ipcMain.handle(IPC_CHANNELS.RELATIONSHIPS_LIST, async (_event, raw?: unknown) =>
    relationships.list(raw),
  );
  ipcMain.handle(IPC_CHANNELS.RELATIONSHIPS_GET, async (_event, id: unknown) =>
    relationships.get(id),
  );
  ipcMain.handle(IPC_CHANNELS.RELATIONSHIPS_SET_STAGE, async (_event, raw: unknown) =>
    relationships.setStage(raw),
  );
  ipcMain.handle(
    IPC_CHANNELS.RELATIONSHIPS_APPLY_AUDIENCE_CORRECTION,
    async (_event, raw: unknown) => relationships.applyAudienceCorrection(raw),
  );
  ipcMain.handle(IPC_CHANNELS.RELATIONSHIPS_CLOSE, async (_event, raw: unknown) =>
    relationships.close(raw),
  );

  const preflight = createPreflightHandlers(() => db);
  ipcMain.handle(IPC_CHANNELS.PREFLIGHT_RUN, async (_event, raw?: unknown) =>
    preflight.run(raw),
  );
  ipcMain.handle(IPC_CHANNELS.PREFLIGHT_GET_LATEST, async () => preflight.getLatest());
  ipcMain.handle(IPC_CHANNELS.PREFLIGHT_CANCEL, async () => preflight.cancel());
}

app.whenReady().then(() => {
  bootstrap();
  registerIpc();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
