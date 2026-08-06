import { getDesktopApi } from '../shared/desktopApi';
import {
  SignalCheckIcon,
  SignalMinusIcon,
  SignalPlusIcon,
  SignalStopIcon,
} from '../shared/SignalIcons';
import { SignalScale } from '../shared/SignalScale';
import { TagListEditor } from '../shared/TagListEditor';
import { useEffect, useState, type FormEvent } from 'react';
import type { PreferenceProfile } from '@twinby/contracts';
import { ReferencesSection } from './ReferencesPage';

type PreferencesTab = 'preferences' | 'references';

const TABS: { id: PreferencesTab; label: string }[] = [
  { id: 'preferences', label: 'Предпочтения' },
  { id: 'references', label: 'Референсы' },
];

export function PreferencesPage() {
  const [profile, setProfile] = useState<PreferenceProfile | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<PreferencesTab>('preferences');

  useEffect(() => {
    void getDesktopApi().preferences
      .get()
      .then(setProfile)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  async function onSave(event: FormEvent) {
    event.preventDefault();
    if (!profile) {
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const saved = await getDesktopApi().preferences.save({
        name: profile.name,
        hardFilters: profile.hardFilters,
        narrative: profile.narrative,
        weights: profile.weights,
        thresholds: profile.thresholds,
      });
      setProfile(saved);
      setMessage('Предпочтения сохранены');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="page">
      <h1>Предпочтения</h1>

      <div className="settings-tabs" role="radiogroup" aria-label="Раздел предпочтений">
        {TABS.map((item) => (
          <label
            key={item.id}
            className={`settings-tabs__item ${
              tab === item.id ? 'settings-tabs__item--active' : ''
            }`}
          >
            <input
              type="radio"
              name="preferences-tab"
              value={item.id}
              checked={tab === item.id}
              onChange={() => setTab(item.id)}
            />
            <span>{item.label}</span>
          </label>
        ))}
      </div>

      {tab === 'references' ? (
        <div className="settings-panel">
          <ReferencesSection />
        </div>
      ) : null}

      {tab === 'preferences' && !profile ? (
        <p className="lede">{error ?? 'Загрузка…'}</p>
      ) : null}

      {tab === 'preferences' && profile ? (
        <div className="settings-panel">
      <p className="lede lede--full">
        Опишите, кто вам нравится. Эти тексты уходят в модель вместе с фото анкеты. Hard
        filters применяются локально до AI, когда данные считаны достоверно.
      </p>

      <form className="form-grid" onSubmit={(e) => void onSave(e)}>
        <label>
          Название профиля
          <input
            value={profile.name}
            onChange={(e) => setProfile({ ...profile, name: e.target.value })}
          />
        </label>

        <div className="full">
          <SignalScale>
            <div className="signal-group">
              <TagListEditor
                label="Что особенно важно"
                hint="Ядро вкуса — без этих сигналов выбор уже не тот."
                tags={profile.narrative.importantSkills}
                placeholder="Например: возраст до 24"
                icon={<SignalCheckIcon />}
                iconClassName="signal-icon--important"
                chipClassName="tag-chip--important"
                disabled={busy}
                onChange={(importantSkills) =>
                  setProfile({
                    ...profile,
                    narrative: { ...profile.narrative, importantSkills },
                  })
                }
              />
              <label>
                Дополнительно текстом
                <textarea
                  rows={3}
                  value={profile.narrative.priorities}
                  placeholder="Приоритеты своими словами…"
                  onChange={(e) =>
                    setProfile({
                      ...profile,
                      narrative: {
                        ...profile.narrative,
                        priorities: e.target.value,
                      },
                    })
                  }
                />
              </label>
            </div>

            <div className="signal-group">
              <TagListEditor
                label="Кто нравится"
                hint="Короткие метки желаемого типажа. Enter или «Добавить»."
                tags={profile.narrative.likedSkills}
                placeholder="Например: хрупкое лицо"
                icon={<SignalPlusIcon />}
                iconClassName="signal-icon--like"
                chipClassName="tag-chip--like"
                disabled={busy}
                onChange={(likedSkills) =>
                  setProfile({
                    ...profile,
                    narrative: { ...profile.narrative, likedSkills },
                  })
                }
              />
              <label>
                Дополнительно текстом
                <textarea
                  rows={3}
                  value={profile.narrative.likedDescription}
                  placeholder="Развёрнуто: примеры, нюансы, сравнения…"
                  onChange={(e) =>
                    setProfile({
                      ...profile,
                      narrative: {
                        ...profile.narrative,
                        likedDescription: e.target.value,
                      },
                    })
                  }
                />
              </label>
            </div>

            <div className="signal-group">
              <TagListEditor
                label="Кто не нравится"
                hint="Мягкие минусы — лучше избегать, но ещё не стоп."
                tags={profile.narrative.dislikedSkills}
                placeholder="Например: глянец"
                icon={<SignalMinusIcon />}
                iconClassName="signal-icon--neg"
                chipClassName="tag-chip--neg"
                disabled={busy}
                onChange={(dislikedSkills) =>
                  setProfile({
                    ...profile,
                    narrative: { ...profile.narrative, dislikedSkills },
                  })
                }
              />
              <label>
                Дополнительно текстом
                <textarea
                  rows={3}
                  value={profile.narrative.dislikedDescription}
                  placeholder="Развёрнуто: что отталкивает и почему…"
                  onChange={(e) =>
                    setProfile({
                      ...profile,
                      narrative: {
                        ...profile.narrative,
                        dislikedDescription: e.target.value,
                      },
                    })
                  }
                />
              </label>
            </div>

            <div className="signal-group">
              <TagListEditor
                label="Стоп-сигналы"
                hint="Жёсткие veto — при таком сигнале не выбираем."
                tags={profile.narrative.stopSkills}
                placeholder="Например: уже мама"
                icon={<SignalStopIcon />}
                iconClassName="signal-icon--hard"
                chipClassName="tag-chip--hard"
                disabled={busy}
                onChange={(stopSkills) =>
                  setProfile({
                    ...profile,
                    narrative: { ...profile.narrative, stopSkills },
                  })
                }
              />
              <label>
                Дополнительно текстом
                <textarea
                  rows={3}
                  value={profile.narrative.hardRejects}
                  placeholder="Уточнения по стоп-критериям…"
                  onChange={(e) =>
                    setProfile({
                      ...profile,
                      narrative: {
                        ...profile.narrative,
                        hardRejects: e.target.value,
                      },
                    })
                  }
                />
              </label>
            </div>
          </SignalScale>
        </div>

        <label className="full">
          Как действовать при сомнении
          <textarea
            rows={2}
            value={profile.narrative.uncertaintyPolicy}
            onChange={(e) =>
              setProfile({
                ...profile,
                narrative: { ...profile.narrative, uncertaintyPolicy: e.target.value },
              })
            }
          />
        </label>

        <label>
          Мин. возраст
          <input
            type="number"
            value={profile.hardFilters.minAge ?? ''}
            onChange={(e) =>
              setProfile({
                ...profile,
                hardFilters: {
                  ...profile.hardFilters,
                  minAge: e.target.value ? Number(e.target.value) : undefined,
                },
              })
            }
          />
        </label>
        <label>
          Макс. возраст
          <input
            type="number"
            value={profile.hardFilters.maxAge ?? ''}
            onChange={(e) =>
              setProfile({
                ...profile,
                hardFilters: {
                  ...profile.hardFilters,
                  maxAge: e.target.value ? Number(e.target.value) : undefined,
                },
              })
            }
          />
        </label>
        <label>
          Макс. дистанция (км)
          <input
            type="number"
            value={profile.hardFilters.maxDistanceKm ?? ''}
            onChange={(e) =>
              setProfile({
                ...profile,
                hardFilters: {
                  ...profile.hardFilters,
                  maxDistanceKm: e.target.value ? Number(e.target.value) : undefined,
                },
              })
            }
          />
        </label>
        <label>
          Мин. совместимость %
          <input
            type="number"
            value={profile.hardFilters.minCompatibilityPercent ?? ''}
            onChange={(e) =>
              setProfile({
                ...profile,
                hardFilters: {
                  ...profile.hardFilters,
                  minCompatibilityPercent: e.target.value
                    ? Number(e.target.value)
                    : undefined,
                },
              })
            }
          />
        </label>
        <label className="checkbox-inline">
          <input
            type="checkbox"
            checked={profile.hardFilters.requireBio}
            onChange={(e) =>
              setProfile({
                ...profile,
                hardFilters: { ...profile.hardFilters, requireBio: e.target.checked },
              })
            }
          />
          Требовать описание
        </label>

        <label>
          Порог like
          <input
            type="number"
            value={profile.thresholds.likeScore}
            onChange={(e) =>
              setProfile({
                ...profile,
                thresholds: {
                  ...profile.thresholds,
                  likeScore: Number(e.target.value) || 0,
                },
              })
            }
          />
        </label>
        <label>
          Порог dislike
          <input
            type="number"
            value={profile.thresholds.dislikeScore}
            onChange={(e) =>
              setProfile({
                ...profile,
                thresholds: {
                  ...profile.thresholds,
                  dislikeScore: Number(e.target.value) || 0,
                },
              })
            }
          />
        </label>
        <label>
          Мин. confidence
          <input
            type="number"
            step="0.05"
            value={profile.thresholds.minConfidence}
            onChange={(e) =>
              setProfile({
                ...profile,
                thresholds: {
                  ...profile.thresholds,
                  minConfidence: Number(e.target.value) || 0,
                },
              })
            }
          />
        </label>
        <label>
          Auto-like score
          <input
            type="number"
            value={profile.thresholds.autoLikeScore}
            onChange={(e) =>
              setProfile({
                ...profile,
                thresholds: {
                  ...profile.thresholds,
                  autoLikeScore: Number(e.target.value) || 0,
                },
              })
            }
          />
        </label>
        <label>
          Auto-dislike score
          <input
            type="number"
            value={profile.thresholds.autoDislikeScore}
            onChange={(e) =>
              setProfile({
                ...profile,
                thresholds: {
                  ...profile.thresholds,
                  autoDislikeScore: Number(e.target.value) || 0,
                },
              })
            }
          />
        </label>

        <div className="btn-row">
          <button type="submit" className="btn btn--primary" disabled={busy}>
            {busy ? 'Сохранение…' : 'Сохранить предпочтения'}
          </button>
        </div>
      </form>

      {message && <p className="ok-msg">{message}</p>}
      {error && <p className="error">{error}</p>}
      <p className="muted">Версия профиля: {profile.version}</p>
        </div>
      ) : null}
    </section>
  );
}
