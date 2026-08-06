import {
  AiDecisionSchema,
  AudienceFromEurydiceAnalysisSchema,
  IdentitySnapshotAnalysisSchema,
  PreferenceSummarySchema,
  ProfileEvidenceSchema,
  SessionFeedbackAnalysisSchema,
  SessionFeedbackNarrativePatchSchema,
  type AiConnectionTest,
  type AiDecision,
  type AiModel,
  type AiVisionTest,
  type AudienceFromEurydiceAnalysis,
  type IdentityDraftInput,
  type IdentitySnapshotAnalysis,
  type ModelCapabilities,
  type Narrative,
  type PreferenceProfile,
  type PreferenceSummary,
  type ProfileEvidence,
  type SessionFeedbackAnalysis,
  type SessionFeedbackNarrativePatch,
  type SwipeDecision,
  type TwoStageAiRaw,
} from '@twinby/contracts';
import OpenAI from 'openai';
import type { ChatCompletionContentPart } from 'openai/resources/chat/completions';

function joinSkills(skills: string[] | undefined): string {
  return (skills ?? []).map((s) => s.trim()).filter(Boolean).join('; ');
}

function formatNarrativeBlock(narrative: Narrative): string[] {
  const likedSkills = joinSkills(narrative.likedSkills);
  const dislikedSkills = joinSkills(narrative.dislikedSkills);
  const importantSkills = joinSkills(narrative.importantSkills);
  const stopSkills = joinSkills(narrative.stopSkills);
  return [
    `Нравится (скилы): ${likedSkills || '—'}`,
    `Нравится (текст): ${narrative.likedDescription?.trim() || '—'}`,
    `Не нравится (скилы): ${dislikedSkills || '—'}`,
    `Не нравится (текст): ${narrative.dislikedDescription?.trim() || '—'}`,
    `Важно (скилы): ${importantSkills || '—'}`,
    `Важно (текст): ${narrative.priorities?.trim() || '—'}`,
    `Стоп-сигналы (скилы): ${stopSkills || '—'}`,
    `Стоп-сигналы (текст): ${narrative.hardRejects?.trim() || '—'}`,
  ];
}

export interface AiImageInput {
  label: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  base64: string;
}

export interface ArionHubClientOptions {
  baseUrl: string;
  apiKey: string;
  primaryModel: string;
  fallbackModel?: string;
  timeoutMs: number;
  maxRetries: number;
  maxOutputTokens: number;
  temperature: number;
  responseFormatMode: 'json-object' | 'prompt-json';
  imageDetail: 'low' | 'high' | 'auto';
  fallbackEnabled: boolean;
  jsonRepairEnabled: boolean;
}

export interface EvaluateProfileInput {
  preferenceProfile: PreferenceProfile;
  /** Cached one-time analysis of references — preferred over re-sending photos */
  preferenceSummary?: PreferenceSummary;
  candidate: {
    age?: number;
    distanceKm?: number;
    compatibilityPercent?: number;
    relationshipGoal?: string;
    bio?: string;
    interests: string[];
    otherVisibleText: string[];
  };
  /** Only used if preferenceSummary is missing */
  positiveReferences?: AiImageInput[];
  negativeReferences?: AiImageInput[];
  candidateImages: AiImageInput[];
  /**
   * Recent user like/dislike/corrections — in-context learning for the next decision.
   * Comments are high-signal and must be respected.
   */
  recentFeedback?: UserDecisionFeedback[];
  /** Cancel in-flight chat completion (e.g. session stop). */
  signal?: AbortSignal;
}

export interface UserDecisionFeedback {
  userDecision: 'like' | 'dislike' | 'skip';
  modelDecision?: 'like' | 'dislike' | 'review';
  corrected: boolean;
  comment?: string;
  /** Short label, e.g. age/goal snippet — avoid dumping raw PII beyond what's already in history */
  label?: string;
  reasons?: string[];
}

export interface BuildPreferenceSummaryInput {
  preferenceProfile: PreferenceProfile;
  positiveReferences: AiImageInput[];
  negativeReferences: AiImageInput[];
}

export interface BuildPreferenceSummaryResult {
  summary: PreferenceSummary;
  model: string;
  latencyMs: number;
  promptTokens?: number;
  completionTokens?: number;
}

export interface AnalyzeOwnProfileIdentityInput {
  bio?: string;
  occupation?: string;
  interests?: string[];
  relationshipGoal?: string;
  /** Optional own-profile photos for vision context (max ~4 recommended). */
  photos?: AiImageInput[];
}

export interface AnalyzeOwnProfileIdentityResult {
  analysis: IdentitySnapshotAnalysis;
  draft: IdentityDraftInput;
  model: string;
  latencyMs: number;
  promptTokens?: number;
  completionTokens?: number;
}

const IDENTITY_FROM_SNAPSHOT_SYSTEM = `Ты аналитик Identity Model для Orpheus (оптимизация собственного профиля Twinby).
По слепку текущего профиля Twinby (текст + фото) собери черновик Identity.
Правила:
- Не выдумывай факты. Если данных нет — верни null или [].
- Поле occupation в Twinby часто шутка/статус («золотой ретривер»), а не реальная работа. Реальную работу/сферу извлекай из bio и других сигналов.
- freeformText — связное сочинение от первого лица о личности (характер, ценности, юмор, как общается). Не копируй bio дословно списком строк.
- realInterests — короткие теги интересов/скиллов (настолки, IT, кино…), 3–12 штук.
- lifestyle — короткие теги образа жизни, если видно.
- relationshipIntent — формат отношений, который человек ищет (серьёзные, дружба, лёгкое общение…).
- explicitNonIdentity — кем человек точно НЕ является / что нельзя усиливать в анкете. Только если это следует из контраста или прямых сигналов; иначе [].
- resources/constraints — только явные намёки; иначе [].
- uncertainties — что осталось неясным для пользователя.
Ответ строго JSON без markdown.`;

const IDENTITY_FROM_SNAPSHOT_JSON = `Верни JSON:
{
  "age": number|null,
  "city": string|null,
  "occupation": string|null,
  "professionalArea": string|null,
  "relationshipIntent": string|null,
  "freeformText": string|null,
  "realInterests": string[],
  "lifestyle": string[],
  "explicitNonIdentity": string[],
  "resources": string[],
  "constraints": string[],
  "uncertainties": string[]
}`;

function optionalTrimmed(value: string | null | undefined): string | undefined {
  const t = value?.trim();
  return t ? t : undefined;
}

export function identityAnalysisToDraft(
  analysis: IdentitySnapshotAnalysis,
): IdentityDraftInput {
  return {
    age: analysis.age ?? undefined,
    city: optionalTrimmed(analysis.city ?? undefined),
    occupation: optionalTrimmed(analysis.occupation ?? undefined),
    professionalArea: optionalTrimmed(analysis.professionalArea ?? undefined),
    relationshipIntent: optionalTrimmed(analysis.relationshipIntent ?? undefined),
    freeformText: optionalTrimmed(analysis.freeformText ?? undefined),
    realInterests: analysis.realInterests.map((s) => s.trim()).filter(Boolean),
    lifestyle: analysis.lifestyle.map((s) => s.trim()).filter(Boolean),
    explicitNonIdentity: analysis.explicitNonIdentity
      .map((s) => s.trim())
      .filter(Boolean),
    resources: analysis.resources.map((s) => s.trim()).filter(Boolean),
    constraints: analysis.constraints.map((s) => s.trim()).filter(Boolean),
  };
}

export interface DeriveAudienceFromEurydiceInput {
  preferenceProfile: PreferenceProfile;
  preferenceSummary?: PreferenceSummary | null;
}

export interface DeriveAudienceFromEurydiceResult {
  analysis: AudienceFromEurydiceAnalysis;
  model: string;
  latencyMs: number;
  promptTokens?: number;
  completionTokens?: number;
}

const AUDIENCE_FROM_EURYDICE_SYSTEM = `Ты формулируешь Audience Model для Orpheus на основе того, кого пользователь ищет через Eurydice (свайп-предпочтения).
Observed preference ≠ optimization mandate: опиши наблюдаемый целевой образ, не приказывай автоматически сужать стратегию.
Правила:
- summary — краткий связный портрет целевой аудитории на русском (3–6 предложений): внешность/типаж, подача, lifestyle, что точно не подходит.
- Пиши конкретно и по делу, без воды и списков внутри summary.
- Четыре группы коротких маркеров (до ~10 в каждой), только из данных Eurydice; не выдумывай; группы не пересекаются:
  • importantSignals — самое важное / ядро типажа (то, без чего образ не тот);
  • positiveSignals — что нравится (желательные черты, не обязательно критичные);
  • negativeSignals — что не нравится (мягкие минусы);
  • hardRejects — только жёсткие стоп-сигналы / veto.
Ответ строго JSON без markdown.`;

const AUDIENCE_FROM_EURYDICE_JSON = `Верни JSON:
{
  "summary": string,
  "importantSignals": string[],
  "positiveSignals": string[],
  "negativeSignals": string[],
  "hardRejects": string[]
}`;

export interface AiDecisionResult {
  decision: SwipeDecision;
  confidence: number;
  reasons: string[];
  raw: AiDecision;
  /** Present when evaluateProfileTwoStage was used. */
  evidence?: ProfileEvidence;
  promptTokens?: number;
  completionTokens?: number;
  model: string;
  latencyMs: number;
}

export interface ExtractEvidenceInput {
  candidate: EvaluateProfileInput['candidate'];
  candidateImages: AiImageInput[];
  signal?: AbortSignal;
}

export interface ExtractEvidenceResult {
  evidence: ProfileEvidence;
  model: string;
  latencyMs: number;
  promptTokens?: number;
  completionTokens?: number;
}

export interface DecideFromEvidenceInput {
  preferenceProfile: PreferenceProfile;
  preferenceSummary?: PreferenceSummary;
  candidate: EvaluateProfileInput['candidate'];
  evidence: ProfileEvidence;
  recentFeedback?: UserDecisionFeedback[];
  signal?: AbortSignal;
}

export interface AnalyzeSessionFeedbackItem {
  displayName?: string;
  bio?: string;
  modelDecision?: string;
  modelExcerpt?: string;
  userDecision?: 'like' | 'dislike';
  /** User confirmed the model was right (not a correction). */
  agreed?: boolean;
  comment?: string;
}

export interface AnalyzeSessionFeedbackInput {
  sessionId: string;
  preferenceProfile: PreferenceProfile;
  items: AnalyzeSessionFeedbackItem[];
  /** User asked to rethink; free-text clarification. */
  revisionNote?: string;
  previousUnderstanding?: string;
}

const FEEDBACK_SYSTEM_PROMPT = `## Намерение
Ты — Eurydice. Калибруй вкус пользователя по его правкам к решениям модели свайпа.
Говори и пиши от женского лица (русский: поняла, увидела, ошиблась, права…).
Сравни, где модель была права и где ошиблась; сформулируй понимание правил.

## Контекст
На входе: текущий narrative профиля и список правок (like/dislike, corrected, комментарии).
C0 hardRejects — абсолютный veto; C3-правки уточняют вкус внутри допустимого.

## Процедура
1) Найди паттерны ошибок и подтверждений модели.
2) Сформулируй understanding (2–5 предложений) и lessons от женского лица.
3) narrativePatch — только дельты, не копируй весь профиль.
4) C0-защита: narrativePatch.hardRejects только усиливает/уточняет veto;
   не ослабляй и не удаляй стопы без явной просьбы пользователя в комментариях.

## Контракт
Ответь строго JSON без markdown по схеме из user-сообщения.
Не определяй чувствительные атрибуты (раса, этнос, религия, здоровье, ориентация и т.п.).`;

const FEEDBACK_JSON_INSTRUCTION = `Верни JSON:
{
  "understanding": "Я поняла, что … (2–5 предложений на русском)",
  "agreePrompt": "Ты согласен?",
  "lessons": ["где модель была права / ошиблась и почему", "..."],
  "narrativePatch": {
    "likedDescription": "опционально — дополнение/уточнение того, что нравится",
    "dislikedDescription": "опционально",
    "priorities": "опционально",
    "hardRejects": "опционально — только усиление/уточнение veto, не ослабление",
    "uncertaintyPolicy": "опционально"
  }
}
В narrativePatch пиши только дельты (новые уточнения), не копируй весь текущий профиль целиком.
Если правок мало — всё равно дай understanding и agreePrompt.`;

const SYSTEM_PROMPT = `## Намерение
Ты — Eurydice: оцениваешь соответствие ЭТОЙ анкеты личному вкусу пользователя для решения свайпа.
Говори и пиши от женского лица (русский: оценила, увидела, решила, сомневаюсь…).
Не ищи «объективную красоту», не веди чат, не знакомься от своего лица.
Оптимизируй согласие с будущим like/dislike пользователя.
Уважай hard rejects даже при красивом лице или «образе».
Почти всегда выдавай бинарное решение; review — только если фото нет или нечитаемы.
Не классифицируй чувствительные атрибуты.

## Контекст
Вопрос: что известно и чему верить (вес сигнала, не порядок шагов).
В user-сообщении приходит экземпляр уровней (по убыванию веса):
- C0 hardRejects — абсолютный veto по телу/стоп-сигналам;
- C1 фото анкеты — главный evidence; смотри ВСЕ кадры;
- C2 визуальный вкус — summary референсов + narrative liked/disliked (лицо/силуэт);
- C3 калибровка — recentFeedback (комментарии важнее общих предпочтений внутри допустимого);
- C4 подача — стиль/кадр на фото (вторично);
- C5 текст анкеты — bio, интересы, цель, %, дистанция, возраст из UI (слабая корректировка);
- C6 веса и пороги likeScore/dislikeScore — как смешивать scores и согласовать action.
C3 никогда не отменяет C0: при конфликте feedback и hard reject → dislike и concern «[C0] …».
Не придумывай невидимое. Возраст — только из интерфейса (C5), не по внешности.

## Процедура
Вопрос: в каком порядке проверять и как разрешать конфликты.
1) Нарушение C0 hard reject по телу/стоп-сигналам? → dislike.
2) visualFit = лицо + силуэт vs позитивные референсы (не одежда/вайб).
   Оцени силуэт по всем кадрам (рост, торс, руки, шея/лицо); не суди только по кроп-селфи, если есть кадры тела.
3) Сходство с негативными референсами / слабый visualFit → dislike.
4) presentationFit (C4) только после прохождения 1–3; высокий presentation при низком visualFit не даёт like.
5) Bio/интересы (C5) — слабый +/-.
6) Фото нет/нечитаемы → review; иначе like или dislike.
7) Согласуй action с overallScore и порогами из user message:
   overallScore >= likeScore → like (если нет C0);
   overallScore <= dislikeScore → dislike;
   иначе — uncertainty policy / C0, не review.
Evidence (неполнота):
- нет кадра тела / блюр / кроп UI → обязательно пункт в uncertainties; силуэт не выдумывать;
- при C0 по фигуре и невидимом теле → dislike (как сомнение по hardReject).
Конфликты:
- «Образ» (одежда, стиль, очки, тату) НЕ оправдывает like при лишнем весе / полном силуэте, если пользователь просит хрупкую/худую/не толстую.
- Сомнение по фигуре при hardReject на полноту → dislike (не like, не review).
- Близко к позитивным референсам по лицу И телосложению, hardRejects не нарушены → like, даже при пустом био.
Uncertainty policy из narrative уточняет сомнения, но не отменяет C0 и запрет review без проблемы с фото.

## Контракт
Вопрос: что обязаны соблюсти на выходе.
Верни ТОЛЬКО JSON по схеме из user-сообщения (action, scores, breakdown, reasons, evidenceCompleteness).
action ∈ {like, dislike, review}; review почти запрещён (см. процедуру п.6).
action обязан согласовываться с overallScore и порогами (п.7).
Массивы matchedPreferences / concerns / uncertainties — макс. 6.
shortReason: одно предложение на русском от женского лица; укажи слой (C0/C1/C2/…); без sensitive labels.
concerns и matchedPreferences: префиксы [C0], [C1], [C2], [C3], [C4], [C5] где уместно.
Не определяй национальность, расу, этничность, религию, здоровье,
инвалидность, политические взгляды, сексуальную ориентацию,
материальное положение или возраст по внешности.
Без markdown и текста вне JSON.`

const SUMMARY_SYSTEM_PROMPT = `## Намерение
Ты — Eurydice. Извлеки из визуальных референсов устойчивые паттерны вкуса для знакомств (не решение по одной анкете).
Формулируй паттерны на русском от женского лица, где есть связный текст.

## Контекст
Положительные фото — что нравится (C2 visual). Отрицательные — что не нравится.
Подача/одежда/кадр — отдельно (C4). Стоп-сигналы по телу → hardRejects (C0).
Не смешивай силуэт с стилем.

## Процедура
1) Выдели тип телосложения/силуэта (хрупкий/стройный/полный/спортивно-массивный и т.п.).
2) Отдельно — черты лица.
3) Отдельно — стиль/подачу (одежда, кадр) в presentation-паттерны.
4) Сформулируй hardRejects только как veto-сигналы, не как «не нравится вайб».
5) Неясное — в uncertainties.

## Контракт
Верни только JSON по схеме из user-сообщения.
Не определяй чувствительные атрибуты (раса, этнос, религия, здоровье, ориентация и т.п.).
Без markdown.`;

const SUMMARY_JSON_INSTRUCTION = `Верни ТОЛЬКО JSON:
{
  "positiveVisualPatterns": string[],
  "negativeVisualPatterns": string[],
  "positivePresentationPatterns": string[],
  "negativePresentationPatterns": string[],
  "lifestylePreferences": string[],
  "bioPreferences": string[],
  "hardRejects": string[],
  "uncertainties": string[]
}
visual* = лицо/силуэт (C2); presentation* = стиль/кадр (C4); hardRejects = C0 veto. Не смешивай.`;

const DECISION_JSON_INSTRUCTION = `Верни ТОЛЬКО JSON объект со схемой.
Предпочитай action "like" или "dislike"; "review" — только если фото отсутствуют или нечитаемы.
Согласуй action с overallScore и порогами likeScore/dislikeScore из контекста.
shortReason — одно предложение RU от женского лица с указанием слоя (C0/C1/…); concerns/matchedPreferences — с префиксами [C0]…[C5].
Неполнота фото (нет тела / блюр / кроп) — в uncertainties, не выдумывай силуэт.
{
  "action": "like" | "dislike" | "review",
  "overallScore": 0-100,
  "confidence": 0-1,
  "breakdown": {
    "visualFit": number|null,
    "presentationFit": number|null,
    "bioFit": number|null,
    "interestsFit": number|null,
    "compatibilityFit": number|null,
    "distanceFit": number|null
  },
  "matchedPreferences": string[] (макс. 6),
  "concerns": string[] (макс. 6),
  "uncertainties": string[] (макс. 6),
  "shortReason": string,
  "evidenceCompleteness": 0-1
}`;

const EVIDENCE_SYSTEM_PROMPT = `## Намерение
Ты — слой A (Evidence). Только факты с фото и текста анкеты.
Не решай like/dislike, не сравнивай с вкусом пользователя, не ставь score.

## Процедура
1) По всем кадрам оцени видимость лица и тела.
2) Если тело видно — bodyTypeHint (petite/slim/average/curvy/athletic/plus), иначе unknown.
3) Типы кадров: короткие русские теги (портрет, в полный рост, селфи, путешествие…).
4) Подача: короткие русские теги (естественная, повседневная, постановочная, глянцевая…).
5) bioSignals — короткие русские теги из bio/интересов; если текста нет — пустой массив (не пиши об этом в uncertainties).
   Никогда не включай «Финансы»/деньги/доход/зарплату — в Twinby это системный чип почти у всех, не реальный интерес.
6) notableVisual — короткие нейтральные факты на русском (не оценки «красиво/нет»).
7) uncertainties — только про фото/видимость на русском: блюр, кроп, лицо мелкое/в стороне, тела нет и т.п.
   Не пиши про пустое bio/интересы и не ссылайся на имена файлов вроде candidate-1.

## Контракт
Только JSON.
Свободные строки (photoTypes, presentation, bioSignals, notableVisual, uncertainties) — только на русском.
Enum-поля faceVisibility/bodyVisibility/bodyTypeHint — строго значения схемы (английские коды).
Без вкусовщины и sensitive labels (раса, этнос, религия, здоровье, ориентация).`;

const EVIDENCE_JSON_INSTRUCTION = `Верни ТОЛЬКО JSON:
{
  "observations": {
    "faceVisibility": "clear"|"partial"|"none"|"unclear",
    "bodyVisibility": "clear"|"partial"|"none"|"unclear",
    "bodyTypeHint": "petite"|"slim"|"average"|"curvy"|"athletic"|"plus"|"unknown",
    "photoTypes": string[],
    "presentation": string[],
    "bioSignals": string[],
    "notableVisual": string[]
  },
  "uncertainties": string[],
  "evidenceCompleteness": 0-1
}
Массивы макс. 8. Не пиши like/dislike/score.
Все string[] — по-русски, коротко.
Не включай финансы/деньги/доход в bioSignals.`;

const DECISION_FROM_EVIDENCE_SYSTEM = `## Намерение
Ты — слой B (Preference decision). Фото уже разобраны слоем A.
Решай like/dislike по observations + предпочтениям пользователя.
Говори от женского лица (русский).

## Контекст
C0 hardRejects — veto; C2 visual/presentation из summary+narrative;
C3 recentFeedback; C5 текст анкеты; C6 веса/пороги.
Observations — единственный visual evidence (фото повторно не приложены).
Не выдумывай то, чего нет в observations/uncertainties.
Интерес/тег «Финансы» (и деньги/доход/зарплата) в Twinby — шум платформы; полностью игнорируй в interestsFit и shortReason.

## Процедура
1) C0 по bodyTypeHint / notableVisual / uncertainties?
2) visualFit vs позитивные/негативные паттерны.
3) presentationFit вторичен.
4) Bio/интересы — слабый +/-.
5) Согласуй action с overallScore и likeScore/dislikeScore.
Review — только если evidenceCompleteness очень низкая и фото по сути нет.

## Контракт
Только JSON по схеме decision.
shortReason: одно короткое предложение на русском с префиксом слоя [C0]…[C5];
без «я ставлю like/dislike», без пересказа всего JSON evidence.`;
const AI_DECISION_ARRAY_CAP = 6;
const AI_CANDIDATE_PHOTO_CAP = 6;

function normalizeProfileEvidenceJson(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') {
    return raw;
  }
  const obj = raw as Record<string, unknown>;
  const obsRaw =
    obj.observations && typeof obj.observations === 'object'
      ? (obj.observations as Record<string, unknown>)
      : {};
  return {
    observations: {
      faceVisibility: obsRaw.faceVisibility ?? 'unclear',
      bodyVisibility: obsRaw.bodyVisibility ?? 'unclear',
      bodyTypeHint: obsRaw.bodyTypeHint ?? 'unknown',
      photoTypes: clipStringArray(obsRaw.photoTypes, 8),
      presentation: clipStringArray(obsRaw.presentation, 8),
      bioSignals: clipStringArray(obsRaw.bioSignals, 8).filter(
        (tag) => !isFinanceNoiseTag(tag),
      ),
      notableVisual: clipStringArray(obsRaw.notableVisual, 8),
    },
    uncertainties: clipStringArray(obj.uncertainties, 8),
    evidenceCompleteness:
      typeof obj.evidenceCompleteness === 'number'
        ? Math.max(0, Math.min(1, obj.evidenceCompleteness))
        : 0.5,
  };
}

export function toTwoStageAiRaw(
  evidence: ProfileEvidence,
  decision: AiDecision,
  models: { extraction: string; decision: string },
): TwoStageAiRaw {
  return {
    pipeline: 'two-stage',
    evidence,
    decision,
    models,
  };
}

function clipStringArray(value: unknown, max = AI_DECISION_ARRAY_CAP): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => String(item)).filter(Boolean).slice(0, max);
}

/** Twinby paints «Финансы» on almost every profile — never feed it to the model. */
function isFinanceNoiseTag(value: string): boolean {
  return /^(финансы|finance|finances|деньги|зарплата|доход|инвестиции|бюджет|капитал|wealth|income|salary|money)$/i.test(
    value.trim(),
  );
}

function filterFinanceNoiseInterests(interests: string[]): string[] {
  return interests.filter((item) => item.trim() && !isFinanceNoiseTag(item));
}

/** Soften overlong model arrays so Zod max(6) does not reject a usable decision. */
export function normalizeAiDecisionJson(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return raw;
  }
  const obj = raw as Record<string, unknown>;
  return {
    ...obj,
    matchedPreferences: clipStringArray(obj.matchedPreferences),
    concerns: clipStringArray(obj.concerns),
    uncertainties: clipStringArray(obj.uncertainties),
  };
}

/** 1x1 red PNG */
export const TINY_TEST_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

export function extractJsonObject(content: string): unknown {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced?.[1]?.trim() ?? trimmed;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('В ответе модели не найден JSON-объект');
  }
  return JSON.parse(raw.slice(start, end + 1));
}

export function mapProviderError(error: unknown): { technical: string; userMessage: string } {
  const message = error instanceof Error ? error.message : String(error);
  const status =
    typeof error === 'object' && error && 'status' in error
      ? Number((error as { status?: number }).status)
      : undefined;

  if (status === 401 || /incorrect api key|invalid.*key|unauthorized/i.test(message)) {
    return {
      technical: message,
      userMessage: 'Неверный API-ключ ArionHub. Проверьте ключ на arionhub.pro.',
    };
  }
  if (
    status === 403 ||
    /permission denied|access denied|forbidden|not allowed|do not have access/i.test(message)
  ) {
    return {
      technical: message,
      userMessage:
        'Модель недоступна для этого ключа (403). Смените primary-модель в «ИИ» или включите fallback (например gpt-5.4-mini).',
    };
  }
  if (/timed?\s*out|timeout|ETIMEDOUT|AbortError/i.test(message)) {
    return {
      technical: message,
      userMessage:
        'Запрос к модели превысил время ожидания. Для анализа референсов это бывает при многих/тяжёлых фото — подождите и повторите, или увеличьте Timeout (мс) в настройках ИИ (например 180000–300000).',
    };
  }
  if (status === 402 || /balance|quota|payment|billing/i.test(message)) {
    return {
      technical: message,
      userMessage: 'Недостаточно баланса на ArionHub.',
    };
  }
  if (status === 429) {
    return {
      technical: message,
      userMessage: 'Превышен лимит запросов ArionHub. Подождите и повторите.',
    };
  }
  if (status === 404 || /model.*not.*found|does not exist/i.test(message)) {
    return {
      technical: message,
      userMessage: 'Модель недоступна. Выберите другую из списка моделей.',
    };
  }
  return {
    technical: message,
    userMessage: `Ошибка ArionHub: ${message}`,
  };
}

export function isModelAccessError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const status =
    typeof error === 'object' && error && 'status' in error
      ? Number((error as { status?: number }).status)
      : undefined;
  return (
    status === 403 ||
    status === 404 ||
    /permission denied|access denied|forbidden|model.*not.*found|does not exist|not allowed/i.test(
      message,
    )
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetry(error: unknown, attempt: number, maxRetries: number): boolean {
  if (attempt >= maxRetries) {
    return false;
  }
  const message = error instanceof Error ? error.message : String(error);
  if (/timed?\s*out|timeout|ETIMEDOUT|AbortError|отмен|aborted/i.test(message)) {
    return false;
  }
  const status =
    typeof error === 'object' && error && 'status' in error
      ? Number((error as { status?: number }).status)
      : undefined;
  if (status === 401 || status === 403 || status === 402 || status === 400) {
    return false;
  }
  return (
    status === 408 ||
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    status === undefined
  );
}

export class ArionHubAiProvider {
  private readonly client: OpenAI;
  private readonly options: ArionHubClientOptions;

  constructor(options: ArionHubClientOptions) {
    this.options = options;
    this.client = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.baseUrl,
      timeout: options.timeoutMs,
      maxRetries: 0,
    });
  }

  async listModels(): Promise<AiModel[]> {
    const response = await this.withRetry(async () => this.client.models.list());
    const models: AiModel[] = [];
    for await (const model of response) {
      models.push({
        id: model.id,
        ownedBy: model.owned_by,
      });
    }
    return models.sort((a, b) => a.id.localeCompare(b.id));
  }

  async testTextConnection(model = this.options.primaryModel): Promise<AiConnectionTest> {
    const started = Date.now();
    try {
      const completion = await this.withRetry(async () =>
        this.client.chat.completions.create({
          model,
          temperature: 0,
          max_tokens: 64,
          messages: [
            {
              role: 'user',
              content:
                'Ответь одним словом: OK. Это проверка текстового соединения Eurydice.',
            },
          ],
        }),
      );
      const content = completion.choices[0]?.message?.content?.trim() ?? '';
      return {
        ok: content.length > 0,
        latencyMs: Date.now() - started,
        model,
        contentPreview: content.slice(0, 120),
        error: content.length === 0 ? 'Пустой ответ модели' : undefined,
        userMessage:
          content.length === 0
            ? 'Модель вернула пустой ответ'
            : 'Текстовое соединение успешно',
      };
    } catch (error) {
      const mapped = mapProviderError(error);
      return {
        ok: false,
        latencyMs: Date.now() - started,
        model,
        error: mapped.technical,
        userMessage: mapped.userMessage,
      };
    }
  }

  async testVisionConnection(model = this.options.primaryModel): Promise<AiVisionTest> {
    const started = Date.now();
    try {
      const completion = await this.withRetry(async () =>
        this.client.chat.completions.create({
          model,
          temperature: 0,
          max_tokens: 128,
          response_format:
            this.options.responseFormatMode === 'json-object'
              ? { type: 'json_object' }
              : undefined,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text:
                    'На изображении маленький цветной пиксель. Верни JSON: {"color":"red_or_other","ok":true}. Только JSON.',
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:image/png;base64,${TINY_TEST_PNG_BASE64}`,
                    detail: this.options.imageDetail,
                  },
                },
              ],
            },
          ],
        }),
      );

      const content = completion.choices[0]?.message?.content?.trim() ?? '';
      let parsedOk = false;
      try {
        const parsed = extractJsonObject(content) as { ok?: boolean };
        parsedOk = parsed.ok === true || typeof parsed === 'object';
      } catch {
        parsedOk = false;
      }

      return {
        ok: parsedOk,
        latencyMs: Date.now() - started,
        model,
        parsedOk,
        contentPreview: content.slice(0, 160),
        error: parsedOk ? undefined : 'Не удалось разобрать JSON vision-ответа',
        userMessage: parsedOk
          ? 'Vision-проверка успешна'
          : 'Модель ответила, но JSON невалиден. Попробуйте другой режим JSON или модель.',
      };
    } catch (error) {
      const mapped = mapProviderError(error);
      const visionUnsupported = /vision|image|multimodal|not support/i.test(mapped.technical);
      return {
        ok: false,
        latencyMs: Date.now() - started,
        model,
        parsedOk: false,
        error: mapped.technical,
        userMessage: visionUnsupported
          ? 'Эта модель, похоже, не поддерживает изображения. Выберите vision-модель.'
          : mapped.userMessage,
      };
    }
  }

  async testCapabilities(model = this.options.primaryModel): Promise<ModelCapabilities> {
    const text = await this.testTextConnection(model);
    const vision = await this.testVisionConnection(model);
    return {
      model,
      text: text.ok ? 'supported' : 'failed',
      vision: vision.ok ? 'supported' : 'failed',
      jsonObject: vision.parsedOk ? 'supported' : vision.ok ? 'unknown' : 'failed',
      testedAt: new Date().toISOString(),
      latencyMs: Math.max(text.latencyMs, vision.latencyMs),
      error: text.error ?? vision.error,
    };
  }

  /**
   * One-time analysis of reference photos → textual PreferenceSummary.
   * Result should be stored and reused; do not call on every profile evaluation.
   */
  async buildPreferenceSummary(
    input: BuildPreferenceSummaryInput,
  ): Promise<BuildPreferenceSummaryResult> {
    const started = Date.now();
    const model = this.options.primaryModel;
    // Vision + many images needs a longer budget than plain chat.
    const requestTimeoutMs = Math.max(this.options.timeoutMs, 180_000);
    const contentParts: ChatCompletionContentPart[] = [
      {
        type: 'text',
        text: [
          SUMMARY_JSON_INSTRUCTION,
          '',
          'Текстовые предпочтения пользователя:',
          ...formatNarrativeBlock(input.preferenceProfile.narrative),
          '',
          `Положительных фото: ${input.positiveReferences.length}`,
          `Отрицательных фото: ${input.negativeReferences.length}`,
        ].join('\n'),
      },
    ];

    for (const image of [
      ...input.positiveReferences.map((img) => ({ ...img, kind: 'positive' as const })),
      ...input.negativeReferences.map((img) => ({ ...img, kind: 'negative' as const })),
    ]) {
      contentParts.push({ type: 'text', text: `[${image.kind}] ${image.label}` });
      contentParts.push({
        type: 'image_url',
        image_url: {
          url: `data:${image.mimeType};base64,${image.base64}`,
          detail: 'low',
        },
      });
    }

    try {
      const completion = await this.withRetry(async () =>
        this.client.chat.completions.create(
          {
            model,
            temperature: 0.2,
            max_tokens: Math.max(this.options.maxOutputTokens, 1024),
            response_format:
              this.options.responseFormatMode === 'json-object'
                ? { type: 'json_object' }
                : undefined,
            messages: [
              { role: 'system', content: SUMMARY_SYSTEM_PROMPT },
              { role: 'user', content: contentParts },
            ],
          },
          { timeout: requestTimeoutMs },
        ),
      );

      const content = completion.choices[0]?.message?.content ?? '';
      let summary: PreferenceSummary;
      try {
        summary = PreferenceSummarySchema.parse(extractJsonObject(content));
      } catch (parseError) {
        if (!this.options.jsonRepairEnabled) {
          throw parseError;
        }
        const repair = await this.client.chat.completions.create(
          {
            model,
            temperature: 0,
            max_tokens: Math.max(this.options.maxOutputTokens, 1024),
            response_format:
              this.options.responseFormatMode === 'json-object'
                ? { type: 'json_object' }
                : undefined,
            messages: [
              {
                role: 'system',
                content: 'Исправь ответ в валидный JSON по схеме preference summary. Без markdown.',
              },
              {
                role: 'user',
                content: `${SUMMARY_JSON_INSTRUCTION}\n\nИсходный ответ:\n${content}`,
              },
            ],
          },
          { timeout: requestTimeoutMs },
        );
        summary = PreferenceSummarySchema.parse(
          extractJsonObject(repair.choices[0]?.message?.content ?? ''),
        );
      }

      return {
        summary,
        model,
        latencyMs: Date.now() - started,
        promptTokens: completion.usage?.prompt_tokens,
        completionTokens: completion.usage?.completion_tokens,
      };
    } catch (error) {
      const mapped = mapProviderError(error);
      throw new Error(mapped.userMessage);
    }
  }

  /**
   * Formulate Audience Model summary/signals from Eurydice preferences + reference summary.
   * Observed preference is evidence, not an automatic optimization mandate.
   */
  async deriveAudienceFromEurydice(
    input: DeriveAudienceFromEurydiceInput,
  ): Promise<DeriveAudienceFromEurydiceResult> {
    const started = Date.now();
    const model = this.options.primaryModel;
    const requestTimeoutMs = Math.max(this.options.timeoutMs, 90_000);
    const p = input.preferenceProfile;
    const s = input.preferenceSummary;

    const summaryBlock = s
      ? [
          'Кэш-анализ референсов Eurydice:',
          `+ визуальное: ${(s.positiveVisualPatterns ?? []).join('; ') || '—'}`,
          `- визуальное: ${(s.negativeVisualPatterns ?? []).join('; ') || '—'}`,
          `+ подача: ${(s.positivePresentationPatterns ?? []).join('; ') || '—'}`,
          `- подача: ${(s.negativePresentationPatterns ?? []).join('; ') || '—'}`,
          `lifestyle: ${(s.lifestylePreferences ?? []).join('; ') || '—'}`,
          `bio: ${(s.bioPreferences ?? []).join('; ') || '—'}`,
          `hardRejects: ${(s.hardRejects ?? []).join('; ') || '—'}`,
          `uncertainties: ${(s.uncertainties ?? []).join('; ') || '—'}`,
        ].join('\n')
      : 'Кэш-анализ референсов отсутствует — опирайся на текстовые предпочтения.';

    const userText = [
      AUDIENCE_FROM_EURYDICE_JSON,
      '',
      'Текстовые предпочтения Eurydice:',
      ...formatNarrativeBlock(p.narrative),
      `Политика неопределённости: ${p.narrative.uncertaintyPolicy || '—'}`,
      '',
      'Hard filters:',
      `возраст: ${p.hardFilters.minAge ?? '—'}–${p.hardFilters.maxAge ?? '—'}`,
      `дистанция км: ${p.hardFilters.maxDistanceKm ?? '—'}`,
      `совместимость %: ${p.hardFilters.minCompatibilityPercent ?? '—'}`,
      `цели: ${(p.hardFilters.allowedRelationshipGoals ?? []).join(', ') || '—'}`,
      `стоп-слова: ${(p.hardFilters.blockedKeywords ?? []).join(', ') || '—'}`,
      `предпочтительные слова: ${(p.hardFilters.preferredKeywords ?? []).join(', ') || '—'}`,
      '',
      summaryBlock,
    ].join('\n');

    try {
      const completion = await this.withRetry(async () =>
        this.client.chat.completions.create(
          {
            model,
            temperature: Math.min(this.options.temperature, 0.35),
            max_tokens: Math.max(this.options.maxOutputTokens, 900),
            response_format:
              this.options.responseFormatMode === 'json-object'
                ? { type: 'json_object' }
                : undefined,
            messages: [
              { role: 'system', content: AUDIENCE_FROM_EURYDICE_SYSTEM },
              { role: 'user', content: userText },
            ],
          },
          { timeout: requestTimeoutMs },
        ),
      );

      const content = completion.choices[0]?.message?.content ?? '';
      let analysis: AudienceFromEurydiceAnalysis;
      try {
        analysis = AudienceFromEurydiceAnalysisSchema.parse(extractJsonObject(content));
      } catch (parseError) {
        if (!this.options.jsonRepairEnabled) {
          throw parseError;
        }
        const repair = await this.client.chat.completions.create(
          {
            model,
            temperature: 0,
            max_tokens: Math.max(this.options.maxOutputTokens, 900),
            response_format:
              this.options.responseFormatMode === 'json-object'
                ? { type: 'json_object' }
                : undefined,
            messages: [
              {
                role: 'system',
                content:
                  'Исправь ответ в валидный JSON по схеме Audience from Eurydice. Без markdown.',
              },
              {
                role: 'user',
                content: `${AUDIENCE_FROM_EURYDICE_JSON}\n\nИсходный ответ:\n${content}`,
              },
            ],
          },
          { timeout: requestTimeoutMs },
        );
        analysis = AudienceFromEurydiceAnalysisSchema.parse(
          extractJsonObject(repair.choices[0]?.message?.content ?? ''),
        );
      }

      return {
        analysis,
        model,
        latencyMs: Date.now() - started,
        promptTokens: completion.usage?.prompt_tokens,
        completionTokens: completion.usage?.completion_tokens,
      };
    } catch (error) {
      const mapped = mapProviderError(error);
      throw new Error(mapped.userMessage);
    }
  }

  /**
   * Indexing helper: short searchable description + essence signals for cloud photos.
   * Call in small batches (≤4) to keep latency reasonable.
   */
  async describePhotosForIndex(input: {
    images: AiImageInput[];
  }): Promise<{
    items: Array<{
      label: string;
      description: string;
      essence: string;
      signals: string[];
    }>;
    model: string;
    latencyMs: number;
  }> {
    const started = Date.now();
    const model = this.options.primaryModel;
    const images = input.images.slice(0, 4);
    if (images.length === 0) {
      return { items: [], model, latencyMs: 0 };
    }

    const contentParts: ChatCompletionContentPart[] = [
      {
        type: 'text',
        text: [
          'Ты индексируешь фото для поиска и сборки образов в личной библиотеке.',
          'Для каждого фото верни описание сцены, суть кадра и теги настроения/контекста.',
          'signals: настроение, место/сеттинг, активность, стиль, роль (лицо/полный рост/lifestyle и т.п.).',
          'Не выдумывай имена людей и факты, которых нет на фото. Пиши по-русски.',
          'Верни ТОЛЬКО JSON:',
          '{"items":[{"index":0,"description":"1-2 предложения","essence":"суть 3-8 слов","signals":["тег","..."]}]}',
          `Число фото: ${images.length}. index с 0.`,
        ].join('\n'),
      },
    ];
    for (const [i, image] of images.entries()) {
      contentParts.push({ type: 'text', text: `[photo ${i}] ${image.label}` });
      contentParts.push({
        type: 'image_url',
        image_url: {
          url: `data:${image.mimeType};base64,${image.base64}`,
          detail: 'low',
        },
      });
    }

    const completion = await this.withRetry(async () =>
      this.client.chat.completions.create({
        model,
        temperature: 0.2,
        max_tokens: Math.max(this.options.maxOutputTokens, 900),
        response_format:
          this.options.responseFormatMode === 'json-object'
            ? { type: 'json_object' }
            : undefined,
        messages: [{ role: 'user', content: contentParts }],
      }),
    );

    const content = completion.choices[0]?.message?.content?.trim() ?? '';
    type DescribedItem = {
      index?: number;
      description?: string;
      essence?: string;
      signals?: string[];
    };
    const parsed = extractJsonObject(content) as { items?: DescribedItem[] };
    const byIndex = new Map<number, DescribedItem>();
    for (const item of parsed.items ?? []) {
      if (typeof item?.index === 'number') byIndex.set(item.index, item);
    }

    const items = images.map((image, index) => {
      const row = byIndex.get(index);
      const description =
        row?.description?.trim() ||
        row?.essence?.trim() ||
        `Фото: ${image.label}`;
      const essence = row?.essence?.trim() || description.slice(0, 80);
      const signals = [
        essence,
        ...(row?.signals ?? []).map((s) => String(s).trim()).filter(Boolean),
      ].slice(0, 10);
      return {
        label: image.label,
        description,
        essence,
        signals,
      };
    });

    return {
      items,
      model,
      latencyMs: Date.now() - started,
    };
  }

  /**
   * Cluster indexed photo descriptions into overlapping ready-made looks/groups.
   * Text-only — uses existing descriptions, does not invent scenes.
   */
  async clusterPhotoLooks(input: {
    photos: Array<{
      id: string;
      fileName: string;
      description: string;
      signals: string[];
    }>;
  }): Promise<{
    groups: Array<{
      name: string;
      brief: string;
      moodTags: string[];
      photoIds: string[];
    }>;
    model: string;
    latencyMs: number;
  }> {
    const started = Date.now();
    const model = this.options.primaryModel;
    const photos = input.photos.slice(0, 80);
    if (photos.length === 0) {
      return { groups: [], model, latencyMs: 0 };
    }

    const catalog = photos
      .map(
        (p, i) =>
          `${i + 1}. id=${p.id} | ${p.fileName} | ${p.description} | tags: ${(p.signals ?? []).slice(0, 6).join(', ')}`,
      )
      .join('\n');

    const prompt = [
      'Ты собираешь готовые «образы» (looks) из уже проиндексированных фото пользователя.',
      'Разбей каталог на 4–12 пересекающихся групп. Группа = цельный образ/настроение/сюжет, который уже можно собрать из существующих фото.',
      'Фото может входить в несколько групп. Не выдумывай кадры — только id из списка.',
      'name — короткий ярлык образа; brief — что это за образ и когда его использовать; moodTags — 2–6 тегов.',
      'Верни ТОЛЬКО JSON:',
      '{"groups":[{"name":"...","brief":"...","moodTags":["..."],"photoIds":["id1","id2"]}]}',
      '',
      'Каталог:',
      catalog,
    ].join('\n');

    const completion = await this.withRetry(async () =>
      this.client.chat.completions.create({
        model,
        temperature: 0.3,
        max_tokens: Math.max(this.options.maxOutputTokens, 1600),
        response_format:
          this.options.responseFormatMode === 'json-object'
            ? { type: 'json_object' }
            : undefined,
        messages: [{ role: 'user', content: prompt }],
      }),
    );

    const content = completion.choices[0]?.message?.content?.trim() ?? '';
    const parsed = extractJsonObject(content) as {
      groups?: Array<{
        name?: string;
        brief?: string;
        moodTags?: string[];
        photoIds?: string[];
      }>;
    };
    const allowed = new Set(photos.map((p) => p.id));
    const groups = (parsed.groups ?? [])
      .map((g) => ({
        name: String(g.name ?? '').trim(),
        brief: String(g.brief ?? '').trim(),
        moodTags: (g.moodTags ?? [])
          .map((t) => String(t).trim())
          .filter(Boolean)
          .slice(0, 8),
        photoIds: (g.photoIds ?? [])
          .map((id) => String(id).trim())
          .filter((id) => allowed.has(id))
          .slice(0, 12),
      }))
      .filter((g) => g.name && g.photoIds.length >= 1)
      .slice(0, 12);

    return { groups, model, latencyMs: Date.now() - started };
  }

  /**
   * Short human-readable summary of an indexed photo library for Settings UI.
   */
  async summarizeIndexedLibrary(input: {
    providerLabel: string;
    indexedCount: number;
    describedCount: number;
    lookGroups: Array<{
      name: string;
      brief: string;
      moodTags: string[];
      photoCount: number;
    }>;
  }): Promise<{ summary: string; model: string; latencyMs: number }> {
    const started = Date.now();
    const model = this.options.primaryModel;
    const looks = input.lookGroups
      .slice(0, 12)
      .map(
        (g) =>
          `- ${g.name} (${g.photoCount} фото): ${g.brief} | ${g.moodTags.join(', ')}`,
      )
      .join('\n');

    const prompt = [
      'Сделай краткий вывод (2–4 предложения) по фототеке пользователя после индексации.',
      'Только по данным ниже, без выдумок. По-русски.',
      'Упомяни объём, какие готовые образы уже есть, чего не хватает для анкеты (если видно).',
      'Верни ТОЛЬКО JSON: {"summary":"..."}',
      '',
      `Источник: ${input.providerLabel}`,
      `В индексе: ${input.indexedCount}`,
      `Описано ИИ: ${input.describedCount}`,
      'Образы (looks):',
      looks || '— групп пока нет',
    ].join('\n');

    const completion = await this.withRetry(async () =>
      this.client.chat.completions.create({
        model,
        temperature: 0.3,
        max_tokens: Math.max(this.options.maxOutputTokens, 500),
        response_format:
          this.options.responseFormatMode === 'json-object'
            ? { type: 'json_object' }
            : undefined,
        messages: [{ role: 'user', content: prompt }],
      }),
    );

    const content = completion.choices[0]?.message?.content?.trim() ?? '';
    const parsed = extractJsonObject(content) as { summary?: string };
    const summary = String(parsed.summary ?? '').trim();
    return {
      summary:
        summary ||
        `Проиндексировано ${input.indexedCount} фото, описано ${input.describedCount}.`,
      model,
      latencyMs: Date.now() - started,
    };
  }

  /**
   * Propose exactly 3 diverse profile types from Identity/Audience + existing photo catalog/looks.
   * Must not invent facts or photo ids outside the catalog.
   */
  async proposeProfileTypeSets(input: {
    identity: {
      city?: string | null;
      occupation?: string | null;
      relationshipIntent?: string | null;
      realInterests: string[];
      explicitNonIdentity: string[];
      aiSummary?: string | null;
    };
    audience: {
      codeName?: string | null;
      summary?: string | null;
    };
    lookGroups: Array<{
      name: string;
      brief: string;
      moodTags: string[];
      photoIds: string[];
    }>;
    photos: Array<{
      id: string;
      fileName: string;
      description: string;
      signals: string[];
    }>;
    freeformNote?: string;
  }): Promise<{
    sets: Array<{
      name: string;
      bio: string;
      brief: string;
      desiredPhotoVision: string;
      photoIds: string[];
      photoReasons: string[];
      strengths: string[];
      weaknesses: string[];
    }>;
    model: string;
    latencyMs: number;
  }> {
    const started = Date.now();
    const model = this.options.primaryModel;
    const photos = input.photos.slice(0, 60);
    const catalog = photos
      .map(
        (p) =>
          `- id=${p.id} | ${p.fileName} | ${p.description} | ${(p.signals ?? []).slice(0, 5).join(', ')}`,
      )
      .join('\n');
    const looks = input.lookGroups
      .slice(0, 12)
      .map(
        (g) =>
          `- ${g.name}: ${g.brief} | mood: ${g.moodTags.join(', ')} | photos: ${g.photoIds.slice(0, 8).join(', ')}`,
      )
      .join('\n');

    const prompt = [
      'Ты Orpheus: предлагаешь ровно 3 РАЗНЫХ типа анкеты Twinby.',
      'Правила аутентичности: используй ТОЛЬКО факты Identity/Audience и ТОЛЬКО photo id из каталога.',
      'Не выдумывай интересы, места, профессию, события. Нельзя добавлять хобби «для красоты».',
      'Три типа должны отличаться акцентом/настроением/сюжетом — не перемешивать одни и те же формулировки.',
      'Для каждого типа:',
      '- name: яркий заголовок типа;',
      '- bio: 2–4 предложения для анкеты из реальных фактов + упаковка под акцент;',
      '- brief: бриф — что вложить в этот образ (логика типа);',
      '- desiredPhotoVision: какие фото нужны (настроение/сюжет/роли), опираясь на то что есть;',
      '- photoIds: 2–6 id из каталога, единый связный набор (лучше из одного look / близких looks);',
      '- photoReasons: по одной короткой причине на каждое фото;',
      '- strengths / weaknesses.',
      'Если фото мало — честно напиши в weaknesses, не выдумывай кадры.',
      'Верни ТОЛЬКО JSON:',
      '{"sets":[{"name":"...","bio":"...","brief":"...","desiredPhotoVision":"...","photoIds":["..."],"photoReasons":["..."],"strengths":["..."],"weaknesses":["..."]}]}',
      '',
      `Identity city: ${input.identity.city ?? '—'}`,
      `occupation: ${input.identity.occupation ?? '—'}`,
      `intent: ${input.identity.relationshipIntent ?? '—'}`,
      `interests: ${input.identity.realInterests.join('; ') || '—'}`,
      `not-me: ${input.identity.explicitNonIdentity.join('; ') || '—'}`,
      `summary: ${input.identity.aiSummary ?? '—'}`,
      `Audience: ${input.audience.codeName ?? '—'} · ${input.audience.summary ?? '—'}`,
      input.freeformNote ? `Заметка пользователя: ${input.freeformNote}` : '',
      '',
      'Готовые образы (looks):',
      looks || '— пока нет групп',
      '',
      'Каталог фото:',
      catalog || '— пусто',
    ]
      .filter(Boolean)
      .join('\n');

    const completion = await this.withRetry(async () =>
      this.client.chat.completions.create({
        model,
        temperature: 0.55,
        max_tokens: Math.max(this.options.maxOutputTokens, 2200),
        response_format:
          this.options.responseFormatMode === 'json-object'
            ? { type: 'json_object' }
            : undefined,
        messages: [{ role: 'user', content: prompt }],
      }),
    );

    const content = completion.choices[0]?.message?.content?.trim() ?? '';
    const parsed = extractJsonObject(content) as {
      sets?: Array<{
        name?: string;
        bio?: string;
        brief?: string;
        desiredPhotoVision?: string;
        photoIds?: string[];
        photoReasons?: string[];
        strengths?: string[];
        weaknesses?: string[];
      }>;
    };
    const allowed = new Set(photos.map((p) => p.id));
    const sets = (parsed.sets ?? [])
      .map((s) => {
        const photoIds = (s.photoIds ?? [])
          .map((id) => String(id).trim())
          .filter((id) => allowed.has(id))
          .slice(0, 6);
        return {
          name: String(s.name ?? '').trim().slice(0, 80),
          bio: String(s.bio ?? '').trim().slice(0, 2000),
          brief: String(s.brief ?? '').trim().slice(0, 2000),
          desiredPhotoVision: String(s.desiredPhotoVision ?? '')
            .trim()
            .slice(0, 2000),
          photoIds,
          photoReasons: (s.photoReasons ?? [])
            .map((r) => String(r).trim())
            .filter(Boolean)
            .slice(0, 6),
          strengths: (s.strengths ?? [])
            .map((x) => String(x).trim())
            .filter(Boolean)
            .slice(0, 5),
          weaknesses: (s.weaknesses ?? [])
            .map((x) => String(x).trim())
            .filter(Boolean)
            .slice(0, 5),
        };
      })
      .filter((s) => s.name && s.bio)
      .slice(0, 3);

    return { sets, model, latencyMs: Date.now() - started };
  }

  /**
   * Pick a cohesive photo set for an existing type brief / desired vision.
   */
  async suggestPhotosForBrief(input: {
    setName?: string;
    brief?: string;
    desiredPhotoVision?: string;
    limit: number;
    lookGroups: Array<{
      name: string;
      brief: string;
      moodTags: string[];
      photoIds: string[];
    }>;
    photos: Array<{
      id: string;
      fileName: string;
      description: string;
      signals: string[];
    }>;
  }): Promise<{
    photoIds: string[];
    reasons: string[];
    message?: string;
    model: string;
    latencyMs: number;
  }> {
    const started = Date.now();
    const model = this.options.primaryModel;
    const photos = input.photos.slice(0, 60);
    if (photos.length === 0) {
      return {
        photoIds: [],
        reasons: [],
        message: 'Нет фото в индексе',
        model,
        latencyMs: 0,
      };
    }

    const catalog = photos
      .map(
        (p) =>
          `- id=${p.id} | ${p.fileName} | ${p.description} | ${(p.signals ?? []).slice(0, 5).join(', ')}`,
      )
      .join('\n');
    const looks = input.lookGroups
      .slice(0, 12)
      .map(
        (g) =>
          `- ${g.name}: ${g.brief} | ${g.moodTags.join(', ')} | ${g.photoIds.slice(0, 8).join(', ')}`,
      )
      .join('\n');

    const prompt = [
      'Подбери связный набор фото под тип анкеты.',
      'Фото должны быть объединены одной мыслью (настроение/сюжет/стиль), не случайный микс.',
      'Используй только id из каталога. Лучше опереться на готовый look, если подходит.',
      `Нужно ${Math.min(Math.max(input.limit, 1), 6)} фото (можно меньше, если материалов мало).`,
      'Верни ТОЛЬКО JSON: {"photoIds":["..."],"reasons":["почему это фото"],"message":"кратко"}',
      '',
      `Тип: ${input.setName ?? '—'}`,
      `Бриф: ${input.brief ?? '—'}`,
      `Какие фото нужны: ${input.desiredPhotoVision ?? '—'}`,
      '',
      'Looks:',
      looks || '—',
      '',
      'Каталог:',
      catalog,
    ].join('\n');

    const completion = await this.withRetry(async () =>
      this.client.chat.completions.create({
        model,
        temperature: 0.35,
        max_tokens: Math.max(this.options.maxOutputTokens, 900),
        response_format:
          this.options.responseFormatMode === 'json-object'
            ? { type: 'json_object' }
            : undefined,
        messages: [{ role: 'user', content: prompt }],
      }),
    );

    const content = completion.choices[0]?.message?.content?.trim() ?? '';
    const parsed = extractJsonObject(content) as {
      photoIds?: string[];
      reasons?: string[];
      message?: string;
    };
    const allowed = new Set(photos.map((p) => p.id));
    const photoIds = (parsed.photoIds ?? [])
      .map((id) => String(id).trim())
      .filter((id) => allowed.has(id))
      .slice(0, Math.min(Math.max(input.limit, 1), 6));

    return {
      photoIds,
      reasons: (parsed.reasons ?? [])
        .map((r) => String(r).trim())
        .filter(Boolean)
        .slice(0, 6),
      message: parsed.message?.trim(),
      model,
      latencyMs: Date.now() - started,
    };
  }

  /**
   * Draft Identity Model fields from an own Twinby profile snapshot (text + optional photos).
   * Does not invent facts — uncertain fields stay null/empty for user confirmation.
   */
  async analyzeOwnProfileIdentity(
    input: AnalyzeOwnProfileIdentityInput,
  ): Promise<AnalyzeOwnProfileIdentityResult> {
    const started = Date.now();
    const model = this.options.primaryModel;
    const requestTimeoutMs = Math.max(this.options.timeoutMs, 120_000);
    const photos = (input.photos ?? []).slice(0, 4);

    const textBlock = [
      IDENTITY_FROM_SNAPSHOT_JSON,
      '',
      'Слепок собственного профиля Twinby:',
      `Bio:\n${input.bio?.trim() || '—'}`,
      `Поле «занятие» в Twinby (может быть шуткой): ${input.occupation?.trim() || '—'}`,
      `Интересы из Twinby: ${(input.interests ?? []).join(', ') || '—'}`,
      `Цель отношений в Twinby: ${input.relationshipGoal?.trim() || '—'}`,
      `Фото профиля приложено: ${photos.length}`,
    ].join('\n');

    const contentParts: ChatCompletionContentPart[] = [{ type: 'text', text: textBlock }];
    for (const [i, image] of photos.entries()) {
      contentParts.push({ type: 'text', text: `[own-photo ${i + 1}] ${image.label}` });
      contentParts.push({
        type: 'image_url',
        image_url: {
          url: `data:${image.mimeType};base64,${image.base64}`,
          detail: this.options.imageDetail === 'high' ? 'high' : 'low',
        },
      });
    }

    try {
      const completion = await this.withRetry(async () =>
        this.client.chat.completions.create(
          {
            model,
            temperature: Math.min(this.options.temperature, 0.3),
            max_tokens: Math.max(this.options.maxOutputTokens, 1200),
            response_format:
              this.options.responseFormatMode === 'json-object'
                ? { type: 'json_object' }
                : undefined,
            messages: [
              { role: 'system', content: IDENTITY_FROM_SNAPSHOT_SYSTEM },
              { role: 'user', content: contentParts },
            ],
          },
          { timeout: requestTimeoutMs },
        ),
      );

      const content = completion.choices[0]?.message?.content ?? '';
      let analysis: IdentitySnapshotAnalysis;
      try {
        analysis = IdentitySnapshotAnalysisSchema.parse(extractJsonObject(content));
      } catch (parseError) {
        if (!this.options.jsonRepairEnabled) {
          throw parseError;
        }
        const repair = await this.client.chat.completions.create(
          {
            model,
            temperature: 0,
            max_tokens: Math.max(this.options.maxOutputTokens, 1200),
            response_format:
              this.options.responseFormatMode === 'json-object'
                ? { type: 'json_object' }
                : undefined,
            messages: [
              {
                role: 'system',
                content:
                  'Исправь ответ в валидный JSON по схеме Identity snapshot analysis. Без markdown.',
              },
              {
                role: 'user',
                content: `${IDENTITY_FROM_SNAPSHOT_JSON}\n\nИсходный ответ:\n${content}`,
              },
            ],
          },
          { timeout: requestTimeoutMs },
        );
        analysis = IdentitySnapshotAnalysisSchema.parse(
          extractJsonObject(repair.choices[0]?.message?.content ?? ''),
        );
      }

      return {
        analysis,
        draft: identityAnalysisToDraft(analysis),
        model,
        latencyMs: Date.now() - started,
        promptTokens: completion.usage?.prompt_tokens,
        completionTokens: completion.usage?.completion_tokens,
      };
    } catch (error) {
      const mapped = mapProviderError(error);
      throw new Error(mapped.userMessage);
    }
  }

  async evaluateProfile(input: EvaluateProfileInput): Promise<AiDecisionResult> {
    const started = Date.now();
    const userText = this.buildEvaluatePrompt(input);
    const contentParts: ChatCompletionContentPart[] = [{ type: 'text', text: userText }];

    // Prefer cached summary — do not re-send reference photos on every evaluation.
    const sendReferencePhotos = !input.preferenceSummary;
    if (sendReferencePhotos) {
      for (const image of [
        ...(input.positiveReferences ?? []).map((img) => ({ ...img, kind: 'positive' })),
        ...(input.negativeReferences ?? []).map((img) => ({ ...img, kind: 'negative' })),
      ]) {
        contentParts.push({ type: 'text', text: `[${image.kind}] ${image.label}` });
        contentParts.push({
          type: 'image_url',
          image_url: {
            url: `data:${image.mimeType};base64,${image.base64}`,
            detail: this.options.imageDetail,
          },
        });
      }
    }

    for (const image of input.candidateImages.slice(0, AI_CANDIDATE_PHOTO_CAP)) {
      contentParts.push({ type: 'text', text: `[C1 candidate] ${image.label}` });
      contentParts.push({
        type: 'image_url',
        image_url: {
          url: `data:${image.mimeType};base64,${image.base64}`,
          detail: this.options.imageDetail,
        },
      });
    }

    if (input.signal?.aborted) {
      throw new Error('AI-запрос отменён');
    }

    try {
      const { completion, model } = await this.createChatWithFallback(
        {
          temperature: this.options.temperature,
          max_tokens: this.options.maxOutputTokens,
          response_format:
            this.options.responseFormatMode === 'json-object'
              ? { type: 'json_object' }
              : undefined,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: contentParts },
          ],
        },
        input.signal ? { signal: input.signal } : undefined,
      );

      const content = completion.choices[0]?.message?.content ?? '';
      let decision: AiDecision;
      try {
        decision = AiDecisionSchema.parse(
          normalizeAiDecisionJson(extractJsonObject(content)),
        );
      } catch (parseError) {
        if (!this.options.jsonRepairEnabled) {
          throw parseError;
        }
        decision = await this.repairJson(content, model);
      }

      return {
        decision: decision.action,
        confidence: decision.confidence,
        reasons: [decision.shortReason, ...decision.matchedPreferences].filter(Boolean),
        raw: decision,
        promptTokens: completion.usage?.prompt_tokens,
        completionTokens: completion.usage?.completion_tokens,
        model,
        latencyMs: Date.now() - started,
      };
    } catch (error) {
      const mapped = mapProviderError(error);
      throw new Error(mapped.userMessage);
    }
  }

  /** Layer A — vision facts only. Prefers fallback model when set (cheaper extraction). */
  async extractEvidence(input: ExtractEvidenceInput): Promise<ExtractEvidenceResult> {
    const started = Date.now();
    const userText = [
      EVIDENCE_JSON_INSTRUCTION,
      '',
      'Текст анкеты (для bioSignals; не выдумывай внешность из текста):',
      `Возраст UI: ${input.candidate.age ?? '—'}`,
      `Bio: ${input.candidate.bio ?? '—'}`,
      `Интересы: ${filterFinanceNoiseInterests(input.candidate.interests).join(', ') || '—'}`,
      `Цель: ${input.candidate.relationshipGoal ?? '—'}`,
      `Прочий текст: ${input.candidate.otherVisibleText.join(' | ') || '—'}`,
      '',
      'Игнорируй «Финансы» — системный чип Twinby, не интерес человека.',
      'Фото анкеты приложены image-частями — смотри все.',
    ].join('\n');

    const contentParts: ChatCompletionContentPart[] = [{ type: 'text', text: userText }];
    for (const image of input.candidateImages.slice(0, AI_CANDIDATE_PHOTO_CAP)) {
      contentParts.push({ type: 'text', text: `[photo] ${image.label}` });
      contentParts.push({
        type: 'image_url',
        image_url: {
          url: `data:${image.mimeType};base64,${image.base64}`,
          detail: this.options.imageDetail,
        },
      });
    }

    if (input.signal?.aborted) {
      throw new Error('AI-запрос отменён');
    }

    try {
      const { completion, model } = await this.createChatWithFallback(
        {
          temperature: Math.min(0.2, this.options.temperature),
          max_tokens: Math.min(512, this.options.maxOutputTokens),
          response_format:
            this.options.responseFormatMode === 'json-object'
              ? { type: 'json_object' }
              : undefined,
          messages: [
            { role: 'system', content: EVIDENCE_SYSTEM_PROMPT },
            { role: 'user', content: contentParts },
          ],
        },
        input.signal ? { signal: input.signal } : undefined,
        { preferFallbackFirst: true },
      );

      const content = completion.choices[0]?.message?.content ?? '';
      const evidence = ProfileEvidenceSchema.parse(
        normalizeProfileEvidenceJson(extractJsonObject(content)),
      );

      return {
        evidence,
        model,
        latencyMs: Date.now() - started,
        promptTokens: completion.usage?.prompt_tokens,
        completionTokens: completion.usage?.completion_tokens,
      };
    } catch (error) {
      const mapped = mapProviderError(error);
      throw new Error(mapped.userMessage);
    }
  }

  /** Layer B — text-only preference decision from evidence. */
  async decideFromEvidence(input: DecideFromEvidenceInput): Promise<AiDecisionResult> {
    const started = Date.now();
    const userText = this.buildDecideFromEvidencePrompt(input);

    if (input.signal?.aborted) {
      throw new Error('AI-запрос отменён');
    }

    try {
      const { completion, model } = await this.createChatWithFallback(
        {
          temperature: this.options.temperature,
          max_tokens: this.options.maxOutputTokens,
          response_format:
            this.options.responseFormatMode === 'json-object'
              ? { type: 'json_object' }
              : undefined,
          messages: [
            { role: 'system', content: DECISION_FROM_EVIDENCE_SYSTEM },
            { role: 'user', content: userText },
          ],
        },
        input.signal ? { signal: input.signal } : undefined,
      );

      const content = completion.choices[0]?.message?.content ?? '';
      let decision: AiDecision;
      try {
        decision = AiDecisionSchema.parse(
          normalizeAiDecisionJson(extractJsonObject(content)),
        );
      } catch (parseError) {
        if (!this.options.jsonRepairEnabled) {
          throw parseError;
        }
        decision = await this.repairJson(content, model);
      }

      return {
        decision: decision.action,
        confidence: decision.confidence,
        reasons: [decision.shortReason, ...decision.matchedPreferences].filter(Boolean),
        raw: decision,
        evidence: input.evidence,
        promptTokens: completion.usage?.prompt_tokens,
        completionTokens: completion.usage?.completion_tokens,
        model,
        latencyMs: Date.now() - started,
      };
    } catch (error) {
      const mapped = mapProviderError(error);
      throw new Error(mapped.userMessage);
    }
  }

  /**
   * A (vision evidence) → B (text decision).
   * Falls back to mono evaluateProfile if either stage fails parse after retries at caller.
   */
  async evaluateProfileTwoStage(input: EvaluateProfileInput): Promise<AiDecisionResult> {
    const started = Date.now();
    const extraction = await this.extractEvidence({
      candidate: input.candidate,
      candidateImages: input.candidateImages,
      signal: input.signal,
    });
    if (input.signal?.aborted) {
      throw new Error('AI-запрос отменён');
    }
    const decision = await this.decideFromEvidence({
      preferenceProfile: input.preferenceProfile,
      preferenceSummary: input.preferenceSummary,
      candidate: input.candidate,
      evidence: extraction.evidence,
      recentFeedback: input.recentFeedback,
      signal: input.signal,
    });

    const promptSum =
      (extraction.promptTokens ?? 0) + (decision.promptTokens ?? 0);
    const completionSum =
      (extraction.completionTokens ?? 0) + (decision.completionTokens ?? 0);

    return {
      ...decision,
      evidence: extraction.evidence,
      promptTokens: promptSum > 0 ? promptSum : undefined,
      completionTokens: completionSum > 0 ? completionSum : undefined,
      model: `${extraction.model}+${decision.model}`,
      latencyMs: Date.now() - started,
    };
  }

  async analyzeSessionFeedback(
    input: AnalyzeSessionFeedbackInput,
  ): Promise<SessionFeedbackAnalysis> {
    const model = this.options.primaryModel;
    const p = input.preferenceProfile;
    const itemsBlock = input.items
      .map((item, i) => {
        const userLabel = item.agreed
          ? `пользователь СОГЛАСЕН (модель права: ${item.modelDecision ?? '—'})`
          : `пользователь исправил на: ${item.userDecision ?? '—'}`;
        const parts = [
          `${i + 1}. ${item.displayName ?? 'анкета'}`,
          `модель: ${item.modelDecision ?? '—'}`,
          userLabel,
          item.modelExcerpt
            ? `описание модели: ${item.modelExcerpt.slice(0, 900)}`
            : '',
          item.bio ? `bio анкеты: ${item.bio.slice(0, 300)}` : '',
          item.comment ? `комментарий пользователя: «${item.comment.slice(0, 300)}»` : '',
        ].filter(Boolean);
        return parts.join(' | ');
      })
      .join('\n');

    const revisionBlock =
      input.revisionNote?.trim() || input.previousUnderstanding?.trim()
        ? [
            'Пользователь просит переосмыслить формулировку:',
            input.previousUnderstanding?.trim()
              ? `Предыдущее понимание: ${input.previousUnderstanding.trim()}`
              : '',
            input.revisionNote?.trim()
              ? `Уточнение пользователя: ${input.revisionNote.trim()}`
              : '',
            'Дай обновлённое understanding с учётом уточнения.',
          ]
            .filter(Boolean)
            .join('\n')
        : '';

    const userText = [
      FEEDBACK_JSON_INSTRUCTION,
      '',
      'Текущие предпочтения:',
      ...formatNarrativeBlock(p.narrative),
      '',
      `Правки пользователя (${input.items.length}):`,
      itemsBlock || 'нет пунктов',
      revisionBlock ? `\n${revisionBlock}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const requestTimeoutMs = Math.max(this.options.timeoutMs, 180_000);

    try {
      const completion = await this.withRetry(async () =>
        this.client.chat.completions.create(
          {
            model,
            temperature: 0.3,
            max_tokens: Math.max(this.options.maxOutputTokens, 1200),
            response_format:
              this.options.responseFormatMode === 'json-object'
                ? { type: 'json_object' }
                : undefined,
            messages: [
              { role: 'system', content: FEEDBACK_SYSTEM_PROMPT },
              { role: 'user', content: userText },
            ],
          },
          { timeout: requestTimeoutMs },
        ),
      );

      const content = completion.choices[0]?.message?.content ?? '';
      let parsed: unknown;
      try {
        parsed = extractJsonObject(content);
      } catch (parseError) {
        if (!this.options.jsonRepairEnabled) {
          throw parseError;
        }
        const repair = await this.client.chat.completions.create(
          {
            model,
            temperature: 0,
            max_tokens: Math.max(this.options.maxOutputTokens, 1200),
            response_format:
              this.options.responseFormatMode === 'json-object'
                ? { type: 'json_object' }
                : undefined,
            messages: [
              {
                role: 'system',
                content: 'Исправь ответ в валидный JSON по схеме feedback analysis. Без markdown.',
              },
              {
                role: 'user',
                content: `${FEEDBACK_JSON_INSTRUCTION}\n\nИсходный ответ:\n${content}`,
              },
            ],
          },
          { timeout: requestTimeoutMs },
        );
        parsed = extractJsonObject(repair.choices[0]?.message?.content ?? '');
      }

      const raw = parsed as {
        understanding?: string;
        agreePrompt?: string;
        lessons?: string[];
        narrativePatch?: SessionFeedbackNarrativePatch;
      };
      const narrativePatch = SessionFeedbackNarrativePatchSchema.parse(
        raw.narrativePatch ?? {},
      );

      return SessionFeedbackAnalysisSchema.parse({
        sessionId: input.sessionId,
        understanding: raw.understanding?.trim() || 'Я учла ваши правки к решениям.',
        agreePrompt: raw.agreePrompt?.trim() || 'Ты согласен?',
        lessons: Array.isArray(raw.lessons) ? raw.lessons.map(String) : [],
        narrativePatch,
        itemsReviewed: input.items.length,
      });
    } catch (error) {
      const mapped = mapProviderError(error);
      throw new Error(mapped.userMessage);
    }
  }

  private async repairJson(brokenContent: string, model: string): Promise<AiDecision> {
    const completion = await this.client.chat.completions.create({
      model,
      temperature: 0,
      max_tokens: this.options.maxOutputTokens,
      response_format:
        this.options.responseFormatMode === 'json-object'
          ? { type: 'json_object' }
          : undefined,
      messages: [
        {
          role: 'system',
          content: 'Исправь ответ в валидный JSON по требуемой схеме. Без markdown.',
        },
        {
          role: 'user',
          content: `${DECISION_JSON_INSTRUCTION}\n\nИсходный ответ:\n${brokenContent}`,
        },
      ],
    });
    const content = completion.choices[0]?.message?.content ?? '';
    return AiDecisionSchema.parse(
      normalizeAiDecisionJson(extractJsonObject(content)),
    );
  }

  private buildPreferenceContextBlocks(input: {
    preferenceProfile: PreferenceProfile;
    preferenceSummary?: PreferenceSummary;
    candidate: EvaluateProfileInput['candidate'];
    recentFeedback?: UserDecisionFeedback[];
  }): string[] {
    const { preferenceProfile: p, candidate: c, preferenceSummary: s, recentFeedback } =
      input;
    const summaryBlock = s
      ? [
          'C2 summary референсов (кэш):',
          `+ визуальное: ${(s.positiveVisualPatterns ?? []).join('; ') || '—'}`,
          `- визуальное: ${(s.negativeVisualPatterns ?? []).join('; ') || '—'}`,
          `+ подача (C4): ${(s.positivePresentationPatterns ?? []).join('; ') || '—'}`,
          `- подача (C4): ${(s.negativePresentationPatterns ?? []).join('; ') || '—'}`,
          `lifestyle: ${(s.lifestylePreferences ?? []).join('; ') || '—'}`,
          `bio: ${(s.bioPreferences ?? []).join('; ') || '—'}`,
          `hardRejects (доп. к C0): ${(s.hardRejects ?? []).join('; ') || '—'}`,
          `uncertainties: ${(s.uncertainties ?? []).join('; ') || '—'}`,
        ].join('\n')
      : 'C2 summary референсов отсутствует.';

    const feedbackBlock =
      recentFeedback && recentFeedback.length > 0
        ? [
            'C3 калибровка — недавние решения пользователя:',
            ...recentFeedback.map((f, i) => {
              const corrected =
                f.corrected && f.modelDecision && f.modelDecision !== f.userDecision
                  ? `модель предложила ${f.modelDecision}, пользователь исправил`
                  : f.corrected
                    ? 'решение пользователя'
                    : 'подтверждено';
              const comment = f.comment?.trim() ? `комментарий: «${f.comment.trim()}»` : '';
              const label = f.label ? ` · ${f.label}` : '';
              const why = f.reasons?.length
                ? ` · было: ${f.reasons.slice(0, 2).join('; ')}`
                : '';
              return `${i + 1}. ${f.userDecision.toUpperCase()} (${corrected})${label}${
                comment ? ` — ${comment}` : ''
              }${why}`;
            }),
          ].join('\n')
        : 'C3 калибровка: недавних пользовательских решений пока нет.';

    const w = p.weights;
    const t = p.thresholds;
    return [
      'C0 hardRejects / стоп-сигналы:',
      `скилы: ${joinSkills(p.narrative.stopSkills) || '—'}`,
      `текст: ${p.narrative.hardRejects || '—'}`,
      '',
      'C2 narrative вкуса:',
      ...formatNarrativeBlock(p.narrative),
      `При сомнении: ${
        p.narrative.uncertaintyPolicy ||
        'не review — решай like/dislike по фото и референсам'
      }`,
      '',
      summaryBlock,
      '',
      feedbackBlock,
      '',
      'C5 текст анкеты:',
      `Возраст: ${c.age ?? 'неизвестно'}`,
      `Дистанция км: ${c.distanceKm ?? 'неизвестно'}`,
      `Совместимость %: ${c.compatibilityPercent ?? 'неизвестно'}`,
      `Цель: ${c.relationshipGoal ?? 'неизвестно'}`,
      `Интересы: ${filterFinanceNoiseInterests(c.interests).join(', ') || '—'}`,
      `Описание: ${c.bio ?? '—'}`,
      `Прочий текст: ${c.otherVisibleText.join(' | ') || '—'}`,
      '',
      'Не учитывай «Финансы»/деньги/доход в интересах — шум Twinby.',
      '',
      'C6 веса:',
      `visual=${w.visual}, presentation=${w.presentation}, bio=${w.bio}, interests=${w.interests}, compatibility=${w.compatibility}, distance=${w.distance}`,
      '',
      'C6 пороги:',
      `likeScore=${t.likeScore}, dislikeScore=${t.dislikeScore}`,
      `overallScore >= likeScore → like (если нет C0); overallScore <= dislikeScore → dislike; иначе uncertainty/C0, не review.`,
    ];
  }

  private buildEvaluatePrompt(input: EvaluateProfileInput): string {
    return [
      DECISION_JSON_INSTRUCTION,
      '',
      'Экземпляр контекста (следуй процедуре из system; чеклист здесь не дублируется):',
      '',
      ...this.buildPreferenceContextBlocks(input),
      '',
      'C1 фото анкеты приложены отдельными image-частями сообщения — главный evidence.',
    ].join('\n');
  }

  private buildDecideFromEvidencePrompt(input: DecideFromEvidenceInput): string {
    return [
      DECISION_JSON_INSTRUCTION,
      '',
      'Слой A — ProfileEvidence (единственный visual evidence, фото нет):',
      JSON.stringify(input.evidence, null, 2),
      '',
      ...this.buildPreferenceContextBlocks(input),
    ].join('\n');
  }

  private modelsToTry(preferFallbackFirst = false): string[] {
    const primary = this.options.primaryModel;
    const fallback =
      this.options.fallbackEnabled &&
      this.options.fallbackModel &&
      this.options.fallbackModel !== primary
        ? this.options.fallbackModel
        : undefined;
    if (!fallback) {
      return [primary];
    }
    return preferFallbackFirst ? [fallback, primary] : [primary, fallback];
  }

  /**
   * Try primary (or preferred) model; on 403/404 model-access errors switch to the other.
   */
  private async createChatWithFallback(
    body: Omit<OpenAI.Chat.ChatCompletionCreateParamsNonStreaming, 'model'>,
    requestOpts?: { signal?: AbortSignal; timeout?: number },
    options?: { preferFallbackFirst?: boolean },
  ): Promise<{
    completion: OpenAI.Chat.Completions.ChatCompletion;
    model: string;
  }> {
    const models = this.modelsToTry(Boolean(options?.preferFallbackFirst));
    let lastError: unknown;
    for (let i = 0; i < models.length; i += 1) {
      const model = models[i]!;
      try {
        const completion = await this.withRetry(async () =>
          this.client.chat.completions.create(
            { ...body, model },
            requestOpts,
          ),
        );
        if (i > 0) {
          // Soft signal in message content path — callers log model name.
        }
        return { completion, model };
      } catch (error) {
        lastError = error;
        const hasNext = i < models.length - 1;
        if (!hasNext || !isModelAccessError(error)) {
          throw error;
        }
      }
    }
    throw lastError;
  }

  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let attempt = 0;
    let lastError: unknown;
    while (attempt <= this.options.maxRetries) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        if (!shouldRetry(error, attempt, this.options.maxRetries)) {
          throw error;
        }
        const backoff = Math.min(4000, 300 * 2 ** attempt) + Math.floor(Math.random() * 200);
        await sleep(backoff);
        attempt += 1;
      }
    }
    throw lastError;
  }
}

export {
  type AiConnectionTest,
  type AiModel,
  type AiVisionTest,
  type ModelCapabilities,
};
