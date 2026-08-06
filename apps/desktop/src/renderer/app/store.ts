import { create } from 'zustand';
import type {
  AppInfo,
  DatabaseHealth,
  LegalConsent,
  SessionMode,
} from '@twinby/contracts';
import { getDesktopApi } from '../shared/desktopApi';

interface UiState {
  hydrated: boolean;
  consentAccepted: boolean;
  appInfo: AppInfo | null;
  dbHealth: DatabaseHealth | null;
  latestConsent: LegalConsent | null;
  sidebarCollapsed: boolean;
  selectedUdid: string;
  selectedSessionMode: SessionMode;
  /** Global toast visible on any route (e.g. cloud index finished). */
  globalToast: string | null;
  /** Stack of in-flight AI labels for the header spinner. */
  aiWorkStack: string[];
  hydrate: () => Promise<void>;
  acceptConsent: () => Promise<void>;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setSelectedUdid: (udid: string) => void;
  setSelectedSessionMode: (mode: SessionMode) => void;
  showGlobalToast: (message: string, durationMs?: number) => void;
  pushAiWork: (label: string) => void;
  popAiWork: () => void;
  clearAiWork: () => void;
}

let globalToastTimer: ReturnType<typeof setTimeout> | null = null;

export const useUiStore = create<UiState>((set, get) => ({
  hydrated: false,
  consentAccepted: false,
  appInfo: null,
  dbHealth: null,
  latestConsent: null,
  sidebarCollapsed: false,
  selectedUdid: '',
  selectedSessionMode: 'recommendation-only',
  globalToast: null,
  aiWorkStack: [],

  async hydrate() {
    try {
      const api = getDesktopApi();
      const [appInfo, dbHealth, latestConsent] = await Promise.all([
        api.app.getInfo(),
        api.database.health(),
        api.legal.getLatestConsent(),
      ]);

      set({
        hydrated: true,
        appInfo,
        dbHealth,
        latestConsent,
        consentAccepted:
          latestConsent?.consentVersion === appInfo.consentTextVersion,
      });
    } catch (error) {
      console.error(error);
      set({ hydrated: true, consentAccepted: false });
    }
  },

  async acceptConsent() {
    const api = getDesktopApi();
    const consentText = await api.legal.getConsentText();
    const consent = await api.legal.acceptConsent({
      consentVersion: consentText.version as '1.0.0',
      accepted: true,
    });
    set({
      latestConsent: consent,
      consentAccepted: true,
    });
  },

  toggleSidebar() {
    set({ sidebarCollapsed: !get().sidebarCollapsed });
  },

  setSidebarCollapsed(collapsed) {
    set({ sidebarCollapsed: collapsed });
  },

  setSelectedUdid(udid) {
    set({ selectedUdid: udid });
  },

  setSelectedSessionMode(mode) {
    set({ selectedSessionMode: mode });
  },

  showGlobalToast(message, durationMs = 6000) {
    if (globalToastTimer) {
      clearTimeout(globalToastTimer);
      globalToastTimer = null;
    }
    set({ globalToast: message });
    globalToastTimer = setTimeout(() => {
      set({ globalToast: null });
      globalToastTimer = null;
    }, durationMs);
  },

  pushAiWork(label) {
    const text = label.trim() || 'Работает ИИ…';
    set({ aiWorkStack: [...get().aiWorkStack, text] });
  },

  popAiWork() {
    const stack = get().aiWorkStack;
    if (stack.length === 0) return;
    set({ aiWorkStack: stack.slice(0, -1) });
  },

  clearAiWork() {
    set({ aiWorkStack: [] });
  },
}));
