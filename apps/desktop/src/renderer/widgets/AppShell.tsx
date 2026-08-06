import { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import type {
  AndroidDevice,
  AppiumSessionInfo,
  SessionMode,
  SessionViewState,
} from '@twinby/contracts';
import { useUiStore } from '../app/store';
import { getDesktopApi } from '../shared/desktopApi';
import eurydiceLogo from '../assets/eurydice-logo.png';

const BLUESTACKS_UDID = '127.0.0.1:5555';
const TWINBY_PACKAGE = 'com.twinby';
const TWINBY_ACTIVITY = 'com.twinby/.MainActivity';

function pickPreferredDevice(devices: AndroidDevice[]): AndroidDevice | undefined {
  const online = devices.filter((d) => d.state === 'device');
  return (
    online.find((d) => d.udid === BLUESTACKS_UDID) ??
    online.find((d) => d.udid.startsWith('127.0.0.1:')) ??
    online[0]
  );
}

function appiumSessionInput(udid: string) {
  return {
    udid,
    appPackage: TWINBY_PACKAGE,
    appActivity: TWINBY_ACTIVITY,
    deviceName: udid.startsWith('127.0.0.1:') ? 'BlueStacks' : 'Android Emulator',
    noReset: true as const,
    newCommandTimeout: 300,
  };
}

type NavIconId =
  | 'eurydice'
  | 'orpheus'
  | 'preferences'
  | 'history'
  | 'privacy'
  | 'settings';

const NAV: { to: string; label: string; icon: NavIconId }[] = [
  { to: '/eurydice', label: 'Eurydice', icon: 'eurydice' },
  { to: '/orpheus', label: 'Orpheus', icon: 'orpheus' },
  { to: '/preferences', label: 'Предпочтения', icon: 'preferences' },
  { to: '/history', label: 'История', icon: 'history' },
  { to: '/privacy', label: 'Приватность', icon: 'privacy' },
  { to: '/settings', label: 'Настройки', icon: 'settings' },
];

function NavIcon({ id }: { id: NavIconId }) {
  const common = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className: 'nav__icon',
    'aria-hidden': true,
  };

  switch (id) {
    case 'eurydice':
      return (
        <svg {...common}>
          <rect x="3" y="4" width="14" height="16" rx="2" />
          <path d="M17 8h4v12a2 2 0 0 1-2 2H9" />
          <path d="M7 9h6M7 13h6" />
        </svg>
      );
    case 'orpheus':
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="3.5" />
          <path d="M5 20c1.5-3.5 4-5 7-5s5.5 1.5 7 5" />
          <path d="M16 4.5l1.2-1.8M17.5 7l2-.5" />
        </svg>
      );
    case 'preferences':
      return (
        <svg {...common}>
          <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />
        </svg>
      );
    case 'history':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 8v5l3 2" />
        </svg>
      );
    case 'privacy':
      return (
        <svg {...common}>
          <path d="M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6l7-3z" />
        </svg>
      );
    case 'settings':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 3v2.2M12 18.8V21M4.9 6.5l1.6 1.6M17.5 15.9l1.6 1.6M3 12h2.2M18.8 12H21M4.9 17.5l1.6-1.6M17.5 8.1l1.6-1.6" />
        </svg>
      );
    default:
      return null;
  }
}

const LIVE_MODES: { mode: SessionMode; label: string }[] = [
  { mode: 'recommendation-only', label: 'Рекомендации' },
  { mode: 'auto-high-confidence', label: 'Авто' },
];

export function AppShell() {
  const appInfo = useUiStore((s) => s.appInfo);
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const setSidebarCollapsed = useUiStore((s) => s.setSidebarCollapsed);
  const udid = useUiStore((s) => s.selectedUdid);
  const setUdid = useUiStore((s) => s.setSelectedUdid);
  const selectedMode = useUiStore((s) => s.selectedSessionMode);
  const setSelectedMode = useUiStore((s) => s.setSelectedSessionMode);
  const globalToast = useUiStore((s) => s.globalToast);
  const showGlobalToast = useUiStore((s) => s.showGlobalToast);
  const aiWorkStack = useUiStore((s) => s.aiWorkStack);
  const popAiWork = useUiStore((s) => s.popAiWork);
  const [session, setSession] = useState<SessionViewState | null>(null);
  const [appiumSession, setAppiumSession] = useState<AppiumSessionInfo | null>(
    null,
  );
  const [devices, setDevices] = useState<AndroidDevice[]>([]);
  const [stopping, setStopping] = useState(false);
  const [busy, setBusy] = useState(false);
  const [liveOpen, setLiveOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const liveMenuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const sessionAiLabel =
    session?.status === 'evaluating'
      ? 'Работает ИИ — оцениваю анкету…'
      : session?.status === 'capturing-profile'
        ? 'Работает ИИ — читаю анкету…'
        : null;
  const aiHeaderLabel =
    aiWorkStack.length > 0
      ? aiWorkStack[aiWorkStack.length - 1]!
      : sessionAiLabel;

  useEffect(() => {
    const unsubscribe = getDesktopApi().cloud.onIndexFinished((event) => {
      popAiWork();
      showGlobalToast(event.message, event.ok ? 7000 : 9000);
    });
    return unsubscribe;
  }, [showGlobalToast, popAiWork]);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const [next, nextDevices, nextAppium] = await Promise.all([
          getDesktopApi().sessions.getState(),
          getDesktopApi().environment.listDevices(),
          getDesktopApi().appium.getSession(),
        ]);
        if (!alive) {
          return;
        }
        setSession(next);
        setDevices(nextDevices);

        const sessionDeviceOnline = Boolean(
          nextAppium &&
            nextDevices.some(
              (d) => d.udid === nextAppium.udid && d.state === 'device',
            ),
        );
        if (nextAppium && !sessionDeviceOnline) {
          // Device gone — drop stale Appium session so indicator / create work again.
          setAppiumSession(null);
          void getDesktopApi()
            .appium.endSession()
            .catch(() => undefined);
        } else {
          setAppiumSession(nextAppium);
        }

        if (udid) {
          const selectedStillOnline = nextDevices.some(
            (d) => d.udid === udid && d.state === 'device',
          );
          if (!selectedStillOnline) {
            const preferred = pickPreferredDevice(nextDevices);
            setUdid(preferred?.udid ?? '');
          }
        } else {
          const preferred = pickPreferredDevice(nextDevices);
          if (preferred) {
            setUdid(preferred.udid);
          }
        }
      } catch {
        /* ignore poll errors */
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 1000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [udid, setUdid]);

  useEffect(() => {
    if (!liveOpen) {
      return;
    }
    const onPointer = (event: MouseEvent) => {
      if (
        liveMenuRef.current &&
        !liveMenuRef.current.contains(event.target as Node)
      ) {
        setLiveOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setLiveOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [liveOpen]);

  const stopSession = useCallback(async () => {
    setStopping(true);
    setActionError(null);
    // Optimistic UI — don't wait for in-flight capture/swipe cleanup.
    setSession((prev) =>
      prev && prev.status !== 'idle' && prev.status !== 'stopped'
        ? { ...prev, status: 'stopped', stoppedAt: new Date().toISOString() }
        : prev,
    );
    try {
      const next = await getDesktopApi().sessions.stop();
      setSession(next);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setStopping(false);
    }
  }, []);

  const createDeviceSession = useCallback(async () => {
    if (!udid) {
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      const created = await getDesktopApi().appium.createSession(
        appiumSessionInput(udid),
      );
      setAppiumSession(created);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [udid]);

  const startLive = useCallback(async () => {
    if (!udid) {
      return;
    }
    setBusy(true);
    setActionError(null);
    setLiveOpen(false);
    try {
      await getDesktopApi().sessions.start({
        mode: selectedMode,
        source: 'live',
        udid,
        appPackage: TWINBY_PACKAGE,
      });
      navigate('/eurydice');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
      navigate('/eurydice');
    } finally {
      setBusy(false);
    }
  }, [navigate, selectedMode, udid]);

  const selectedModeLabel =
    LIVE_MODES.find((item) => item.mode === selectedMode)?.label ??
    'Рекомендации';

  const running =
    session && !['idle', 'stopped', 'error'].includes(session.status);
  // Same enable rule as Session page «Стоп»: running or error.
  const canStop = Boolean(
    session && !['idle', 'stopped'].includes(session.status),
  );
  const deviceSessionActive = Boolean(
    appiumSession &&
      devices.some(
        (d) => d.udid === appiumSession.udid && d.state === 'device',
      ),
  );

  return (
    <div className={`shell ${collapsed ? 'shell--collapsed' : ''}`}>
      <aside
        className="sidebar"
        title={collapsed ? 'Нажмите, чтобы развернуть меню' : undefined}
        onClick={(event) => {
          if (!collapsed) {
            return;
          }
          // Only nav links keep the menu collapsed; empty space / brand / spacer expand it.
          if ((event.target as Element).closest('.nav__link')) {
            return;
          }
          setSidebarCollapsed(false);
        }}
      >
        <div className="brand">
          <img
            className="brand__mark"
            src={eurydiceLogo}
            alt=""
            width={36}
            height={36}
          />
          {!collapsed && <span className="brand__name">E&amp;O</span>}
        </div>
        <nav className="nav">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              title={item.label}
              className={({ isActive }) =>
                `nav__link ${isActive ? 'nav__link--active' : ''}`
              }
            >
              <NavIcon id={item.icon} />
              <span className="nav__label">{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar__spacer" aria-hidden />
        <button
          type="button"
          className="sidebar__toggle"
          title={collapsed ? 'Развернуть меню' : 'Свернуть меню'}
          onClick={(event) => {
            event.stopPropagation();
            toggleSidebar();
          }}
        >
          {collapsed ? (
            <span className="sidebar__expand-arrow" aria-hidden>
              »
            </span>
          ) : (
            '« Свернуть'
          )}
        </button>
      </aside>
      <main className="main">
        <header className="topbar">
          <div>
            <strong>{appInfo?.name ?? 'Eurydice'}</strong>
            {running ? (
              <span className="muted">
                {' '}
                · {session?.mode} · {session?.status}
              </span>
            ) : null}
            {actionError ? (
              <span className="topbar__error" title={actionError}>
                {' '}
                {actionError}
              </span>
            ) : null}
          </div>
          <div className="topbar__actions">
            {aiHeaderLabel ? (
              <div
                className="topbar__ai"
                role="status"
                aria-live="polite"
                aria-busy="true"
                title={aiHeaderLabel}
              >
                <span className="ai-waiting__spinner" aria-hidden="true" />
                <span className="topbar__ai-label">Работает ИИ</span>
              </div>
            ) : null}
            <span
              className={`topbar__session-status ${
                deviceSessionActive
                  ? 'topbar__session-status--on'
                  : 'topbar__session-status--off'
              }`}
              title={
                deviceSessionActive
                  ? `Appium-сессия активна${
                      appiumSession?.udid ? ` · ${appiumSession.udid}` : ''
                    }`
                  : 'Appium-сессия не создана'
              }
            >
              Сессия {deviceSessionActive ? '✅' : '❌'}
            </span>
            <select
              className="topbar__udid"
              value={udid}
              aria-label="Устройство"
              onChange={(e) => setUdid(e.target.value)}
            >
              <option value="">— устройство —</option>
              {devices.map((d) => (
                <option key={d.udid} value={d.udid}>
                  {d.udid} ({d.state}
                  {d.isEmulator ? ', emu' : ''})
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn topbar__btn"
              disabled={busy || !udid}
              title="Создать Appium-сессию с выбранным устройством"
              onClick={() => void createDeviceSession()}
            >
              Создать сессию из устройства
            </button>
            <div className="topbar__menu" ref={liveMenuRef}>
              <button
                type="button"
                className="btn topbar__btn topbar__menu-trigger"
                disabled={busy || Boolean(running)}
                aria-expanded={liveOpen}
                aria-haspopup="menu"
                title="Режим live-сессии"
                onClick={(event) => {
                  event.stopPropagation();
                  setLiveOpen((open) => !open);
                }}
              >
                {selectedModeLabel}
                <span className="topbar__caret" aria-hidden>
                  ▾
                </span>
              </button>
              {liveOpen ? (
                <div
                  className="topbar__dropdown"
                  role="menu"
                  onMouseDown={(event) => event.preventDefault()}
                >
                  {LIVE_MODES.map((item) => (
                    <button
                      key={item.mode}
                      type="button"
                      role="menuitem"
                      className={`topbar__dropdown-item ${
                        item.mode === selectedMode
                          ? 'topbar__dropdown-item--active'
                          : ''
                      }`}
                      disabled={busy || Boolean(running)}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setSelectedMode(item.mode);
                        setLiveOpen(false);
                      }}
                    >
                      {item.label}
                      {item.mode === selectedMode ? ' · выбрано' : ''}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <button
              type="button"
              className="btn btn--go topbar__btn"
              disabled={busy || !udid || Boolean(running)}
              title={`Запуск live · ${selectedModeLabel}`}
              onClick={() => void startLive()}
            >
              Запуск
            </button>
            <button
              type="button"
              className="btn btn--stop topbar__btn"
              disabled={stopping || !canStop}
              title="Остановить сессию"
              onClick={() => void stopSession()}
            >
              {stopping ? 'Стоп…' : 'Стоп'}
            </button>
          </div>
        </header>
        <div className="content">
          {globalToast ? (
            <div className="app-toast app-toast--global" role="status" aria-live="polite">
              {globalToast}
            </div>
          ) : null}
          <Outlet />
        </div>
      </main>
    </div>
  );
}
