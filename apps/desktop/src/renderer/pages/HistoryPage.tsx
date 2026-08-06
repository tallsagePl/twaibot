import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  HistoryFeedbackDecision,
  HistorySessionProfile,
  HistorySessionSummary,
  RelationshipStage,
  RelationshipView,
  SessionFeedbackAnalysis,
  VerifiedProfileSnapshotView,
} from '@twinby/contracts';
import { withAiWork } from '../shared/aiWork';
import { AiWaiting } from '../shared/AiWaiting';
import { getDesktopApi } from '../shared/desktopApi';

const RELATIONSHIP_STAGES: RelationshipStage[] = [
  'incoming-like',
  'matched',
  'conversation-started',
  'substantive-conversation',
  'telegram-exchanged',
  'date-proposed',
  'date-scheduled',
  'date-completed',
  'closed',
];

const PAGE_SIZE = 20;

const DECISION: Record<string, string> = {
  like: 'лайк',
  dislike: 'дизлайк',
  review: 'review',
  skip: 'пропуск',
  agree: 'согласен',
};

type HistoryTab = 'candidates' | 'profiles' | 'matches';

export function HistoryPage() {
  const [tab, setTab] = useState<HistoryTab>('candidates');
  const [sessions, setSessions] = useState<HistorySessionSummary[]>([]);
  const [snapshots, setSnapshots] = useState<VerifiedProfileSnapshotView[]>([]);
  const [relationships, setRelationships] = useState<RelationshipView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<HistorySessionProfile[]>([]);
  const [profilesTotal, setProfilesTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [busy, setBusy] = useState(false);
  const [processingFeedback, setProcessingFeedback] = useState(false);
  const [applyingFeedback, setApplyingFeedback] = useState(false);
  const [analysis, setAnalysis] = useState<SessionFeedbackAnalysis | null>(null);
  /** review = agree/rethink; revise = extra note + rethink */
  const [analysisPhase, setAnalysisPhase] = useState<'review' | 'revise'>('review');
  const [revisionNote, setRevisionNote] = useState('');
  const [drafts, setDrafts] = useState<
    Record<string, { decision?: HistoryFeedbackDecision; comment: string }>
  >({});
  const [deleteTarget, setDeleteTarget] = useState<HistorySessionSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [expandedProfiles, setExpandedProfiles] = useState<Record<string, boolean>>({});
  const sessionBodyRef = useRef<HTMLDivElement | null>(null);

  const refreshSessions = useCallback(async () => {
    try {
      const next = await getDesktopApi().history.listSessions();
      setSessions(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const refreshProfiles = useCallback(async () => {
    try {
      const next = await getDesktopApi().profileSnapshot.list();
      setSnapshots(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const refreshMatches = useCallback(async () => {
    try {
      const next = await getDesktopApi().relationships.list({ limit: 100, offset: 0 });
      setRelationships(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void refreshSessions();
  }, [refreshSessions]);

  useEffect(() => {
    if (tab === 'profiles') {
      void refreshProfiles();
    }
    if (tab === 'matches') {
      void refreshMatches();
    }
  }, [tab, refreshProfiles, refreshMatches]);

  const loadProfiles = useCallback(async (sessionId: string, pageIndex: number) => {
    setLoadingProfiles(true);
    try {
      const result = await getDesktopApi().history.listSessionProfiles({
        sessionId,
        limit: PAGE_SIZE,
        offset: pageIndex * PAGE_SIZE,
      });
      setProfiles(result.items);
      setProfilesTotal(result.total);
      setDrafts((prev) => {
        const next = { ...prev };
        for (const item of result.items) {
          if (!next[item.id]) {
            next[item.id] = {
              decision: item.userOverrideDecision,
              comment: item.userFeedbackComment ?? '',
            };
          }
        }
        return next;
      });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingProfiles(false);
    }
  }, []);

  async function toggleSession(session: HistorySessionSummary) {
    if (expandedId === session.id) {
      setExpandedId(null);
      setAnalysis(null);
      setAnalysisPhase('review');
      setRevisionNote('');
      return;
    }
    setExpandedId(session.id);
    setPage(0);
    setAnalysis(null);
    setAnalysisPhase('review');
    setRevisionNote('');
    await loadProfiles(session.id, 0);
  }

  async function goPage(nextPage: number) {
    if (!expandedId) {
      return;
    }
    setPage(nextPage);
    await loadProfiles(expandedId, nextPage);
    sessionBodyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function saveFeedback(
    eventId: string,
    decision?: HistoryFeedbackDecision,
    comment?: string,
  ) {
    const draft = drafts[eventId];
    const nextDecision = decision ?? draft?.decision;
    const nextComment = comment ?? draft?.comment ?? '';
    setDrafts((prev) => ({
      ...prev,
      [eventId]: { decision: nextDecision, comment: nextComment },
    }));
    setBusy(true);
    try {
      const updated = await getDesktopApi().history.saveProfileFeedback({
        eventId,
        decision: nextDecision,
        comment: nextComment || undefined,
      });
      setProfiles((prev) => prev.map((item) => (item.id === eventId ? updated : item)));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function submitFeedback(
    sessionId: string,
    options?: { revisionNote?: string; previousUnderstanding?: string },
  ) {
    setBusy(true);
    setProcessingFeedback(true);
    try {
      // Persist visible drafts first (initial send)
      if (!options?.revisionNote) {
        await Promise.all(
          profiles
            .filter((item) => item.hasDetail)
            .map(async (item) => {
              const draft = drafts[item.id];
              if (!draft) {
                return;
              }
              if (!draft.decision && !draft.comment.trim()) {
                return;
              }
              await getDesktopApi().history.saveProfileFeedback({
                eventId: item.id,
                decision: draft.decision,
                comment: draft.comment || undefined,
              });
            }),
        );
      }
      const result = await withAiWork('Обрабатываю фидбек сессии…', () =>
        getDesktopApi().history.submitSessionFeedback({
          sessionId,
          revisionNote: options?.revisionNote,
          previousUnderstanding: options?.previousUnderstanding,
        }),
      );
      setAnalysis(result);
      setAnalysisPhase('review');
      setRevisionNote('');
      await loadProfiles(sessionId, page);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      setProcessingFeedback(false);
    }
  }

  async function applyFeedback(sessionId: string) {
    if (!analysis) {
      return;
    }
    setBusy(true);
    setApplyingFeedback(true);
    try {
      await withAiWork('Сохраняю выводы в предпочтения…', () =>
        getDesktopApi().history.applySessionFeedback({
          sessionId,
          accept: true,
          narrativePatch: analysis.narrativePatch,
        }),
      );
      setAnalysis(null);
      setAnalysisPhase('review');
      setRevisionNote('');
      setDrafts({});
      setError(null);
      await refreshSessions();
      await loadProfiles(sessionId, page);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      setApplyingFeedback(false);
    }
  }

  async function rethinkFeedback(sessionId: string) {
    if (!analysis) {
      return;
    }
    const note = revisionNote.trim();
    if (!note) {
      setError('Напишите, что нужно уточнить, затем нажмите «Обдумать»');
      return;
    }
    await submitFeedback(sessionId, {
      revisionNote: note,
      previousUnderstanding: analysis.understanding,
    });
  }

  async function confirmDeleteSession() {
    if (!deleteTarget) {
      return;
    }
    setDeleting(true);
    try {
      await getDesktopApi().history.deleteSession({ sessionId: deleteTarget.id });
      if (expandedId === deleteTarget.id) {
        setExpandedId(null);
        setProfiles([]);
        setProfilesTotal(0);
        setAnalysis(null);
        setDrafts({});
      }
      setDeleteTarget(null);
      await refreshSessions();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeleting(false);
    }
  }

  const pageCount = Math.max(1, Math.ceil(profilesTotal / PAGE_SIZE));

  function renderPager() {
    if (profilesTotal <= PAGE_SIZE) {
      return null;
    }
    return (
      <div className="history-pager">
        <button
          type="button"
          className="btn"
          disabled={busy || loadingProfiles || page <= 0}
          onClick={() => void goPage(page - 1)}
        >
          Предыдущая
        </button>
        <span className="muted">
          Стр. {page + 1} / {pageCount} · {profilesTotal} анкет
        </span>
        <button
          type="button"
          className="btn"
          disabled={busy || loadingProfiles || page + 1 >= pageCount}
          onClick={() => void goPage(page + 1)}
        >
          Следующая
        </button>
      </div>
    );
  }

  return (
    <section className="page">
      <h1>История</h1>
      <p className="lede">
        Кандидаты Eurydice, собственные профили Orpheus и цепочки мэтчей.
      </p>

      <div className="history-tabs" role="tablist" aria-label="Разделы истории">
        {(
          [
            { id: 'candidates' as const, label: 'Кандидаты' },
            { id: 'profiles' as const, label: 'Профили' },
            { id: 'matches' as const, label: 'Мэтчи' },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={`history-tabs__item ${
              tab === item.id ? 'history-tabs__item--active' : ''
            }`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {error ? <p className="error">{error}</p> : null}

      {tab === 'profiles' ? (
        <div className="card-lite">
          <div className="orpheus-actions">
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => void refreshProfiles()}
            >
              Обновить
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => {
                void (async () => {
                  setBusy(true);
                  try {
                    await getDesktopApi().profileSnapshot.capture();
                    await refreshProfiles();
                  } catch (err) {
                    setError(err instanceof Error ? err.message : String(err));
                  } finally {
                    setBusy(false);
                  }
                })();
              }}
            >
              Снять слепок
            </button>
          </div>
          {snapshots.length === 0 ? (
            <p className="muted">
              Пока нет слепков. Capture требует locator discovery own-profile (§20).
            </p>
          ) : (
            <ul className="history-sessions">
              {snapshots.map((snap) => (
                <li key={snap.id} className="history-session">
                  <div className="history-session__head">
                    <div className="history-session__toggle" style={{ cursor: 'default' }}>
                      <div className="history-session__title">
                        <strong>{formatTime(snap.capturedAt)}</strong>
                        <span className="muted">
                          {snap.deploymentStatus} · фото {snap.photos.length}
                          {typeof snap.plannedSimilarity === 'number'
                            ? ` · план ${Math.round(snap.plannedSimilarity * 100)}%`
                            : ''}
                        </span>
                      </div>
                      <p className="muted">{snap.bio || 'Bio пустое'}</p>
                    </div>
                    <button
                      type="button"
                      className="history-session__trash"
                      title="Удалить слепок"
                      onClick={() => {
                        void (async () => {
                          setBusy(true);
                          try {
                            await getDesktopApi().profileSnapshot.delete(snap.id);
                            await refreshProfiles();
                          } catch (err) {
                            setError(err instanceof Error ? err.message : String(err));
                          } finally {
                            setBusy(false);
                          }
                        })();
                      }}
                    >
                      <TrashIcon />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {tab === 'matches' ? (
        <div className="card-lite">
          <div className="orpheus-actions">
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => void refreshMatches()}
            >
              Обновить
            </button>
          </div>
          {relationships.length === 0 ? (
            <p className="muted">
              Пока нет relationships. Они появятся после preflight-скана likes/matches
              (нужен locator discovery).
            </p>
          ) : (
            <ul className="history-sessions">
              {relationships.map((rel) => (
                <li key={rel.id} className="history-session">
                  <div className="history-session__body" style={{ padding: 14 }}>
                    <strong>{rel.candidateIdentityId.slice(0, 12)}</strong>
                    <span className="muted">
                      {' '}
                      · {rel.origin} · fit {rel.audienceFit.finalLabel}
                      {rel.audienceFit.correctedByUser ? ' · corrected' : ''}
                    </span>
                    <div className="orpheus-actions" style={{ marginTop: 8 }}>
                      <select
                        value={rel.currentStage}
                        disabled={busy}
                        onChange={(e) => {
                          const stage = e.target.value as RelationshipStage;
                          void (async () => {
                            setBusy(true);
                            try {
                              await getDesktopApi().relationships.setStage({
                                relationshipId: rel.id,
                                stage,
                              });
                              await refreshMatches();
                            } catch (err) {
                              setError(
                                err instanceof Error ? err.message : String(err),
                              );
                            } finally {
                              setBusy(false);
                            }
                          })();
                        }}
                      >
                        {RELATIONSHIP_STAGES.map((stage) => (
                          <option key={stage} value={stage}>
                            {stage}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="btn"
                        disabled={busy || rel.audienceFit.correctedByUser}
                        onClick={() => {
                          void (async () => {
                            setBusy(true);
                            try {
                              await getDesktopApi().relationships.applyAudienceCorrection({
                                relationshipId: rel.id,
                                finalLabel: 'core',
                                correctionReasons: ['other'],
                                correctionComment: 'Ручная коррекция из History → Мэтчи',
                              });
                              await refreshMatches();
                            } catch (err) {
                              setError(
                                err instanceof Error ? err.message : String(err),
                              );
                            } finally {
                              setBusy(false);
                            }
                          })();
                        }}
                      >
                        Коррекция → Ядро
                      </button>
                      <button
                        type="button"
                        className="btn btn--stop"
                        disabled={busy || rel.currentStage === 'closed'}
                        onClick={() => {
                          void (async () => {
                            setBusy(true);
                            try {
                              await getDesktopApi().relationships.close({
                                relationshipId: rel.id,
                                reason: 'Закрыто из History',
                              });
                              await refreshMatches();
                            } catch (err) {
                              setError(
                                err instanceof Error ? err.message : String(err),
                              );
                            } finally {
                              setBusy(false);
                            }
                          })();
                        }}
                      >
                        Закрыть
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {tab !== 'candidates' ? null : sessions.length === 0 ? (
        <div className="card-lite">
          <p className="muted">Пока пусто. Запустите сессию — история появится здесь.</p>
        </div>
      ) : (
        <ul className="history-sessions">
          {sessions.map((session) => {
            const open = expandedId === session.id;
            return (
              <li key={session.id} className="history-session">
                <div className="history-session__head">
                  <button
                    type="button"
                    className="history-session__toggle"
                    onClick={() => void toggleSession(session)}
                  >
                    <div className="history-session__title">
                      <strong>{formatTime(session.startedAt)}</strong>
                      <span className="muted">
                        {session.source} · {session.mode} · {session.status}
                        {session.hasDetail ? ' · подробно' : ''}
                      </span>
                    </div>
                    <div className="history-session__stats">
                      <span>{formatDuration(session.durationMs)}</span>
                      <span>{session.viewed} анкет</span>
                      <span>
                        {session.likes}/{session.dislikes} лайк/диз
                      </span>
                      <span className="muted">{open ? '▾' : '▸'}</span>
                    </div>
                  </button>
                  <button
                    type="button"
                    className="history-session__trash"
                    title="Удалить сессию"
                    aria-label="Удалить сессию"
                    disabled={busy || deleting}
                    onClick={(event) => {
                      event.stopPropagation();
                      setDeleteTarget(session);
                    }}
                  >
                    <TrashIcon />
                  </button>
                </div>

                {open ? (
                  <div className="history-session__body" ref={sessionBodyRef}>
                    {session.hasDetail ? (
                      <div className="history-session__actions">
                        <button
                          type="button"
                          className="btn btn--primary"
                          disabled={busy}
                          onClick={() => void submitFeedback(session.id)}
                        >
                          Отправить правки
                        </button>
                        {processingFeedback ? (
                          <AiWaiting label="Нейронка обрабатывает запрос…" sticky />
                        ) : null}
                      </div>
                    ) : (
                      <p className="muted">
                        Краткая история — фото и поля правок доступны только у последней сессии.
                      </p>
                    )}

                    {analysis && analysis.sessionId === session.id ? (
                      <div className="history-analysis">
                        <p>
                          <strong>{analysis.understanding}</strong>
                        </p>
                        <p>{analysis.agreePrompt}</p>
                        {analysis.lessons.length > 0 ? (
                          <ul className="history-analysis__lessons">
                            {analysis.lessons.map((lesson) => (
                              <li key={lesson}>{lesson}</li>
                            ))}
                          </ul>
                        ) : null}

                        {analysisPhase === 'review' ? (
                          <div className="history-session__actions">
                            <button
                              type="button"
                              className="btn btn--primary"
                              disabled={busy || processingFeedback || applyingFeedback}
                              onClick={() => void applyFeedback(session.id)}
                            >
                              Согласен
                            </button>
                            <button
                              type="button"
                              className="btn"
                              disabled={busy || processingFeedback || applyingFeedback}
                              onClick={() => {
                                setAnalysisPhase('revise');
                                setError(null);
                              }}
                            >
                              Подумай ещё
                            </button>
                            {applyingFeedback ? (
                              <AiWaiting label="Нейронка обрабатывает запрос… сохраняю выводы в предпочтения" />
                            ) : null}
                          </div>
                        ) : (
                          <div className="history-analysis__revise">
                            <textarea
                              className="history-item__comment"
                              rows={3}
                              placeholder="Что не так в формулировке / что ещё учесть…"
                              value={revisionNote}
                              onChange={(event) => setRevisionNote(event.target.value)}
                              disabled={busy}
                            />
                            <div className="history-session__actions">
                              <button
                                type="button"
                                className="btn"
                                disabled={busy || processingFeedback}
                                onClick={() => {
                                  setAnalysisPhase('review');
                                  setRevisionNote('');
                                  setError(null);
                                }}
                              >
                                Назад
                              </button>
                              <button
                                type="button"
                                className="btn btn--primary"
                                disabled={busy || processingFeedback}
                                onClick={() => void rethinkFeedback(session.id)}
                              >
                                Обдумать
                              </button>
                              {processingFeedback ? (
                                <AiWaiting label="Нейронка обрабатывает запрос… переосмысливаю формулировку" />
                              ) : null}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : null}

                    {renderPager()}

                    {loadingProfiles ? (
                      <p className="muted">Загрузка анкет…</p>
                    ) : profiles.length === 0 ? (
                      <p className="muted">В этой сессии ещё нет записей.</p>
                    ) : (
                      <ul className="history-list">
                        {profiles.map((item) => {
                          const open = Boolean(expandedProfiles[item.id]);
                          const textClass = open ? undefined : 'truncate-2';
                          return (
                          <li
                            key={item.id}
                            className={
                              open
                                ? 'history-item history-item--expanded'
                                : 'history-item'
                            }
                            onClick={() =>
                              setExpandedProfiles((prev) => ({
                                ...prev,
                                [item.id]: !prev[item.id],
                              }))
                            }
                          >
                            <div className="history-item__head">
                              <strong>
                                {profileTitle(item)}
                                {item.modelDecision === 'like' ||
                                item.modelDecision === 'dislike' ? (
                                  <span
                                    className={
                                      item.modelDecision === 'like'
                                        ? 'history-item__ai-decision history-item__ai-decision--like'
                                        : 'history-item__ai-decision history-item__ai-decision--dislike'
                                    }
                                  >
                                    {' '}
                                    {item.modelDecision === 'like' ? 'ЛАЙК' : 'ДИЗЛАЙК'}
                                  </span>
                                ) : null}
                              </strong>
                              <span className="muted">{formatTime(item.createdAt)}</span>
                            </div>

                            {item.photoDataUrls.length > 0 ? (
                              <div className="history-item__photos">
                                {item.photoDataUrls.slice(0, 3).map((url, index) => (
                                  <img
                                    key={`${item.id}-photo-${index}`}
                                    src={url}
                                    alt={`Фото ${index + 1}`}
                                  />
                                ))}
                              </div>
                            ) : null}

                            {(item.bio || item.profileText) && (
                              <p className={textClass}>
                                {item.bio || item.profileText}
                              </p>
                            )}

                            <p>
                              Модель: {label(item.modelDecision)} → сессия:{' '}
                              {label(item.userDecision)}
                              {item.autoExecuted ? ' · AUTO' : ''}
                            </p>
                            {item.modelExcerpt ? (
                              <div
                                className={
                                  textClass
                                    ? `history-item__ai-desc muted ${textClass}`
                                    : 'history-item__ai-desc muted'
                                }
                              >
                                <strong>Описание ИИ</strong>
                                <p>{item.modelExcerpt}</p>
                              </div>
                            ) : item.reasons.length > 0 ? (
                              <div className="history-item__ai-desc muted">
                                <strong>Описание ИИ</strong>
                                <p>{item.reasons.join('\n')}</p>
                              </div>
                            ) : null}

                            {item.hasDetail ? (
                              <div
                                className="history-item__feedback"
                                onClick={(event) => event.stopPropagation()}
                              >
                                <p className="muted">
                                  Ваша правка — «согласен» = бот поступил верно
                                </p>
                                <div className="history-item__feedback-row">
                                  <button
                                    type="button"
                                    className={
                                      drafts[item.id]?.decision === 'agree'
                                        ? 'btn btn--primary'
                                        : 'btn'
                                    }
                                    disabled={busy}
                                    onClick={() => void saveFeedback(item.id, 'agree')}
                                  >
                                    Согласен
                                  </button>
                                  <button
                                    type="button"
                                    className={
                                      drafts[item.id]?.decision === 'like'
                                        ? 'btn btn--primary'
                                        : 'btn'
                                    }
                                    disabled={busy}
                                    onClick={() => void saveFeedback(item.id, 'like')}
                                  >
                                    Лайк
                                  </button>
                                  <button
                                    type="button"
                                    className={
                                      drafts[item.id]?.decision === 'dislike'
                                        ? 'btn btn--stop'
                                        : 'btn'
                                    }
                                    disabled={busy}
                                    onClick={() => void saveFeedback(item.id, 'dislike')}
                                  >
                                    Дизлайк
                                  </button>
                                </div>
                                <textarea
                                  className="history-item__comment"
                                  rows={2}
                                  placeholder="Почему так нужно поступать…"
                                  value={drafts[item.id]?.comment ?? ''}
                                  onChange={(event) =>
                                    setDrafts((prev) => ({
                                      ...prev,
                                      [item.id]: {
                                        decision: prev[item.id]?.decision,
                                        comment: event.target.value,
                                      },
                                    }))
                                  }
                                  onBlur={() => {
                                    const draft = drafts[item.id];
                                    if (!draft?.decision && !draft?.comment?.trim()) {
                                      return;
                                    }
                                    void saveFeedback(
                                      item.id,
                                      draft?.decision,
                                      draft?.comment,
                                    );
                                  }}
                                />
                              </div>
                            ) : null}
                          </li>
                          );
                        })}
                      </ul>
                    )}

                    {renderPager()}
                  </div>
                ) : null}
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
            if (!deleting) {
              setDeleteTarget(null);
            }
          }}
        >
          <div
            className="history-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="history-delete-title"
            onClick={(event) => event.stopPropagation()}
          >
            <p id="history-delete-title" className="history-modal__text">
              Ты уверен, что хочешь удалить историю за этот период?
            </p>
            <p className="muted history-modal__meta">
              {formatTime(deleteTarget.startedAt)} · {deleteTarget.viewed} анкет
            </p>
            <div className="history-modal__actions">
              <button
                type="button"
                className="btn history-modal__btn history-modal__btn--no"
                disabled={deleting}
                onClick={() => setDeleteTarget(null)}
              >
                Нет
              </button>
              <button
                type="button"
                className="btn btn--stop history-modal__btn"
                disabled={deleting}
                onClick={() => void confirmDeleteSession()}
              >
                Да, согласен
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function TrashIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

function stripLivePrefix(value: string): string {
  return value.replace(/^live:\s*/i, '').trim() || value;
}

function profileTitle(item: HistorySessionProfile): string {
  const raw = item.displayName ?? item.fixtureId ?? item.captureId.slice(0, 8);
  return stripLivePrefix(raw);
}

function label(value?: string | null): string {
  if (!value) {
    return '—';
  }
  return DECISION[value] ?? value;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ru-RU');
  } catch {
    return iso;
  }
}

function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${h}ч ${String(m).padStart(2, '0')}м`;
  }
  return `${m}м ${String(s).padStart(2, '0')}с`;
}
