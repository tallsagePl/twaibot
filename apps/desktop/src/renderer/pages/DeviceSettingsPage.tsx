import { useCallback, useEffect, useState } from 'react';
import type {
  AndroidDevice,
  AppiumPageSource,
  AppiumServerStatus,
  AppiumSessionInfo,
  AppiumWindowRect,
  CapturedProfile,
  DiscoverySnapshot,
  LocatorProfile,
  SessionLimits,
  SpeedPreset,
  TwinbyPackageInfo,
} from '@twinby/contracts';
import { useUiStore } from '../app/store';
import { getDesktopApi } from '../shared/desktopApi';

/** Local copy — avoid pulling CJS contracts bundle into renderer for presets */
const SPEED_PRESET_VALUES: Record<
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
  turbo: {
    speedPreset: 'turbo',
    maxActionsPerMinute: 120,
    minActionIntervalMs: 0,
    maxPhotosPerProfile: 8,
    maxPhotosForAi: 5,
    requireAllPhotos: true,
    requireBio: false,
    uiCooldownMs: 280,
  },
};

const PRESET_LABEL: Record<SpeedPreset, string> = {
  safe: 'Safe — медленно',
  balanced: 'Balanced',
  fast: 'Fast',
  turbo: 'Turbo — эмулятор, макс. скорость',
};

const BLUESTACKS_UDID = '127.0.0.1:5555';
const DEFAULT_APP_ACTIVITY = 'com.twinby/.MainActivity';

function pickPreferredDevice(devices: AndroidDevice[]): AndroidDevice | undefined {
  const online = devices.filter((d) => d.state === 'device');
  return (
    online.find((d) => d.udid === BLUESTACKS_UDID) ??
    online.find((d) => d.udid.startsWith('127.0.0.1:')) ??
    online[0]
  );
}

/** Device / Appium / capture — embedded under Settings. */
export function DeviceSettingsSection() {
  const udid = useUiStore((s) => s.selectedUdid);
  const setUdid = useUiStore((s) => s.setSelectedUdid);
  const [devices, setDevices] = useState<AndroidDevice[]>([]);
  const [appPackage, setAppPackage] = useState('com.twinby');
  const [appActivity, setAppActivity] = useState(DEFAULT_APP_ACTIVITY);
  const [status, setStatus] = useState<AppiumServerStatus | null>(null);
  const [session, setSession] = useState<AppiumSessionInfo | null>(null);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [pageSource, setPageSource] = useState<AppiumPageSource | null>(null);
  const [windowRect, setWindowRect] = useState<AppiumWindowRect | null>(null);
  const [pkg, setPkg] = useState<TwinbyPackageInfo | null>(null);
  const [profile, setProfile] = useState<LocatorProfile | null>(null);
  const [discovery, setDiscovery] = useState<DiscoverySnapshot | null>(null);
  const [captured, setCaptured] = useState<CapturedProfile | null>(null);
  const [limits, setLimits] = useState<SessionLimits | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [nextDevices, nextStatus, nextSession, nextPkg, nextProfile, nextLimits] =
        await Promise.all([
          getDesktopApi().environment.listDevices(),
          getDesktopApi().appium.getStatus(),
          getDesktopApi().appium.getSession(),
          getDesktopApi().twinby.detectPackage(),
          getDesktopApi().twinby.getLocatorProfile(),
          getDesktopApi().twinby.getSessionLimits(),
        ]);
      setDevices(nextDevices);
      setStatus(nextStatus);
      setSession(nextSession);
      setPkg(nextPkg);
      setProfile(nextProfile);
      setLimits(nextLimits);
      if (!udid) {
        const preferred = pickPreferredDevice(nextDevices);
        if (preferred) {
          setUdid(preferred.udid);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [udid, setUdid]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function run(action: () => Promise<void>, okMessage?: string) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await action();
      await refresh();
      if (okMessage) {
        setMessage(okMessage);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dashboard-device">
      <h2>Устройство / Twinby capture</h2>
      <p className="lede">
        Захват фото и описания под выбранным темпом. Like/dislike здесь не нажимаем.
      </p>

      {error ? <p className="error">{error}</p> : null}
      {message ? <p className="ok-msg">{message}</p> : null}

      <div className="grid">
        <div className="stat">
          <p className="muted">Appium</p>
          <strong>
            {status?.ready ? 'ready' : status?.running ? 'running' : 'offline'}
          </strong>
          <p className="muted truncate">{status?.url ?? '—'}</p>
        </div>
        <div className="stat">
          <p className="muted">Владение процессом</p>
          <strong>{status?.owned ? 'наш' : 'чужой / нет'}</strong>
          <p className="muted">{status?.version ? `v${status.version}` : ''}</p>
        </div>
        <div className="stat">
          <p className="muted">Сессия</p>
          <strong>{session ? 'активна' : 'нет'}</strong>
          <p className="muted truncate">{session?.sessionId ?? '—'}</p>
        </div>
        <div className="stat">
          <p className="muted">Устройства</p>
          <strong>{devices.filter((d) => d.state === 'device').length} online</strong>
        </div>
        <div className="stat">
          <p className="muted">Twinby</p>
          <strong>{pkg?.installed ? pkg.versionName ?? 'ok' : 'не найден'}</strong>
          <p className="muted truncate">{pkg?.packageName ?? '—'}</p>
        </div>
      </div>

      <div className="session-toolbar">
        <button type="button" className="btn" disabled={busy} onClick={() => void refresh()}>
          Обновить
        </button>
        <button
          type="button"
          className="btn btn--primary"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await getDesktopApi().appium.startServer();
            }, 'Appium готов')
          }
        >
          Старт Appium
        </button>
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await getDesktopApi().appium.stopServer();
            }, 'Стоп выполнен (чужой сервер не убиваем)')
          }
        >
          Стоп Appium
        </button>
      </div>

      <div className="card-lite form-grid">
        <label>
          UDID
          <select value={udid} onChange={(e) => setUdid(e.target.value)}>
            <option value="">— выберите —</option>
            {devices.map((d) => (
              <option key={d.udid} value={d.udid}>
                {d.udid} ({d.state}
                {d.isEmulator ? ', emu' : ''})
              </option>
            ))}
          </select>
        </label>
        <label>
          appPackage
          <input
            value={appPackage}
            placeholder="com.twinby"
            onChange={(e) => setAppPackage(e.target.value)}
          />
        </label>
        <label>
          appActivity
          <input
            value={appActivity}
            placeholder="com.twinby/.MainActivity"
            onChange={(e) => setAppActivity(e.target.value)}
          />
        </label>
        <p className="full muted" style={{ marginTop: -4 }}>
          BlueStacks: UDID <code>127.0.0.1:5555</code>, deviceName BlueStacks, noReset,
          newCommandTimeout 300.
        </p>
        <div className="btn-row">
          <button
            type="button"
            className="btn btn--primary"
            disabled={busy || !udid}
            onClick={() =>
              void run(async () => {
                await getDesktopApi().appium.createSession({
                  udid,
                  appPackage: appPackage.trim() || 'com.twinby',
                  appActivity: appActivity.trim() || DEFAULT_APP_ACTIVITY,
                  deviceName: udid.startsWith('127.0.0.1:')
                    ? 'BlueStacks'
                    : 'Android Emulator',
                  noReset: true,
                  newCommandTimeout: 300,
                });
              }, 'Сессия создана')
            }
          >
            Создать сессию
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy || !session}
            onClick={() =>
              void run(async () => {
                await getDesktopApi().appium.endSession();
                setScreenshot(null);
                setPageSource(null);
                setWindowRect(null);
                setDiscovery(null);
                setCaptured(null);
              }, 'Сессия закрыта')
            }
          >
            Закрыть сессию
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy || !session}
            onClick={() =>
              void run(async () => {
                const shot = await getDesktopApi().appium.takeScreenshot();
                setScreenshot(shot.dataUrl);
              }, 'Screenshot снят')
            }
          >
            Screenshot
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy || !session}
            onClick={() =>
              void run(async () => {
                const snap = await getDesktopApi().twinby.captureDiscoverySnapshot();
                setDiscovery(snap);
                setScreenshot(snap.screenshotDataUrl ?? null);
                setWindowRect(snap.windowRect ?? null);
              }, 'Discovery snapshot готов')
            }
          >
            Discovery snapshot
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={busy || !session}
            onClick={() =>
              void run(async () => {
                const result = await getDesktopApi().twinby.captureCurrentProfile();
                setCaptured(result);
                const first = result.images[0]?.dataUrl;
                if (first) {
                  setScreenshot(first);
                }
              }, 'Захват анкеты завершён')
            }
          >
            Захватить анкету
          </button>
        </div>
      </div>

      {limits ? (
        <div className="card-lite form-grid" style={{ marginTop: 14 }}>
          <h2 className="full">Лимиты и скорость</h2>
          <div className="full btn-row" style={{ marginBottom: 4 }}>
            {(['safe', 'balanced', 'fast', 'turbo'] as SpeedPreset[]).map((preset) => (
              <button
                key={preset}
                type="button"
                className={
                  limits.speedPreset === preset ? 'btn btn--primary' : 'btn'
                }
                disabled={busy}
                onClick={() =>
                  setLimits({
                    ...limits,
                    ...SPEED_PRESET_VALUES[preset],
                  })
                }
              >
                {PRESET_LABEL[preset]}
              </button>
            ))}
          </div>
          <p className="full muted" style={{ marginTop: 0 }}>
            Сейчас: {limits.speedPreset} · в ИИ до {limits.maxPhotosForAi} фото · захват до{' '}
            {limits.maxPhotosPerProfile} · интервал {limits.minActionIntervalMs} мс
          </p>
          <label>
            Действий / мин
            <input
              type="number"
              min={1}
              max={30}
              value={limits.maxActionsPerMinute}
              onChange={(e) =>
                setLimits({ ...limits, maxActionsPerMinute: Number(e.target.value) })
              }
            />
          </label>
          <label>
            Мин. интервал, мс
            <input
              type="number"
              min={500}
              max={60000}
              value={limits.minActionIntervalMs}
              onChange={(e) =>
                setLimits({ ...limits, minActionIntervalMs: Number(e.target.value) })
              }
            />
          </label>
          <label>
            Макс. фото / анкета (UI)
            <input
              type="number"
              min={1}
              max={20}
              value={limits.maxPhotosPerProfile}
              onChange={(e) =>
                setLimits({ ...limits, maxPhotosPerProfile: Number(e.target.value) })
              }
            />
          </label>
          <label>
            Фото в ИИ
            <input
              type="number"
              min={1}
              max={10}
              value={limits.maxPhotosForAi}
              onChange={(e) =>
                setLimits({ ...limits, maxPhotosForAi: Number(e.target.value) })
              }
            />
          </label>
          <label>
            Макс. анкет
            <input
              type="number"
              min={1}
              max={350}
              value={limits.maxProfiles}
              onChange={(e) =>
                setLimits({ ...limits, maxProfiles: Number(e.target.value) })
              }
            />
          </label>
          <label>
            Макс. likes (0 = без лимита)
            <input
              type="number"
              min={0}
              max={5000}
              value={limits.maxLikes}
              onChange={(e) => setLimits({ ...limits, maxLikes: Number(e.target.value) })}
            />
          </label>
          <label>
            Макс. dislikes (0 = без лимита)
            <input
              type="number"
              min={0}
              max={5000}
              value={limits.maxDislikes}
              onChange={(e) =>
                setLimits({ ...limits, maxDislikes: Number(e.target.value) })
              }
            />
          </label>
          <label>
            Макс. auto-действий (0 = без лимита)
            <input
              type="number"
              min={0}
              max={5000}
              value={limits.maxAutoActions}
              onChange={(e) =>
                setLimits({ ...limits, maxAutoActions: Number(e.target.value) })
              }
            />
          </label>
          <label>
            Длительность, мин (0 = без лимита)
            <input
              type="number"
              min={0}
              max={10080}
              value={limits.maxSessionDurationMin}
              onChange={(e) =>
                setLimits({ ...limits, maxSessionDurationMin: Number(e.target.value) })
              }
            />
          </label>
          <label className="checkbox-inline">
            <input
              type="checkbox"
              checked={limits.requireAllPhotos}
              onChange={(e) =>
                setLimits({ ...limits, requireAllPhotos: e.target.checked })
              }
            />
            Все фото до конца / повтора
          </label>
          <label className="checkbox-inline">
            <input
              type="checkbox"
              checked={limits.requireBio}
              onChange={(e) => setLimits({ ...limits, requireBio: e.target.checked })}
            />
            Требовать описание (bio)
          </label>
          <div className="btn-row">
            <button
              type="button"
              className="btn btn--primary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const saved = await getDesktopApi().twinby.saveSessionLimits(limits);
                  setLimits(saved);
                }, 'Лимиты сохранены')
              }
            >
              Сохранить лимиты
            </button>
          </div>
        </div>
      ) : null}

      {captured ? (
        <div className="card-lite" style={{ marginTop: 12 }}>
          <h2>Захваченная анкета</h2>
          <p>
            <strong>
              {captured.fields.displayName ?? '—'}
              {captured.fields.age != null ? `, ${captured.fields.age}` : ''}
            </strong>
            {captured.fields.distanceKm != null
              ? ` · ${captured.fields.distanceKm} км`
              : ''}
            {captured.fields.compatibilityPercent != null
              ? ` · ${captured.fields.compatibilityPercent}%`
              : ''}
          </p>
          <p className="muted">
            Фото: {captured.images.length} · действия: {captured.actionsUsed} · completeness{' '}
            {Math.round(captured.completeness.overall * 100)}%
          </p>
          <p className="muted">
            Цель: {captured.fields.relationshipGoal ?? '—'} · Интересы:{' '}
            {captured.fields.interests.join(', ') || '—'}
          </p>
          <p className="muted">Bio: {captured.fields.bio ?? '—'}</p>
          {captured.warnings.length > 0 ? (
            <ul className="reason-list">
              {captured.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : null}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            {captured.images.map((img) =>
              img.dataUrl ? (
                <img
                  key={img.index}
                  src={img.dataUrl}
                  alt={`photo ${img.index}`}
                  style={{
                    width: 96,
                    height: 128,
                    objectFit: 'contain',
                    borderRadius: 8,
                    border: '1px solid var(--line)',
                  }}
                />
              ) : null,
            )}
          </div>
          <div className="btn-row" style={{ marginTop: 10 }}>
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await getDesktopApi().twinby.cleanupCapture(captured.observationId);
                  setCaptured(null);
                }, 'Временные файлы удалены')
              }
            >
              Удалить temp capture
            </button>
          </div>
        </div>
      ) : null}

      {profile ? (
        <div className="card-lite" style={{ marginTop: 12 }}>
          <h2>Locator profile</h2>
          <p>
            <strong>{profile.id}</strong> · {profile.appPackage}{' '}
            {profile.appVersion ? `v${profile.appVersion}` : ''}
          </p>
          <p className="muted">
            nextPhoto={profile.feed.nextPhotoArea[0]?.strategy ?? '—'} · details=
            {profile.feed.detailsButton[0]?.strategy ?? '—'}
          </p>
        </div>
      ) : null}

      {discovery ? (
        <div className="card-lite" style={{ marginTop: 12 }}>
          <h2>Последний discovery</h2>
          <p>
            Экран: <strong>{discovery.detectedScreen.type}</strong> (
            {Math.round(discovery.detectedScreen.confidence * 100)}%)
          </p>
          <p className="muted">{discovery.detectedScreen.evidence.join(' · ')}</p>
        </div>
      ) : null}

      {windowRect ? (
        <p className="muted">
          Окно: {windowRect.width}×{windowRect.height} @ ({windowRect.x}, {windowRect.y})
        </p>
      ) : null}

      {screenshot ? (
        <div className="card-lite" style={{ marginTop: 12 }}>
          <h2>Screenshot</h2>
          <img
            src={screenshot}
            alt="Appium screenshot"
            style={{
              maxWidth: 280,
              width: '100%',
              borderRadius: 12,
              border: '1px solid var(--line)',
            }}
          />
        </div>
      ) : null}

      {pageSource ? (
        <div className="card-lite" style={{ marginTop: 12 }}>
          <h2>Page source</h2>
          <p className="muted">{pageSource.length} символов</p>
        </div>
      ) : null}
    </div>
  );
}
