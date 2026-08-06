import { useCallback, useEffect, useState } from 'react';
import type {
  AndroidDevice,
  AndroidVirtualDevice,
  EnvironmentReport,
  EnvironmentReportItem,
} from '@twinby/contracts';
import { getDesktopApi } from '../shared/desktopApi';

const STATUS_LABEL: Record<EnvironmentReportItem['status'], string> = {
  ok: 'OK',
  warning: 'Внимание',
  error: 'Ошибка',
  unknown: 'Неизвестно',
};

/** Environment doctor — embedded under Dashboard. */
export function SetupSection() {
  const [report, setReport] = useState<EnvironmentReport | null>(null);
  const [avds, setAvds] = useState<AndroidVirtualDevice[]>([]);
  const [devices, setDevices] = useState<AndroidDevice[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const runDoctor = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const [nextReport, nextAvds, nextDevices] = await Promise.all([
        getDesktopApi().environment.runDoctor(),
        getDesktopApi().environment.listAvds(),
        getDesktopApi().environment.listDevices(),
      ]);
      setReport(nextReport);
      setAvds(nextAvds);
      setDevices(nextDevices);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void runDoctor();
  }, [runDoctor]);

  async function copyText(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId(null), 1500);
    } catch {
      setError('Не удалось скопировать в буфер обмена');
    }
  }

  return (
    <div className="dashboard-setup">
      <h2>Мастер настройки</h2>
      <p className="lede">
        Environment doctor проверяет Node, Java, Android SDK, ADB, эмулятор, AVD, Appium и
        UiAutomator2.
      </p>

      <div className="session-toolbar">
        <button
          type="button"
          className="btn btn--primary"
          disabled={busy}
          onClick={() => void runDoctor()}
        >
          {busy ? 'Проверка…' : 'Проверить снова'}
        </button>
      </div>

      {error ? <p className="error">{error}</p> : null}

      {report ? (
        <>
          <div className="grid">
            <div className="stat">
              <p className="muted">Итог</p>
              <strong>{report.ok ? 'Окружение готово' : 'Есть ошибки'}</strong>
            </div>
            <div className="stat">
              <p className="muted">Проверено</p>
              <strong>{new Date(report.checkedAt).toLocaleString('ru-RU')}</strong>
            </div>
            <div className="stat">
              <p className="muted">AVD</p>
              <strong>{avds.length}</strong>
            </div>
            <div className="stat">
              <p className="muted">ADB devices</p>
              <strong>{devices.length}</strong>
            </div>
          </div>

          <ul className="doctor-list">
            {report.items.map((item) => (
              <li key={item.id} className={`doctor-item doctor-item--${item.status}`}>
                <div className="doctor-item__head">
                  <strong>{item.label}</strong>
                  <span className={`doctor-badge doctor-badge--${item.status}`}>
                    {STATUS_LABEL[item.status]}
                  </span>
                </div>
                <p>{item.detail}</p>
                {item.path ? <p className="muted truncate">Путь: {item.path}</p> : null}
                {item.version ? <p className="muted">Версия: {item.version}</p> : null}
                {item.fixCommand ? (
                  <div className="doctor-fix">
                    <code>{item.fixCommand}</code>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => void copyText(item.id, item.fixCommand!)}
                    >
                      {copiedId === item.id ? 'Скопировано' : 'Копировать'}
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>

          {avds.length > 0 || devices.length > 0 ? (
            <div className="card-lite" style={{ marginTop: 16 }}>
              <h2>Обнаружено</h2>
              {avds.length > 0 ? (
                <p>AVD: {avds.map((a) => a.name).join(', ')}</p>
              ) : null}
              {devices.length > 0 ? (
                <p>
                  Devices:{' '}
                  {devices.map((d) => `${d.udid} (${d.state})`).join(', ')}
                </p>
              ) : (
                <p className="muted">Устройства пока не подключены.</p>
              )}
            </div>
          ) : null}
        </>
      ) : (
        <p className="muted">{busy ? 'Идёт проверка окружения…' : 'Нет данных'}</p>
      )}
    </div>
  );
}
