import { withAiWork } from '../shared/aiWork';
import { getDesktopApi } from '../shared/desktopApi';
import { AiWaiting } from '../shared/AiWaiting';
import { useEffect, useState, type FormEvent } from 'react';
import type {
  AiConfig,
  AiConnectionTest,
  AiModel,
  AiVisionTest,
  ModelCapabilities,
} from '@twinby/contracts';

type Status = 'idle' | 'loading' | 'ok' | 'error';

/** AI / ArionHub settings — embedded under Dashboard setup. */
export function AiSettingsSection() {
  const [config, setConfig] = useState<AiConfig | null>(null);
  const [apiKeyDraft, setApiKeyDraft] = useState('');
  const [models, setModels] = useState<AiModel[]>([]);
  const [capabilities, setCapabilities] = useState<ModelCapabilities | null>(null);
  const [textResult, setTextResult] = useState<AiConnectionTest | null>(null);
  const [visionResult, setVisionResult] = useState<AiVisionTest | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Status>('idle');
  const [aiWaitLabel, setAiWaitLabel] = useState<string | null>(null);

  async function reload() {
    const next = await getDesktopApi().ai.getConfig();
    setConfig(next);
    const caps = await getDesktopApi().ai.getCapabilities(next.primaryModel);
    setCapabilities(caps);
  }

  useEffect(() => {
    void reload().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : String(err));
    });
  }, []);

  async function onSave(event: FormEvent) {
    event.preventDefault();
    if (!config) {
      return;
    }
    setBusy('loading');
    setError(null);
    setMessage(null);
    try {
      const saved = await getDesktopApi().ai.saveConfig({
        baseUrl: config.baseUrl,
        primaryModel: config.primaryModel,
        fallbackModel: config.fallbackModel || undefined,
        timeoutMs: config.timeoutMs,
        maxRetries: config.maxRetries,
        maxOutputTokens: config.maxOutputTokens,
        temperature: config.temperature,
        responseFormatMode: config.responseFormatMode,
        maxCandidatePhotos: config.maxCandidatePhotos,
        positiveAnchorsCount: config.positiveAnchorsCount,
        negativeAnchorsCount: config.negativeAnchorsCount,
        imageDetail: config.imageDetail,
        sessionSpendingLimitUsd: config.sessionSpendingLimitUsd,
        dailySpendingLimitUsd: config.dailySpendingLimitUsd,
        usdPer1kTokens: config.usdPer1kTokens,
        fallbackEnabled: config.fallbackEnabled,
        jsonRepairEnabled: config.jsonRepairEnabled,
        apiKey: apiKeyDraft.trim() ? apiKeyDraft.trim() : undefined,
      });
      setConfig(saved);
      setApiKeyDraft('');
      setMessage('Настройки сохранены. Ключ в renderer не хранится.');
      setBusy('ok');
    } catch (err) {
      setBusy('error');
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function onClearKey() {
    if (!config) {
      return;
    }
    setBusy('loading');
    try {
      const saved = await getDesktopApi().ai.saveConfig({
        baseUrl: config.baseUrl,
        primaryModel: config.primaryModel,
        fallbackModel: config.fallbackModel,
        timeoutMs: config.timeoutMs,
        maxRetries: config.maxRetries,
        maxOutputTokens: config.maxOutputTokens,
        temperature: config.temperature,
        responseFormatMode: config.responseFormatMode,
        maxCandidatePhotos: config.maxCandidatePhotos,
        positiveAnchorsCount: config.positiveAnchorsCount,
        negativeAnchorsCount: config.negativeAnchorsCount,
        imageDetail: config.imageDetail,
        sessionSpendingLimitUsd: config.sessionSpendingLimitUsd,
        dailySpendingLimitUsd: config.dailySpendingLimitUsd,
        usdPer1kTokens: config.usdPer1kTokens,
        fallbackEnabled: config.fallbackEnabled,
        jsonRepairEnabled: config.jsonRepairEnabled,
        clearApiKey: true,
      });
      setConfig(saved);
      setMessage('API-ключ удалён');
      setBusy('ok');
    } catch (err) {
      setBusy('error');
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function onListModels() {
    setBusy('loading');
    setAiWaitLabel('Нейронка обрабатывает запрос… загружаю список моделей');
    setError(null);
    try {
      const list = await withAiWork('Загружаю список моделей…', () =>
        getDesktopApi().ai.listModels(),
      );
      setModels(list);
      setMessage(`Загружено моделей: ${list.length}`);
      setBusy('ok');
    } catch (err) {
      setBusy('error');
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAiWaitLabel(null);
    }
  }

  async function onTestText() {
    setBusy('loading');
    setAiWaitLabel('Нейронка обрабатывает запрос… проверяю текстовый ответ');
    setError(null);
    try {
      const result = await withAiWork('Проверяю текстовый ответ ИИ…', () =>
        getDesktopApi().ai.testTextConnection(),
      );
      setTextResult(result);
      setMessage(result.userMessage ?? (result.ok ? 'OK' : 'Ошибка'));
      setBusy(result.ok ? 'ok' : 'error');
      if (!result.ok) {
        setError(result.userMessage ?? result.error ?? 'Тест текста не прошёл');
      }
      await reload();
    } catch (err) {
      setBusy('error');
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAiWaitLabel(null);
    }
  }

  async function onTestVision() {
    setBusy('loading');
    setAiWaitLabel('Нейронка обрабатывает запрос… проверяю vision');
    setError(null);
    try {
      const result = await withAiWork('Проверяю vision ИИ…', () =>
        getDesktopApi().ai.testVisionConnection(),
      );
      setVisionResult(result);
      setMessage(result.userMessage ?? (result.ok ? 'OK' : 'Ошибка'));
      setBusy(result.ok ? 'ok' : 'error');
      if (!result.ok) {
        setError(result.userMessage ?? result.error ?? 'Vision-тест не прошёл');
      }
      await reload();
    } catch (err) {
      setBusy('error');
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAiWaitLabel(null);
    }
  }

  if (!config) {
    return (
      <div className="dashboard-ai">
        <h2>Настройки ИИ · ArionHub</h2>
        <p className="lede">{error ?? 'Загрузка…'}</p>
      </div>
    );
  }

  return (
    <div className="dashboard-ai">
      {aiWaitLabel ? <AiWaiting label={aiWaitLabel} sticky /> : null}
      <h2>Настройки ИИ · ArionHub</h2>
      <p className="lede">
        OpenAI-compatible gateway. Base URL по умолчанию уже задан. Создайте API-ключ на
        ArionHub, вставьте ниже и проверьте текст и vision.
      </p>

      <div className="card-lite" style={{ marginBottom: 16 }}>
        <p>
          Документация:{' '}
          <a
            href="https://arionhub.pro/docs?section=quick-start"
            target="_blank"
            rel="noreferrer"
          >
            arionhub.pro/docs (quick-start)
          </a>
        </p>
        <p className="muted">
          Ключ: Log in → API Keys → Create. Формат <code>sk-...</code>. Один ключ — для всех
          моделей.
        </p>
      </div>

      <form className="form-grid" onSubmit={(e) => void onSave(e)}>
        <label>
          Provider
          <input value="ArionHub" disabled />
        </label>
        <label>
          Base URL
          <input
            value={config.baseUrl}
            onChange={(e) => setConfig({ ...config, baseUrl: e.target.value })}
          />
        </label>
        <label>
          API key {config.hasApiKey ? `(сохранён: ${config.apiKeyMasked})` : '(не задан)'}
          <input
            type="password"
            autoComplete="off"
            placeholder={config.hasApiKey ? 'Оставьте пустым, чтобы не менять' : 'sk-...'}
            value={apiKeyDraft}
            onChange={(e) => setApiKeyDraft(e.target.value)}
          />
        </label>
        <label>
          Primary model
          <input
            list="model-list"
            value={config.primaryModel}
            onChange={(e) => setConfig({ ...config, primaryModel: e.target.value })}
          />
          <datalist id="model-list">
            {models.map((m) => (
              <option key={m.id} value={m.id} />
            ))}
          </datalist>
        </label>
        <label>
          Fallback model
          <input
            list="model-list"
            value={config.fallbackModel ?? ''}
            onChange={(e) => setConfig({ ...config, fallbackModel: e.target.value })}
          />
        </label>
        <label>
          Timeout (ms)
          <input
            type="number"
            value={config.timeoutMs}
            onChange={(e) =>
              setConfig({ ...config, timeoutMs: Number(e.target.value) || 60000 })
            }
          />
        </label>
        <label>
          Max retries
          <input
            type="number"
            value={config.maxRetries}
            onChange={(e) =>
              setConfig({ ...config, maxRetries: Number(e.target.value) || 0 })
            }
          />
        </label>
        <label>
          Max output tokens
          <input
            type="number"
            value={config.maxOutputTokens}
            onChange={(e) =>
              setConfig({ ...config, maxOutputTokens: Number(e.target.value) || 1024 })
            }
          />
        </label>
        <label>
          Temperature
          <input
            type="number"
            step="0.1"
            value={config.temperature}
            onChange={(e) =>
              setConfig({ ...config, temperature: Number(e.target.value) || 0 })
            }
          />
        </label>
        <label>
          JSON mode
          <select
            value={config.responseFormatMode}
            onChange={(e) =>
              setConfig({
                ...config,
                responseFormatMode: e.target.value as AiConfig['responseFormatMode'],
              })
            }
          >
            <option value="json-object">response_format json_object</option>
            <option value="prompt-json">только prompt + Zod</option>
          </select>
        </label>
        <label>
          Image detail
          <select
            value={config.imageDetail}
            onChange={(e) =>
              setConfig({
                ...config,
                imageDetail: e.target.value as AiConfig['imageDetail'],
              })
            }
          >
            <option value="low">low</option>
            <option value="auto">auto</option>
            <option value="high">high</option>
          </select>
        </label>
        <p className="full muted" style={{ marginTop: -8 }}>
          Live evaluate всегда шлёт candidate-фото с detail=low и режет число кадров лимитом
          «Фото в ИИ» на странице Устройство.
        </p>
        <label className="checkbox-inline">
          <input
            type="checkbox"
            checked={config.fallbackEnabled}
            onChange={(e) => setConfig({ ...config, fallbackEnabled: e.target.checked })}
          />
          Fallback model enabled
        </label>
        <label className="checkbox-inline">
          <input
            type="checkbox"
            checked={config.jsonRepairEnabled}
            onChange={(e) => setConfig({ ...config, jsonRepairEnabled: e.target.checked })}
          />
          JSON repair enabled
        </label>

        <div className="btn-row">
          <button type="submit" className="btn btn--primary" disabled={busy === 'loading'}>
            Сохранить
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy === 'loading'}
            onClick={() => void onClearKey()}
          >
            Удалить ключ
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy === 'loading'}
            onClick={() => void onListModels()}
          >
            Загрузить модели
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy === 'loading'}
            onClick={() => void onTestText()}
          >
            Проверить текст
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy === 'loading'}
            onClick={() => void onTestVision()}
          >
            Проверить vision
          </button>
        </div>
      </form>

      {message && <p className="ok-msg">{message}</p>}
      {error && <p className="error">{error}</p>}

      <div className="grid" style={{ marginTop: 16 }}>
        <article className="stat">
          <h2>Capabilities</h2>
          <p>text: {capabilities?.text ?? 'unknown'}</p>
          <p>vision: {capabilities?.vision ?? 'unknown'}</p>
          <p>json: {capabilities?.jsonObject ?? 'unknown'}</p>
          <p className="muted">{capabilities?.testedAt ?? 'ещё не тестировали'}</p>
        </article>
        <article className="stat">
          <h2>Text test</h2>
          <p>{textResult ? (textResult.ok ? 'OK' : 'FAIL') : '—'}</p>
          <p className="muted">{textResult?.contentPreview ?? ''}</p>
          <p className="muted">
            {textResult ? `${textResult.latencyMs} ms` : ''}
          </p>
        </article>
        <article className="stat">
          <h2>Vision test</h2>
          <p>{visionResult ? (visionResult.ok ? 'OK' : 'FAIL') : '—'}</p>
          <p className="muted">{visionResult?.contentPreview ?? ''}</p>
          <p className="muted">
            {visionResult ? `${visionResult.latencyMs} ms` : ''}
          </p>
        </article>
      </div>

      {models.length > 0 && (
        <div className="card-lite" style={{ marginTop: 16 }}>
          <h2>Модели ({models.length})</h2>
          <ul className="model-list">
            {models.slice(0, 80).map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  className="linkish"
                  onClick={() => setConfig({ ...config, primaryModel: m.id })}
                >
                  {m.id}
                </button>
                {m.ownedBy ? <span className="muted"> · {m.ownedBy}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
