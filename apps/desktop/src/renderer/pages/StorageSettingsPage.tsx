import { useCallback, useEffect, useState } from 'react';
import type {
  CloudConnectionView,
  CloudCredentialsStatus,
  CloudFolderView,
  CloudIndexStatusView,
  CloudProvider,
} from '@twinby/contracts';
import { useUiStore } from '../app/store';
import { AiWaiting } from '../shared/AiWaiting';
import { getDesktopApi } from '../shared/desktopApi';

const BROWSE_BATCH_SIZE = 15;

function providerLabel(provider: CloudProvider): string {
  return provider === 'google-drive' ? 'Google Drive' : 'Яндекс Диск';
}

function formatBrowseDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Cloud photo storage — Settings → Хранилище. */
export function StorageSettingsSection() {
  const [connections, setConnections] = useState<CloudConnectionView[]>([]);
  const [cloudCreds, setCloudCreds] = useState<CloudCredentialsStatus | null>(null);
  const [googleFolders, setGoogleFolders] = useState<CloudFolderView[]>([]);
  const [yandexFolders, setYandexFolders] = useState<CloudFolderView[]>([]);
  const [indexStatus, setIndexStatus] = useState<CloudIndexStatusView | null>(null);
  const [googleClientId, setGoogleClientId] = useState('');
  const [googleClientSecret, setGoogleClientSecret] = useState('');
  const [yandexToken, setYandexToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [browsingProvider, setBrowsingProvider] = useState<CloudProvider | null>(
    null,
  );
  const [discoveringProvider, setDiscoveringProvider] =
    useState<CloudProvider | null>(null);
  /** Providers for which discovery finished — show batch UI instead of start button. */
  const [sessionStarted, setSessionStarted] = useState<
    Partial<Record<CloudProvider, boolean>>
  >({});
  const [error, setError] = useState<string | null>(null);
  const showGlobalToast = useUiStore((s) => s.showGlobalToast);
  const pushAiWork = useUiStore((s) => s.pushAiWork);

  const reload = useCallback(async () => {
    const api = getDesktopApi();
    const [cloud, creds, gFolders, yFolders, status] = await Promise.all([
      api.cloud.listConnections(),
      api.cloud.getCredentialsStatus(),
      api.cloud.listFolders('google-drive'),
      api.cloud.listFolders('yandex-disk'),
      api.cloud.getIndexStatus(),
    ]);
    setConnections(cloud);
    setCloudCreds(creds);
    setGoogleFolders(gFolders);
    setYandexFolders(yFolders);
    setIndexStatus(status);
    setSessionStarted((prev) => {
      const next = { ...prev };
      for (const provider of ['google-drive', 'yandex-disk'] as CloudProvider[]) {
        if ((status.discoveredTotalByProvider?.[provider] ?? 0) > 0) {
          next[provider] = true;
        }
      }
      return next;
    });
  }, []);

  useEffect(() => {
    void reload().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : String(err));
    });
  }, [reload]);

  useEffect(() => {
    const unsubscribe = getDesktopApi().cloud.onIndexFinished(() => {
      setBrowsingProvider(null);
      void reload().catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
      });
    });
    return unsubscribe;
  }, [reload]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      setBrowsingProvider(null);
      setDiscoveringProvider(null);
    }
  }

  return (
    <div className="storage-settings">
      <h2>Хранилище</h2>
      <p className="muted">
        Google Drive и Яндекс Диск (read-only). Секреты только в main. В индексе:{' '}
        {indexStatus?.totalIndexed ?? 0} фото. Индексация идёт шагами по{' '}
        {BROWSE_BATCH_SIZE} фото (потолок {500}) — для каждого ИИ пишет краткое
        описание, чтобы потом искать по смыслу.
      </p>

      {error ? <p className="error">{error}</p> : null}
      {discoveringProvider ? (
        <AiWaiting label="Считаю фото в хранилище…" />
      ) : null}
      {browsingProvider ? (
        <AiWaiting
          label={`ИИ описывает следующие ${BROWSE_BATCH_SIZE} фото… Можно уйти на другую страницу — уведомление придёт туда.`}
        />
      ) : null}

      {connections.map((c) => {
        const isGoogle = c.provider === 'google-drive';
        const folders = isGoogle ? googleFolders : yandexFolders;
        const label = providerLabel(c.provider);
        const browsedAt = indexStatus?.browsedAtByProvider?.[c.provider];
        const browseSummary =
          indexStatus?.browseSummaryByProvider?.[c.provider];
        const indexedForProvider = indexStatus?.byProvider?.[c.provider] ?? 0;
        const discoveredTotal =
          indexStatus?.discoveredTotalByProvider?.[c.provider] ?? 0;
        const matchedIndexed =
          indexStatus?.matchedIndexedByProvider?.[c.provider] ?? 0;
        const remaining = indexStatus?.remainingByProvider?.[c.provider] ?? 0;
        // Discovery list is in-memory — after app restart only DB index/summary remain.
        const hasCloudSession =
          Boolean(sessionStarted[c.provider]) || discoveredTotal > 0;
        const hasSavedIndex =
          Boolean(browsedAt) || indexedForProvider > 0 || Boolean(browseSummary);
        const orphanIndexed = Math.max(0, indexedForProvider - matchedIndexed);
        const batchLabel = `Просмотреть ${Math.min(BROWSE_BATCH_SIZE, remaining || BROWSE_BATCH_SIZE)} фото`;

        return (
          <div key={c.id} className="cloud-provider">
            <div className="cloud-provider__head">
              <strong>{label}</strong>
              <span
                className={
                  c.connected
                    ? 'draft-badge draft-badge--current'
                    : 'draft-badge draft-badge--draft'
                }
              >
                {c.connected ? 'подключён' : 'не подключён'}
              </span>
              {browsedAt ? (
                <span className="draft-badge draft-badge--confirmed">просмотрено</span>
              ) : null}
              {c.accountLabel ? <span className="muted">{c.accountLabel}</span> : null}
            </div>

            {c.connected && hasCloudSession ? (
              <div className="cloud-browse-status">
                <p className="muted">
                  В облаке: {discoveredTotal || '…'} фото
                  {' · '}
                  уже описаны:{' '}
                  <strong>
                    {matchedIndexed}/{discoveredTotal || '…'}
                  </strong>
                  {remaining > 0 ? (
                    <>
                      {' · '}
                      осталось описать: <strong>{remaining}</strong>
                    </>
                  ) : (
                    <> · все текущие описаны</>
                  )}
                  {orphanIndexed > 0 ? (
                    <>
                      {' · '}
                      в индексе {orphanIndexed} старых (файла в облаке уже нет)
                    </>
                  ) : null}
                  {browsedAt ? ` · список от ${formatBrowseDate(browsedAt)}` : ''}
                </p>
                {remaining > 0 ? (
                  <p className="muted">
                    Нажимайте «{batchLabel}», пока не опишете оставшиеся кадры.
                    Итоговый вывод ИИ появится, когда новых не останется.
                  </p>
                ) : browseSummary ? (
                  <>
                    <p className="cloud-browse-status__summary">
                      <strong>Вывод ИИ:</strong> {browseSummary}
                    </p>
                    <p className="muted">
                      «Обновить список» пересоберёт вывод ИИ заново.
                    </p>
                  </>
                ) : null}
              </div>
            ) : c.connected && hasSavedIndex ? (
              <div className="cloud-browse-status">
                <p className="muted">
                  В локальном индексе: <strong>{indexedForProvider}</strong> фото
                  {browsedAt
                    ? ` · последний просмотр ${formatBrowseDate(browsedAt)}`
                    : ''}
                  . Нажмите «Обновить список», чтобы сверить с облаком и обновить
                  вывод ИИ.
                </p>
                {browseSummary ? (
                  <p className="cloud-browse-status__summary">
                    <strong>Вывод ИИ:</strong> {browseSummary}
                  </p>
                ) : null}
              </div>
            ) : c.connected ? (
              <p className="muted">
                Нажмите «Проиндексировать», чтобы посчитать фото в хранилище, затем
                просматривайте их шагами по {BROWSE_BATCH_SIZE}.
              </p>
            ) : null}
            {c.lastError ? <p className="error">{c.lastError}</p> : null}

            {!c.connected ? (
              isGoogle ? (
                <div className="orpheus-form cloud-provider__creds">
                  <label>
                    Client ID
                    <input
                      type="text"
                      autoComplete="off"
                      placeholder={
                        cloudCreds?.google.hasClientId
                          ? 'сохранён в secure storage'
                          : 'xxx.apps.googleusercontent.com'
                      }
                      value={googleClientId}
                      disabled={busy}
                      onChange={(e) => setGoogleClientId(e.target.value)}
                    />
                  </label>
                  <label>
                    Client Secret
                    <input
                      type="password"
                      autoComplete="off"
                      placeholder={
                        cloudCreds?.google.hasClientSecret
                          ? 'сохранён в secure storage'
                          : 'секрет Desktop OAuth client'
                      }
                      value={googleClientSecret}
                      disabled={busy}
                      onChange={(e) => setGoogleClientSecret(e.target.value)}
                    />
                  </label>
                  <p className="muted">
                    Google Cloud Console → OAuth client type Desktop → Drive readonly.
                  </p>
                </div>
              ) : (
                <div className="orpheus-form cloud-provider__creds">
                  <label>
                    OAuth token
                    <input
                      type="password"
                      autoComplete="off"
                      placeholder={
                        cloudCreds?.yandex.hasOAuthToken
                          ? 'сохранён в secure storage'
                          : 'OAuth token Яндекс Диска'
                      }
                      value={yandexToken}
                      disabled={busy}
                      onChange={(e) => setYandexToken(e.target.value)}
                    />
                  </label>
                  <p className="muted">
                    oauth.yandex.ru → приложение с доступом к Диску → OAuth token.
                  </p>
                </div>
              )
            ) : null}

            <div className="orpheus-actions">
              {!c.connected ? (
                <button
                  type="button"
                  className="btn btn--go"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      if (isGoogle) {
                        const result = await getDesktopApi().cloud.connectGoogle({
                          googleClientId: googleClientId.trim() || undefined,
                          googleClientSecret:
                            googleClientSecret.trim() || undefined,
                        });
                        setGoogleClientId('');
                        setGoogleClientSecret('');
                        if (!result.connected) {
                          throw new Error(
                            result.lastError || 'Google Drive не подключён',
                          );
                        }
                        showGlobalToast('Google Drive подключён');
                      } else {
                        const result = await getDesktopApi().cloud.connectYandex({
                          yandexOAuthToken: yandexToken.trim() || undefined,
                        });
                        setYandexToken('');
                        if (!result.connected) {
                          throw new Error(
                            result.lastError || 'Яндекс Диск не подключён',
                          );
                        }
                        showGlobalToast('Яндекс Диск подключён');
                      }
                    })
                  }
                >
                  Подключить
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="btn"
                    disabled={
                      busy ||
                      Boolean(browsingProvider) ||
                      Boolean(discoveringProvider)
                    }
                    onClick={() =>
                      void run(async () => {
                        await getDesktopApi().cloud.disconnect(c.provider);
                        setSessionStarted((prev) => ({
                          ...prev,
                          [c.provider]: false,
                        }));
                        showGlobalToast(`${label}: можно подключить другое`);
                      })
                    }
                  >
                    Переподключить другое
                  </button>
                  <button
                    type="button"
                    className={
                      hasCloudSession || hasSavedIndex ? 'btn' : 'btn btn--ai'
                    }
                    disabled={
                      busy ||
                      Boolean(browsingProvider) ||
                      Boolean(discoveringProvider)
                    }
                    onClick={() => {
                      if (discoveringProvider || browsingProvider) return;
                      setDiscoveringProvider(c.provider);
                      setError(null);
                      void getDesktopApi()
                        .cloud.discoverStorage({ provider: c.provider })
                        .then(async (result) => {
                          setSessionStarted((prev) => ({
                            ...prev,
                            [c.provider]: true,
                          }));
                          showGlobalToast(
                            `${label}: найдено ${result.discoveredTotal} · из них уже просмотрено ${result.alreadyIndexed} · новых ${result.remaining}`,
                            6000,
                          );
                          await reload();
                        })
                        .catch((err: unknown) => {
                          setError(
                            err instanceof Error ? err.message : String(err),
                          );
                        })
                        .finally(() => {
                          setDiscoveringProvider(null);
                        });
                    }}
                  >
                    {hasCloudSession || hasSavedIndex
                      ? 'Обновить список'
                      : 'Проиндексировать'}
                  </button>
                  {hasCloudSession && remaining > 0 ? (
                    <button
                      type="button"
                      className="btn btn--ai"
                      disabled={
                        busy ||
                        Boolean(browsingProvider) ||
                        Boolean(discoveringProvider)
                      }
                      onClick={() => {
                        if (browsingProvider || discoveringProvider) return;
                        setBrowsingProvider(c.provider);
                        setError(null);
                        pushAiWork(
                          `Описываю ${Math.min(BROWSE_BATCH_SIZE, remaining)} фото (${label})…`,
                        );
                        showGlobalToast(
                          `${label}: описываю следующие фото в фоне`,
                          4000,
                        );
                        void getDesktopApi()
                          .cloud.browseStorage({
                            provider: c.provider,
                            limit: BROWSE_BATCH_SIZE,
                            skipIndexed: true,
                          })
                          .then(() => reload())
                          .catch((err: unknown) => {
                            setError(
                              err instanceof Error ? err.message : String(err),
                            );
                          })
                          .finally(() => {
                            setBrowsingProvider(null);
                          });
                      }}
                    >
                      {batchLabel}
                    </button>
                  ) : null}
                </>
              )}
            </div>

            {c.connected && folders.length > 0 ? (
              <div className="cloud-folders">
                <p className="muted">Папки (выберите для поиска/просмотра):</p>
                <ul className="cloud-folders__list">
                  {folders.map((folder) => (
                    <li key={folder.id}>
                      <label className="cloud-folders__item">
                        <input
                          type="checkbox"
                          checked={folder.selected}
                          disabled={busy}
                          onChange={(e) =>
                            void run(async () => {
                              const selected = folders
                                .filter((f) =>
                                  f.id === folder.id ? e.target.checked : f.selected,
                                )
                                .map((f) => f.id);
                              await getDesktopApi().cloud.setSelectedFolders({
                                provider: c.provider,
                                folderIds: selected,
                              });
                              setSessionStarted((prev) => ({
                                ...prev,
                                [c.provider]: false,
                              }));
                            })
                          }
                        />
                        <span>{folder.name}</span>
                        {folder.path ? (
                          <span className="muted">{folder.path}</span>
                        ) : null}
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
