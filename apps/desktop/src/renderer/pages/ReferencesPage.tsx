import { withAiWork } from '../shared/aiWork';
import { getDesktopApi } from '../shared/desktopApi';
import { AiWaiting } from '../shared/AiWaiting';
import { useCallback, useEffect, useState } from 'react';
import type {
  PreferenceSummary,
  ReferenceImage,
  ReferencePolarity,
  StoredPreferenceSummary,
} from '@twinby/contracts';

const EMPTY_SUMMARY: PreferenceSummary = {
  positiveVisualPatterns: [],
  negativeVisualPatterns: [],
  positivePresentationPatterns: [],
  negativePresentationPatterns: [],
  lifestylePreferences: [],
  bioPreferences: [],
  hardRejects: [],
  uncertainties: [],
};

function linesToList(text: string): string[] {
  // Keep spaces and empty lines while typing; normalize only on save.
  return text.replace(/\r\n/g, '\n').split('\n');
}

function listToLines(items: string[]): string {
  return items.join('\n');
}

function normalizeSummary(summary: PreferenceSummary): PreferenceSummary {
  const clean = (items: string[]) =>
    items.map((line) => line.trim()).filter(Boolean);
  return {
    positiveVisualPatterns: clean(summary.positiveVisualPatterns),
    negativeVisualPatterns: clean(summary.negativeVisualPatterns),
    positivePresentationPatterns: clean(summary.positivePresentationPatterns),
    negativePresentationPatterns: clean(summary.negativePresentationPatterns),
    lifestylePreferences: clean(summary.lifestylePreferences),
    bioPreferences: clean(summary.bioPreferences),
    hardRejects: clean(summary.hardRejects),
    uncertainties: clean(summary.uncertainties),
  };
}

/** References block — embedded under Preferences (or as a standalone page). */
export function ReferencesSection() {
  const [refs, setRefs] = useState<ReferenceImage[]>([]);
  const [summary, setSummary] = useState<StoredPreferenceSummary | null>(null);
  const [draft, setDraft] = useState<PreferenceSummary>(EMPTY_SUMMARY);
  const [polarity, setPolarity] = useState<ReferencePolarity>('positive');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const [nextRefs, nextSummary] = await Promise.all([
      getDesktopApi().preferences.listReferences(),
      getDesktopApi().preferences.getSummary(),
    ]);
    setRefs(nextRefs);
    setSummary(nextSummary);
    if (nextSummary) {
      setDraft(nextSummary.summary);
    }
  }, []);

  useEffect(() => {
    void reload().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : String(err));
    });
  }, [reload]);

  async function onAdd() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const added = await getDesktopApi().preferences.addReference({
        polarity,
        comment: comment.trim() || undefined,
      });
      setComment('');
      await reload();
      const count = added.length;
      setMessage(
        count === 1
          ? 'Фото добавлено. Summary устарел — нажмите «Проанализировать референсы».'
          : `Добавлено фото: ${count}. Summary устарел — нажмите «Проанализировать референсы».`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onRemove(id: string) {
    setBusy(true);
    setError(null);
    try {
      await getDesktopApi().preferences.removeReference(id);
      await reload();
      setMessage('Референс удалён. При необходимости перезапустите анализ.');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onAnalyze(force: boolean) {
    setBusy(true);
    setAnalyzing(true);
    setError(null);
    setMessage(null);
    try {
      const result = await withAiWork('Анализирую референсы…', () =>
        getDesktopApi().ai.analyzeReferences(force),
      );
      setSummary(result);
      setDraft(result.summary);
      setMessage(
        result.stale
          ? 'Анализ выполнен, но набор фото уже изменился.'
          : force
            ? `Повторный анализ готов (${result.latencyMs ?? '—'} ms)`
            : `Анализ сохранён. Дальше модель будет использовать текст summary, без повторной отправки этих фото (${result.latencyMs ?? '—'} ms)`,
      );
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      setAnalyzing(false);
    }
  }

  async function onSaveSummary() {
    setBusy(true);
    setError(null);
    try {
      const cleaned = normalizeSummary(draft);
      const saved = await getDesktopApi().preferences.saveSummary(cleaned);
      setSummary(saved);
      setDraft(saved.summary);
      setMessage('Summary сохранён вручную');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const positive = refs.filter((r) => r.polarity === 'positive');
  const negative = refs.filter((r) => r.polarity === 'negative');

  return (
    <div className="preferences-references">
      {analyzing ? (
        <AiWaiting
          sticky
          label={
            refs.length > 6
              ? `Нейронка обрабатывает запрос… смотрю все ${refs.length} фото пакетами`
              : 'Нейронка обрабатывает запрос… анализирую референсы'
          }
        />
      ) : null}
      <p className="lede lede--full">
        Загрузите примеры «нравится» и «не нравится» — можно выбрать сколько угодно фото за
        раз. Анализ идёт пакетами и склеивает summary; при оценке анкет фото референсов
        повторно не отправляются.
      </p>

      <div className="card-lite" style={{ marginBottom: 16 }}>
        <div className="btn-row" style={{ marginTop: 0 }}>
          <label>
            Полярность
            <select
              value={polarity}
              onChange={(e) => setPolarity(e.target.value as ReferencePolarity)}
            >
              <option value="positive">Нравится (+)</option>
              <option value="negative">Не нравится (−)</option>
            </select>
          </label>
          <label className="full" style={{ flex: 1, minWidth: 200 }}>
            Комментарий (опционально)
            <input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Почему это хороший/плохой пример"
            />
          </label>
        </div>
        <div className="btn-row">
          <button type="button" className="btn btn--primary" disabled={busy} onClick={() => void onAdd()}>
            Добавить фото
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy || refs.length === 0}
            onClick={() => void onAnalyze(false)}
          >
            Проанализировать референсы
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy || refs.length === 0}
            onClick={() => void onAnalyze(true)}
          >
            Переанализировать принудительно
          </button>
        </div>
        {summary && (
          <p className="muted" style={{ marginTop: 10 }}>
            Summary: {summary.stale ? 'устарел (набор фото изменился)' : 'актуален'} ·{' '}
            {summary.analyzedAt}
            {summary.model ? ` · ${summary.model}` : ''}
          </p>
        )}
      </div>

      {message && <p className="ok-msg">{message}</p>}
      {error && <p className="error">{error}</p>}

      <div className="grid">
        <div>
          <h2>Нравится ({positive.length})</h2>
          <div className="ref-grid">
            {positive.map((ref) => (
              <article key={ref.id} className="ref-card">
                {ref.thumbnailDataUrl ? (
                  <img src={ref.thumbnailDataUrl} alt="" />
                ) : (
                  <div className="ref-card__empty">нет превью</div>
                )}
                <p className="muted">{ref.comment || 'без комментария'}</p>
                <button type="button" className="btn" disabled={busy} onClick={() => void onRemove(ref.id)}>
                  Удалить
                </button>
              </article>
            ))}
          </div>
        </div>
        <div>
          <h2>Не нравится ({negative.length})</h2>
          <div className="ref-grid">
            {negative.map((ref) => (
              <article key={ref.id} className="ref-card">
                {ref.thumbnailDataUrl ? (
                  <img src={ref.thumbnailDataUrl} alt="" />
                ) : (
                  <div className="ref-card__empty">нет превью</div>
                )}
                <p className="muted">{ref.comment || 'без комментария'}</p>
                <button type="button" className="btn" disabled={busy} onClick={() => void onRemove(ref.id)}>
                  Удалить
                </button>
              </article>
            ))}
          </div>
        </div>
      </div>

      <div className="card-lite" style={{ marginTop: 16 }}>
        <h2>AI Summary (можно править)</h2>
        <p className="muted">
          Этот текст сохранится и будет использоваться вместо повторной отправки референс-фото.
        </p>
        <div className="form-grid">
          {(
            [
              ['positiveVisualPatterns', '+ Визуальные паттерны'],
              ['negativeVisualPatterns', '− Визуальные паттерны'],
              ['positivePresentationPatterns', '+ Подача'],
              ['negativePresentationPatterns', '− Подача'],
              ['lifestylePreferences', 'Lifestyle'],
              ['bioPreferences', 'Bio'],
              ['hardRejects', 'Hard rejects'],
              ['uncertainties', 'Неясности'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="full">
              {label} (по строке)
              <textarea
                rows={3}
                value={listToLines(draft[key] ?? [])}
                onChange={(e) =>
                  setDraft({ ...draft, [key]: linesToList(e.target.value) })
                }
              />
            </label>
          ))}
          <div className="btn-row">
            <button type="button" className="btn btn--primary" disabled={busy} onClick={() => void onSaveSummary()}>
              Сохранить summary
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
