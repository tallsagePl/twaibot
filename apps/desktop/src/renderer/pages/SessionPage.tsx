import { useCallback, useEffect, useState } from 'react';
import type {
  AndroidDevice,
  SessionMode,
  SessionViewState,
  SwipeDecision,
} from '@twinby/contracts';
import { useUiStore } from '../app/store';
import { AiWaiting } from '../shared/AiWaiting';
import { getDesktopApi } from '../shared/desktopApi';

function formatElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function sessionElapsedMs(state: SessionViewState | null, now: number): number {
  if (!state?.startedAt) {
    return 0;
  }
  const start = new Date(state.startedAt).getTime();
  const end = state.stoppedAt ? new Date(state.stoppedAt).getTime() : now;
  return Math.max(0, end - start);
}

const STATUS_LABEL: Record<string, string> = {
  idle: 'Ожидание',
  'validating-environment': 'Проверка окружения',
  'starting-appium': 'Старт Appium',
  connecting: 'Подключение',
  'opening-twinby': 'Открытие Twinby',
  ready: 'Готово',
  'capturing-profile': 'Чтение анкеты',
  evaluating: 'Анализ ИИ…',
  'awaiting-review': 'Нужно ваше решение',
  'executing-action': 'Выполнение действия',
  recovering: 'Восстановление',
  cooldown: 'Пауза между анкетами',
  paused: 'На паузе',
  stopping: 'Остановка…',
  stopped: 'Остановлено',
  error: 'Ошибка',
};

const DECISION_LABEL: Record<SwipeDecision, string> = {
  like: 'Лайк',
  dislike: 'Дизлайк',
  review: 'На проверку',
};

export function SessionPage() {
  const udid = useUiStore((s) => s.selectedUdid);
  const setUdid = useUiStore((s) => s.setSelectedUdid);
  const mode = useUiStore((s) => s.selectedSessionMode);
  const setMode = useUiStore((s) => s.setSelectedSessionMode);
  const [state, setState] = useState<SessionViewState | null>(null);
  const [devices, setDevices] = useState<AndroidDevice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [comment, setComment] = useState('');
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    try {
      const [next, nextDevices] = await Promise.all([
        getDesktopApi().sessions.getState(),
        getDesktopApi().environment.listDevices(),
      ]);
      setState(next);
      setDevices(nextDevices);
      if (!udid) {
        const online = nextDevices.filter((d) => d.state === 'device');
        const preferred =
          online.find((d) => d.udid === '127.0.0.1:5555') ??
          online.find((d) => d.udid.startsWith('127.0.0.1:')) ??
          online[0];
        if (preferred) {
          setUdid(preferred.udid);
        }
      }
      setError(next.errorMessage ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [setUdid, udid]);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => {
      void refresh();
    }, 700);
    return () => window.clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    if (!state?.startedAt) {
      return;
    }
    setNow(Date.now());
    if (state.stoppedAt) {
      return;
    }
    const id = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => window.clearInterval(id);
  }, [state?.startedAt, state?.stoppedAt]);

  async function run(action: () => Promise<SessionViewState>) {
    setBusy(true);
    setError(null);
    try {
      const next = await action();
      setState(next);
      setComment('');
      setError(next.errorMessage ?? null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      // Keep polling from immediately overwriting a just-failed action
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  const current = state?.current;
  const canActOnProfile =
    Boolean(current) &&
    (state?.status === 'awaiting-review' || state?.status === 'error');
  const isLive = state?.source === 'live';
  const canConfirmRecommendation =
    current?.finalDecision === 'like' || current?.finalDecision === 'dislike';

  return (
    <section className="page">
      <h1>Сессия</h1>

      {error && state?.status === 'error' && !current ? (
        <p className="error">{error}</p>
      ) : null}
      {error && state?.status === 'error' && current ? (
        <p className="muted" style={{ marginBottom: 8 }}>
          Сбой ИИ не блокирует решение — нажмите Лайк или Дизлайк ниже.
        </p>
      ) : null}

      <div className="card-lite form-grid" style={{ marginBottom: 12 }}>
        <label>
          Режим
          <select
            value={mode}
            disabled={isRunning(state)}
            onChange={(e) => setMode(e.target.value as SessionMode)}
          >
            <option value="recommendation-only">Рекомендации</option>
            <option value="auto-high-confidence">Авто</option>
          </select>
        </label>
        <label>
          UDID (для live)
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
      </div>

      {mode === 'auto-high-confidence' ? (
        <p className="error error--banner">
          Внимание: режим «Авто» нажимает лайк/дизлайк без подтверждения при высоких порогах.
          Сначала проверьте режим «Рекомендации».
        </p>
      ) : null}

      <div className="session-toolbar">
        <button
          type="button"
          className="btn"
          disabled={busy || isRunning(state)}
          onClick={() =>
            void run(() => getDesktopApi().sessions.start({ mode, source: 'mock' }))
          }
        >
          Mock
        </button>
        <button
          type="button"
          className="btn btn--go"
          disabled={busy || isRunning(state) || !udid}
          onClick={() =>
            void run(() =>
              getDesktopApi().sessions.start({
                mode,
                source: 'live',
                udid,
                appPackage: 'com.twinby',
              }),
            )
          }
        >
          Запуск
        </button>
        <button
          type="button"
          className="btn"
          disabled={
            busy ||
            !state ||
            !['awaiting-review', 'ready', 'cooldown'].includes(state.status)
          }
          onClick={() => void run(() => getDesktopApi().sessions.pause())}
        >
          Пауза
        </button>
        <button
          type="button"
          className="btn"
          disabled={busy || state?.status !== 'paused'}
          onClick={() => void run(() => getDesktopApi().sessions.resume())}
        >
          Продолжить
        </button>
        <button
          type="button"
          className="btn btn--primary"
          disabled={busy || state?.status !== 'error'}
          onClick={() => void run(() => getDesktopApi().sessions.resume())}
        >
          Повторить
        </button>
        <button
          type="button"
          className="btn btn--stop"
          disabled={!isRunning(state) && state?.status !== 'error'}
          onClick={() => void run(() => getDesktopApi().sessions.stop())}
        >
          Стоп
        </button>
      </div>

      {state?.status === 'error' ? (
        <p className="muted" style={{ marginBottom: 12 }}>
          Сессия не остановлена — нажмите «Повторить», чтобы продолжить со следующей анкеты.
        </p>
      ) : null}

      {state?.status === 'recovering' ? (
        <div className="card-lite" style={{ marginBottom: 12 }}>
          <p>Восстановление после сбоя — пробую снова…</p>
        </div>
      ) : null}

      {state ? (
        <div className="grid">
          <div className="stat">
            <p className="muted">Статус</p>
            <strong>{STATUS_LABEL[state.status] ?? state.status}</strong>
            <p className="muted">
              {state.source} · {state.mode}
            </p>
          </div>
          <div className="stat">
            <p className="muted">Просмотрено</p>
            <strong>
              {state.counters.viewed} / {state.totalProfiles}
            </strong>
            <p className="muted" style={{ marginTop: 8 }}>
              Время сессии
            </p>
            <strong>{formatElapsed(sessionElapsedMs(state, now))}</strong>
          </div>
          <div className="stat">
            <p className="muted">Лайки / дизлайки</p>
            <strong>
              {state.counters.likes} / {state.counters.dislikes}
            </strong>
            <p className="muted" style={{ marginTop: 8 }}>
              Ошибки
            </p>
            <strong>{state.counters.errors}</strong>
          </div>
        </div>
      ) : null}

      {state?.status === 'capturing-profile' ? (
        <div className="card-lite">
          <AiWaiting label="читаю анкету…" block />
        </div>
      ) : null}
      {state?.status === 'evaluating' || current?.evaluating ? (
        <div className="card-lite">
          <AiWaiting label="Нейронка обрабатывает запрос… решаю, что делать с анкетой" block />
        </div>
      ) : null}

      {current ? (
        <div className="session-card">
          <div className="session-card__photos">
            {current.photoDataUrls.map((url, index) => (
              <img key={`${current.captureId}-${index}`} src={url} alt={`Фото ${index + 1}`} />
            ))}
          </div>
          <div className="session-card__body">
            <h2>
              {current.displayName ?? current.fixtureId}
              {typeof current.age === 'number' ? `, ${current.age}` : ''}
            </h2>
            <p className="muted">
              {typeof current.distanceKm === 'number' ? `${current.distanceKm} км · ` : ''}
              {current.goal || 'цель не указана'}
            </p>
            <p>{current.bio?.trim() ? current.bio : 'Без описания'}</p>

            {current.finalDecision ? (
              <div className="card-lite session-decision">
                <p>
                  Рекомендация: <strong>{DECISION_LABEL[current.finalDecision]}</strong>
                  {current.autoEligible ? ' · auto eligible' : ''}
                </p>
                {typeof current.effectiveConfidence === 'number' ? (
                  <p className="muted">
                    effective {Math.round(current.effectiveConfidence * 100)}%
                    {typeof current.overallScore === 'number'
                      ? ` · score ${Math.round(current.overallScore)}`
                      : ''}
                  </p>
                ) : null}
                <ul className="reason-list">
                  {current.modelReasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {canActOnProfile ? (
              <div className="session-actions">
                {mode === 'recommendation-only' ? (
                  <label>
                    Комментарий к этой анкете
                    <textarea
                      rows={3}
                      placeholder="Почему like/dislike — нейронка учтёт это в следующих оценках"
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      disabled={busy}
                      maxLength={1000}
                    />
                  </label>
                ) : null}
                <div className="session-actions__row">
                  <button
                    type="button"
                    className="btn btn--primary"
                    disabled={busy || !canConfirmRecommendation}
                    onClick={() =>
                      void run(() =>
                        getDesktopApi().review.confirm({
                          captureId: current.captureId,
                          decision: current.finalDecision!,
                          comment: comment.trim() || undefined,
                          corrected: false,
                        }),
                      )
                    }
                  >
                    Подтвердить
                  </button>
                  <button
                    type="button"
                    className="btn btn--primary"
                    disabled={busy}
                    onClick={() =>
                      void run(() =>
                        getDesktopApi().review.confirm({
                          captureId: current.captureId,
                          decision: 'like',
                          comment: comment.trim() || undefined,
                          corrected: true,
                        }),
                      )
                    }
                  >
                    Лайк
                  </button>
                  <button
                    type="button"
                    className="btn btn--primary"
                    disabled={busy}
                    onClick={() =>
                      void run(() =>
                        getDesktopApi().review.confirm({
                          captureId: current.captureId,
                          decision: 'dislike',
                          comment: comment.trim() || undefined,
                          corrected: true,
                        }),
                      )
                    }
                  >
                    Дизлайк
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={busy}
                    onClick={() =>
                      void run(() => getDesktopApi().review.skip(current.captureId))
                    }
                  >
                    Пропустить{isLive ? ' (dislike)' : ''}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function isRunning(state: SessionViewState | null): boolean {
  if (!state) {
    return false;
  }
  return !['idle', 'stopped', 'error'].includes(state.status);
}
