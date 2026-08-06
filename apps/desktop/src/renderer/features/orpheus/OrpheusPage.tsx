import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type {
  AudienceModelView,
  IdentityDraftInput,
  IdentityModelView,
  PendingProfileChangeView,
  PhotoPlanView,
  ProfileExperimentView,
  ProfileVariantView,
  ProposedProfileSet,
  RecommendStopView,
  VerifiedProfileSnapshotView,
} from '@twinby/contracts';
import { AiWaiting } from '../../shared/AiWaiting';
import { ArrowRightIcon } from '../../shared/ArrowIcons';
import {
  audienceSkillsChanged,
  buildAudienceDraftUpdate,
  countAudienceSkills,
  EMPTY_AUDIENCE_SKILLS,
  skillsFromAudienceView,
  type AudienceSkillsForm,
} from '../../shared/audienceSkills';
import { withAiWork } from '../../shared/aiWork';
import { getDesktopApi } from '../../shared/desktopApi';
import {
  SignalCheckIcon,
  SignalMinusIcon,
  SignalPlusIcon,
  SignalStopIcon,
} from '../../shared/SignalIcons';
import { SignalScale } from '../../shared/SignalScale';
import { TagListEditor } from '../../shared/TagListEditor';

type IdentityDraftForm = {
  codeName: string;
  city: string;
  occupation: string;
  relationshipIntent: string;
  freeformText: string;
  realInterests: string[];
  explicitNonIdentity: string[];
};

function toIdentityDraftInput(draft: IdentityDraftForm): IdentityDraftInput {
  return {
    codeName: draft.codeName.trim(),
    city: draft.city.trim() || undefined,
    occupation: draft.occupation.trim() || undefined,
    relationshipIntent: draft.relationshipIntent.trim() || undefined,
    freeformText: draft.freeformText.trim() || undefined,
    realInterests: draft.realInterests,
    lifestyle: [],
    explicitNonIdentity: draft.explicitNonIdentity,
    resources: [],
    constraints: [],
  };
}

function deploymentStatusRu(
  status: VerifiedProfileSnapshotView['deploymentStatus'],
): string {
  switch (status) {
    case 'matches-plan':
      return 'совпадает';
    case 'partially-matches':
      return 'частично';
    case 'does-not-match':
      return 'не совпадает';
    default:
      return 'не сверено';
  }
}

export function OrpheusPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [aiWaitLabel, setAiWaitLabel] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string) => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    setToast(message);
    toastTimerRef.current = setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 4500);
  }, []);

  useEffect(
    () => () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    },
    [],
  );
  const [identity, setIdentity] = useState<IdentityModelView | null>(null);
  const [audience, setAudience] = useState<AudienceModelView | null>(null);
  const [snapshot, setSnapshot] = useState<VerifiedProfileSnapshotView | null>(null);
  const [planVariant, setPlanVariant] = useState<ProfileVariantView | null>(null);
  const [sets, setSets] = useState<ProposedProfileSet[]>([]);
  const [suggestedPhotos, setSuggestedPhotos] = useState<
    Record<string, Array<{ id: string; fileName: string; shortDescription: string }>>
  >({});
  const [photoPreviews, setPhotoPreviews] = useState<Record<string, string | null>>(
    {},
  );
  const [needsStorageForSet, setNeedsStorageForSet] = useState<string | null>(null);
  const [hasConnectedStorage, setHasConnectedStorage] = useState(false);
  const [photoPlan, setPhotoPlan] = useState<PhotoPlanView | null>(null);
  const [experiment, setExperiment] = useState<ProfileExperimentView | null>(null);
  const [pendingChange, setPendingChange] = useState<PendingProfileChangeView | null>(
    null,
  );
  const [recommend, setRecommend] = useState<RecommendStopView | null>(null);
  const [audienceCodeName, setAudienceCodeName] = useState('');
  const [audienceSummary, setAudienceSummary] = useState('');
  const [audienceSkills, setAudienceSkills] =
    useState<AudienceSkillsForm>(EMPTY_AUDIENCE_SKILLS);
  const [identityDraft, setIdentityDraft] = useState<IdentityDraftForm>({
    codeName: '',
    city: '',
    occupation: '',
    relationshipIntent: '',
    freeformText: '',
    realInterests: [],
    explicitNonIdentity: [],
  });
  // New draft/version only when the user actually edited a field since last load/save.
  // Refs mirror state so async save/confirm handlers never see a stale dirty flag.
  const [, setIdentityDirtyState] = useState(false);
  const [, setAudienceDirtyState] = useState(false);
  const identityDirtyRef = useRef(false);
  const audienceDirtyRef = useRef(false);

  const setIdentityDirty = useCallback((value: boolean) => {
    identityDirtyRef.current = value;
    setIdentityDirtyState(value);
  }, []);

  const setAudienceDirty = useCallback((value: boolean) => {
    audienceDirtyRef.current = value;
    setAudienceDirtyState(value);
  }, []);

  const touchIdentity = useCallback(
    (patch: Partial<IdentityDraftForm> | ((d: IdentityDraftForm) => IdentityDraftForm)) => {
      setIdentityDirty(true);
      setIdentityDraft((d) =>
        typeof patch === 'function' ? patch(d) : { ...d, ...patch },
      );
    },
    [setIdentityDirty],
  );

  const touchAudienceCodeName = useCallback(
    (value: string) => {
      setAudienceDirty(true);
      setAudienceCodeName(value);
    },
    [setAudienceDirty],
  );

  const touchAudienceSummary = useCallback(
    (value: string) => {
      setAudienceDirty(true);
      setAudienceSummary(value);
    },
    [setAudienceDirty],
  );

  const touchAudienceSkills = useCallback(
    (patch: Partial<AudienceSkillsForm>) => {
      setAudienceDirty(true);
      setAudienceSkills((prev) => ({ ...prev, ...patch }));
    },
    [setAudienceDirty],
  );

  const audienceFormChanged = useCallback(
    (codeName: string, summary: string, skills: AudienceSkillsForm) => {
      if (!audience) return true;
      const baseline = skillsFromAudienceView(audience);
      return (
        codeName.trim() !== (audience.codeName ?? '').trim() ||
        summary.trim() !== (audience.summary ?? '').trim() ||
        audienceSkillsChanged(baseline, skills)
      );
    },
    [audience],
  );

  const refresh = useCallback(async () => {
    try {
      const api = getDesktopApi();
      const [id, aud, snap, activeExp, pending, connections, plan] =
        await Promise.all([
          api.identity.getCurrent(),
          api.audience.getCurrent(),
          api.profileSnapshot.getActive(),
          api.experiment.getActive(),
          api.experiment.getPendingProfileChange(),
          api.cloud.listConnections(),
          api.profileSnapshot.resolvePlanVariant(),
        ]);
      setHasConnectedStorage(connections.some((c) => c.connected));
      setIdentity(id);
      setAudience(aud);
      setAudienceCodeName(aud.codeName ?? '');
      setAudienceSummary(aud.summary ?? '');
      setAudienceSkills(skillsFromAudienceView(aud));
      setSnapshot(snap);
      setPlanVariant(plan);
      setExperiment(activeExp);
      setPendingChange(pending);
      setIdentityDraft({
        codeName: id.codeName ?? '',
        city: id.city ?? '',
        occupation: id.occupation ?? '',
        relationshipIntent: id.relationshipIntent ?? '',
        freeformText: id.aiSummary ?? '',
        realInterests: id.realInterests.map((s) => s.statement),
        explicitNonIdentity: id.explicitNonIdentity.map((s) => s.statement),
      });
      setIdentityDirty(false);
      setAudienceDirty(false);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function run(
    action: () => Promise<void>,
    options?: { aiLabel?: string },
  ) {
    setBusy(true);
    setError(null);
    if (options?.aiLabel) {
      setAiWaitLabel(options.aiLabel);
      setInfo(null);
    }
    try {
      if (options?.aiLabel) {
        await withAiWork(options.aiLabel, async () => {
          await action();
          await refresh();
        });
      } else {
        await action();
        await refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      setAiWaitLabel(null);
    }
  }

  function runAi(label: string, action: () => Promise<void>) {
    return run(action, { aiLabel: label });
  }

  return (
    <div className="page">
      <header className="page__header">
        <h1>Orpheus</h1>
        <p className="muted">
          Identity, облачные фото, три варианта анкеты, план съёмки и эксперименты.
        </p>
      </header>

      {aiWaitLabel ? <AiWaiting label={aiWaitLabel} sticky /> : null}
      {toast ? (
        <div className="app-toast" role="status" aria-live="polite">
          {toast}
        </div>
      ) : null}
      {error ? <p className="error">{error}</p> : null}
      {info && !aiWaitLabel && !toast ? <p className="muted">{info}</p> : null}

      {pendingChange ? (
        <article className="panel panel--warn">
          <h2>Изменение профиля Twinby во время теста</h2>
          <p>
            Обнаружено: <strong>{pendingChange.reason}</strong>
          </p>
          <p className="muted">
            {new Date(pendingChange.detectedAt).toLocaleString('ru-RU')} · тест не
            останавливается автоматически — подтвердите, что изменение намеренное.
          </p>
          <div className="orpheus-actions">
            <button
              type="button"
              className="btn btn--stop"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const result =
                    await getDesktopApi().experiment.resolvePendingProfileChange({
                      intentional: true,
                    });
                  setInfo(result.message);
                  setRecommend(null);
                })
              }
            >
              Да, намеренно — остановить тест
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const result =
                    await getDesktopApi().experiment.resolvePendingProfileChange({
                      intentional: false,
                    });
                  setInfo(result.message);
                })
              }
            >
              Нет — продолжить тест
            </button>
          </div>
        </article>
      ) : null}

      <section className="card-stack">
        <article className="panel">
          <h2>Активный профиль / слепок Twinby</h2>
          {snapshot ? (
            <>
              <p>
                Слепок от {new Date(snapshot.capturedAt).toLocaleString('ru-RU')} · статус{' '}
                <strong>{deploymentStatusRu(snapshot.deploymentStatus)}</strong>
              </p>
              <div className="orpheus-deployment">
                <p>
                  <strong>Рекомендовано</strong>
                </p>
                <p className="muted">
                  {planVariant
                    ? `bio: ${planVariant.bio || '—'} · фото: ${planVariant.photoIds.length}`
                    : 'Нет плана Orpheus (сет / эксперимент)'}
                </p>
                <p>
                  <strong>Фактически</strong>
                </p>
                <p className="muted">
                  bio: {snapshot.bio || '—'} · фото: {snapshot.photos.length}
                </p>
                <p>
                  Соответствие плану:{' '}
                  <strong>
                    {snapshot.plannedSimilarity != null
                      ? `${Math.round(snapshot.plannedSimilarity * 100)}%`
                      : snapshot.deploymentStatus === 'matches-plan'
                        ? '100%'
                        : snapshot.deploymentStatus === 'not-verified'
                          ? 'не сверено'
                          : '—'}
                  </strong>
                </p>
                {snapshot.differencesFromPlan.length > 0 ? (
                  <ul className="muted">
                    {snapshot.differencesFromPlan.map((diff) => (
                      <li key={diff}>{diff}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await getDesktopApi().profileSnapshot.delete(snapshot.id);
                  })
                }
              >
                Удалить слепок
              </button>
            </>
          ) : (
            <p className="muted">Нет verified snapshot. Снимите слепок с Twinby.</p>
          )}
          <div className="orpheus-actions">
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const result = await getDesktopApi().profileSnapshot.capture();
                  setInfo(
                    result.changed
                      ? `Новый слепок: ${result.reason ?? 'профиль изменился'} · ${deploymentStatusRu(result.snapshot.deploymentStatus)}${
                          result.pendingProfileChange
                            ? ' · ждёт подтверждения для теста'
                            : ''
                        }`
                      : result.reason ?? 'Слепок без изменений',
                  );
                })
              }
            >
              Снять слепок Twinby
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy || !snapshot}
              onClick={() =>
                void run(async () => {
                  if (!snapshot) {
                    throw new Error('Сначала снимите слепок Twinby');
                  }
                  const compared = await getDesktopApi().profileSnapshot.compareToPlan({
                    snapshotId: snapshot.id,
                  });
                  setSnapshot(compared);
                  setInfo(
                    `Сверка: ${deploymentStatusRu(compared.deploymentStatus)} · ${
                      compared.plannedSimilarity != null
                        ? `${Math.round(compared.plannedSimilarity * 100)}%`
                        : '—'
                    }`,
                  );
                })
              }
            >
              Сверить с планом
            </button>
            <button
              type="button"
              className="btn btn--go"
              disabled={
                busy ||
                !snapshot ||
                Boolean(experiment && experiment.status === 'running')
              }
              onClick={() =>
                void run(async () => {
                  if (!snapshot) {
                    throw new Error('Сначала снимите слепок Twinby');
                  }
                  const created =
                    await getDesktopApi().experiment.createFromSnapshot({
                      snapshotId: snapshot.id,
                    });
                  setExperiment(created);
                  showToast(
                    'Текущий профиль Twinby записан как эксперимент (baseline)',
                  );
                  setInfo(
                    'Baseline-эксперимент создан из текущего слепка. Заполните pre-feedback и стартуйте тест.',
                  );
                })
              }
            >
              Взять текущий профиль в эксперимент
            </button>
          </div>
        </article>

        <article className="panel">
          <details className="model-spoiler">
            <summary className="model-spoiler__summary">
              <div className="model-spoiler__title">
                <h2>Identity Model</h2>
                <p className="muted">
                  Версия {identity?.version ?? '—'}
                  {identity?.codeName ? ` · ${identity.codeName}` : ''}
                  {' · '}
                  <span
                    className={
                      identity?.userConfirmedAt
                        ? 'draft-badge draft-badge--confirmed'
                        : 'draft-badge draft-badge--draft'
                    }
                  >
                    {identity?.userConfirmedAt ? 'подтверждена' : 'черновик'}
                  </span>
                </p>
              </div>
              <Link
                to="/orpheus/identity-drafts"
                className="panel__arrow"
                aria-label="Все черновики Identity"
                title="Все черновики Identity"
                onClick={(event) => event.stopPropagation()}
              >
                <ArrowRightIcon />
              </Link>
            </summary>
            <div className="model-spoiler__body orpheus-form">
            <label>
              Кодовое наименование
              <input
                value={identityDraft.codeName}
                placeholder="Например: nerdy-moscow-v1"
                onChange={(e) => touchIdentity({ codeName: e.target.value })}
              />
            </label>
            <p className="field-hint">
              Короткое название этого черновика Identity — чтобы отличать версии в
              истории (не публикуется в Twinby).
            </p>
            <label>
              Город
              <input
                value={identityDraft.city}
                onChange={(e) => touchIdentity({ city: e.target.value })}
              />
            </label>
            <label>
              Занятие
              <input
                value={identityDraft.occupation}
                onChange={(e) => touchIdentity({ occupation: e.target.value })}
              />
            </label>
            <label>
              Намерение
              <input
                value={identityDraft.relationshipIntent}
                placeholder="Например: серьёзные отношения, дружба, лёгкое общение"
                onChange={(e) =>
                  touchIdentity({ relationshipIntent: e.target.value })
                }
              />
            </label>
            <p className="field-hint">
              Что вы ищете в Twinby и к какому формату отношений готовы. Это не слоган
              для анкеты, а внутренняя рамка для Orpheus: серьёзные отношения, дружба без
              романтики, лёгкое общение, брак и семья, пока не определился и т.п. Чем
              точнее, тем лучше система отфильтрует чужой тон в текстах и фото.
            </p>
            <label>
              Кто я (свободно)
              <textarea
                rows={4}
                placeholder="Короткое сочинение о себе своими словами…"
                value={identityDraft.freeformText}
                onChange={(e) => touchIdentity({ freeformText: e.target.value })}
              />
            </label>
            <p className="field-hint">
              Развёрнутое описание личности — характер, ценности, как вы общаетесь. Не
              список интересов: их добавьте тегами ниже.
            </p>
            <TagListEditor
              label="Интересы и сигналы"
              hint="Короткие метки вроде «настолки», «компьютеры», «машины», «горы», «кулинария». Enter или «Добавить» — как навыки на HeadHunter."
              tags={identityDraft.realInterests}
              placeholder="Например: настолки"
              disabled={busy}
              onChange={(realInterests) => touchIdentity({ realInterests })}
            />
            <TagListEditor
              label="Кто я точно не"
              hint="Черты и образы, которые нельзя усиливать в анкете. Например: «тусовщик», «спортсмен», «офисный сноб»."
              tags={identityDraft.explicitNonIdentity}
              placeholder="Например: тусовщик"
              disabled={busy}
              onChange={(explicitNonIdentity) =>
                touchIdentity({ explicitNonIdentity })
              }
            />
            <div className="orpheus-actions">
              <button
                type="button"
                className="btn btn--ai"
                disabled={busy || !snapshot}
                onClick={() =>
                  void runAi('Нейронка обрабатывает слепок Twinby…', async () => {
                    await getDesktopApi().identity.analyzeCurrentProfile();
                    showToast(
                      'AI разобрала слепок Twinby — проверьте поля и подтвердите Identity',
                    );
                    setInfo(
                      'AI разобрала слепок Twinby и разложила гипотезы по полям Identity — проверьте и подтвердите',
                    );
                  })
                }
              >
                Из слепка Twinby
              </button>
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    if (!identityDirtyRef.current) {
                      showToast('Identity без изменений — новый черновик не создан');
                      setInfo('Identity без изменений — новый черновик не создан');
                      return;
                    }
                    await getDesktopApi().identity.createDraft(
                      toIdentityDraftInput(identityDraft),
                    );
                    setIdentityDirty(false);
                    showToast('Черновик Identity сохранён');
                    setInfo('Черновик Identity сохранён');
                  })
                }
              >
                Сохранить черновик
              </button>
              <button
                type="button"
                className="btn btn--go"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    // Persist only when the user edited fields; otherwise just confirm.
                    if (identityDirtyRef.current) {
                      await getDesktopApi().identity.createDraft(
                        toIdentityDraftInput(identityDraft),
                      );
                    }
                    await getDesktopApi().identity.confirm();
                    setIdentityDirty(false);
                    showToast('Identity подтверждена');
                    setInfo('Identity подтверждена');
                  })
                }
              >
                Подтвердить Identity
              </button>
            </div>
            </div>
          </details>
        </article>

        <article className="panel">
          <details className="model-spoiler">
            <summary className="model-spoiler__summary">
              <div className="model-spoiler__title">
                <h2>Audience Model</h2>
                <p className="muted">
                  Версия {audience?.version ?? '—'}
                  {audience?.codeName ? ` · ${audience.codeName}` : ''}
                  {' · '}
                  сигналов: {countAudienceSkills(audienceSkills)}
                  {' · '}
                  <span
                    className={
                      audience?.source === 'user-confirmed'
                        ? 'draft-badge draft-badge--confirmed'
                        : 'draft-badge draft-badge--draft'
                    }
                  >
                    {audience?.source === 'user-confirmed'
                      ? 'подтверждена'
                      : 'черновик'}
                  </span>
                </p>
              </div>
              <Link
                to="/orpheus/audience-drafts"
                className="panel__arrow"
                aria-label="Все черновики Audience"
                title="Все черновики Audience"
                onClick={(event) => event.stopPropagation()}
              >
                <ArrowRightIcon />
              </Link>
            </summary>
            <div className="model-spoiler__body orpheus-form">
            <label>
              Кодовое наименование
              <input
                value={audienceCodeName}
                placeholder="Например: soft-nerdy-core"
                onChange={(e) => touchAudienceCodeName(e.target.value)}
              />
            </label>
            <p className="field-hint">
              Короткое название этого черновика Audience — чтобы отличать версии в
              истории (внутренняя метка, не для анкеты).
            </p>
            <label>
              Краткое описание целевой аудитории
              <textarea
                rows={5}
                className="orpheus-textarea"
                placeholder="Кого мы ищем: типаж, подача, lifestyle, что точно не подходит…"
                value={audienceSummary}
                onChange={(e) => touchAudienceSummary(e.target.value)}
              />
            </label>
            <p className="field-hint">
              Это целевой образ для Orpheus. Можно написать вручную или собрать из
              предпочтений и референсов Eurydice — это гипотеза, её нужно подтвердить.
            </p>
            <SignalScale>
              <div className="signal-group">
                <TagListEditor
                  label="Что особенно важно"
                  hint="Ядро типажа — без этих сигналов образ уже не тот."
                  tags={audienceSkills.important}
                  placeholder="Например: маленькое аккуратное лицо"
                  icon={<SignalCheckIcon />}
                  iconClassName="signal-icon--important"
                  chipClassName="tag-chip--important"
                  disabled={busy}
                  onChange={(important) => touchAudienceSkills({ important })}
                />
              </div>
              <div className="signal-group">
                <TagListEditor
                  label="Кто нравится"
                  hint="Желательные черты и атмосфера — плюсы, но не жёсткое ядро."
                  tags={audienceSkills.likes}
                  placeholder="Например: geek-культура"
                  icon={<SignalPlusIcon />}
                  iconClassName="signal-icon--like"
                  chipClassName="tag-chip--like"
                  disabled={busy}
                  onChange={(likes) => touchAudienceSkills({ likes })}
                />
              </div>
              <div className="signal-group">
                <TagListEditor
                  label="Кто не нравится"
                  hint="Мягкие минусы: лучше избегать, но это ещё не стоп."
                  tags={audienceSkills.dislikes}
                  placeholder="Например: слишком beauty-oriented образ"
                  icon={<SignalMinusIcon />}
                  iconClassName="signal-icon--neg"
                  chipClassName="tag-chip--neg"
                  disabled={busy}
                  onChange={(dislikes) => touchAudienceSkills({ dislikes })}
                />
              </div>
              <div className="signal-group">
                <TagListEditor
                  label="Стоп-сигналы"
                  hint="Жёсткие veto — при таком сигнале не выбираем."
                  tags={audienceSkills.stops}
                  placeholder="Например: уже мама"
                  icon={<SignalStopIcon />}
                  iconClassName="signal-icon--hard"
                  chipClassName="tag-chip--hard"
                  disabled={busy}
                  onChange={(stops) => touchAudienceSkills({ stops })}
                />
              </div>
            </SignalScale>
            <div className="orpheus-actions orpheus-actions--under-scale">
              <button
                type="button"
                className="btn btn--ai"
                disabled={busy}
                onClick={() =>
                  void runAi('Нейронка обрабатывает данные Eurydice…', async () => {
                    await getDesktopApi().audience.deriveFromEurydice();
                    showToast(
                      'AI сформулировала целевой образ по Eurydice — проверьте и подтвердите',
                    );
                    setInfo(
                      'AI сформулировала целевой образ по Eurydice — проверьте и подтвердите Audience',
                    );
                  })
                }
              >
                Определить по Eurydice
              </button>
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const shouldSave =
                      audienceDirtyRef.current &&
                      audienceFormChanged(
                        audienceCodeName,
                        audienceSummary,
                        audienceSkills,
                      );
                    if (!shouldSave) {
                      setAudienceDirty(false);
                      showToast('Audience без изменений — новый черновик не создан');
                      setInfo('Audience без изменений — новый черновик не создан');
                      return;
                    }
                    await getDesktopApi().audience.updateDraft(
                      buildAudienceDraftUpdate({
                        codeName: audienceCodeName,
                        summary: audienceSummary,
                        skills: audienceSkills,
                        audience,
                      }),
                    );
                    setAudienceDirty(false);
                    showToast('Черновик Audience сохранён');
                    setInfo('Черновик Audience сохранён');
                  })
                }
              >
                Сохранить черновик Audience
              </button>
              <button
                type="button"
                className="btn btn--go"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const shouldSave =
                      audienceDirtyRef.current &&
                      audienceFormChanged(
                        audienceCodeName,
                        audienceSummary,
                        audienceSkills,
                      );
                    if (shouldSave) {
                      await getDesktopApi().audience.updateDraft(
                        buildAudienceDraftUpdate({
                          codeName: audienceCodeName,
                          summary: audienceSummary,
                          skills: audienceSkills,
                          audience,
                        }),
                      );
                    }
                    await getDesktopApi().audience.confirmUpdate();
                    setAudienceDirty(false);
                    showToast('Audience подтверждена');
                    setInfo('Audience подтверждена');
                  })
                }
              >
                Подтвердить Audience
              </button>
            </div>
            </div>
          </details>
        </article>

        {!hasConnectedStorage ? (
          <article className="panel">
            <h2>Хранилище фото</h2>
            <p className="muted">
              Подключение Google Drive / Яндекс Диска и просмотр фото — в настройках.
            </p>
            <Link to="/settings?tab=storage" className="btn btn--ai">
              Открыть настройки хранилища
            </Link>
          </article>
        ) : null}

        <article className="panel">
          <h2>Варианты анкеты</h2>
          <div className="orpheus-actions">
            <button
              type="button"
              className="btn btn--go"
              disabled={busy}
              onClick={() =>
                void runAi('Собираю 3 типа анкеты…', async () => {
                  const next = await getDesktopApi().orpheus.generateProfileSets({
                    pinnedPhotoIds: [],
                    forbiddenPhotoIds: [],
                  });
                  setSets(next);
                  setNeedsStorageForSet(null);
                  const hydrated: Record<
                    string,
                    Array<{ id: string; fileName: string; shortDescription: string }>
                  > = {};
                  for (const set of next) {
                    hydrated[set.id] = set.photoIds.map((id, i) => ({
                      id,
                      fileName: id,
                      shortDescription:
                        set.photoRoles[i]?.explanation ||
                        set.desiredPhotoVision ||
                        'Фото под бриф типа',
                    }));
                  }
                  setSuggestedPhotos(hydrated);
                  setPhotoPreviews({});
                  showToast('Сгенерированы 3 типа анкеты');
                  const allIds = next.flatMap((s) => s.photoIds);
                  void Promise.all(
                    allIds.map(async (photoId) => {
                      try {
                        const preview =
                          await getDesktopApi().cloud.getPhotoPreview(photoId);
                        setPhotoPreviews((prev) => ({
                          ...prev,
                          [photoId]: preview.dataUrl,
                        }));
                      } catch {
                        setPhotoPreviews((prev) => ({ ...prev, [photoId]: null }));
                      }
                    }),
                  );
                })
              }
            >
              Сгенерировать 3 типа
            </button>
          </div>
          <div className="orpheus-sets">
            {sets.map((set) => (
              <div key={set.id} className="orpheus-set">
                <strong>{set.name}</strong>
                <p>{set.bio}</p>
                {set.brief ? (
                  <p className="muted">
                    <strong>Бриф:</strong> {set.brief}
                  </p>
                ) : null}
                {set.desiredPhotoVision ? (
                  <p className="muted">
                    <strong>Какие фото:</strong> {set.desiredPhotoVision}
                  </p>
                ) : null}
                <ul>
                  {set.strengths.slice(0, 3).map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
                {(suggestedPhotos[set.id] ?? []).length > 0 ? (
                  <ul className="orpheus-photo-stack">
                    {suggestedPhotos[set.id]!.map((photo) => {
                      const preview = photoPreviews[photo.id];
                      return (
                        <li key={photo.id} className="orpheus-photo-stack__item">
                          {preview ? (
                            <img src={preview} alt={photo.fileName} />
                          ) : (
                            <div className="orpheus-photo-stack__fallback">
                              {preview === null
                                ? 'Превью недоступно'
                                : 'Загрузка превью…'}
                            </div>
                          )}
                          <p className="muted orpheus-photo-stack__meta">
                            {photo.shortDescription || photo.fileName}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
                {needsStorageForSet === set.id ? (
                  <div className="orpheus-actions">
                    <p className="muted">Подключите хранилище</p>
                    <button
                      type="button"
                      className="btn btn--ai"
                      onClick={() => navigate('/settings?tab=storage')}
                    >
                      К настройкам хранилища
                    </button>
                  </div>
                ) : null}
                <div className="orpheus-actions">
                  <button
                    type="button"
                    className="btn btn--ai"
                    disabled={busy}
                    onClick={() =>
                      void (async () => {
                        setBusy(true);
                        setError(null);
                        let photos: Array<{
                          id: string;
                          fileName: string;
                          shortDescription: string;
                        }> = [];
                        try {
                          await withAiWork('Подбираю фото под бриф…', async () => {
                            const result = await getDesktopApi().orpheus.suggestPhotos({
                              profileSetId: set.id,
                              setName: set.name,
                              brief: set.brief,
                              desiredPhotoVision: set.desiredPhotoVision,
                              limit: 6,
                            });
                            if (result.needsStorage) {
                              setNeedsStorageForSet(set.id);
                              setSuggestedPhotos((prev) => {
                                const next = { ...prev };
                                delete next[set.id];
                                return next;
                              });
                              return;
                            }
                            setNeedsStorageForSet(null);
                            photos = result.photos.map((p) => ({
                              id: p.id,
                              fileName: p.fileName,
                              shortDescription: p.shortDescription || p.fileName,
                            }));
                            setSuggestedPhotos((prev) => ({
                              ...prev,
                              [set.id]: photos,
                            }));
                            setSets((prev) =>
                              prev.map((s) =>
                                s.id === set.id
                                  ? { ...s, photoIds: photos.map((p) => p.id) }
                                  : s,
                              ),
                            );
                            if (photos.length === 0) {
                              showToast(
                                result.message ||
                                  'Нет фото в индексе — сделайте «Просмотр хранилища»',
                              );
                            } else {
                              showToast(
                                result.message || `Подобрано ${photos.length} фото`,
                              );
                            }
                          });
                        } catch (err) {
                          setError(err instanceof Error ? err.message : String(err));
                        } finally {
                          setBusy(false);
                        }
                        await Promise.all(
                          photos.map(async (photo) => {
                            try {
                              const preview =
                                await getDesktopApi().cloud.getPhotoPreview(photo.id);
                              setPhotoPreviews((prev) => ({
                                ...prev,
                                [photo.id]: preview.dataUrl,
                              }));
                            } catch {
                              setPhotoPreviews((prev) => ({
                                ...prev,
                                [photo.id]: null,
                              }));
                            }
                          }),
                        );
                      })()
                    }
                  >
                    Предложить фото
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        const photos = suggestedPhotos[set.id] ?? [];
                        const photoIds =
                          photos.length > 0
                            ? photos.map((p) => p.id)
                            : set.photoIds;
                        await getDesktopApi().orpheus.saveVariant({
                          name: set.name,
                          bio: set.bio,
                          hypothesis:
                            set.brief ||
                            set.strategy.intendedFirstImpression.join('; '),
                          photoIds,
                          photoRoles: photoIds.map((photoId, i) => ({
                            photoId,
                            role: set.photoRoles[i]?.role ?? 'other',
                            explanation:
                              set.photoRoles[i]?.explanation ??
                              photos[i]?.shortDescription ??
                              'Предложенное фото',
                          })),
                          strategyId: set.strategy.id,
                          createdAgainstAudienceVersion:
                            set.strategy.audienceModelVersion,
                          createdAgainstIdentityVersion:
                            set.strategy.identityModelVersion,
                          expectedPerformance: set.expectedPerformance,
                        });
                        showToast('Вариант сохранён');
                      })
                    }
                  >
                    Сохранить вариант
                  </button>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <h2>Photo Plan</h2>
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const plan = await getDesktopApi().orpheus.createPhotoPlan({});
                setPhotoPlan(plan);
              })
            }
          >
            Построить план съёмки
          </button>
          {photoPlan ? (
            <ul>
              {photoPlan.tasks.map((task) => (
                <li key={task.id}>
                  <strong>{task.title}</strong> · impact {task.expectedImpact} ·{' '}
                  {task.goal}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">План пока не построен.</p>
          )}
        </article>

        <article className="panel">
          <h2>Эксперимент</h2>
          {experiment ? (
            <>
              <p>
                Статус: <strong>{experiment.status}</strong> · цель{' '}
                {experiment.targetDurationDays} дн.
                {experiment.imperfectDeployment ? (
                  <>
                    {' '}
                    · <strong>imperfect deployment</strong>
                  </>
                ) : null}
              </p>
              {experiment.metrics ? (
                <p className="muted">
                  Входящие: {experiment.metrics.incomingLikes} · целевые:{' '}
                  {experiment.metrics.targetIncomingLikes} · мэтчи:{' '}
                  {experiment.metrics.matches}
                </p>
              ) : null}
              {recommend ? (
                <p>
                  Рекомендация: <strong>{recommend.recommendation}</strong> —{' '}
                  {recommend.explanation}
                </p>
              ) : null}
              <div className="orpheus-actions">
                {experiment.status === 'draft' || experiment.status === 'ready' ? (
                  <button
                    type="button"
                    className="btn btn--go"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        const deployment =
                          snapshot?.deploymentStatus ?? 'not-verified';
                        if (
                          deployment === 'not-verified' ||
                          deployment === 'does-not-match'
                        ) {
                          throw new Error(
                            deployment === 'not-verified'
                              ? 'Сначала снимите слепок Twinby и сверьте его с планом'
                              : 'Twinby не совпадает с планом — поправьте анкету или снимите новый слепок',
                          );
                        }
                        let allowImperfect = false;
                        if (deployment === 'partially-matches') {
                          const ok = window.confirm(
                            'Профиль совпадает с планом лишь частично. Запустить тест с пометкой imperfect deployment?',
                          );
                          if (!ok) {
                            return;
                          }
                          allowImperfect = true;
                        }
                        await getDesktopApi().experiment.savePreFeedback({
                          experimentId: experiment.id,
                          userExpectedOutcome: 'Ожидаю рост целевых входящих',
                        });
                        await getDesktopApi().experiment.start({
                          experimentId: experiment.id,
                          allowImperfectDeployment: allowImperfect,
                        });
                      })
                    }
                  >
                    Pre-feedback + старт
                  </button>
                ) : null}
                {experiment.status === 'running' ? (
                  <>
                    <button
                      type="button"
                      className="btn"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          const r = await getDesktopApi().experiment.recommendStop(
                            experiment.id,
                          );
                          setRecommend(r);
                        })
                      }
                    >
                      Оценить сигнал
                    </button>
                    <button
                      type="button"
                      className="btn btn--stop"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await getDesktopApi().experiment.complete({
                            experimentId: experiment.id,
                            reason: 'stopped-by-user',
                          });
                          setRecommend(null);
                        })
                      }
                    >
                      Завершить тест
                    </button>
                  </>
                ) : null}
              </div>
            </>
          ) : (
            <p className="muted">
              Нет активного теста. Можно взять текущий слепок Twinby как baseline или
              создать эксперимент из сгенерированного сета A.
            </p>
          )}
          <div className="orpheus-actions">
            <button
              type="button"
              className="btn btn--go"
              disabled={
                busy ||
                !snapshot ||
                Boolean(experiment && experiment.status === 'running')
              }
              onClick={() =>
                void run(async () => {
                  if (!snapshot) {
                    throw new Error('Сначала снимите слепок Twinby');
                  }
                  const created =
                    await getDesktopApi().experiment.createFromSnapshot({
                      snapshotId: snapshot.id,
                    });
                  setExperiment(created);
                  showToast(
                    'Текущий профиль Twinby записан как эксперимент (baseline)',
                  );
                  setInfo(
                    'Baseline-эксперимент создан из текущего слепка. Заполните pre-feedback и стартуйте тест.',
                  );
                })
              }
            >
              Из текущего профиля Twinby
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy || Boolean(experiment && experiment.status === 'running')}
              onClick={() =>
                void run(async () => {
                  const variantSets = sets.length
                    ? sets
                    : await getDesktopApi().orpheus.generateProfileSets({
                        pinnedPhotoIds: [],
                        forbiddenPhotoIds: [],
                      });
                  if (!sets.length) {
                    setSets(variantSets);
                  }
                  const chosen = variantSets[0];
                  if (!chosen) {
                    throw new Error('Нет сета для эксперимента');
                  }
                  const saved = await getDesktopApi().orpheus.saveVariant({
                    name: chosen.name,
                    bio: chosen.bio,
                    hypothesis: chosen.strategy.intendedFirstImpression.join('; '),
                    photoIds: chosen.photoIds,
                    photoRoles: chosen.photoRoles.map((r) => ({
                      photoId: r.photoId,
                      role: r.role,
                      explanation: r.explanation,
                    })),
                    strategyId: chosen.strategy.id,
                    createdAgainstAudienceVersion:
                      chosen.strategy.audienceModelVersion,
                    createdAgainstIdentityVersion:
                      chosen.strategy.identityModelVersion,
                  });
                  const created = await getDesktopApi().experiment.create({
                    profileVariantId: saved.id,
                    minDurationDays: 3,
                    targetDurationDays: 5,
                    maxDurationDays: 7,
                  });
                  setExperiment(created);
                })
              }
            >
              Создать эксперимент из сета A
            </button>
          </div>
        </article>
      </section>
    </div>
  );
}
