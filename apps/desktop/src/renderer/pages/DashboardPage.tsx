import { getDesktopApi } from '../shared/desktopApi';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useUiStore } from '../app/store';
import type { AiConfig } from '@twinby/contracts';
import { AiSettingsSection } from './AiSettingsPage';
import { DeviceSettingsSection } from './DeviceSettingsPage';
import { SetupSection } from './SetupPage';
import { StorageSettingsSection } from './StorageSettingsPage';

type SettingsTab = 'main' | 'ai' | 'environment' | 'device' | 'storage';

const TABS: { id: SettingsTab; label: string }[] = [
  { id: 'main', label: 'Основное' },
  { id: 'ai', label: 'ИИ' },
  { id: 'storage', label: 'Хранилище' },
  { id: 'environment', label: 'Окружение' },
  { id: 'device', label: 'Устройство' },
];

function parseTab(raw: string | null): SettingsTab {
  if (
    raw === 'ai' ||
    raw === 'environment' ||
    raw === 'device' ||
    raw === 'storage' ||
    raw === 'main'
  ) {
    return raw;
  }
  return 'main';
}

export function DashboardPage() {
  const appInfo = useUiStore((s) => s.appInfo);
  const dbHealth = useUiStore((s) => s.dbHealth);
  const [ai, setAi] = useState<AiConfig | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<SettingsTab>(() =>
    parseTab(searchParams.get('tab')),
  );

  useEffect(() => {
    setTab(parseTab(searchParams.get('tab')));
  }, [searchParams]);

  useEffect(() => {
    void getDesktopApi().ai.getConfig().then(setAi).catch(() => setAi(null));
  }, []);

  function selectTab(next: SettingsTab) {
    setTab(next);
    setSearchParams(next === 'main' ? {} : { tab: next });
  }

  return (
    <section className="page">
      <h1>Настройки</h1>

      <div className="settings-tabs" role="radiogroup" aria-label="Раздел настроек">
        {TABS.map((item) => (
          <label
            key={item.id}
            className={`settings-tabs__item ${
              tab === item.id ? 'settings-tabs__item--active' : ''
            }`}
          >
            <input
              type="radio"
              name="settings-tab"
              value={item.id}
              checked={tab === item.id}
              onChange={() => selectTab(item.id)}
            />
            <span>{item.label}</span>
          </label>
        ))}
      </div>

      {tab === 'main' ? (
        <div className="settings-panel">
          <p className="lede">Статус приложения, базы данных и ArionHub.</p>
          <div className="grid">
            <article className="stat">
              <h2>Приложение</h2>
              <p>{appInfo?.name ?? '—'}</p>
              <p className="muted">версия {appInfo?.version ?? '—'}</p>
            </article>
            <article className="stat">
              <h2>База данных</h2>
              <p>{dbHealth?.ok ? 'Готова' : 'Не готова'}</p>
              {dbHealth?.path ? (
                <button
                  type="button"
                  className="path-link muted truncate"
                  title={dbHealth.path}
                  onClick={() =>
                    void getDesktopApi()
                      .app.showPathInFolder(dbHealth.path)
                      .catch(() => undefined)
                  }
                >
                  {dbHealth.path}
                </button>
              ) : (
                <p className="muted truncate">—</p>
              )}
            </article>
            <article className="stat">
              <h2>ArionHub</h2>
              <p>{ai?.hasApiKey ? 'Ключ сохранён' : 'Нужен API-ключ'}</p>
              <p className="muted truncate">
                {ai ? `${ai.primaryModel} · ${ai.apiKeyMasked ?? 'нет ключа'}` : '…'}
              </p>
            </article>
          </div>
        </div>
      ) : null}

      {tab === 'ai' ? (
        <div className="settings-panel">
          <AiSettingsSection />
        </div>
      ) : null}

      {tab === 'storage' ? (
        <div className="settings-panel">
          <StorageSettingsSection />
        </div>
      ) : null}

      {tab === 'environment' ? (
        <div className="settings-panel">
          <SetupSection />
        </div>
      ) : null}

      {tab === 'device' ? (
        <div className="settings-panel">
          <DeviceSettingsSection />
        </div>
      ) : null}
    </section>
  );
}
