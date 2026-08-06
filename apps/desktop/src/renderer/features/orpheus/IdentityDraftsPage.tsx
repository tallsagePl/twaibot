import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { IdentityModelView } from '@twinby/contracts';
import { ArrowLeftIcon } from '../../shared/ArrowIcons';
import { getDesktopApi } from '../../shared/desktopApi';
import { SignalMinusIcon, SignalPlusIcon } from '../../shared/SignalIcons';
import { TrashIcon } from '../../shared/TrashIcon';

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ru-RU');
  } catch {
    return iso;
  }
}

export function IdentityDraftsPage() {
  const navigate = useNavigate();
  const [versions, setVersions] = useState<IdentityModelView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<IdentityModelView | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const list = await getDesktopApi().identity.listVersions();
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
      await getDesktopApi().identity.deleteVersion(deleteTarget.id);
      setDeleteTarget(null);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  async function loadVersion(v: IdentityModelView) {
    setBusyId(v.id);
    setError(null);
    try {
      await getDesktopApi().identity.activateVersion(v.id);
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
          <h1>Черновики Identity</h1>
          <p className="muted">Все сохранённые версии модели личности.</p>
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
            const status = v.supersededAt
              ? 'заменена'
              : v.userConfirmedAt
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
                      {v.userConfirmedAt
                        ? ` · подтверждена ${formatWhen(v.userConfirmedAt)}`
                        : ''}
                      {v.supersededAt
                        ? ` · заменена ${formatWhen(v.supersededAt)}`
                        : ''}
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
                        aria-label={`Загрузить версию Identity ${v.version}`}
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
                        aria-label={`Удалить версию Identity ${v.version}`}
                        disabled={busyId !== null}
                        onClick={() => setDeleteTarget(v)}
                      >
                        <TrashIcon />
                      </button>
                    ) : null}
                  </div>
                </div>
                <dl className="draft-card__fields">
                  <div>
                    <dt>Город</dt>
                    <dd>{v.city || '—'}</dd>
                  </div>
                  <div>
                    <dt>Занятие</dt>
                    <dd>{v.occupation || '—'}</dd>
                  </div>
                  <div>
                    <dt>Намерение</dt>
                    <dd>{v.relationshipIntent || '—'}</dd>
                  </div>
                </dl>
                {v.aiSummary ? (
                  <p className="draft-card__summary">{v.aiSummary}</p>
                ) : (
                  <p className="muted">Сочинение пустое.</p>
                )}
                {v.realInterests.length === 0 &&
                v.explicitNonIdentity.length === 0 ? (
                  <p className="muted">Интересы и «кто не я» не заданы.</p>
                ) : (
                  <div className="draft-skill-groups">
                    {v.realInterests.length > 0 ? (
                      <div className="signal-group">
                        <div className="signal-group__title">
                          <span className="signal-icon signal-icon--like">
                            <SignalPlusIcon />
                          </span>
                          Интересы
                          <span className="muted"> · {v.realInterests.length}</span>
                        </div>
                        <ul className="tag-chips">
                          {v.realInterests.map((s) => (
                            <li
                              key={`i-${s.id}`}
                              className="tag-chip tag-chip--like"
                            >
                              <span className="signal-icon signal-icon--chip signal-icon--like">
                                <SignalPlusIcon />
                              </span>
                              <span>{s.statement}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {v.explicitNonIdentity.length > 0 ? (
                      <div className="signal-group">
                        <div className="signal-group__title">
                          <span className="signal-icon signal-icon--neg">
                            <SignalMinusIcon />
                          </span>
                          Кто не я
                          <span className="muted">
                            {' '}
                            · {v.explicitNonIdentity.length}
                          </span>
                        </div>
                        <ul className="tag-chips">
                          {v.explicitNonIdentity.map((s) => (
                            <li
                              key={`n-${s.id}`}
                              className="tag-chip tag-chip--neg"
                            >
                              <span className="signal-icon signal-icon--chip signal-icon--neg">
                                <SignalMinusIcon />
                              </span>
                              <span>{s.statement}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                )}
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
            aria-labelledby="identity-delete-title"
            onClick={(event) => event.stopPropagation()}
          >
            <p id="identity-delete-title" className="history-modal__text">
              Ты уверен, что хочешь удалить этот черновик Identity?
            </p>
            <p className="muted history-modal__meta">
              Версия {deleteTarget.version}
              {deleteTarget.userConfirmedAt ? ' · подтверждена' : ''} ·{' '}
              {formatWhen(deleteTarget.createdAt)}
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
