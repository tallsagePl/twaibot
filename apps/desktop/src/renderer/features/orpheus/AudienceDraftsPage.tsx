import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { AudienceModelView } from '@twinby/contracts';
import { AudienceSkillGroups } from '../../shared/AudienceSkillGroups';
import { ArrowLeftIcon } from '../../shared/ArrowIcons';
import { countAudienceSkills, skillsFromAudienceView } from '../../shared/audienceSkills';
import { getDesktopApi } from '../../shared/desktopApi';
import { TrashIcon } from '../../shared/TrashIcon';

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ru-RU');
  } catch {
    return iso;
  }
}

export function AudienceDraftsPage() {
  const navigate = useNavigate();
  const [versions, setVersions] = useState<AudienceModelView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AudienceModelView | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const list = await getDesktopApi().audience.listVersions();
    setVersions(list);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        await reload();
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
  }, [reload]);

  async function confirmDelete() {
    if (!deleteTarget) return;
    setBusyId(deleteTarget.id);
    setError(null);
    try {
      await getDesktopApi().audience.deleteVersion(deleteTarget.id);
      setDeleteTarget(null);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  async function loadVersion(v: AudienceModelView) {
    setBusyId(v.id);
    setError(null);
    try {
      await getDesktopApi().audience.activateVersion(v.id);
      navigate('/orpheus');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusyId(null);
    }
  }

  return (
    <div className="page">
      <header className="page__header page__header--row">
        <div>
          <h1>Черновики Audience</h1>
          <p className="muted">Все сохранённые версии целевой аудитории.</p>
        </div>
        <Link to="/orpheus" className="btn btn--with-icon">
          <ArrowLeftIcon size={16} />
          К Orpheus
        </Link>
      </header>

      {error ? <p className="error">{error}</p> : null}

      {versions.length === 0 ? (
        <p className="muted">Версий пока нет.</p>
      ) : (
        <ul className="draft-list">
          {versions.map((v) => {
            const isCurrent = !v.supersededAt;
            const signalCount = countAudienceSkills(skillsFromAudienceView(v));
            const status = v.supersededAt
              ? 'заменена'
              : v.source === 'user-confirmed'
                ? 'подтверждена'
                : 'черновик';
            const busy = busyId === v.id;
            return (
              <li key={v.id} className="draft-card">
                <div className="draft-card__head">
                  <div>
                    <strong>
                      {v.codeName?.trim() ? `${v.codeName.trim()} · ` : ''}
                      Версия {v.version}
                    </strong>
                    <p className="muted draft-card__meta">
                      создана {formatWhen(v.createdAt)}
                      {v.supersededAt
                        ? ` · заменена ${formatWhen(v.supersededAt)}`
                        : ''}
                      {' · '}
                      сигналов: {signalCount}
                    </p>
                  </div>
                  <div className="draft-card__head-actions">
                    <div className="draft-status-row">
                      {isCurrent ? (
                        <span className="draft-badge draft-badge--current">текущая</span>
                      ) : null}
                      <span
                        className={[
                          'draft-badge',
                          status === 'подтверждена'
                            ? 'draft-badge--confirmed'
                            : status === 'заменена'
                              ? 'draft-badge--superseded'
                              : 'draft-badge--draft',
                        ].join(' ')}
                      >
                        {status}
                      </span>
                    </div>
                    {!isCurrent ? (
                      <button
                        type="button"
                        className="btn btn--go draft-card__load"
                        title="Загрузить и подтвердить"
                        aria-label={`Загрузить версию Audience ${v.version}`}
                        disabled={busyId !== null}
                        onClick={() => void loadVersion(v)}
                      >
                        {busy ? '…' : 'Загрузить'}
                      </button>
                    ) : null}
                    {versions.length > 1 ? (
                      <button
                        type="button"
                        className="draft-card__trash draft-card__trash--danger"
                        title="Удалить версию"
                        aria-label={`Удалить версию Audience ${v.version}`}
                        disabled={busyId !== null}
                        onClick={() => setDeleteTarget(v)}
                      >
                        <TrashIcon />
                      </button>
                    ) : null}
                  </div>
                </div>
                {v.summary?.trim() ? (
                  <p className="draft-card__summary">{v.summary}</p>
                ) : (
                  <p className="muted">Описание пустое.</p>
                )}
                <AudienceSkillGroups audience={v} />
              </li>
            );
          })}
        </ul>
      )}

      {deleteTarget ? (
        <div
          className="history-modal-backdrop"
          role="presentation"
          onClick={() => {
            if (!busyId) setDeleteTarget(null);
          }}
        >
          <div
            className="history-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="audience-delete-title"
            onClick={(event) => event.stopPropagation()}
          >
            <p id="audience-delete-title" className="history-modal__text">
              Ты уверен, что хочешь удалить этот черновик Audience?
            </p>
            <p className="muted history-modal__meta">
              Версия {deleteTarget.version} · {formatWhen(deleteTarget.createdAt)}
            </p>
            <div className="history-modal__actions">
              <button
                type="button"
                className="btn history-modal__btn history-modal__btn--no"
                disabled={busyId !== null}
                onClick={() => setDeleteTarget(null)}
              >
                Нет
              </button>
              <button
                type="button"
                className="btn btn--stop history-modal__btn"
                disabled={busyId !== null}
                onClick={() => void confirmDelete()}
              >
                Да, согласен
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
