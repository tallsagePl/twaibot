# Orpheus & Eurydice

## Полное техническое задание, продуктовая спецификация и мастер-промпт для кодогенерирующей нейросети

> Версия: 1.1  
> Язык интерфейса MVP: русский  
> Язык кода, типов, таблиц, IPC и доменных сущностей: английский  
> Целевая платформа: Windows 10/11 x64  
> Стек: Electron + React + TypeScript + Node.js + SQLite + Drizzle + Appium + UiAutomator2 + WebdriverIO + Sharp  
> AI-провайдер: ArionHub, OpenAI-compatible API  
> Целевое Android-приложение: Twinby  
> Режим работы: локальное desktop-приложение на устройстве пользователя

---

# 0. Как использовать этот документ

Этот Markdown одновременно является:

1. полным техническим заданием;
2. продуктовой спецификацией;
3. архитектурным документом;
4. описанием доменной модели;
5. UX-спецификацией;
6. планом миграции существующего репозитория;
7. roadmap реализации;
8. набором acceptance criteria;
9. мастер-промптом для нейросети, которая будет писать код.

Кодогенерирующая нейросеть должна воспринимать документ целиком. Нельзя реализовывать только удобные части и игнорировать ограничения, правила атрибуции, безопасность, ручные подтверждения и требования к фактическому слепку Twinby.

## 0.1. Роль исполнителя

Ты — senior/staff full-stack engineer и solution architect с практическим опытом в TypeScript, React, Electron, Node.js, SQLite, Drizzle, Appium, Android UI automation, UiAutomator2, WebdriverIO, computer vision, multimodal LLM, OAuth, локальном хранении чувствительных данных, аналитике экспериментов и проектировании state machine.

Твоя задача — не переписать проект с нуля, а превратить существующий рабочий Twinby AI Swiper в единый продукт **Orpheus & Eurydice**, сохранив работающий вертикальный срез и расширив его второй продуктовой половиной.

## 0.2. Обязательный стиль работы

Работай итеративно. На каждом этапе:

1. изучи текущую реализацию;
2. объясни цель;
3. перечисли изменяемые файлы;
4. покажи структуру каталогов;
5. реализуй законченный вертикальный срез;
6. добавь миграции;
7. добавь typed contracts и IPC;
8. добавь unit/integration tests;
9. приведи команды запуска;
10. опиши ручную проверку;
11. перечисли неизвестные данные;
12. не переходи дальше, пока этап нельзя проверить локально.

Запрещено:

- писать новый параллельный backend;
- дублировать Audience Model для Orpheus и Eurydice;
- помещать новые функции внутрь уже перегруженного `LiveSessionService`;
- давать LLM право самостоятельно считать статистику по сырым событиям;
- придумывать selectors или координаты Twinby без discovery;
- автоматически отправлять сообщения;
- автоматически отвечать лайком;
- автоматически менять собственный профиль Twinby;
- молча подменять uncertain decision на dislike в research mode;
- скрывать invalid AI output за неявным fallback;
- хранить секреты в renderer или логах;
- считать текст анкеты доказанным фактом.

## 0.3. Формат ответа кодогенерирующей нейросети

Для каждого этапа ответ должен содержать:

```text
Цель
Архитектурное решение
Изменённые файлы
Миграции
Код
Тесты
Команды запуска
Ручная проверка
Известные ограничения
Следующий этап
```

---

# 1. Название, бренд и концепция

Полное название:

```text
Orpheus & Eurydice
```

Короткие варианты бренда:

```text
O&E
E&O
EO
```

Предпочтительный вариант логотипа — `E&O` или `EO`. Финальный графический стиль не блокирует MVP.

## 1.1. Eurydice

Eurydice отвечает на вопрос:

> Кого выбираю я?

Это существующая и развиваемая часть:

- захват анкет Twinby;
- анализ фото и текста;
- применение preference profile;
- positive/negative references;
- hard rejects;
- решение `like`, `dislike`, `review`;
- ручной и auto mode;
- обратная связь;
- развитие общей Audience Model.

## 1.2. Orpheus

Orpheus отвечает на вопрос:

> Как я представляю себя тем, кого выбираю?

Он отвечает за:

- Identity Model;
- облачную фотобиблиотеку;
- поиск фотографий;
- аудит фото и сета;
- генерацию трёх вариантов собственной анкеты;
- проверку аутентичности;
- photo plan;
- фактический слепок Twinby;
- ручные эксперименты;
- анализ входящих лайков и мэтчей;
- сравнение профилей;
- рекомендации, какой профиль использовать.

## 1.3. Единая формулировка продукта

> **Orpheus & Eurydice — локальная система двусторонней оптимизации знакомств. Eurydice изучает выбор пользователя и автоматизирует оценку анкет. Orpheus помогает честно представить пользователя выбранной аудитории, строит несколько вариантов профиля, проверяет их в реальном Twinby и анализирует результаты. Система не ищет одну идеальную анкету навсегда; она ищет диапазон устойчиво хороших стратегий с учётом ограниченности данных и изменения социальной среды.**

## 1.4. Главная метафора

Продукт не ищет одну «лучшую руку для all-in».

Он ищет диапазон хороших рук, позволяющий стабильно поднимать банк.

Следствия:

- один тест не объявляет вечного победителя;
- несколько профилей могут быть равноценными;
- один профиль может выигрывать по входящим лайкам, другой — по Telegram;
- сильные профили могут иметь разную волатильность;
- старые выводы могут устаревать;
- нужен портфель профилей.

---

# 2. Текущее состояние и правило миграции

## 2.1. Существующий проект

Текущий проект — Electron + React + TypeScript monorepo.

Уже используются:

- Electron main process;
- React renderer;
- typed IPC;
- SQLite + Drizzle;
- Sharp;
- Appium;
- UiAutomator2;
- WebdriverIO;
- ArionHub;
- preference profiles;
- visual references;
- AI preference summary;
- history;
- mock/live Twinby flow;
- auto mode;
- session/spend limits;
- abort in-flight AI;
- retries/recovery;
- locator profiles.

Существующие пакеты:

```text
packages/contracts
packages/config
packages/database
packages/logging
packages/ai-provider
packages/decision-engine
packages/session-orchestrator
packages/appium-client
packages/android-environment
packages/twinby-adapter
packages/profile-capture
packages/image-pipeline
packages/test-fixtures
```

## 2.2. Что нельзя сломать

- подключение к физическому Android;
- Appium lifecycle;
- открытие Twinby;
- feed detection;
- capture candidate;
- hard filters;
- ArionHub evaluation;
- preference summary cache;
- recent feedback;
- decision engine;
- review mode;
- auto mode;
- limits;
- stop/abort;
- history;
- cleanup временных screenshots;
- mock mode.

## 2.3. Главный технический риск

`LiveSessionService` и `MockSessionService` перегружены. Новые функции нельзя добавлять внутрь них.

Нужна декомпозиция:

```text
DeviceBootstrapService
TwinbyNavigationService
PreflightOrchestrator
OwnProfileCaptureService
CandidateCapturePipeline
CandidateEvaluationService
IncomingLikesScanService
MatchesScanService
DialogsScanService
RelationshipReconciliationService
ActionExecutionService
SessionLimitService
SessionRecoveryService
HistoryRecorder
```

После рефакторинга `LiveSessionService` только координирует шаги.

## 2.4. Правила миграции

- не переписывать всё;
- backward-compatible migrations;
- сохранить историю;
- расширять общую инфраструктуру;
- сначала contracts и DB, затем UI;
- временные adapters допустимы;
- breaking changes документировать;
- новая логика должна иметь tests.

---

# 3. Границы продукта

## 3.1. Разрешено

Приложение может:

- управлять видимым Android UI;
- делать screenshots и UI hierarchy dump;
- анализировать видимые фото и текст;
- выполнять like/dislike только в разрешённом режиме Eurydice;
- открывать собственный профиль;
- делать фактический snapshot;
- открывать likes, matches, dialogs;
- открывать анкеты из этих разделов;
- хранить уменьшенные preview/hash;
- подключать Google Drive и Яндекс Диск read-only;
- индексировать фото пользователя;
- строить profile variants;
- предлагать обработку фото;
- анализировать тесты;
- просить ручной feedback.

## 3.2. Запрещено

- создание аккаунтов;
- обход верификации;
- извлечение Twinby auth token;
- внутренний Twinby API;
- GPS/IP spoofing;
- anti-detection;
- обход anti-bot;
- автоматические сообщения;
- автоматическое начало диалога;
- автоматическое изменение own profile;
- автоматический ответный лайк;
- массовый архив чужих фото;
- создание ложной личности;
- обещание безопасности аккаунта.

## 3.3. Legal consent

Перед первым использованием показать предупреждение о риске нарушения правил Twinby и ограничении аккаунта.

```ts
interface LegalConsent {
  id: string;
  documentVersion: string;
  acceptedAt: string;
  appVersion: string;
}
```

---

# 4. Воронка и определения успеха

## 4.1. Полная воронка

```text
Просмотр профиля
→ входящий лайк
→ взаимный мэтч
→ начало диалога
→ содержательный диалог
→ Telegram
→ предложение свидания
→ назначенное свидание
→ состоявшееся свидание
```

Исходящий путь:

```text
Eurydice поставила лайк
→ мэтч
→ диалог
→ содержательный диалог
→ Telegram
→ свидание
```

## 4.2. Текущий поздний успех

Для MVP главная поздняя метрика — переход в Telegram.

Модель данных сразу поддерживает стадии свидания.

## 4.3. Входящий лайк

```text
Любой входящий лайк = успех профиля
Целевой входящий лайк = гиперуспех
```

Входящий лайк особенно ценен, потому что пользователь не совершал адресного действия по отношению к этой женщине.

## 4.4. Два типа результата

```ts
type MatchOrigin =
  | "incoming-like-first"
  | "outgoing-like-first"
  | "unknown";
```

`incoming-like-first` преимущественно отражает Orpheus.  
`outgoing-like-first` отражает совместную работу Orpheus и Eurydice.

## 4.5. Содержательный диалог

Базовое правило:

```text
не менее 10 сообщений суммарно
и
диалог продолжается больше суток
```

В MVP стадия преимущественно выставляется вручную. Если пользователь отмечает Telegram, ранние стадии считаются логически пройденными.

---

# 5. Навигация приложения

Основное меню:

```text
1. Eurydice
2. Orpheus
3. История
4. Настройки
```

Существующая `Session` переименовывается в `Eurydice`.

## 5.1. История

```text
Кандидаты
Профили
Мэтчи
```

### Кандидаты

Существующая история candidate evaluation.

### Профили

- variants;
- actual snapshots;
- photos/order/bio;
- strategy;
- expectations;
- tests;
- actual result;
- current reassessment.

### Мэтчи

- incoming like;
- match;
- dialogs;
- Telegram;
- date;
- current stage;
- profile attribution;
- audience class;
- manual correction.

Profile Builder находится в Orpheus, не в History.

---

# 6. Общая доменная архитектура

Пять контуров:

```text
Audience Model
Identity Model
Profile Strategy
Profile Variants
Experiment & Relationship Analytics
```

## 6.1. Audience Model

Одна общая модель.

Eurydice спрашивает:

> Подходит ли кандидатка пользователю?

Orpheus спрашивает:

> Подходит ли представление пользователя выбранной аудитории?

## 6.2. Identity Model

Описывает:

```text
Кто я сейчас
Что реально
Что готов усилить
Как хочу выглядеть
Кем точно не являюсь
Что нельзя выдумывать
Какие ресурсы доступны
```

## 6.3. Profile Strategy

Определяет, какие реальные стороны усиливаются в конкретном варианте.

## 6.4. Profile Variant

План анкеты: фото, order, bio, strategy, hypothesis, expected performance.

## 6.5. Verified Profile Snapshot

Фактическое состояние Twinby. Аналитика строится по нему, а не по словам пользователя.


---

# 7. Audience Model

## 7.1. Источники

```text
Текст пользователя
Положительные фотореференсы
Отрицательные фотореференсы
Hard rejects
Реальные like/dislike
User corrections
Incoming likes
Target matches
Ручной feedback
Preference summary
```

Нельзя считать отрицательные признаки простой инверсией положительных.

```ts
interface AudienceModel {
  id: string;
  version: number;
  codeName: string;
  summary: string;

  // UI groups: important=visualCore; likes=positive without visual-core;
  // dislikes=negative; stops=hardRejects
  positiveSignals: AudienceSignal[];
  negativeSignals: AudienceSignal[];
  hardRejects: AudienceSignal[];
  toleratedVariations: AudienceSignal[];

  visualCore: AudienceSignal[];
  presentationPatterns: AudienceSignal[];
  secondaryInterests: AudienceSignal[];

  source: string; // e.g. user | user-confirmed | default
  createdAt: string;
  supersededAt?: string;
}
```

## 7.2. Факты, заявления и гипотезы

Люди могут преувеличивать, использовать старые или отредактированные фото, фотографироваться рядом с чужими дорогими вещами, описывать желаемый образ жизни и даже использовать AI-generated avatar.

Система не должна говорить:

```text
Она богата
Она занимается теннисом
Она постоянно путешествует
```

Правильные формулировки:

```text
Профиль создаёт образ обеспеченности
Есть заявленный интерес к теннису
Вероятно, профиль хочет ассоциироваться с путешествиями
```

```ts
type EvidenceStatus =
  | "observed"
  | "claimed"
  | "inferred"
  | "validated";

type EvidenceLikelihood =
  | "unlikely"
  | "possible"
  | "probable";
```

```ts
interface AudienceSignal {
  id: string;
  key: string;
  statement: string;

  polarity:
    | "positive"
    | "negative"
    | "hard-reject"
    | "tolerated";

  status: EvidenceStatus;
  likelihood: EvidenceLikelihood;
  confidence: number;

  evidence: string[];
  contradictions: string[];
  sourceRefs: string[];

  createdAt: string;
  lastConfirmedAt?: string;
}
```

## 7.3. Audience Fit

В коде:

```ts
type AudienceFitLabel =
  | "core"
  | "acceptable"
  | "borderline"
  | "outside";
```

В UI:

```ts
const audienceFitLabels: Record<AudienceFitLabel, string> = {
  core: "Ядро аудитории",
  acceptable: "Подходит",
  borderline: "На границе",
  outside: "Вне аудитории",
};
```

Аналитическое правило:

```text
core + acceptable = целевой
borderline = отдельный неоднозначный класс
outside = нецелевой, но incoming like всё равно успех
```

## 7.4. Исправление пользователем

Хранятся исходная и финальная оценки.

```ts
interface AudienceFitAssessment {
  modelLabel: AudienceFitLabel;
  modelScore: number;
  modelConfidence: number;
  modelReasons: string[];

  finalLabel: AudienceFitLabel;

  correctedByUser: boolean;
  correctionReasons: AudienceCorrectionReason[];
  correctionComment?: string;
  correctedAt?: string;
}
```

```ts
type AudienceCorrectionReason =
  | "appearance-misread"
  | "combination-missed"
  | "text-overweighted"
  | "negative-signal-missed"
  | "positive-signal-missed"
  | "other";
```

Русские причины:

```text
Неверно оценена внешность
Не учтено сочетание признаков
Слишком большой вес описания
Не замечен отрицательный сигнал
Не замечен положительный сигнал
Другое
```

Коррекция:

1. немедленно меняет effective label;
2. идёт в recent feedback;
3. агрегируется;
4. может породить предложение обновить Audience Model;
5. не переписывает модель автоматически без подтверждения.

## 7.5. Устойчивость Audience Model и цель оптимизации

Одна коррекция, один incoming like или один новый паттерн не создают новую долгосрочную Audience Model автоматически. Для предложения обновления нужны повторяющиеся подтверждения, несколько независимых сигналов или явное решение пользователя.

## 7.6. История версий Audience (UI)

UI держит dirty-флаг на полях Audience (codeName, summary, 4 группы скилов): правка → dirty=true; после save/confirm/refresh → dirty=false. «Сохранить черновик» и сохранение перед confirm вызывают `updateDraft` только при dirty и реальном отличии от baseline. **Подтверждение** без правок только помечает текущую версию `user-confirmed`, не клонирует. «Определить по Eurydice» создаёт версию на стороне AI (4 группы: `importantSignals` → visual-core, иначе fallback на `narrative.importantSkills` из Eurydice). Пользователь должен видеть полный список прошлых версий, а не только текущую на главном экране Orpheus.

UX:

```text
Карточка Audience Model
→ стрелка → справа сверху
→ страница «Черновики Audience» (/orpheus/audience-drafts)
→ список всех версий (новые сверху): номер, бейджи статуса, дата, summary, сигналы в 4 группах
→ на карточке: Загрузить (зелёная) / Удалить (красная корзина)
→ «← К Orpheus»
```

IPC: `audience:list-versions`, `audience:delete-version`, `audience:activate-version`.

На каждой карточке версии справа сверху — бейджи статуса (`текущая` зелёным, также `подтверждена` / `черновик` / `заменена`), зелёная кнопка **Загрузить** (скрыта у текущей) и красная корзина (корзина скрыта, если версия одна). **Загрузить** (`activate-version`): делает выбранную версию текущей подтверждённой in-place (`source=user-confirmed`, снимает `supersededAt`; прежнюю текущую помечает заменённой) — без клона — и открывает `/orpheus` с подставленными полями. Удаление только после подтверждения в модалке. Если удалили текущую — следующей становится максимальная оставшаяся версия.

На карточке Audience первое поле — **кодовое наименование** (`codeName`): короткое имя черновика для истории версий, внутренняя метка.

Ниже summary — **четыре редактируемые группы сигналов** сверху вниз (иконки + шкала зелёный→красный слева):

1. **Что особенно важно** → `visualCore` (category `visual-core`);
2. **Кто нравится** → `positiveSignals` без visual-core;
3. **Кто не нравится** → `negativeSignals`;
4. **Стоп-сигналы** → `hardRejects`.

Группы показываются раздельно и на карточке Orpheus, и в истории черновиков — не одной кучей.

Кнопки действий на карточке Audience (слева направо):

1. **Определить по Eurydice** (синяя, AI) — сформулировать summary + 4 группы сигналов из предпочтений и summary референсов Eurydice;
2. **Сохранить черновик Audience** — сохранить summary и сигналы без подтверждения;
3. **Подтвердить Audience** (зелёная) — сохранить изменения (если есть) и пометить текущую версию подтверждённой, без клона с теми же данными.

После save/confirm/AI — заметный toast.

Критическое правило:

```text
Observed preference ≠ optimization mandate
```

То, что Eurydice чаще выбирает определённый сегмент, является evidence о предпочтениях, но не означает, что Orpheus должен автоматически оптимизировать весь собственный профиль только под этот сегмент. Перед построением стратегии пользователь подтверждает, какую аудиторию и какой результат оптимизируем сейчас.

---

# 8. Identity Model

## 8.1. Формирование

Identity Model строится совместно:

```text
Свободный текст
Структурированная анкета
Положительные фотореференсы
Отрицательные фотореференсы
Анализ текущего профиля
Анализ фотобиблиотеки
AI-гипотезы
Подтверждение и исправление пользователя
```

Анкета формируется прогрессивно, а не как обязательная длинная форма перед первым результатом. Orpheus сначала использует уже доступные данные и материалы, строит черновик Identity Model и затем задаёт только вопросы, способные изменить strategy, photo selection, bio или authenticity verdict.

Правильный UX:

```text
Наблюдаемые данные и существующие материалы
→ черновик Identity Model
→ вопросы по критическим пробелам
→ исправление пользователем
→ подтверждение
```

Самоописание пользователя является важным источником, но не единственным evidence. Если вместо абстрактного label можно получить пример поведения или подтверждение материалом, Orpheus предпочитает более конкретный сигнал.

## 8.1.1. История версий Identity (UI)

UI держит dirty-флаг на полях Identity: любое изменение input/тегов → dirty=true. «Сохранить черновик» пишет новую версию только при dirty; после save/refresh dirty сбрасывается. «Подтвердить Identity» сохраняет форму только если dirty, иначе только ставит `userConfirmedAt`. «Из слепка Twinby» создаёт версию на стороне AI. Пользователь должен видеть не только текущую версию на главном экране Orpheus, но и полный список прошлых.

UX:

```text
Карточка Identity Model
→ стрелка → справа сверху
→ страница «Черновики Identity» (/orpheus/identity-drafts)
→ список всех версий (новые сверху): номер, бейджи статуса, дата, ключевые поля, сочинение, теги
→ на карточке: Загрузить (зелёная) / Удалить (красная корзина)
→ «← К Orpheus»
```

IPC: `identity:list-versions`, `identity:delete-version`, `identity:activate-version`.

На каждой карточке версии справа сверху — бейджи статуса (`текущая` зелёным, также `подтверждена` / `черновик` / `заменена`), зелёная кнопка **Загрузить** (скрыта у текущей) и красная корзина (корзина скрыта, если версия одна). **Загрузить** (`activate-version`): делает выбранную версию текущей подтверждённой in-place (`userConfirmedAt`, снимает `supersededAt`; прежнюю текущую помечает заменённой) — без клона — и открывает `/orpheus` с подставленными полями. Удаление только после подтверждения в модалке. Если удалили текущую — следующей становится максимальная оставшаяся версия.

На карточке Identity первое поле — **кодовое наименование** (`codeName`): короткое имя черновика для истории версий, не публикуется в Twinby.

Кнопки действий на карточке Identity (слева направо):

1. **Из слепка Twinby** (синяя, AI) — разбор verified snapshot через нейронку в поля черновика;
2. **Сохранить черновик** — сохранить форму без подтверждения;
3. **Подтвердить Identity** (зелёная) — сохранить форму + `userConfirmedAt`.

После save/confirm — заметный toast (не только muted-текст).

## 8.2. Целевая полнота данных

Ниже указан целевой состав Identity Model, а не обязательная first-run форма. Поля могут заполняться постепенно. Первый вариант профиля можно строить до полной заполненности модели, если оставшиеся пробелы не создают риск выдумки или критической ошибки позиционирования. Перед переводом варианта в `ready` или `testing` все authenticity-critical неопределённости должны быть подтверждены или явно отмечены.

- возраст;
- город;
- работа;
- профессиональная сфера;
- реальные интересы;
- образ жизни;
- формат отношений;
- характер;
- сильные стороны;
- слабые стороны;
- доступные локации;
- доступная одежда;
- бюджет;
- время;
- реальные хобби;
- что нельзя изображать;
- кем пользователь точно не является.

```ts
interface IdentityModel {
  id: string;
  version: number;

  age?: number;
  city?: string;
  occupation?: string;
  professionalArea?: string;

  currentSelf: IdentitySignal[];
  amplifiableTraits: IdentitySignal[];
  desiredPresentation: IdentitySignal[];
  explicitNonIdentity: IdentitySignal[];

  realInterests: IdentitySignal[];
  lifestyle: IdentitySignal[];
  relationshipIntent?: string;

  resources: IdentityResource[];
  constraints: IdentityConstraint[];
  authenticityRules: AuthenticityRule[];

  positiveReferenceIds: string[];
  negativeReferenceIds: string[];

  aiSummary: string;
  userConfirmedAt?: string;
  createdAt: string;
  supersededAt?: string;
}
```

Identity signal хранит не только формулировку, но и статус evidence. Это позволяет отличать «пользователь так сказал», «это видно в материалах» и «AI это предположил».

```ts
interface IdentitySignal {
  id: string;
  key: string;
  statement: string;

  status: EvidenceStatus;
  confidence: number;

  evidence: string[];
  sourceRefs: string[];

  userConfirmed: boolean;
  createdAt: string;
  lastConfirmedAt?: string;
}
```

Подтверждение пользователя означает, что сигнал допустимо использовать в его Identity Model; оно не превращает внешний claim в независимо доказанный факт. AI-гипотеза без подтверждения пользователя не может сама стать ключевым positioning signal.

## 8.3. Система противоречий

Orpheus обязан знать не только «кто пользователь», но и «кто пользователь точно не».

Примеры blocking rules:

```text
Не создавать образ luxury lifestyle
Не подразумевать постоянные путешествия
Не использовать несуществующее хобби
Не создавать профессиональный статус, которого нет
Не менять телосложение
```

```ts
interface IdentityConflict {
  id: string;
  profileVariantId?: string;
  signal: string;
  conflictingIdentityRuleId: string;
  severity: "warning" | "blocking";
  explanation: string;
}
```

## 8.4. Правило 60/40

Позиционирование может усиливать реальные стороны, но не создавать нового человека.

```text
Не менее 60% ключевых сигналов прямо подтверждаются реальностью.
Не более 40% — отбор, усиление и упаковка.
0% ключевых сигналов — выдумка.
```

Это product guardrail, а не физическая формула.

```ts
interface AuthenticityAssessment {
  identityPreservationScore: number;
  strategyAmplificationScore: number;

  directlySupportedSignalCount: number;
  amplifiedSignalCount: number;
  misleadingSignalCount: number;
  fabricatedSignalCount: number;

  blockingConflicts: string[];
  warnings: string[];
}
```

Если `fabricatedSignalCount > 0`, вариант нельзя переводить в `ready` без исправления или явного осознанного override.

---

# 9. Profile Strategy

## 9.1. Цель профиля

Стратегия строится как пересечение:

```text
Identity × Audience × Objective
```

Audience Model описывает наблюдаемые предпочтения пользователя, но конкретная цель Orpheus подтверждается отдельно. Это не даёт системе автоматически сузить позиционирование только до сегмента, который чаще выбирала Eurydice.

```ts
interface ProfileObjective {
  audienceModelVersion: number;
  targetAudienceDescription: string;

  primaryOutcome:
    | "incoming-like"
    | "target-incoming-like"
    | "match"
    | "telegram";

  antiMetric?: string;
  userConfirmedAt: string;
}
```

Пример anti-metric:

```text
Не увеличивать количество лайков ценой заметного снижения доли целевой аудитории.
```

## 9.2. Стратегия

Начальная последовательность акцентов:

```text
1. Спокойный и уверенный
2. Интеллектуальный
3. Ироничный и лёгкий
4. Взрослый и надёжный
5. Стильный городской
```

Она меняется для конкретного варианта.

```ts
interface ProfileStrategy {
  id: string;
  name: string;

  primaryTraits: string[];
  secondaryTraits: string[];
  suppressedTraits: string[];
  forbiddenSignals: string[];

  intendedFirstImpression: string[];
  intendedEmotionalTone: string[];
  intendedConversationHooks: string[];

  objective: ProfileObjective;
  audienceModelVersion: number;
  identityModelVersion: number;

  userNotes?: string;
  createdAt: string;
}
```

Стратегия создаётся совместно:

```text
AI предлагает
→ пользователь исправляет
→ AI проверяет conflicts
→ пользователь подтверждает
```

---

# 10. Облачная фотобиблиотека

## 10.1. Провайдеры

Обязательно поддержать оба:

```text
Google Drive
Яндекс Диск
```

Они могут быть подключены одновременно.

При поиске пользователь выбирает:

```text
Google Drive
Яндекс Диск
Оба источника
```

## 10.2. OAuth и права

- read-only;
- пользователь авторизуется сам;
- выбирает доступные папки;
- приложение не изменяет оригиналы;
- renderer не получает secrets;
- tokens хранятся в main process и secure storage (`safeStorage` + settings `*.enc`);
- provider можно отключить;
- показать состояние подключения и ошибки.

Локальная настройка в UI Orpheus → «Облачная фотобиблиотека»:

```text
Google Drive
→ Client ID + Client Secret (OAuth client type Desktop в Google Cloud Console)
→ scope drive.readonly
→ «Подключить» открывает браузер (loopback http://127.0.0.1:<port>/oauth2callback)
→ refresh token шифруется в main

Яндекс Диск
→ OAuth token приложения с доступом к Диску (oauth.yandex.ru)
→ «Подключить» проверяет API и подтягивает папки
→ token шифруется в main
```

IPC: `cloud:get-credentials-status`, `cloud:save-credentials`, `cloud:clear-credentials`, `cloud:connect-google`, `cloud:connect-yandex`, `cloud:disconnect`, `cloud:list-folders`, `cloud:set-selected-folders`, `cloud:discover-storage`, `cloud:browse-storage`, `cloud:get-index-status`, `cloud:index-finished` (push).

## 10.3. Lazy indexing

Нет фоновой полной индексации. Индексация идёт **маленькими шагами** из Настройки → Хранилище.

```text
Пользователь выбирает cloud source / папки
→ «Проиндексировать» (cloud:discover-storage)
   → считает фото в выбранных папках (потолок 500, с пагинацией API)
   → сверяет с локальным индексом по externalFileId (не по количеству)
   → показывает: из текущих matched/total · новых remaining
   → фото, удалённые из облака, но оставшиеся в индексе, не блокируют прогресс
→ «Просмотреть 15 фото» (cloud:browse-storage, limit=15, skipIndexed=true)
   → следующие 15 неизвестных fileId: vision → описание + теги
   → уже известные id пропускаются
   → счётчик обновляется по id (matched/total, remaining)
→ после последнего шага (remaining=0)
   → ИИ собирает пересекающиеся группы-образы (looks)
   → краткий вывод по библиотеке
→ cloud:index-finished пушится в UI (хедер + страница Хранилище обновляются без refresh)
→ повторный поиск и генерация типов используют локальный индекс + looks
```

Целевой объём — до 1000 фотографий (текущий UI-потолок discover/browse — 500; батч описания — 15).

### 10.3.1. Группы-образы (looks)

После индексации фото не остаются только отдельными описаниями. ИИ обязан разбить библиотеку на **пересекающиеся готовые образы**:

```text
look = название + бриф + mood tags + набор photoId
одно фото может входить в несколько looks
looks нельзя выдумывать — только из уже описанных кадров
```

Дальше Profile Builder выбирает тип анкеты и опирается на looks как на «уже собранные образы», а не на случайный микс файлов.

## 10.4. Indexed asset

```ts
interface IndexedPhotoAsset {
  id: string;

  provider: "google-drive" | "yandex-disk";
  externalFileId: string;
  externalPath?: string;
  fileName: string;

  sourceModifiedAt: string;
  sourceSizeBytes?: number;
  checksum?: string;
  perceptualHash: string;

  localPreviewPath: string;
  originalCachePath?: string;

  embedding: number[];
  embeddingModel: string;
  embeddingVersion: string;

  shortDescription: string;
  observedSignals: string[];
  possibleRoles: PhotoRole[];
  risks: string[];

  peopleCount?: number;
  faceVisibility: number;
  bodyVisibility: number;
  technicalQuality: number;

  indexedAt: string;
  deletedFromIndexAt?: string;
}

interface PhotoLookGroup {
  id: string;
  name: string;
  brief: string;
  moodTags: string[];
  photoIds: string[];
  createdAt: string;
  updatedAt: string;
}
```

## 10.5. Повторное использование

Если совпадают:

```text
provider
externalFileId
sourceModifiedAt
checksum
```

повторный vision-анализ не запускается.

## 10.6. Local retrieval

```text
Текстовый запрос
→ text embedding
→ vector similarity
→ metadata filters
→ diversity reranking
→ dedupe серий
→ shortlist
→ LLM видит только shortlist
```

Нельзя повторно отправлять 1000 фото модели при каждом запросе.

## 10.7. Удаление из индекса

Пользователь может удалить конкретное фото из индекса.

Удаляются:

- local preview;
- embedding;
- AI metadata.

Оригинал в облаке не затрагивается. При новом поиске файл может быть проиндексирован снова.

---

# 11. Оценка фотографии

Фото нельзя оценивать только как «хорошее/плохое».

Тёмная фотография может быть плохой на роль главной, но сильной для образа загадочности или меланхолии.

Уровни оценки:

```text
Техническое качество
Возможная роль
Соответствие стратегии
Соответствие сету
Предельная ценность
Риски
```

```ts
type PhotoRole =
  | "main-face"
  | "full-body"
  | "lifestyle"
  | "social"
  | "intellectual"
  | "humor"
  | "conversation-hook"
  | "activity"
  | "style"
  | "emotional"
  | "trust"
  | "mystery"
  | "other";
```

```ts
interface PhotoAssessment {
  photoAssetId: string;

  technical: {
    faceVisibility: number;
    sharpness: number;
    lighting: number;
    composition: number;
    backgroundClutter: number;
    realism: number;
  };

  possibleRoles: Array<{
    role: PhotoRole;
    fit: number;
    explanation: string;
  }>;

  strategyFits: Array<{
    strategyId: string;
    fit: number;
    explanation: string;
  }>;

  standaloneStrengths: string[];
  standaloneRisks: string[];
  assessedAt: string;
  assessmentVersion: string;
}
```

---

# 12. Оценка фотосета

Проблема текущей анкеты описана как «коллаж эмоций, а не цельный образ».

```ts
interface PhotoSetAssessment {
  id: string;
  profileSetId: string;

  coherence: number;
  authenticity: number;
  targetAudienceAlignment: number;
  firstImpressionStrength: number;
  conversationHookStrength: number;

  dominantSignals: string[];
  conflictingSignals: string[];
  repeatedSignals: string[];
  missingRoles: string[];

  weakestLinks: Array<{
    photoAssetId: string;
    reason: string;
  }>;

  unexpectedStrengths: Array<{
    photoAssetId: string;
    reason: string;
  }>;

  marginalValues: MarginalPhotoValue[];
}
```

```ts
interface MarginalPhotoValue {
  photoAssetId: string;
  position: number;
  newInformationScore: number;
  redundancyScore: number;
  setImpact: number;
  explanation: string;
}
```

Нет фиксированного идеального числа фото. Обычно 2–3 до 5–6. Главное фото должно ясно показывать лицо, хотя не обязано быть паспортным фронтальным кадром.

---

# 13. Profile Builder

## 13.1. Результат

Orpheus предлагает **ровно три цельных и разных типа** анкеты.

Каждый включает:

```text
Название типа (акцент)
Bio (описание анкеты из реальных фактов Identity)
Бриф — что нужно вложить в этот образ
Какие фото нужны (desiredPhotoVision: настроение / сюжет / роли)
Фотографии из существующей библиотеки, подобранные под бриф
Порядок и роль каждого фото + короткое «почему это фото»
Стратегию
Плюсы / минусы / риски
Killer features
Прогноз
Аутентичность
```

### 13.1.1. Разнообразие и запрет выдумки

Три типа **не должны** быть перестановкой одних и тех же формулировок и одних и тех же случайных фото.

- Каждый тип — отдельный акцент/настроение/сюжет.
- Факты (город, работа, интересы, «кто не я») берутся **только** из Identity / Audience.
- Фото — **только** из индекса / looks; нельзя предлагать несуществующие кадры.
- Набор фото внутри типа должен быть **связным** (один образ / настроение / сюжет), а не random sample.
- Если материалов мало — тип всё равно предлагается, но weaknesses честно говорят об ограничениях.

### 13.1.2. Бриф и подбор фото

При генерации типа ИИ сначала формулирует бриф и `desiredPhotoVision`, затем подбирает фото под эту мысль (предпочтительно из подходящего look). Кнопка «Предложить фото» пересобирает набор **под тот же бриф**, а не случайно.

## 13.2. Сравнение

Orpheus:

- сравнивает три сета;
- называет лучший;
- объясняет выбор;
- показывает killer features;
- показывает weaknesses;
- честно говорит, если библиотека слабая.

Выбор лучшего сета является рекомендацией, а не фактом. Вместе с рекомендацией показываются confidence и факторы, которые ограничивают уверенность. Низкая confidence означает недостаточность данных или близость вариантов, а не автоматически плохой профиль.

```ts
interface RecommendationConfidence {
  confidence: number;
  reasons: string[];
  limitingFactors: string[];
}
```

## 13.3. Фото могут повторяться

Одно фото можно использовать в нескольких сетах. Сеты отличаются смысловой связкой, порядком, bio или strategy.

## 13.4. Пользовательские ограничения

Пользователь может:

- закрепить фото;
- запретить фото;
- закрепить bio;
- ограничить main photo;
- оставить заметку.

```ts
interface ProfileGenerationConstraints {
  pinnedPhotoIds: string[];
  forbiddenPhotoIds: string[];
  allowedMainPhotoIds?: string[];
  pinnedBio?: string;
  pinnedStrategyId?: string;
  freeformNote?: string;
}
```

## 13.5. Регенерация

Обязательные команды:

```text
Переделать всё
Сохранить идею, заменить фотографии
Сохранить фотографии, поменять порядок
```

Плюс свободное поле заметки.

## 13.6. Слабая библиотека

Если сильный сет собрать нельзя:

1. предложить три лучших доступных;
2. указать ограничения;
3. назвать missing roles;
4. предложить фото, которые стоит найти или снять;
5. отсортировать действия по impact/effort.

---

# 14. Photo Plan

Принцип:

```text
Максимальный эффект при минимальных затратах денег, времени и координации
```

Нельзя предлагать нереалистичное:

- ехать на курорт из Москвы;
- повторять редкое хобби только ради фото;
- покупать дорогую одежду ради одного кадра;
- изображать деятельность, которой пользователь не занимается.

```ts
interface PhotoTask {
  id: string;
  title: string;
  goal: string;
  targetRole: PhotoRole;
  strategyId: string;

  expectedImpact: "low" | "medium" | "high";

  effort: {
    money: "none" | "low" | "medium" | "high";
    time: "low" | "medium" | "high";
    coordination: "low" | "medium" | "high";
  };

  feasibility: number;
  locationIdea: string;
  timeOfDayIdea?: string;
  clothingIdea: string;
  poseIdea: string;
  emotionIdea: string;
  photographerIdea: string;
  minimalVersion: string;
  improvedVersion: string;
  whyNeeded: string[];
  risks: string[];
}
```

Пользователь может уточнить сезон, одежду, доступную локацию, помощника и отношение к постановочным кадрам.

---

# 15. Советы по обработке фото

Обработка не выполняется автоматически.

Карточка совета:

```text
Проблема
Предложение
Ожидаемый эффект
Риск
[Показать превью] [Пропустить]
```

Лёгкие изменения:

- crop;
- exposure;
- white balance;
- horizon;
- noise;
- случайный объект;
- лёгкое background blur.

Сильные изменения маркируются отдельно:

- background replacement;
- clothing replacement;
- face/body alteration;
- full generation.

По умолчанию рекомендовать только техническую коррекцию.

---

# 16. Own Profile Variant

```ts
type OwnProfileVariantStatus =
  | "draft"
  | "ready"
  | "recommended"
  | "active"
  | "testing"
  | "paused"
  | "archived";
```

```ts
interface OwnProfileVariant {
  id: string;
  version: number;
  name: string;
  status: OwnProfileVariantStatus;

  strategyId: string;

  plannedProfile: {
    photoAssetIds: string[];
    bio: string;
  };

  hypothesis: string;
  changedSignalBundle: ProfileChangeSet;

  createdAgainstAudienceVersion: number;
  createdAgainstIdentityVersion: number;

  createdAssessment: ProfileAssessment;
  expectedPerformance: ExpectedPerformance;

  verifiedSnapshotId?: string;

  createdAt: string;
  activatedAt?: string;
  deactivatedAt?: string;
  archivedAt?: string;
}
```

Orpheus хранит портфель Draft/Ready/Recommended/Active/Testing/Paused/Archived. Только один профиль реально активен в Twinby. Переключение выполняет пользователь.

---

# 17. Связка изменений

Единица эксперимента — не обязательно одна переменная и не весь профиль. Это смысловая связка взаимосвязанных изменений.

```ts
interface ProfileChangeSet {
  id: string;
  name: string;

  changedSignals: Array<{
    type:
      | "main-photo"
      | "photo-order"
      | "photo-set"
      | "bio"
      | "positioning";
    before: string;
    after: string;
  }>;

  commonHypothesis: string;

  expectedEffect: {
    funnelStage:
      | "incoming-like"
      | "match"
      | "conversation"
      | "telegram"
      | "date";
    direction: "increase" | "decrease";
  };
}
```

Пример:

```text
Новое главное фото
+ перенос хобби-фото на третье место
+ спокойнее первая строка bio

Гипотеза:
сделать первое впечатление увереннее и менее хаотичным
```


---

# 18. Фактический слепок собственного профиля Twinby

## 18.1. Источник истины

Источник истины — фактическое состояние Twinby, а не слова пользователя и не план Orpheus.

Пользователь может забыть изменить часть анкеты, поменять порядок не так, изменить bio частично или сказать, что сделал то, чего не сделал. Аналитика не должна приписывать результаты несуществующему профилю.

AI-generated plan, summary или assessment не становятся фактом только потому, что были сохранены ранее. Для собственного профиля приоритет всегда имеет verified snapshot; при невозможности проверки система сохраняет uncertainty, а не повышает гипотезу до ground truth.

## 18.2. Capture pipeline

```text
Открыть собственный профиль
→ считать bio и доступные поля
→ пройти по всем фото
→ сохранить порядок
→ создать уменьшенные preview
→ вычислить perceptual hashes
→ сопоставить фото с indexed cloud assets (pHash)
→ сравнить с последним snapshot
→ сравнить с планом Orpheus (эксперимент / активный / последний variant)
→ создать immutable snapshot при изменении (deploymentStatus + diffs persist)
```

Индексация облака пишет реальный perceptual hash на preview JPEG. IPC `profile-snapshot:compare-to-plan` пересчитывает и **сохраняет** статус сверки.

```ts
interface VerifiedProfileSnapshot {
  id: string;
  profileVariantId?: string;
  capturedAt: string;

  photos: Array<{
    position: number;
    localPreviewPath: string;
    perceptualHash: string;
    matchedPhotoAssetId?: string;
    matchConfidence?: number;
  }>;

  bio: string;
  occupation?: string;
  interests?: string[];
  relationshipGoal?: string;

  plannedSimilarity?: number;
  differencesFromPlan: string[];

  deploymentStatus:
    | "not-verified"
    | "matches-plan"
    | "partially-matches"
    | "does-not-match";

  source: "twinby-profile-capture";
}
```

## 18.3. Хранение собственных фото

Для каждого исторического собственного профиля хранить уменьшенные изображения:

```text
длинная сторона: 512–768 px
JPEG quality: 55–70
EXIF: удалить
геометки: удалить
```

Оригиналы в snapshot storage не нужны.

## 18.4. Сопоставление с облаком

Обычный checksum не подходит из-за crop/compression Twinby.

Использовать:

- pHash;
- dHash;
- crop-tolerant comparison;
- aspect ratio;
- при необходимости face embedding;
- confidence score.

## 18.5. План против факта

UI:

```text
Рекомендовано:
— фото B первым
— удалить фото D
— изменить bio

Фактически:
— фото B осталось третьим
— фото D сохранено
— bio изменено частично

Соответствие плану: 46%
```

Эксперимент может начаться только после понятного статуса deployment:

- `not-verified` / `does-not-match` — старт запрещён (снять слепок и сверить / поправить Twinby);
- `matches-plan` — обычный старт;
- `partially-matches` — только с явным подтверждением; эксперимент помечается `imperfectDeployment`.

UI Orpheus показывает статус по-русски, блоки «Рекомендовано / Фактически / соответствие N%» и кнопку «Сверить с планом».

---

# 19. Preflight перед каждой Eurydice-сессией

Перед **каждой** сессией Eurydice:

```text
1. Быстрый просмотр собственного профиля
2. Проверка диалогов
3. Проверка области мэтчей
4. Проверка входящих лайков
5. Reconciliation
6. Только затем feed
```

Пропуск возможен только явным manual override с предупреждением.

## 19.1. Быстрый профиль

- открыть own profile;
- сравнить count/order/pHash/bio;
- если нет изменений — не создавать snapshot;
- если есть — создать snapshot и запустить profile-change flow.

## 19.2. Верхние 5 диалогов

Перед сессией открыть dialogs и просмотреть верхние 5 диалогов, исключая системный диалог Twinby.

Для каждого открыть профиль и получить identity fingerprint.

Сравнение выполняется как множество, а не по позиции:

```text
те же 5 людей в другом порядке = новых top-5 диалогов нет
```

Нельзя использовать только name, нужен composite identity.

## 19.3. Область мэтчей

Открыть matches area в верхней части dialogs.

Просмотреть новые профили.

Бот не должен:

- начинать диалог;
- нажимать conversation starter;
- отправлять сообщение;
- запускать встроенную игру.

## 19.4. Входящие лайки

Открыть соседнюю вкладку likes.

Для каждого нового профиля:

1. открыть анкету;
2. снять видимые данные;
3. построить CandidateEvidence;
4. прогнать Audience Model;
5. присвоить `core/acceptable/borderline/outside`;
6. связать с active profile snapshot;
7. сохранить current relationship.

Если профиль уже в актуальной базе:

```text
не запускать AI
не тратить токены
не создавать дубль
```

## 19.5. Reconciliation

```text
like остаётся в Twinby → keep current
new like → add + assess
like стал match → transform relationship
old like исчез → remove from current likes
new match → update current stage
new dialog → update current stage
```

Current-state таблицы отражают актуальное состояние. Минимальная event chain и агрегаты сохраняются для аналитики.

---

# 20. Twinby locator discovery

## 20.1. Нельзя выдумывать интерфейс

До реального discovery нельзя считать известными:

- порядок нижних вкладок;
- resource IDs;
- точные координаты;
- положение likes;
- положение matches strip;
- путь к own profile/edit;
- различия темы/версии/Premium.

Пользователь готов предоставить screenshots в момент реализации.

## 20.2. Приоритет локаторов

```text
1. resource-id
2. accessibility id / content-desc
3. visible text
4. устойчивый XPath
5. relative bounds
6. normalized coordinates
```

```ts
interface NormalizedPoint {
  xRatio: number;
  yRatio: number;
}
```

```ts
const x = Math.round(screenWidth * point.xRatio);
const y = Math.round(screenHeight * point.yRatio);
```

## 20.3. Locator profile

```ts
interface TwinbyLocatorProfile {
  id: string;
  twinbyVersion?: string;
  deviceModel?: string;
  screenWidth: number;
  screenHeight: number;
  orientation: "portrait";
  theme?: "light" | "dark";
  selectors: Record<string, LocatorStrategy[]>;
  createdAt: string;
  lastValidatedAt?: string;
}
```

## 20.4. Обучение по скриншоту

```text
screenshot + UI hierarchy
→ автоматический поиск
→ diagnostic overlay
→ пользователь указывает элемент при необходимости
→ сохранить selector
→ проверить
→ version locator profile
```

Coordinates — последний fallback, а не основной selector.

---

# 21. Входящие лайки

## 21.1. Read-only

Бот только:

```text
обнаруживает
открывает
анализирует
классифицирует
связывает с профилем
показывает
```

Ничего не нажимает в смысле взаимного лайка и не рекомендует скрытое автоматическое действие.

## 21.2. Identity

```ts
interface CandidateIdentity {
  id: string;
  name?: string;
  age?: number;
  primaryPhotoHash?: string;
  additionalPhotoHashes?: string[];
  bioFingerprint?: string;
  firstSeenAt: string;
  lastSeenAt: string;
}
```

Identity matching использует комбинацию имени, возраста, hashes, bio fingerprint и временного контекста.

## 21.3. Current incoming likes

```ts
interface CurrentIncomingLike {
  relationshipId: string;
  candidateIdentityId: string;
  detectedAt: string;
  lastConfirmedAt: string;
}
```

Если лайк исчез после match, запись удаляется из current likes, а relationship становится `matched`.

## 21.4. Assessment

```ts
interface IncomingLikeAssessment {
  id: string;
  relationshipId: string;
  candidateObservationId: string;
  activeProfileSnapshotId: string;
  experimentId?: string;
  audienceFit: AudienceFitAssessment;
  detectedAt: string;
}
```

В согласованном сценарии считаем, что likes можно открыть. Premium-locked и blurred-like отдельный flow в MVP не нужен.

---

# 22. Relationship chain

## 22.1. Одна сущность

Incoming like и match не должны становиться несвязанными дубликатами.

```ts
type RelationshipStage =
  | "incoming-like"
  | "matched"
  | "conversation-started"
  | "substantive-conversation"
  | "telegram-exchanged"
  | "date-proposed"
  | "date-scheduled"
  | "date-completed"
  | "closed";
```

```ts
interface RelationshipRecord {
  id: string;
  candidateIdentityId: string;

  origin:
    | "incoming-like-first"
    | "outgoing-like-first"
    | "unknown";

  currentStage: RelationshipStage;
  audienceFit: AudienceFitAssessment;

  attributedProfileSnapshotId: string;
  attributedProfileVariantId?: string;
  experimentId?: string;

  createdAt: string;
  updatedAt: string;
}
```

## 22.2. Event chain

```ts
type RelationshipEventType =
  | "incoming-like-detected"
  | "matched"
  | "conversation-started"
  | "substantive-conversation"
  | "telegram-exchanged"
  | "date-proposed"
  | "date-scheduled"
  | "date-completed"
  | "closed";
```

```ts
interface RelationshipEvent {
  id: string;
  relationshipId: string;
  type: RelationshipEventType;
  occurredAt: string;
  source: "twinby-scan" | "user-feedback";
  metadata?: Record<string, unknown>;
}
```

UI current lists показывает только актуальную стадию, а event chain используется для analytics.

## 22.3. Manual stage update

Кнопки:

```text
Начали общаться
Содержательный диалог
Перешли в Telegram
Предложили свидание
Назначили свидание
Свидание состоялось
Закрыть
```

Telegram может логически заполнить ранние стадии, но source остаётся `user-feedback`.

---

# 23. Атрибуция профилю

## 23.1. Правило match

Нас интересует профиль, активный в момент обнаружения match.

Не угадывать, когда человек впервые увидел анкету.

```ts
interface MatchAttribution {
  relationshipId: string;
  matchDetectedAt: string;
  activeSnapshotId: string;
  activeVariantId?: string;
  experimentId?: string;
  rule: "active-profile-at-match";
}
```

## 23.2. Incoming like

Связывать с профилем, активным в момент обнаружения incoming like.

## 23.3. Сравнение с историческими профилями

Для каждой кандидатки можно показывать:

```text
Текущий профиль №3: 54%
Лучший исторический профиль №1: 92%
```

Название показателя:

```text
Audience–Profile Alignment
```

Это не вероятность лайка.

```ts
interface ProfileVariantAlignment {
  candidateObservationId: string;
  profileVariantId: string;

  semanticAlignment: number;
  historicalPerformance?: number;
  combinedEstimate: number;

  confidence: number;
  matchedSignals: string[];
  conflictingSignals: string[];
  unknowns: string[];
  historySampleSize: number;
}
```

Показывать semantic, historical и combined отдельно. При малой выборке — «Недостаточно исторических данных».

---

# 24. Эксперименты

## 24.1. Ручной запуск

Эксперимент запускается только кнопкой пользователя после verified snapshot.

```text
Начать тест
```

Можно создать **baseline-эксперимент из текущего Twinby-профиля**:

```text
есть активный слепок Twinby
→ «Взять текущий профиль в эксперимент» / experiment:create-from-snapshot
→ вариант профиля из bio + фото слепка (hypothesis = baseline)
→ слепок связывается с вариантом, deployment = matches-plan (план = факт)
→ draft-эксперимент → pre-feedback → старт
```

Альтернатива: эксперимент из сгенерированного сета анкеты (сет A).

## 24.2. Длительность

```text
минимум: 3 дня
цель: 4–5 дней
максимум по умолчанию: 7 дней
```

Короткие тесты допустимы.

## 24.3. Feedback до теста

### Orpheus

- hypothesis;
- strengths;
- risks;
- expected range;
- confidence;
- expected funnel changes.

### Пользователь

- нравится ли профиль;
- кажется ли он своим;
- ожидаемый результат;
- сомнения;
- предполагаемая killer feature;
- что может не сработать.

```ts
interface PreExperimentFeedback {
  experimentId: string;
  botExpectation: string;
  botExpectedMetrics: ExpectedPerformance;
  userExpectedOutcome: string;
  userExpectedMetrics?: Partial<ExpectedPerformance>;
  userAuthenticityRating?: number;
  userNotes?: string;
}
```

## 24.4. Feedback после теста

### Orpheus

- фактические метрики;
- forecast error;
- supported/rejected hypotheses;
- ambiguities;
- next action.

### Пользователь

- совпали ли ожидания;
- качество аудитории;
- комфорт;
- использовать ли повторно;
- собственная интерпретация.

Feedback должен превращаться в structured insights, а не только сохраняться как текст.

## 24.5. Profile change during test

Порядок строго такой:

```text
1. Попросить подтвердить, что изменение намеренное
2. Создать новую версию профиля
3. Завершить текущий тест
4. Показать причину
5. Предложить новый тест
```

Только подтверждённое изменение профиля автоматически завершает тест. Во всех других случаях бот спрашивает.

## 24.6. Досрочное завершение

Бот может предложить:

```text
Завершить — сильный положительный сигнал
Завершить — профиль заметно слабее
Продолжить
Продлить
Вернуться к прошлому профилю
```

Решение принимает пользователь.

## 24.7. Нулевой результат

Практический вывод:

```text
Профиль, скорее всего, плохой. Стоит попробовать другой.
```

Одновременно указать ограничение: точное число показов неизвестно.

## 24.8. Status

```ts
type ExperimentStatus =
  | "draft"
  | "ready"
  | "running"
  | "completed"
  | "stopped-early-positive"
  | "stopped-early-negative"
  | "stopped-by-user"
  | "stopped-profile-changed"
  | "insufficient-data";
```

## 24.9. Ограничение интерпретации

Один эксперимент может изменить текущую рекомендацию, но не должен объявлять вечного победителя или окончательно отвергать стратегию. При малой выборке, слишком коротком тесте или слабом количестве наблюдаемых событий вывод должен быть `insufficient-data`.

Допустимо:

```text
В текущем тесте профиль показал более сильный сигнал.
Пока недостаточно данных для устойчивого вывода.
```

Недопустимо:

```text
Этот профиль объективно лучше навсегда.
```

Нулевой результат после полноценного тестового окна остаётся практическим отрицательным сигналом согласно §24.7, но интерпретируется с оговоркой, что точное число показов неизвестно.

## 24.10. Привязка к версиям

В момент старта эксперимент фиксирует контекст, в котором он был запущен:

```ts
interface ExperimentContext {
  audienceModelVersion: number;
  identityModelVersion: number;
  profileStrategyId: string;
  verifiedProfileSnapshotId: string;
}
```

Исторический результат интерпретируется относительно этого контекста. Более новая Audience Model может дать современную переоценку, но не переписывает исходные ожидания и условия эксперимента.

---

# 25. Метрики и КПД

## 25.1. Основные Orpheus metrics

```text
Входящие лайки / день
Целевые входящие лайки / день
Доля целевых входящих лайков
Взаимные мэтчи из входящих
```

## 25.2. Совместные metrics

```text
Мэтчи / сессию Eurydice
Целевые мэтчи / сессию Eurydice
```

Диагностически:

```text
Мэтчи / 100 исходящих лайков
Целевые мэтчи / 100 исходящих лайков
```

Активность разных тестов не обязана быть одинаковой.

## 25.3. Поздние stages

```text
Conversation rate
Substantive conversation rate
Telegram conversion
Date proposed rate
Date scheduled rate
Date completed rate
```

## 25.4. Success classification

```text
all incoming likes = success
core + acceptable = hyper-success
borderline = ambiguous
outside = non-target success
```

## 25.5. Два КПД

### Orpheus Efficiency

Profile-led:

- incoming likes;
- target incoming likes;
- mutual matches after incoming.

### Combined Efficiency

- matches/session;
- target matches/session;
- Telegram;
- dates.

## 25.6. Начальные веса

Конфигурационный старт:

```text
Обычный входящий лайк: 1
Целевой входящий лайк: 3
Обычный мэтч: 1
Целевой мэтч: 2
Telegram: 4
Свидание: 6
```

Это не научные константы.

```ts
interface EfficiencyWeightPolicy {
  id: string;
  incomingLikeWeight: number;
  targetIncomingLikeWeight: number;
  matchWeight: number;
  targetMatchWeight: number;
  telegramWeight: number;
  dateWeight: number;

  source:
    | "default"
    | "user-configured"
    | "calibrated-from-history";

  sampleSize: number;
  explanation: string;
  createdAt: string;
}
```

Weights со временем могут измениться на 1–2% или на десятки процентов. Изменение должно быть объяснено.

## 25.7. Эквивалентность

Начальные thresholds:

```text
до 10% → эквивалентны
10–25% → вероятное преимущество
больше 25% → заметное преимущество
```

```ts
interface EfficiencyComparisonPolicy {
  equivalentThreshold: number;
  probableAdvantageThreshold: number;

  source:
    | "default"
    | "user-configured"
    | "calibrated-from-history";

  sampleSize: number;
  updatedAt: string;
  explanation: string;
}
```

При малой выборке corridor должен быть шире.

## 25.8. Диапазоны

Показывать:

```text
Ожидаемый target match rate: 10–16%
Уверенность: низкая
```

Не показывать ложную точность.

---

# 26. Ожидаемый, фактический и текущий результат

Четыре слоя:

```text
Оценка при создании
Оценка при активации
Фактический результат
Современная переоценка
```

```ts
interface MetricRange {
  low: number;
  median?: number;
  high: number;
}

interface ExpectedPerformance {
  incomingLikesPerDay?: MetricRange;
  targetIncomingLikesPerDay?: MetricRange;
  matchesPerSession?: MetricRange;
  targetMatchesPerSession?: MetricRange;
  telegramConversion?: MetricRange;
  confidence: number;
  assumptions: string[];
}
```

```ts
interface ActualPerformance {
  activeDays: number;
  eurydiceSessions: number;
  incomingLikes: number;
  targetIncomingLikes: number;
  matches: number;
  targetMatches: number;
  conversations: number;
  substantiveConversations: number;
  telegramExchanges: number;
  dateProposed: number;
  dateScheduled: number;
  dateCompleted: number;
}
```

UI:

```text
При создании, Audience v3: 82%
Ожидалось: 5–8 целевых лайков
Факт: 9
Современная оценка, Audience v8: 68%
```

---

# 27. Временность выводов

Это социальная система, а не физика.

На результат могут влиять:

- мода;
- сезон;
- хайп;
- рынок;
- возраст;
- изменение Twinby;
- изменение пользователя;
- изменение его вкуса.

MVP не реализует сложную сезонную модель, но хранит контекст.

```ts
interface ProfileInsight {
  id: string;
  statement: string;
  confidence: number;
  sampleSize: number;

  validFrom: string;
  validUntil?: string;

  context: {
    city?: string;
    periodStart?: string;
    periodEnd?: string;
    audienceModelVersion: number;
    profileStrategyId?: string;
  };

  stability: "temporary" | "medium-term" | "stable";
  lastConfirmedAt: string;
}
```

Нельзя писать «идеальная анкета». Писать:

```text
Профиль показал сильный результат в текущем периоде
и входит в диапазон перспективных
```


---

# 28. Главный экран Orpheus

Блоки идут строго в этом порядке:

```text
1. Активный фактический профиль
2. Соответствие рекомендованному профилю
3. Текущий эксперимент
4. Прогноз воронки
5. Реальные результаты
6. Следующая рекомендация
7. Пробелы в фотосете
8. Состояние облачной библиотеки
```

## 28.1. Активный фактический профиль

Показывает snapshot, фото, order, bio, capture time, variant и test status.

## 28.2. Соответствие плану

```text
Соответствие плану: 86%
```

Список differences.

## 28.3. Текущий эксперимент

- day count;
- target 4–5;
- current signal;
- status;
- suggested action.

## 28.4. Прогноз воронки

Ranges, confidence, assumptions.

## 28.5. Реальные результаты

- incoming/day;
- target incoming/day;
- matches/session;
- target matches/session;
- Telegram;
- dates.

## 28.6. Следующая рекомендация

Одно ясное действие, а не список из десяти равнозначных советов.

## 28.7. Пробелы

- missing role;
- conflict;
- weak main photo;
- redundant photo;
- weak bio signal.

## 28.8. Cloud status

- Google connected;
- Yandex connected;
- selected folders;
- indexed count;
- last search;
- errors.

---

# 29. Разделы Orpheus

```text
Обзор
Обо мне
Аудитория
Библиотека
Конструктор
План фото
Эксперименты
Выводы
```

`Аудитория` — UI над общей Audience Model, а не отдельная модель.

## 29.1. Страницы истории черновиков

На главном экране Orpheus у карточек **Identity Model** и **Audience Model** справа сверху — стрелка `→` (SVG-иконка).

| Карточка | Маршрут | Содержимое |
| --- | --- | --- |
| Identity Model | `/orpheus/identity-drafts` | все версии Identity + бейджи + Загрузить / Удалить |
| Audience Model | `/orpheus/audience-drafts` | все версии Audience + 4 группы сигналов + Загрузить / Удалить |

История для сравнения прошлых гипотез; **Загрузить** делает выбранную версию текущей подтверждённой и возвращает на `/orpheus` с подставленной формой. Возврат без загрузки — кнопка «К Orpheus» (иконка стрелки влево).

Подробности: §7.6, §8.1.1.

---

# 30. Eurydice

## 30.1. Сохранить существующее

- capture;
- image preprocessing;
- hard filters;
- AI evaluation;
- review;
- auto;
- limits;
- abort;
- history.

## 30.2. Расширенный результат

```ts
interface CandidateEvaluation {
  decision: "like" | "dislike" | "review";
  score: number;
  confidence: number;
  reasons: string[];

  audienceFit: {
    label: AudienceFitLabel;
    score: number;
    confidence: number;
    reasons: string[];
  };

  profileAlignments?: ProfileVariantAlignment[];
}
```

## 30.3. Research mode

Добавить calibration/research mode, где uncertainty сохраняется и `review` не превращается молча в dislike.

## 30.4. Evidence отдельно от preference

Рекомендуемый pipeline:

```text
Evidence extraction
→ Preference decision
```

Taste-specific assumptions должны находиться в Audience Model, а не быть зашиты в system prompt.

---

# 31. AI provider architecture

ArionHub — единственный provider MVP, но код использует abstraction.

```ts
interface AiProvider {
  listCapabilities(): Promise<AiCapabilities>;
  evaluateCandidate(input: CandidateEvaluationInput): Promise<CandidateEvaluation>;
  summarizeAudience(input: AudienceSummaryInput): Promise<AudienceModelDraft>;
  analyzePhoto(input: PhotoAnalysisInput): Promise<PhotoAnalysisResult>;
  generateProfileSets(input: ProfileSetGenerationInput): Promise<ProfileSetGenerationResult>;
  auditProfile(input: ProfileAuditInput): Promise<ProfileAssessment>;
  analyzeExperiment(input: ExperimentAnalysisInput): Promise<ExperimentAnalysisResult>;
  embedText(input: string[]): Promise<number[][]>;
  embedImages?(input: Buffer[]): Promise<number[][]>;
}
```

## 31.1. Capabilities

```ts
interface AiCapabilities {
  vision: boolean;
  structuredOutput: boolean;
  embeddings: boolean;
  maxImages?: number;
  maxInputTokens?: number;
  reportsUsage: boolean;
}
```

Нельзя предполагать model capabilities без проверки.

## 31.2. Secrets

API key:

- main process only;
- secure storage;
- never logs;
- masked UI;
- not renderer;
- not plaintext DB.

## 31.3. Structured output

Все критичные ответы валидируются Zod.

При invalid response:

1. сохранить sanitized raw response;
2. один ограниченный repair attempt;
3. затем typed error;
4. не придумывать fallback result.

## 31.4. Режим ответа: unary, не stream

**Текущий режим MVP: один полный ответ на запрос (non-streaming / unary).**

Реализация в `@twinby/ai-provider` вызывает `chat.completions.create` **без** `stream: true`. Клиент ждёт весь completion, затем парсит JSON (`response_format: json_object` или prompt-json) и валидирует Zod.

Следствия для UX:

- достаточно спиннера / статуса «Нейронка обрабатывает запрос…»;
- **не** требуется live-отображение токенов, «размышлений» или partial JSON во время ожидания;
- reasoning / chain-of-thought в UI не показывается, пока транспорт остаётся unary.

Если позже включим streaming SSE:

1. явно перевести соответствующие пайплайны на `stream: true`;
2. на каждом таком экране показывать поток рассуждений / промежуточный текст (и отдельно финальный structured result);
3. обновить этот раздел документа и acceptance criteria.

До такого перехода streaming UI **не** является требованием.

---

# 32. AI pipelines

## 32.1. Candidate Evidence

```ts
interface CandidateEvidence {
  observations: Array<{
    key: string;
    value: string;
    source: "photo" | "text" | "ui";
    confidence: number;
  }>;

  claims: Array<{
    statement: string;
    sourceText: string;
  }>;

  inferences: Array<{
    statement: string;
    likelihood: EvidenceLikelihood;
    evidence: string[];
    contradictions: string[];
  }>;

  imageAuthenticityRisks: string[];
}
```

## 32.2. Preference decision

Input: CandidateEvidence + Audience Model + recent feedback + hard rejects + mode.

Output: decision, score, confidence, audience fit, reasons, triggered rejects, uncertainty.

## 32.3. Photo indexing

На один новый файл:

```text
preview
pHash
one-time vision analysis
embedding
short metadata
```

## 32.4. Retrieval

```text
query embedding
filters
vector search
diversity rerank
series dedupe
top 20–40
```

## 32.5. Profile generation output

```ts
interface GeneratedProfileSet {
  id: string;
  name: string;
  strategy: ProfileStrategy;
  photoIds: string[];
  bio: string;

  photoRoles: Array<{
    photoId: string;
    role: PhotoRole;
    explanation: string;
  }>;

  strengths: string[];
  weaknesses: string[];
  killerFeatures: string[];
  risks: string[];

  authenticityAssessment: AuthenticityAssessment;
  expectedPerformance: ExpectedPerformance;
}

interface ProfileSetGenerationResult {
  profileSets: [GeneratedProfileSet, GeneratedProfileSet, GeneratedProfileSet];
  recommendedProfileSetId: string;
  recommendationConfidence: RecommendationConfidence;
}
```

## 32.6. Experiment analysis

LLM получает готовые metrics, а не raw events.

```ts
interface ExperimentAnalysisInput {
  experiment: ExperimentSummary;
  metrics: CalculatedExperimentMetrics;
  preFeedback: PreExperimentFeedback;
  postUserFeedback?: PostExperimentUserFeedback;
  comparableProfiles: ComparableProfileSummary[];
}
```

---

# 33. Базовые AI prompts

## 33.1. Evidence extraction

```text
Ты извлекаешь наблюдаемые сигналы из анкеты знакомства.

Правила:
1. Не объявляй текст анкеты фактом.
2. Разделяй observed, claimed и inferred.
3. Не делай вывод о богатстве по дорогому предмету.
4. Не делай вывод о характере только по лицу.
5. Используй unlikely, possible, probable.
6. Указывай contradictions.
7. Не выдумывай невидимые детали.
8. Не идентифицируй реальных людей.
9. Верни только JSON по схеме.
```

## 33.2. Orpheus generation

```text
Ты строишь три честных варианта анкеты пользователя.

Цель:
создать три отличающиеся, но аутентичные связки фото, порядка, bio и positioning.

Ограничения:
- не выдумывать интересы;
- учитывать explicitNonIdentity;
- не использовать forbidden photos;
- сохранять pinned photos;
- main photo ясно показывает лицо;
- фото оцениваются в контексте сета;
- не использовать максимальное число фото без причины;
- указать плюсы, минусы, risks и killer feature;
- выбрать лучший вариант;
- при слабых материалах сказать об этом;
- предложить missing photos;
- вернуть ровно три варианта;
- вернуть JSON по схеме.
```

---

# 34. База данных

## 34.1. Правила

- SQLite + Drizzle;
- UTC timestamps;
- blobs не хранить в SQLite, кроме compact embedding при необходимости;
- previews — files;
- foreign keys;
- indexes;
- transactions для reconciliation;
- current-state таблицы очищаются;
- event chain хранится минимально.

## 34.2. Рекомендуемые таблицы

```text
audience_model_versions
audience_signals
audience_fit_assessments
identity_model_versions
identity_signals
identity_resources
identity_constraints
profile_strategies
cloud_connections
cloud_folders
indexed_photo_assets
photo_assessments
profile_variants
profile_variant_photos
profile_change_sets
profile_change_items
verified_profile_snapshots
verified_profile_snapshot_photos
profile_assessments
profile_experiments
experiment_pre_feedback
experiment_post_feedback
experiment_metrics
profile_insights
candidate_identities
candidate_observations
current_incoming_likes
current_matches
current_dialogs
relationships
relationship_events
profile_variant_alignments
efficiency_weight_policies
efficiency_comparison_policies
locator_profiles
locator_entries
preflight_runs
preflight_run_steps
```

## 34.3. Ключевые схемы

### `audience_model_versions`

```text
id TEXT PK
version INTEGER UNIQUE
summary TEXT
created_at TEXT
superseded_at TEXT NULL
source TEXT
```

### `audience_signals`

```text
id TEXT PK
audience_model_id TEXT FK
key TEXT
statement TEXT
polarity TEXT
status TEXT
likelihood TEXT
confidence REAL
evidence_json TEXT
contradictions_json TEXT
source_refs_json TEXT
created_at TEXT
last_confirmed_at TEXT NULL
```

### `identity_model_versions`

```text
id TEXT PK
version INTEGER UNIQUE
age INTEGER NULL
city TEXT NULL
occupation TEXT NULL
professional_area TEXT NULL
relationship_intent TEXT NULL
ai_summary TEXT
user_confirmed_at TEXT NULL
created_at TEXT
superseded_at TEXT NULL
```

### `identity_signals`

```text
id TEXT PK
identity_model_id TEXT FK
key TEXT
statement TEXT
status TEXT
confidence REAL
evidence_json TEXT
source_refs_json TEXT
user_confirmed INTEGER
created_at TEXT
last_confirmed_at TEXT NULL
```

### `indexed_photo_assets`

```text
id TEXT PK
provider TEXT
external_file_id TEXT
external_path TEXT NULL
file_name TEXT
source_modified_at TEXT
source_size_bytes INTEGER NULL
checksum TEXT NULL
perceptual_hash TEXT
local_preview_path TEXT
original_cache_path TEXT NULL
embedding_blob BLOB
embedding_model TEXT
embedding_version TEXT
short_description TEXT
observed_signals_json TEXT
possible_roles_json TEXT
risks_json TEXT
people_count INTEGER NULL
face_visibility REAL
body_visibility REAL
technical_quality REAL
indexed_at TEXT
deleted_from_index_at TEXT NULL
UNIQUE(provider, external_file_id, source_modified_at)
```

### `profile_variants`

```text
id TEXT PK
version INTEGER
name TEXT
status TEXT
strategy_id TEXT FK
bio TEXT
hypothesis TEXT
change_set_id TEXT FK
created_against_audience_version INTEGER
created_against_identity_version INTEGER
created_assessment_json TEXT
expected_performance_json TEXT
verified_snapshot_id TEXT NULL
created_at TEXT
activated_at TEXT NULL
deactivated_at TEXT NULL
archived_at TEXT NULL
```

### `verified_profile_snapshots`

```text
id TEXT PK
profile_variant_id TEXT NULL
captured_at TEXT
bio TEXT
occupation TEXT NULL
interests_json TEXT
relationship_goal TEXT NULL
planned_similarity REAL NULL
differences_from_plan_json TEXT
deployment_status TEXT
source TEXT
```

### `relationships`

```text
id TEXT PK
candidate_identity_id TEXT FK
origin TEXT
current_stage TEXT
model_audience_fit TEXT
final_audience_fit TEXT
audience_score REAL
audience_confidence REAL
corrected_by_user INTEGER
correction_reasons_json TEXT
correction_comment TEXT NULL
attributed_profile_snapshot_id TEXT FK
attributed_profile_variant_id TEXT NULL
experiment_id TEXT NULL
created_at TEXT
updated_at TEXT
```

### `current_incoming_likes`

```text
relationship_id TEXT PK FK
candidate_identity_id TEXT FK
detected_at TEXT
last_confirmed_at TEXT
```

### `relationship_events`

```text
id TEXT PK
relationship_id TEXT FK
type TEXT
occurred_at TEXT
source TEXT
metadata_json TEXT
```

## 34.4. Удаление snapshot

Пользователь может удалить конкретный snapshot.

Если он связан с test:

- предупреждение;
- удалить preview;
- сохранить aggregate metrics;
- не cascade-delete experiment.

---

# 35. IPC contracts

Все endpoints typed.

## Audience

```text
audience:get-current
audience:list-versions
audience:delete-version
audience:activate-version
audience:update-draft
audience:confirm-update
audience:apply-correction
audience:derive-from-eurydice
```

## Identity

```text
identity:get-current
identity:list-versions
identity:delete-version
identity:activate-version
identity:create-draft
identity:analyze-current-profile
identity:add-reference
identity:remove-reference
identity:confirm
```

## Cloud

```text
cloud:list-connections
cloud:connect-google
cloud:connect-yandex
cloud:disconnect
cloud:list-folders
cloud:set-selected-folders
cloud:search-photos
cloud:get-index-status
cloud:discover-storage
cloud:browse-storage
cloud:index-finished
cloud:delete-indexed-photo
```

## Orpheus

```text
orpheus:generate-profile-sets
orpheus:regenerate-all
orpheus:regenerate-photos-keep-idea
orpheus:reorder-keep-photos
orpheus:save-variant
orpheus:audit-variant
orpheus:create-photo-plan
orpheus:request-photo-edit-preview
```

## Snapshot

```text
profile-snapshot:capture
profile-snapshot:get-active
profile-snapshot:list
profile-snapshot:compare-to-plan
profile-snapshot:delete
```

## Experiment

```text
experiment:create
experiment:create-from-snapshot
experiment:save-pre-feedback
experiment:start
experiment:get-active
experiment:recommend-stop
experiment:complete
experiment:confirm-profile-change
experiment:get-pending-profile-change
experiment:resolve-pending-profile-change
experiment:save-post-feedback
experiment:compare
```

## Relationships

```text
relationships:list
relationships:get
relationships:set-stage
relationships:apply-audience-correction
relationships:close
```

## Preflight

```text
preflight:run
preflight:get-latest
preflight:cancel
```

Renderer не обращается напрямую к DB, Appium или AI.

---

# 36. Сервисы

```text
SecureSecretService
AiProviderService
AudienceModelService
IdentityModelService
CloudConnectionService
GoogleDrivePhotoSource
YandexDiskPhotoSource
PhotoIndexingService
PhotoSearchService
PhotoAssessmentService
ProfileSetGenerator
ProfileAuditService
PhotoPlanService
OwnProfileVariantService
OwnProfileCaptureService
ProfileDeploymentVerifier
ExperimentService
ExperimentMetricsService
ExperimentAnalysisService
RelationshipService
RelationshipReconciliationService
IncomingLikesScanService
MatchesScanService
DialogsScanService
PreflightOrchestrator
TwinbyNavigationService
LocatorDiscoveryService
LocatorProfileService
```

`ExperimentMetricsService` считает totals, ratios, per-day, per-session, confidence, sample size и equivalence. LLM только интерпретирует.

---

# 37. State machines

## Profile Variant

```text
draft → ready → recommended → active → testing → paused → archived
```

## Experiment

```text
draft → ready → running → completed
```

Side exits:

```text
stopped-early-positive
stopped-early-negative
stopped-by-user
stopped-profile-changed
insufficient-data
```

## Relationship

```text
incoming-like
→ matched
→ conversation-started
→ substantive-conversation
→ telegram-exchanged
→ date-proposed
→ date-scheduled
→ date-completed
```

Любая стадия → `closed`.

## Preflight

```text
idle
→ connecting
→ profile-check
→ dialogs-check
→ matches-check
→ likes-check
→ reconciliation
→ completed
```

Ошибки:

```text
failed-recoverable
failed-blocking
cancelled
```

---

# 38. UX правила

- UI только русский в MVP;
- code identifiers английские;
- строки централизованы;
- каждый совет содержит «что / почему / эффект / риск / уверенность / действие»;
- использовать «возможно», «вероятно», «есть сигнал»;
- не выдавать inference за факт;
- feedback должен быть быстрым;
- Identity onboarding прогрессивный: не спрашивать заново то, что уже достоверно известно из профиля, материалов или подтверждённой модели;
- после первого полезного результата задавать новые вопросы только если они способны изменить recommendation или authenticity verdict;
- пользователь готов давать feedback несколько раз в день сначала и несколько раз в неделю позже.

---

# 39. Безопасность и приватность

## Secrets

- API key;
- OAuth access/refresh tokens.

Только main process + secure OS storage.

## Candidate screenshots

- временные;
- удалять после анализа по умолчанию;
- хранить только минимальный preview/hash при необходимости identity matching;
- не строить массовый архив.

## Own photos

- локальные previews;
- explicit delete from index;
- originals остаются в cloud.

## Logs

Не логировать:

- keys;
- tokens;
- полные sensitive prompts;
- полные переписки;
- originals.

---

# 40. Error handling

Обрабатывать:

- Appium unavailable;
- stale element;
- deleted session;
- unknown screen;
- network loading;
- modal;
- permission dialog;
- AI timeout;
- abort;
- invalid JSON;
- cloud auth failure;
- permission denied;
- database migration failure.

Recovery:

```text
re-find selector
→ back to known screen
→ reactivate Twinby
→ recreate Appium session
→ abort with diagnostic bundle
```

Если target действия не подтверждён — не нажимать.

---

# 41. Performance

- indexing concurrency limit;
- progress;
- pause/resume/cancel;
- skip known;
- resize before AI;
- strip EXIF;
- hash cache;
- WAL;
- transactions;
- batch operations;
- no repeated vision for known photos;
- preflight максимально локальный и дешёвый.

---

# 42. Testing

## Unit

- Audience correction;
- Relationship transitions;
- current likes cleanup;
- profile change detection;
- snapshot comparison;
- pHash matching;
- experiment metrics;
- KPI weights;
- equivalence;
- authenticity conflicts;
- photo retrieval dedupe;
- invalid AI JSON.

## Integration

- mock ArionHub;
- mock Google Drive;
- mock Yandex Disk;
- mock Appium;
- full preflight;
- incoming-like → match;
- profile change during test;
- three-set generation;
- regeneration;
- migrations.

## Fixtures

```text
own-profile-screen
dialogs-screen
matches-strip
incoming-likes-screen
candidate-profile
profile-changed
same-top-five-different-order
incoming-like-became-match
cloud-photo-series
dark-photo-contextual-strength
```

## Manual E2E

На физическом Android:

1. capture own profile;
2. scan top 5 dialogs;
3. scan matches;
4. scan incoming likes;
5. убедиться, что message не отправлено;
6. запустить Eurydice;
7. остановить;
8. проверить History;
9. проверить cleanup.

---

# 43. Observability

Логировать:

- run ID;
- session ID;
- preflight step;
- screen;
- selector strategy;
- retry;
- AI model;
- duration;
- image count;
- token usage;
- cache hit;
- skipped known photo;
- relationship transition;
- experiment transition.

Diagnostic bundle:

```text
logs
screenshots
UI hierarchy
locator profile
app version
Twinby version
device info
```

Без секретов.

---

# 44. MVP scope

## Входит

### Eurydice

- существующий swipe engine;
- новое название;
- preflight;
- own profile snapshot;
- top 5 dialogs;
- matches;
- incoming likes;
- audience fit;
- correction.

### Orpheus

- Identity Model;
- Audience view;
- Google Drive;
- Yandex Disk;
- lazy indexing;
- local search;
- three sets;
- feedback and constraints;
- photo plan;
- manual deployment;
- verified snapshot;
- experiments;
- analytics.

### History

```text
Кандидаты
Профили
Мэтчи
```

## Не входит

- auto own-profile editing;
- auto incoming-like response;
- messages;
- full chat analysis;
- complex seasonality;
- respondent panel;
- export JSON/CSV;
- stealth;
- spoofing;
- internal Twinby API.

---

# 45. Этапы реализации

## 0. Baseline

Запустить текущий проект, tests, DB backup, map IPC.

## 1. Refactor orchestration

Extract services без изменения поведения.

## 2. Branding/navigation

Session → Eurydice, добавить Orpheus и 3 History tabs.

## 3. Domain/DB foundation

Migrations для Audience, Identity, Variant, Snapshot, Experiment, Relationship.

## 4. Own profile snapshot

Discovery, capture, hash, compare, History/Profile.

## 5. Preflight

Profile, dialogs, matches, likes, reconciliation.

## 6. Relationship UI

Stages, current state, corrections.

## 7. Cloud OAuth

Google + Yandex, read-only, folders.

## 8. Photo indexing/search

Lazy, one-time, local retrieval, dedupe.

## 9. Identity Model

Text + refs + AI draft + conflicts + confirm.

## 10. Profile Builder

Three sets + constraints + regeneration.

## 11. Photo Plan

Missing roles + impact/effort.

## 12. Deployment verification

Plan vs actual: pHash match к indexed assets при capture, `comparePlannedToActual` + persist `deploymentStatus`, UI план/факт/%, гейт `experiment.start` (в т.ч. `imperfectDeployment` при partial).

## 13. Experiments

Pre/post feedback, manual start, profile-change flow.

## 14. Comparison/recommendation

Dynamic weights, equivalence, portfolio, historical alignment.

---

# 46. Acceptance criteria

## Preflight

- запускается перед каждой session;
- не пишет;
- не лайкает;
- top 5 order-independent;
- known like skips AI;
- like transforms to match;
- current likes cleaned.

## Cloud

- оба provider подключаются;
- source selectable;
- new photo indexed once;
- known photo skipped;
- repeated search local;
- up to 1000 assets manageable.

## Builder

- Identity Model может заполняться прогрессивно без обязательной длинной first-run анкеты;
- target audience и profile objective подтверждаются пользователем;
- exactly 3 sets;
- photos/order/bio/strategy;
- plus/minus/killer feature;
- best highlighted вместе с recommendation confidence;
- pinned/forbidden respected;
- 3 regeneration modes.

## Snapshot

- actual Twinby capture;
- plan mismatch / match persisted on capture and compare-to-plan;
- immutable;
- delete supported;
- experiment start gated by deployment status.

## Experiment

- manual start;
- 3–7 days;
- pre/post feedback;
- profile change confirmation;
- new version;
- old test stopped;
- new test offered;
- all other stop actions confirmed.

## Analytics

- incoming/day;
- target incoming/day;
- matches/session;
- target matches/session;
- all incoming = success;
- core+acceptable = hyper-success;
- zero result recommends another profile;
- dynamic equivalence;
- raw metrics visible.

---

# 47. Пример end-to-end scenario

```text
1. Запуск приложения.
2. Preflight capture own profile.
3. Snapshot unchanged.
4. Scan top 5 dialogs.
5. Scan matches.
6. Найдены 2 incoming likes.
7. Первый известен — AI skipped.
8. Второй новый — analyzed.
9. Class: Ядро аудитории.
10. Профиль получает hyper-success.
11. Пользователь запускает Eurydice.
12. Открывает Orpheus.
13. Уточняет Identity: не luxury traveler.
14. Выбирает Google + Yandex.
15. Запрос: спокойный, уверенный, интеллектуальный, немного ироничный.
16. Новые фото индексируются один раз.
17. Orpheus предлагает 3 sets.
18. Пользователь запрещает фото и закрепляет другое.
19. Команда: сохранить идею, заменить фото.
20. Получает новые 3 sets.
21. Выбирает B.
22. Вручную меняет Twinby.
23. Bot captures snapshot.
24. Обнаруживает неверный order.
25. Пользователь исправляет.
26. Snapshot matches plan.
27. Pre-feedback + manual start.
28. Через 4 дня сильный target incoming signal.
29. Bot предлагает завершить.
30. User confirms.
31. Post-test compares bot expectation, user expectation and fact.
32. Profile status: promising.
```

---

# 48. Окончательно согласованные решения

1. Название — Orpheus & Eurydice.
2. Eurydice — выбор и swipe.
3. Orpheus — собственный профиль.
4. Audience Model общая.
5. Identity включает «кто я» и «кто я точно не».
6. Фото оценивается в контексте сета.
7. Генерируются три цельных сета.
8. Главное фото ясно показывает лицо.
9. Нет идеального фиксированного числа фото.
10. Профиль меняется вручную.
11. Бот проверяет факт.
12. Test запускается вручную.
13. 3–7 дней, цель 4–5.
14. Меняется смысловая связка.
15. Incoming like — успех.
16. Target incoming like — hyper-success.
17. `core + acceptable` — target.
18. User correction обязательна.
19. Bot не пишет.
20. Bot не отвечает лайком.
21. Preflight перед каждой Eurydice session.
22. Top 5 dialogs scan.
23. Matches scan.
24. Likes scan.
25. Known like не анализируется.
26. Current likes очищаются.
27. Relationship chain единая.
28. Match attributed to active profile at detection.
29. Момент просмотра не угадывается.
30. Google и Yandex одновременно.
31. Lazy indexing.
32. До ~1000 photos.
33. Repeated search local.
34. Photo editing только по выбору.
35. UI только русский.
36. Delete snapshot.
37. Delete indexed photo.
38. Export не MVP.
39. Complex seasonality не MVP.
40. Нет вечного perfect profile.
41. Есть range of good profiles.
42. Weights calibrate from history.
43. Zero result likely means weak profile.
44. Auto-stop only on confirmed profile change.
45. Other stops require user.
46. Identity Model заполняется прогрессивно; полный набор полей — целевая полнота, а не gate до первого результата.
47. Identity signals хранят evidence status и не смешивают claim, observation и AI inference.
48. Observed preference не является автоматическим optimization mandate для Orpheus.
49. Target audience и profile objective подтверждаются пользователем перед построением стратегии.
50. Один experiment не создаёт вечного победителя; при слабых данных используется `insufficient-data`.
51. Historical experiments остаются привязаны к версиям Audience/Identity и verified snapshot на момент запуска.

---

# 49. Неизвестные данные, которые нельзя выдумывать

До screenshots нельзя утверждать selectors, coordinates, tab order, matches location, likes location, own-profile navigation или Premium differences.

В момент реализации запросить screenshots и выполнить locator discovery.

---

# 50. Необязательный рыночный контекст

Рабочие оценки из обсуждения, не hardcoded requirements:

```text
Twinby MAU: ориентир 1–2.5 млн
центральная оценка: ~1.5 млн

женщины 18–24 Москва, активные в Twinby:
ориентир 40–90 тыс.

реально релевантный пул:
ориентир 3–8 тыс.
```

Приложение должно со временем оценивать собственные наблюдаемые показатели:

- unique profiles seen;
- repeats;
- new profiles/day;
- estimated coverage;
- exhaustion risk.

---

# 51. Definition of Done MVP

```text
- Existing Eurydice не сломана.
- Preflight перед каждой session.
- Own profile snapshot работает.
- Top 5 dialogs scan работает.
- Matches scan работает.
- Likes scan работает.
- No messages and no auto like in these screens.
- Audience fit + correction.
- History 3 tabs.
- Google + Yandex.
- Lazy index.
- Known photos skip tokens.
- 3 profile sets.
- Constraints/regeneration.
- Photo plan.
- Manual deployment verification.
- Manual experiment start.
- Profile change flow.
- Metrics calculated in code.
- Pre/post feedback.
- Forecast/fact/current reassessment.
- Delete snapshot/indexed photo.
- Security requirements.
- Tests pass.
- Physical Android E2E documented.
```

---

# 52. Рекомендуемая структура monorepo

```text
apps/
  desktop/
    src/
      main/
        ipc/
        services/
        windows/
      renderer/
        features/
          eurydice/
          orpheus/
          history/
          settings/
        shared/
      preload/

packages/
  contracts/
  config/
  database/
  logging/
  ai-provider/
  decision-engine/
  session-orchestrator/
  appium-client/
  android-environment/
  twinby-adapter/
  profile-capture/
  image-pipeline/
  test-fixtures/

  audience-model/
  identity-model/
  cloud-photo-sources/
  photo-index/
  own-profile/
  profile-auditor/
  profile-builder/
  profile-experiments/
  relationship-tracker/
  analytics/
  locator-discovery/
```

---

# 53. Минимальные package interfaces

```ts
export interface AudienceModelRepository {
  getCurrent(): Promise<AudienceModel>;
  getVersion(version: number): Promise<AudienceModel>;
  saveDraft(draft: AudienceModelDraft): Promise<AudienceModel>;
  confirmVersion(id: string): Promise<AudienceModel>;
}

export interface AudienceFitEvaluator {
  evaluate(
    evidence: CandidateEvidence,
    model: AudienceModel,
  ): Promise<AudienceFitAssessment>;
}
```

```ts
export interface IdentityModelRepository {
  getCurrent(): Promise<IdentityModel | null>;
  saveDraft(draft: IdentityModelDraft): Promise<IdentityModel>;
  confirmVersion(id: string): Promise<IdentityModel>;
}

export interface IdentityConflictDetector {
  detect(
    identity: IdentityModel,
    strategy: ProfileStrategy,
    profile: ProposedProfileSet,
  ): Promise<IdentityConflict[]>;
}
```

```ts
export interface CloudPhotoSource {
  provider: "google-drive" | "yandex-disk";
  connect(): Promise<CloudConnection>;
  disconnect(connectionId: string): Promise<void>;
  listFolders(connectionId: string): Promise<CloudFolder[]>;
  listFiles(input: ListCloudFilesInput): AsyncIterable<CloudPhotoFile>;
  downloadPreview(file: CloudPhotoFile): Promise<Buffer>;
  downloadOriginal(file: CloudPhotoFile): Promise<Buffer>;
}
```

```ts
export interface PhotoIndexer {
  index(file: CloudPhotoFile): Promise<IndexedPhotoAsset>;
  isKnown(file: CloudPhotoFile): Promise<boolean>;
}

export interface PhotoSearchEngine {
  search(input: PhotoSearchInput): Promise<PhotoSearchResult>;
}
```

```ts
export interface OwnProfileCapture {
  capture(): Promise<VerifiedProfileSnapshot>;
}

export interface ProfileDeploymentVerifier {
  compare(
    planned: OwnProfileVariant,
    actual: VerifiedProfileSnapshot,
  ): Promise<ProfileDeploymentComparison>;
}
```

```ts
export interface ExperimentManager {
  create(input: CreateExperimentInput): Promise<ProfileExperiment>;
  start(id: string): Promise<ProfileExperiment>;
  complete(id: string, reason: ExperimentCompletionReason): Promise<ProfileExperiment>;
  handleProfileChange(input: ProfileChangeDuringExperimentInput): Promise<void>;
}
```

```ts
export interface RelationshipReconciler {
  reconcile(input: PreflightScanResult): Promise<ReconciliationResult>;
}
```

---

# 54. Typed errors

```ts
type AppErrorCode =
  | "AI_KEY_MISSING"
  | "AI_CAPABILITY_UNSUPPORTED"
  | "AI_INVALID_RESPONSE"
  | "AI_BUDGET_EXCEEDED"
  | "APPIUM_UNAVAILABLE"
  | "DEVICE_NOT_CONNECTED"
  | "TWINBY_SCREEN_UNKNOWN"
  | "LOCATOR_NOT_FOUND"
  | "PROFILE_CAPTURE_FAILED"
  | "CLOUD_AUTH_FAILED"
  | "CLOUD_PERMISSION_DENIED"
  | "PHOTO_INDEX_FAILED"
  | "EXPERIMENT_ALREADY_RUNNING"
  | "PROFILE_NOT_VERIFIED"
  | "DATABASE_MIGRATION_FAILED";
```

Renderer получает русское безопасное сообщение и diagnostic ID.

---

# 55. Пример UI

```text
Активный профиль

Профиль №4 · «Спокойный интеллектуальный»
Слепок сделан 7 августа, 02:12
Соответствие плану: 94%

Текущий тест
4-й день из рекомендуемых 4–5

Входящие лайки: 12
Целевые входящие лайки: 7
Мэтчи на сессию Eurydice: 1,4

Orpheus считает сигнал сильным.
Завершить тест досрочно?

[Продолжить] [Завершить]
```

---

# 56. Финальное архитектурное правило

Orpheus & Eurydice — единый цикл:

```text
Eurydice наблюдает выбор
→ Audience Model уточняется
→ Orpheus строит profile
→ profile получает incoming signals
→ relationships и tests создают data
→ Profile Performance Model уточняется
→ обе части становятся точнее
```

При конфликте источников:

```text
Фактическое состояние Twinby
>
слова пользователя о состоянии Twinby
>
план Orpheus
>
прогноз AI
```

Для статистики:

```text
расчёты кода > интерпретация LLM
```

Для identity:

```text
подтверждённые данные пользователя > AI-гипотеза
```

Для действий:

```text
read-only safe action > неподтверждённое нажатие
```

Для ground truth и аналитики:

```text
AI не является источником истины.
Сохранённый AI-вывод не повышает сам себя до факта.
Аналитический результат должен быть воспроизводим из сохранённых snapshots, model versions, experiment context и рассчитанных metrics.
```

---

# Приложение A. Детальная исходная спецификация существующей Eurydice

Ниже приложена исходная подробная архитектурная спецификация текущего Twinby AI Swiper. Она сохраняется как технический baseline для уже работающей части приложения.

**При конфликте с основной частью документа выше приоритет имеет основная спецификация Orpheus & Eurydice.** В частности, новое название, навигация, preflight, общая Audience Model, relationship chain, Orpheus и запреты на автоматические сообщения/изменение собственного профиля считаются окончательными.

---

# Промпт на разработку Twinby AI Swiper

> Полная спецификация настольного приложения, которое управляет Android-версией Twinby через Appium, анализирует фотографии и текст анкет через мультимодальную модель, доступную через ArionHub, и предлагает либо выполняет свайп в соответствии с пользовательскими предпочтениями.

---

## 0. Роль исполнителя

Ты — senior/full-stack разработчик и архитектор, специализирующийся на TypeScript, React, Electron, Node.js, Appium, Android Emulator, ADB, WebdriverIO, мультимодальных LLM API, локальном хранении данных и безопасной работе с пользовательскими секретами.

Твоя задача — спроектировать и поэтапно реализовать рабочее Windows-приложение **Twinby AI Swiper**.

Не пытайся сразу написать весь проект. Работай итеративно. На каждом этапе:

1. Объясни цель.
2. Покажи структуру файлов.
3. Реализуй законченный вертикальный срез.
4. Добавь команды запуска.
5. Добавь тесты.
6. Опиши ожидаемый результат.
7. Укажи ограничения и неизвестные данные.
8. Не переходи дальше, пока текущий этап нельзя проверить локально.

Код и имена сущностей пиши на английском. Интерфейс и пользовательские ошибки — на русском.

---

# 1. Назначение продукта

Создать локальное настольное приложение для Windows, которое:

1. Запускает или подключается к Android Emulator.
2. Подключается через ADB.
3. Запускает Appium и создаёт UiAutomator2-сессию.
4. Открывает уже установленный Twinby.
5. Считывает видимые данные текущей анкеты через Android UI.
6. Собирает до заданного количества фотографий анкеты.
7. Обрезает интерфейс и уменьшает изображения.
8. Передаёт в мультимодальную модель через ArionHub:
   - фотографии анкеты;
   - описание;
   - возраст;
   - расстояние;
   - интересы;
   - цель знакомства;
   - процент совместимости;
   - текстовые критерии пользователя;
   - положительные и отрицательные визуальные референсы.
9. Получает структурированное решение `like`, `dislike` или `review`.
10. Показывает решение пользователю.
11. В зависимости от режима либо только рекомендует, либо выполняет разрешённый свайп.
12. Сохраняет статистику решений, исправлений, времени ответа и токенов.
13. По умолчанию удаляет временные фотографии анкет сразу после анализа.

Приложение не должно:

- создавать аккаунты;
- обходить верификацию;
- извлекать токены Twinby;
- обращаться к внутреннему API Twinby;
- подменять IP или GPS;
- обходить антибот-механизмы;
- маскировать автоматизацию;
- отправлять сообщения;
- массово собирать или архивировать чужие анкеты;
- хранить фотографии анкет дольше одного анализа по умолчанию;
- использовать чужой аккаунт;
- работать без явного запуска владельцем компьютера.

---

# 2. Юридическое и продуктовое ограничение

Перед первым использованием показать отдельный экран предупреждения.

Twinby в пользовательском соглашении запрещает программы автоматизации, несанкционированное ПО и несанкционированные соединения. Источник:

- https://twinby.ru/legal/user-agreement

Пользователь должен явно подтвердить:

```text
Я понимаю, что автоматизация может нарушать правила Twinby,
может привести к ограничению функций или удалению аккаунта.
Я запускаю приложение на собственном аккаунте и принимаю риск.
```

Согласие хранить локально с версией текста, датой, временем и версией приложения.

Нельзя добавлять функции скрытия автоматизации или обхода ограничений. Нельзя обещать безопасность аккаунта.

---

# 3. Аналогичные публичные проекты

Нельзя утверждать, что любой из проектов полностью актуален, безопасен или совместим с текущим Twinby. Они используются только как архитектурные ориентиры.

## 3.1 SpicySwipe

Репозиторий:

- https://github.com/ramailo1/SpicySwipe

Публично заявленные особенности:

- Tinder-автоматизация через браузерное расширение;
- несколько AI-провайдеров;
- настройка API-ключей;
- анализ профиля;
- approval/review-интерфейс;
- аналитика сессий;
- локальное хранение настроек;
- разделение UI, API layer и selectors;
- локальный Ollama;
- диагностический режим.

Взять концептуально:

- AI-provider abstraction;
- экран конфигурации модели;
- review перед действием;
- аналитику по моделям и сессиям;
- отдельный слой селекторов;
- локальное хранение настроек;
- разделение UI, orchestration и automation.

Не копировать:

- Tinder DOM selectors;
- браузерную реализацию;
- сообщения;
- stealth/anti-detection;
- код без проверки лицензии;
- обещания безопасности.

## 3.2 Auto-Tinder

Репозиторий:

- https://github.com/joelbarmettlerUZH/auto-tinder

Публично заявленная логика:

- сбор примеров;
- ручная разметка изображений;
- обучение пользовательским предпочтениям;
- классификация профиля;
- автоматическое решение `like/pass`.

Взять концептуально:

- положительные и отрицательные примеры;
- ручную разметку;
- отдельный preference/classifier layer;
- сравнение модели с реальными решениями пользователя.

Не копировать:

- внутренний Tinder API;
- auth-token extraction;
- scraping;
- загрузку чужих изображений;
- устаревший TensorFlow pipeline.

## 3.3 Tinder Automation Bot на Appium

Репозиторий:

- https://github.com/nathandev0/Tinder_Automation_Bot

Публично заявленный подход:

- Appium;
- управление мобильным приложением;
- автоматические свайпы;
- статистика;
- управление устройствами.

Взять концептуально:

- Appium как control layer;
- device manager;
- сессионную статистику;
- жизненный цикл automation-сессии;
- общий интерфейс эмулятора и физического устройства.

Не копировать:

- создание аккаунтов;
- SMS-автоматизацию;
- app cloning;
- spoofing;
- token extraction;
- jailbreak/root bypass;
- IP rotation;
- shadow-ban detection;
- human-like masking.

## 3.4 Главный вывод

```text
SpicySwipe:
понятный UI + provider abstraction + review + analytics

Auto-Tinder:
положительные/отрицательные примеры + персональная классификация

Appium Tinder Bot:
управление мобильным приложением через Appium
```

Взаимодействие с Twinby выполняется только через видимый пользовательский интерфейс Android. Внутренние API Twinby не используются.

---

# 4. Целевая платформа

Первичная платформа:

- Windows 10/11 x64;
- Node.js LTS;
- Android Studio;
- Android SDK;
- Android Emulator;
- ADB;
- Appium 3;
- UiAutomator2;
- Appium Inspector;
- Electron;
- React;
- TypeScript.

Первичная поддержка:

- один локальный пользователь;
- один эмулятор или одно физическое Android-устройство;
- одна активная Twinby-сессия;
- один AI-провайдер — ArionHub;
- русский интерфейс.

Не проектировать первую версию как SaaS или многопользовательскую систему.

---

# 5. Высокоуровневая архитектура

```text
┌─────────────────────────────────────────────────────────────┐
│ Electron Desktop App                                        │
│                                                             │
│  ┌──────────────────┐       IPC       ┌───────────────────┐ │
│  │ React Renderer   │◄───────────────►│ Electron Main     │ │
│  │ UI, Forms,       │                 │ Orchestrator      │ │
│  │ Session, History │                 │ Processes, DB     │ │
│  └──────────────────┘                 └─────────┬─────────┘ │
└────────────────────────────────────────────────┼───────────┘
                                                 │
                 ┌───────────────────────────────┼──────────────┐
                 │                               │              │
                 ▼                               ▼              ▼
        Android Environment                ArionHub API     Local Files
        ├─ Android Emulator                ├─ /v1/models    ├─ references
        ├─ ADB                             └─ chat API       ├─ temp
        ├─ Appium                                           └─ SQLite
        └─ UiAutomator2
                 │
                 ▼
              Twinby
```

---

# 6. Технологический стек

## Desktop

- Electron;
- React;
- TypeScript;
- electron-vite или Vite;
- React Router;
- Zustand только для UI-состояния;
- TanStack Query для асинхронных запросов;
- Mantine или shadcn/ui — выбрать один;
- React Hook Form;
- Zod.

## Main process

- Node.js;
- TypeScript;
- `execa`;
- `better-sqlite3`;
- Drizzle ORM;
- `sharp`;
- `pino`;
- `zod`;
- OpenAI SDK с ArionHub base URL;
- `webdriverio`.

## Testing

- Vitest;
- React Testing Library;
- Playwright для Electron smoke;
- mock WebDriver;
- mock ArionHub server;
- fixture screenshots;
- contract tests;
- manual real-device checklist.

## Packaging

- electron-builder;
- Windows installer;
- Android SDK не включать в installer;
- MVP использует установленный Appium;
- production packaging Appium решать отдельным этапом.

---

# 7. Структура monorepo

Использовать `pnpm`.

```text
twinby-ai-swiper/
├─ apps/
│  └─ desktop/
│     ├─ src/
│     │  ├─ main/
│     │  │  ├─ bootstrap/
│     │  │  ├─ ipc/
│     │  │  ├─ security/
│     │  │  └─ main.ts
│     │  ├─ preload/
│     │  │  └─ index.ts
│     │  └─ renderer/
│     │     ├─ app/
│     │     ├─ pages/
│     │     ├─ widgets/
│     │     ├─ features/
│     │     ├─ entities/
│     │     ├─ shared/
│     │     └─ main.tsx
│     └─ electron-builder.yml
├─ packages/
│  ├─ contracts/
│  ├─ config/
│  ├─ database/
│  ├─ logging/
│  ├─ android-environment/
│  ├─ appium-client/
│  ├─ twinby-adapter/
│  ├─ profile-capture/
│  ├─ image-pipeline/
│  ├─ ai-provider/
│  ├─ decision-engine/
│  ├─ session-orchestrator/
│  └─ test-fixtures/
├─ scripts/
│  ├─ doctor.ts
│  ├─ install-appium-driver.ts
│  ├─ list-avds.ts
│  └─ detect-twinby-package.ts
├─ docs/
│  ├─ setup-windows.md
│  ├─ appium-inspector.md
│  ├─ locator-discovery.md
│  ├─ ai-contract.md
│  ├─ privacy.md
│  └─ troubleshooting.md
├─ data/
│  ├─ references/
│  ├─ temporary/
│  ├─ logs/
│  └─ application.sqlite
├─ package.json
├─ pnpm-workspace.yaml
├─ tsconfig.base.json
└─ README.md
```

Не помещать бизнес-логику в React-компоненты или IPC handlers.

---

# 8. Слои приложения

## Presentation layer

Отвечает за формы, статусы, пользовательские действия, preview, review queue, историю и ошибки. Не имеет прямого доступа к API key, файловой системе, child processes, SQLite, Appium, ADB и ArionHub.

## IPC layer

Разрешить только явно перечисленные методы. Все входы и выходы валидировать через Zod.

```ts
interface DesktopApi {
  environment: {
    runDoctor(): Promise<EnvironmentReport>;
    listAvds(): Promise<AndroidVirtualDevice[]>;
    startAvd(input: StartAvdInput): Promise<void>;
    stopAvd(): Promise<void>;
    listDevices(): Promise<AndroidDevice[]>;
  };
  ai: {
    saveConfig(input: AiConfigInput): Promise<void>;
    testTextConnection(): Promise<AiConnectionTest>;
    testVisionConnection(input: VisionTestInput): Promise<AiVisionTest>;
    listModels(): Promise<AiModel[]>;
  };
  preferences: {
    get(): Promise<PreferenceProfile>;
    save(input: PreferenceProfileInput): Promise<void>;
    addReference(input: AddReferenceInput): Promise<ReferenceImage>;
    removeReference(id: string): Promise<void>;
  };
  sessions: {
    start(input: StartSessionInput): Promise<SessionState>;
    pause(): Promise<void>;
    resume(): Promise<void>;
    stop(): Promise<void>;
    subscribe(listener: (event: SessionEvent) => void): Unsubscribe;
  };
  review: {
    list(): Promise<ReviewItem[]>;
    confirm(input: ReviewDecisionInput): Promise<void>;
  };
  history: {
    list(input: HistoryQuery): Promise<PaginatedHistory>;
    exportCsv(input: HistoryExportInput): Promise<string>;
    clear(): Promise<void>;
  };
}
```

## Application layer

Use cases:

- `RunEnvironmentDoctor`;
- `StartAndroidEnvironment`;
- `ConnectAppiumSession`;
- `CaptureCurrentProfile`;
- `EvaluateProfile`;
- `ExecuteSwipeDecision`;
- `AddUserFeedback`;
- `BuildPreferenceSummary`;
- `TestAiProvider`;
- `RecoverSession`;
- `StopSessionSafely`.

## Domain layer

Не зависит от Electron, Appium и AI SDK. Содержит модели, правила, state machine, thresholds, hard filters, domain errors и события.

## Infrastructure layer

Конкретные реализации SQLite, ArionHub, Appium/WebdriverIO, ADB, Emulator, filesystem, image processing и secure storage.

---

# 9. Пользовательские экраны

## 9.1 Welcome / Risk Notice

- описание приложения;
- предупреждение о правилах Twinby;
- ссылка на соглашение;
- чекбокс осознанного согласия;
- кнопка «Продолжить».

Без согласия автоматизация недоступна.

## 9.2 Setup Wizard

Шаги:

1. Проверка Node.js.
2. Проверка Java.
3. Проверка `ANDROID_HOME`.
4. Проверка `adb`.
5. Проверка `emulator`.
6. Поиск AVD.
7. Проверка Appium.
8. Проверка UiAutomator2.
9. Проверка Appium Inspector.
10. Выбор AVD.
11. Запуск AVD.
12. Проверка Twinby.
13. Вход и верификация вручную.
14. Подключение ArionHub.
15. Vision-test.
16. Добавление предпочтений.
17. Добавление референсов.
18. Тестовый recommendation-only запуск.

Каждый шаг показывает статус, найденный путь/версию, объяснение, кнопку повторной проверки, команду исправления и кнопку копирования команды.

## 9.3 Dashboard

Показывать:

- состояние приложения;
- устройство;
- Android;
- Appium;
- Twinby;
- модель;
- режим;
- текущую сессию;
- просмотрено;
- like/dislike/review;
- ошибки;
- токены;
- оценочную стоимость;
- «Запустить всё»;
- «Пауза»;
- «Остановить».

## 9.4 Preferences

### Hard filters

- минимальный и максимальный возраст;
- максимальная дистанция;
- допустимые цели знакомства;
- минимальная совместимость;
- обязательное описание;
- запрещённые слова;
- желательные слова;
- стоп-критерии.

Hard filters выполняются локально до AI, только если значение достоверно считано.

### Free-form description + skills

Четыре блока вкуса сверху вниз (SVG-иконки + вертикальная шкала зелёный→красный слева):

1. «Что особенно важно» → `importantSkills` + `priorities`;
2. «Кто нравится» → `likedSkills` + `likedDescription`;
3. «Кто не нравится» → `dislikedSkills` + `dislikedDescription`;
4. «Стоп-сигналы» → `stopSkills` + `hardRejects`;

«Как действовать при сомнении» — только текст (`uncertaintyPolicy`).

Скилы и текст уходят в AI вместе (и в `audience:derive-from-eurydice`); текст — для нюансов, которые не укладываются в короткие метки. Скилы и текст не должны дублировать друг друга: метки — короткие маркеры, textarea — правила оценки и примеры.

### Weights

- внешность;
- стиль и подача;
- описание;
- интересы;
- совместимость;
- расстояние.

Сумма — 100%.

### Thresholds

- like score;
- dislike score;
- минимальная уверенность;
- auto-like threshold;
- auto-dislike threshold.

## 9.5 References

Две колонки: положительные и отрицательные.

Карточка:

- preview;
- polarity;
- комментарий;
- tags;
- weight;
- pinned;
- дата;
- удалить;
- заменить;
- полноэкранный просмотр.

Предлагать уточнить, что важно:

```text
Нравится лицо
Нравится общий образ
Нравится одежда
Нравится естественность фото
Нравится фигура
Не нравится фильтр
Не нравится постановочность
Другое
```

Не делать выводов о чувствительных атрибутах.

## 9.6 AI Settings

Поля:

- provider: ArionHub;
- base URL;
- API key;
- primary model;
- fallback model;
- timeout;
- max retries;
- max candidate photos;
- positive anchors count;
- negative anchors count;
- image detail;
- max output tokens;
- session spending limit;
- daily spending limit;
- fallback enabled;
- JSON repair enabled.

Кнопки:

- загрузить модели;
- проверить текст;
- проверить vision;
- проверить JSON;
- тестовый анализ.

## 9.7 Device Settings

Поля:

- AVD;
- emulator path;
- adb path;
- Appium host/port;
- device UDID;
- package;
- activity;
- `noReset`;
- boot timeout;
- app launch timeout;
- selector profile.

Действия:

- список AVD;
- запустить;
- остановить;
- cold boot;
- открыть Device Manager;
- открыть Appium Inspector;
- проверить ADB;
- найти package;
- подключить физическое устройство.

## 9.8 Locator Diagnostics

Показывать:

- screenshot;
- XML page source;
- detected screen;
- найденные элементы;
- применившиеся locators;
- fallback locators;
- confidence detector;
- сохранить snapshot;
- проверить Like без нажатия;
- проверить Dislike без нажатия;
- открыть профиль;
- собрать данные.

Опасные действия требуют подтверждения.

## 9.9 Session

Слева live screenshot, состояние и progress фото. Справа extracted data, решение, score, confidence, breakdown, reasons, uncertainties, модель, latency, tokens и cost.

Кнопки:

- подтвердить;
- исправить на like;
- исправить на dislike;
- review;
- пропустить;
- остановить после текущей анкеты.

## 9.10 Review Queue

Для каждого элемента:

- snapshot только при opt-in;
- extracted data;
- решение модели;
- reasons;
- пользовательское решение;
- «использовать как референс».

По умолчанию фотографии не сохранять между запусками.

## 9.11 History and Analytics

Показывать:

- анализы;
- распределение решений;
- исправления;
- agreement rate;
- среднее время;
- ошибки;
- токены;
- стоимость;
- модели;
- сессии;
- review rate;
- auto/manual actions.

Имена анкет не хранить по умолчанию.

## 9.12 Privacy and Data

Настройки:

- хранить ли candidate screenshots;
- срок хранения;
- удалять при закрытии;
- удалять после анализа;
- хранить ли bio;
- хранить ли reasons;
- очистить всё;
- экспортировать настройки;
- экспортировать историю без изображений.

---

# 10. Android Environment Manager

## Задачи

- найти Android SDK;
- найти `adb`;
- найти `emulator`;
- перечислить AVD;
- запустить AVD;
- дождаться загрузки;
- определить UDID;
- проверить Twinby package;
- запустить приложение;
- остановить emulator;
- восстановиться после сбоя.

## Поиск путей Windows

Проверять:

- `ANDROID_HOME`;
- `ANDROID_SDK_ROOT`;
- `%LOCALAPPDATA%\Android\Sdk`;
- user override.

Не хардкодить один путь.

## Запуск

```bash
emulator -list-avds
emulator @<avd_name>
```

Либо полный путь к `emulator.exe`. Не использовать `-wipe-data` без подтверждения.

## Ожидание загрузки

1. Запустить process.
2. Проверять `adb devices`.
3. Дождаться статуса `device`, не `offline`.
4. Выполнять:

```bash
adb -s <udid> shell getprop sys.boot_completed
```

5. Дождаться `1`.
6. Проверить package manager.
7. Применить timeout.
8. При timeout показать emulator logs.

## Создание AVD

Инструкция:

- Android Studio;
- Device Manager;
- Pixel-профиль;
- system image с Google Play;
- подходящий API;
- аппаратное ускорение;
- достаточно RAM/storage.

Twinby устанавливается из Play Store вручную. Не скачивать APK с неофициальных источников.

## Twinby login

Вход, код и видео-верификация выполняются вручную. Бот обнаруживает login/verification/permission/update screens, ставит сессию на паузу и просит пользователя завершить действие.

---

# 11. Appium Process Manager

## Установка

```bash
npm install -g appium
appium driver install uiautomator2
appium driver doctor uiautomator2
```

## Жизненный цикл

- проверить порт;
- определить существующий server;
- использовать его либо запустить свой;
- сохранить PID;
- читать stdout/stderr;
- дождаться `/status`;
- завершать только свой процесс;
- не убивать чужой Appium;
- писать логи.

## Capabilities

```ts
type TwinbyCapabilities = {
  platformName: "Android";
  "appium:automationName": "UiAutomator2";
  "appium:deviceName": string;
  "appium:udid": string;
  "appium:appPackage": string;
  "appium:appActivity"?: string;
  "appium:noReset": boolean;
  "appium:newCommandTimeout": number;
  "appium:autoGrantPermissions"?: boolean;
  "appium:disableWindowAnimation"?: boolean;
};
```

Не менять permissions без необходимости.

## Session contract

```ts
interface MobileSession {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getScreenshot(): Promise<Buffer>;
  getPageSource(): Promise<string>;
  find(locator: Locator): Promise<MobileElement | null>;
  findAll(locator: Locator): Promise<MobileElement[]>;
  tap(target: TapTarget): Promise<void>;
  swipe(direction: SwipeDirection, options?: SwipeOptions): Promise<void>;
  back(): Promise<void>;
  launchApp(): Promise<void>;
  activateApp(packageName: string): Promise<void>;
  terminateApp(packageName: string): Promise<void>;
}
```

---

# 12. Twinby UI Adapter

## Контракт

```ts
interface DatingAppAdapter {
  detectScreen(): Promise<DetectedScreen>;
  ensureFeedReady(): Promise<void>;
  captureCurrentProfile(options: CaptureProfileOptions): Promise<CapturedProfile>;
  performAction(action: SwipeAction): Promise<ActionResult>;
  dismissKnownOverlay(): Promise<boolean>;
  recoverToFeed(): Promise<RecoveryResult>;
}

class TwinbyAndroidAdapter implements DatingAppAdapter {}
```

## Нельзя выдумывать селекторы

Реальные `resource-id`, `content-desc`, text, hierarchy и coordinates получить через Appium Inspector на фактической версии Twinby.

До этого создать interfaces, config, mock locators, diagnostic tooling и discovery checklist.

Не писать ложные значения вроде `com.twinby:id/like_button`, если Inspector их не подтвердил.

## Locator priority

1. accessibility id;
2. resource-id;
3. text;
4. class + relation;
5. минимально хрупкий XPath;
6. screen-relative coordinates как последний fallback.

Coordinate fallback хранить по resolution, density, orientation, app version и selector profile version.

## Locator profile

```ts
interface LocatorProfile {
  id: string;
  appPackage: string;
  appVersion?: string;
  screenWidth?: number;
  screenHeight?: number;
  feed: {
    root: Locator[];
    likeButton: Locator[];
    dislikeButton: Locator[];
    detailsButton: Locator[];
    name: Locator[];
    age: Locator[];
    distance: Locator[];
    compatibility: Locator[];
    bio: Locator[];
    interests: Locator[];
    nextPhotoArea: Locator[];
    photoIndicator: Locator[];
  };
  overlays: {
    matchDialog: Locator[];
    premiumDialog: Locator[];
    updateDialog: Locator[];
    errorDialog: Locator[];
    noProfiles: Locator[];
  };
}
```

## Screen types

```ts
type TwinbyScreenType =
  | "feed"
  | "profile-details"
  | "photo-viewer"
  | "match-dialog"
  | "premium-dialog"
  | "no-profiles"
  | "network-error"
  | "login"
  | "verification"
  | "update-required"
  | "android-permission"
  | "unknown";
```

```ts
interface DetectedScreen {
  type: TwinbyScreenType;
  confidence: number;
  evidence: string[];
}
```

Не выполнять свайп, если screen не `feed`.

## Recovery

- match dialog — закрыть, не писать;
- premium dialog — закрыть;
- network error — retry with backoff;
- no profiles — завершить;
- login/verification/update — pause;
- unknown — screenshot + page source + pause.

Ограничить recovery attempts.

---

# 13. Profile Capture Pipeline

## CapturedProfile

```ts
interface CapturedProfile {
  observationId: string;
  capturedAt: string;
  fields: {
    displayName?: string;
    age?: number;
    distanceKm?: number;
    compatibilityPercent?: number;
    relationshipGoal?: string;
    bio?: string;
    interests: string[];
    otherVisibleText: string[];
  };
  images: CapturedImage[];
  source: {
    appPackage: string;
    appVersion?: string;
    deviceId: string;
    screenSize?: { width: number; height: number };
  };
  completeness: {
    text: number;
    images: number;
    overall: number;
  };
  cardFingerprint: string;
}
```

## Извлечение текста

Порядок:

1. Appium page source.
2. Accessibility text.
3. Visible UI text.
4. Если element text недоступен — передать screenshot модели.
5. OCR не использовать в MVP без отдельной причины.

## Сбор фотографий

1. Убедиться, что открыт профиль.
2. Сделать screenshot.
3. Определить photo region.
4. Вырезать region.
5. Рассчитать perceptual hash.
6. Сохранить временный файл.
7. Перейти к следующему фото.
8. Дождаться изменения hash.
9. Повторять до max photos, повторения, конца или timeout.
10. Вернуться в известное состояние.

Не допускать бесконечный цикл.

## Photo region

Приоритет:

1. bounds элемента фото;
2. region selector profile;
3. configurable normalized crop;
4. полный screenshot как fallback с warning.

```ts
interface NormalizedRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
```

## Image preprocessing

Через `sharp`:

- auto-rotate;
- crop;
- remove top/bottom bars;
- resize;
- JPEG/WebP;
- configurable quality;
- metadata strip;
- max dimension 768 px default;
- no upscaling;
- checksum;
- perceptual hash.

Никогда не сохранять EXIF.

---

# 14. Preference Model

```ts
interface PreferenceProfile {
  id: string;
  name: string;
  hardFilters: {
    minAge?: number;
    maxAge?: number;
    maxDistanceKm?: number;
    minCompatibilityPercent?: number;
    requireBio?: boolean;
    allowedRelationshipGoals: string[];
    blockedKeywords: string[];
    preferredKeywords: string[];
  };
  narrative: {
    likedDescription: string;
    dislikedDescription: string;
    priorities: string;
    hardRejects: string;
    uncertaintyPolicy: string;
    likedSkills: string[];
    dislikedSkills: string[];
    importantSkills: string[];
    stopSkills: string[];
  };
  weights: {
    visual: number;
    presentation: number;
    bio: number;
    interests: number;
    compatibility: number;
    distance: number;
  };
  thresholds: {
    likeScore: number;
    dislikeScore: number;
    autoLikeScore: number;
    autoDislikeScore: number;
    minConfidence: number;
  };
  referenceSelection: {
    maxPositive: number;
    maxNegative: number;
    preferPinned: boolean;
  };
  version: number;
  createdAt: string;
  updatedAt: string;
}
```

```ts
interface ReferenceImage {
  id: string;
  preferenceProfileId: string;
  polarity: "positive" | "negative";
  filePath: string;
  thumbnailPath: string;
  comment?: string;
  tags: string[];
  weight: number;
  pinned: boolean;
  checksum: string;
  createdAt: string;
}
```

## Reference selection MVP

1. `pinned`.
2. Наибольший weight.
3. Самые свежие.
4. Не больше лимита.
5. Минимум один positive и один negative, если доступны.

Не строить image embeddings в MVP, пока подходящий endpoint не подтверждён.

## Preference summary

```ts
interface PreferenceSummary {
  positiveVisualPatterns: string[];
  negativeVisualPatterns: string[];
  positivePresentationPatterns: string[];
  negativePresentationPatterns: string[];
  lifestylePreferences: string[];
  bioPreferences: string[];
  hardRejects: string[];
  uncertainties: string[];
}
```

AI summary всегда показывать пользователю и разрешать редактирование. Не менять preference profile скрытно.

---

# 15. ArionHub AI Provider

## Основа

ArionHub публично позиционируется как OpenAI/Claude-compatible API gateway.

Default base URL:

```text
https://arionhub.pro/v1
```

Модели и цены не хардкодить как постоянные.

## Config

```ts
interface ArionHubConfig {
  baseUrl: string;
  apiKeySecretId: string;
  primaryModel: string;
  fallbackModel?: string;
  timeoutMs: number;
  maxRetries: number;
  maxOutputTokens: number;
  temperature: number;
  responseFormatMode: "json-object" | "prompt-json";
}
```

Предварительные defaults:

```text
primary: gpt-5.6-terra
fallback: gpt-5.4-mini
```

Использовать только после successful vision test.

## Model discovery

1. Попробовать `GET /models`.
2. Показать модели.
3. Не считать имя модели доказательством vision.
4. Выполнить реальный tiny vision test.
5. Сохранить capabilities.

```ts
interface ModelCapabilities {
  model: string;
  text: "supported" | "failed" | "unknown";
  vision: "supported" | "failed" | "unknown";
  jsonObject: "supported" | "failed" | "unknown";
  testedAt: string;
  latencyMs?: number;
  error?: string;
}
```

## Vision test

Отправить маленькое локальное тестовое изображение и вопрос с очевидным ответом. Потребовать JSON. Проверить HTTP, content, JSON parsing, usage и latency. Не использовать реальную анкету.

## Request format

Использовать Chat Completions, только если фактическая документация ArionHub это подтверждает.

```ts
interface AiImageInput {
  label: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  base64: string;
}

type VisionMessagePart =
  | { type: "text"; text: string }
  | {
      type: "image_url";
      image_url: {
        url: string;
        detail?: "low" | "high" | "auto";
      };
    };
```

Поддержать:

1. `response_format: { type: "json_object" }`;
2. strict prompt + Zod parse.

## Provider abstraction

```ts
interface VisionAiProvider {
  listModels(): Promise<AiModel[]>;
  testCapabilities(model: string): Promise<ModelCapabilities>;
  buildPreferenceSummary(input: BuildPreferenceSummaryInput): Promise<PreferenceSummary>;
  evaluateProfile(input: EvaluateProfileInput): Promise<RawAiDecision>;
}
```

## Retry policy

Retry только на timeout, 408, 429, 500, 502, 503, 504, temporary network error и один invalid JSON repair.

Не retry на 401, 403, no balance, unsupported image/model, invalid key или refusal без изменения input.

Exponential backoff with jitter.

## Circuit breaker

- 3 auth/payment errors — pause;
- 5 network failures — open circuit;
- 3 invalid JSON — fallback/pause;
- vision unsupported — disable model for vision.

---

# 16. AI Input Contract

```ts
interface EvaluateProfileInput {
  preferenceProfile: PreferenceProfile;
  preferenceSummary?: PreferenceSummary;
  candidate: {
    age?: number;
    distanceKm?: number;
    compatibilityPercent?: number;
    relationshipGoal?: string;
    bio?: string;
    interests: string[];
    otherVisibleText: string[];
    completeness: number;
  };
  positiveReferences: AiImageInput[];
  negativeReferences: AiImageInput[];
  candidateImages: AiImageInput[];
  userFeedbackSummary?: {
    commonFalseLikes: string[];
    commonFalseDislikes: string[];
  };
}
```

Не передавать без необходимости:

- имя;
- точную геолокацию;
- ID анкеты;
- телефон;
- username;
- сообщения;
- токены;
- page source целиком;
- скрытые данные.

Имя удалять перед AI request.

## System prompt модели

```text
Ты оцениваешь соответствие анкеты личным предпочтениям пользователя.

Тебе передаются:
1. текстовые предпочтения пользователя;
2. положительные визуальные референсы;
3. отрицательные визуальные референсы;
4. фотографии текущей анкеты;
5. видимые данные анкеты.

Твоя задача:
- сравнить анкету с предпочтениями;
- оценить визуальное соответствие, стиль, описание и интересы;
- не придумывать невидимые свойства;
- не делать выводов о характере только по лицу;
- не определять чувствительные характеристики;
- при нехватке информации выбирать review;
- вернуть только JSON по схеме.

Не определяй национальность, расу, этничность, религию, здоровье,
инвалидность, политические взгляды, сексуальную ориентацию,
материальное положение или возраст по внешности.
Возраст используй только указанный в интерфейсе.
```

## Output schema

```ts
const AiDecisionSchema = z.object({
  action: z.enum(["like", "dislike", "review"]),
  overallScore: z.number().min(0).max(100),
  confidence: z.number().min(0).max(1),
  breakdown: z.object({
    visualFit: z.number().min(0).max(100).nullable(),
    presentationFit: z.number().min(0).max(100).nullable(),
    bioFit: z.number().min(0).max(100).nullable(),
    interestsFit: z.number().min(0).max(100).nullable(),
    compatibilityFit: z.number().min(0).max(100).nullable(),
    distanceFit: z.number().min(0).max(100).nullable(),
  }),
  matchedPreferences: z.array(z.string()).max(6),
  concerns: z.array(z.string()).max(6),
  uncertainties: z.array(z.string()).max(6),
  shortReason: z.string().max(500),
  evidenceCompleteness: z.number().min(0).max(1),
});
```

## Parsing

1. Получить content.
2. Удалить markdown fences.
3. Parse JSON.
4. Validate Zod.
5. При ошибке один repair request без изображений.
6. При повторной ошибке fallback либо `review`.
7. Никогда не auto-swipe после invalid output.

---

# 17. Deterministic Decision Engine

AI не нажимает кнопку напрямую.

```text
Captured profile
      ↓
Hard filters
      ↓
AI evaluation
      ↓
Schema validation
      ↓
Deterministic post-processing
      ↓
Execution policy
      ↓
Manual / Auto action
```

## Hard filters

- возраст вне диапазона;
- дистанция выше max;
- запрещённая цель;
- blocked keyword;
- отсутствует bio при `requireBio`.

Hard reject только если поле достоверно считано.

## FinalDecision

```ts
interface FinalDecision {
  proposedAction: "like" | "dislike" | "review";
  executableAction: "like" | "dislike" | null;
  overallScore: number;
  effectiveConfidence: number;
  source: "hard-filter" | "primary-ai" | "fallback-ai";
  reasons: string[];
  blockedBy: string[];
}
```

## Effective confidence

Не доверять только self-reported confidence. Учитывать model confidence, completeness, distance from threshold, conflicting reasons, image count, bio presence, extraction validity и correction history.

```ts
effectiveConfidence =
  modelConfidence
  * completenessFactor
  * calibrationFactor
  * thresholdDistanceFactor;
```

Коэффициенты — конфигурация с тестами. Не называть результат научной вероятностью.

## Modes

```ts
type AutomationMode =
  | "recommendation-only"
  | "auto-high-confidence"
  | "full-allowed";
```

### recommendation-only

Ничего не нажимает без решения пользователя.

### auto-high-confidence

Исполняет только при verified screen, отсутствии safety block, достаточных score/confidence и непревышенных limits.

### full-allowed

Даже здесь не исполнять `review`, unknown screen, invalid JSON, unsupported model, rate limit или action после cost limit.

MVP начинается только с `recommendation-only`.

---

# 18. Session State Machine

```ts
type SessionStatus =
  | "idle"
  | "validating-environment"
  | "starting-emulator"
  | "waiting-for-device"
  | "starting-appium"
  | "connecting"
  | "opening-twinby"
  | "ready"
  | "capturing-profile"
  | "evaluating"
  | "awaiting-review"
  | "executing-action"
  | "cooldown"
  | "recovering"
  | "paused"
  | "stopping"
  | "stopped"
  | "error";
```

Правила:

- один active orchestrator;
- без параллельных анализов;
- transitions логируются;
- action привязан к observation id;
- после capture проверить, что профиль не изменился;
- stop отменяет AI request, не выполняет action, закрывает Appium и удаляет temp.

## Profile identity guard

Перед нажатием:

1. Снять fingerprint текущей карточки.
2. Сравнить с capture-time fingerprint.
3. При различии отменить action.
4. Выполнить recapture/review.

---

# 19. Session Limits

- max profiles;
- max likes;
- max dislikes;
- max auto-actions;
- max duration;
- max AI cost;
- min/max UI cooldown;
- stop on repeated errors;
- stop on no profiles.

Не добавлять random delays для маскировки. Cooldown нужен только для UI stability, animation, rate limit и контроля.

---

# 20. Database

Использовать SQLite + Drizzle.

## Таблицы

### `app_settings`

- key;
- encrypted/plain value policy;
- updated_at.

### `legal_consents`

- id;
- consent_version;
- accepted_at.

### `preference_profiles`

- id;
- name;
- hard_filters_json;
- narrative_json;
- weights_json;
- thresholds_json;
- version;
- timestamps.

### `reference_images`

- id;
- preference_profile_id;
- polarity;
- path;
- thumbnail_path;
- comment;
- tags_json;
- weight;
- pinned;
- checksum;
- timestamps.

### `ai_configs`

Raw API key не хранить.

- id;
- provider;
- base_url;
- primary_model;
- fallback_model;
- config_json;
- secret_id;
- timestamps.

### `model_capabilities`

- model;
- text_status;
- vision_status;
- json_status;
- latency_ms;
- tested_at;
- error.

### `device_configs`

- avd_name;
- udid;
- app_package;
- app_activity;
- locator_profile_id;
- config_json.

### `locator_profiles`

- name;
- app_version;
- screen_size;
- locators_json;
- timestamps.

### `sessions`

- mode;
- started_at;
- ended_at;
- status;
- counters_json;
- token_usage_json;
- estimated_cost;
- error_summary.

### `profile_observations`

- session_id;
- captured_at;
- anonymized_fingerprint;
- extracted_fields_json;
- completeness;
- candidate_image_count;
- persisted_images;
- expires_at.

### `ai_decisions`

- observation_id;
- provider;
- model;
- raw_action;
- score;
- confidence;
- breakdown_json;
- reasons_json;
- usage_json;
- latency_ms;
- estimated_cost.

### `final_decisions`

- observation_id;
- proposed_action;
- executable_action;
- source;
- effective_confidence;
- blocked_by_json.

### `executed_actions`

- observation_id;
- action;
- mode;
- performed_at;
- success;
- error;
- before_hash;
- after_hash.

### `user_feedback`

- observation_id;
- model_action;
- user_action;
- reason;
- added_as_reference;
- created_at.

### `application_events`

- session_id;
- level;
- category;
- code;
- message;
- metadata_json;
- created_at.

## Retention defaults

- temp candidate images: удалить после decision/action;
- candidate text: только обезличенные metadata;
- name: не сохранять;
- exact photo: не сохранять;
- page source: только diagnostic opt-in;
- logs: 7 дней;
- history: configurable;
- references: до удаления пользователем.

---

# 21. Secure Storage

## API key

Хранить через Electron `safeStorage` или OS credential vault. В БД — secret reference.

API key:

- не отдавать renderer;
- не логировать;
- маскировать;
- не экспортировать;
- не включать в crash report.

## Electron security

```ts
webPreferences: {
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  preload: preloadPath,
}
```

Также:

- CSP;
- запрет произвольной навигации;
- allowlist external URLs;
- no `eval`;
- no raw shell strings;
- `spawn`/`execa` с массивом args;
- Zod для IPC;
- sanitize user text.

---

# 22. Logging

Использовать `pino`.

Категории:

- environment;
- emulator;
- adb;
- appium;
- twinby-adapter;
- capture;
- image;
- ai;
- decision;
- action;
- database;
- security;
- ui.

Не логировать API key, base64, полное bio, имя, screenshot или page source без opt-in.

```ts
interface AppErrorShape {
  code: string;
  category: string;
  userMessage: string;
  technicalMessage: string;
  recoverable: boolean;
  suggestedAction?: string;
  cause?: unknown;
}
```

---

# 23. Error Handling

## Environment

- SDK missing;
- adb missing;
- emulator missing;
- no AVD;
- no device;
- offline;
- virtualization disabled;
- Appium missing;
- UiAutomator2 missing.

Показывать конкретное исправление.

## Twinby

- package not found;
- activity not found;
- login required;
- verification required;
- unknown screen;
- stale locators;
- feed empty;
- modal blocked;
- profile changed.

## AI

- invalid key;
- no balance;
- model missing;
- vision unsupported;
- invalid image;
- context too large;
- timeout;
- rate limit;
- malformed JSON;
- refusal;
- no usage.

## Actions

Перед retry tap проверить, не выполнено ли действие уже. Нельзя повторным tap свайпнуть следующую анкету.

---

# 24. Cost Tracking

Не хардкодить неподтверждённые тарифы.

```ts
interface ModelPrice {
  model: string;
  inputPerMillion?: number;
  outputPerMillion?: number;
  currency: "USD";
  source?: string;
  updatedAt?: string;
}
```

Расчёт:

```ts
estimatedCost =
  inputTokens / 1_000_000 * inputPrice
  + outputTokens / 1_000_000 * outputPrice;
```

Если usage/price отсутствуют, показывать «неизвестно».

---

# 25. Feedback and Calibration

После manual correction сохранять model decision, user decision, error category, comment, model и preference version.

Категории:

- неверно оценена внешность;
- неверно оценён стиль;
- bio переоценено;
- bio недооценено;
- пропущен stop criterion;
- слишком много review;
- недостаточно данных;
- другое.

Metrics:

- total agreement;
- like precision;
- dislike agreement;
- false-like rate;
- false-dislike rate;
- review rate;
- correction rate;
- latency;
- cost.

Не называть self-reported confidence вероятностью без калибровки.

## Model comparison

Offline tool:

1. Пользователь выбирает размеченный набор.
2. Модели получают одинаковый input.
3. Сравнить agreement, false likes/dislikes, review, latency и cost.
4. Не применять winner автоматически.

Реальные screenshots сохранять для dataset только с opt-in и retention period.

---

# 26. Background Processing

Не выполнять loop в renderer. Использовать main service или worker thread.

Требования:

- AbortController для AI;
- cancellable capture;
- pause only at safe states;
- stop after current profile;
- event stream в renderer;
- backpressure;
- один профиль одновременно.

---

# 27. Реальный сценарий запуска

## Первый запуск

1. Установить Android Studio.
2. Создать AVD.
3. Выбрать image с Google Play.
4. Запустить AVD.
5. Войти в Play Store.
6. Установить Twinby.
7. Войти и пройти верификацию вручную.
8. Установить Appium и UiAutomator2.
9. Запустить desktop app.
10. Пройти setup wizard.
11. Добавить ArionHub key.
12. Загрузить модели.
13. Выполнить vision test.
14. Ввести предпочтения.
15. Добавить references.
16. Запустить recommendation-only.
17. Проверить первые решения вручную.

## Обычный запуск

Кнопка «Запустить всё»:

1. Проверяет settings.
2. Проверяет AVD.
3. Запускает AVD.
4. Ждёт boot.
5. Проверяет ADB.
6. Запускает Appium.
7. Создаёт session.
8. Открывает Twinby.
9. Проверяет feed.
10. Начинает loop.

Android Studio при обычном запуске не требуется открывать.

---

# 28. Main Processing Loop

```ts
async function runSession(signal: AbortSignal) {
  await environment.ensureReady(signal);
  await mobile.connect(signal);
  await twinby.ensureFeedReady(signal);

  while (!signal.aborted) {
    limits.assertCanContinue();

    const screen = await twinby.detectScreen();

    if (screen.type !== "feed") {
      const recovered = await twinby.recoverToFeed();
      if (!recovered.success) {
        await pauseWithReason(recovered.reason);
        return;
      }
    }

    transition("capturing-profile");

    const profile = await twinby.captureCurrentProfile({
      maxImages: settings.maxCandidatePhotos,
      signal,
    });

    const preDecision = hardFilters.evaluate(profile, preferences);
    let finalDecision: FinalDecision;

    if (preDecision.isTerminal) {
      finalDecision = preDecision.finalDecision;
    } else {
      transition("evaluating");

      const aiDecision = await ai.evaluateProfile({
        candidate: sanitizeProfile(profile),
        positiveReferences: references.getPositive(),
        negativeReferences: references.getNegative(),
        preferenceProfile: preferences,
      });

      finalDecision = decisionEngine.finalize({
        profile,
        aiDecision,
        preferences,
        modelCalibration,
      });
    }

    await history.saveDecision(profile, finalDecision);

    const execution = executionPolicy.resolve({
      mode: session.mode,
      decision: finalDecision,
    });

    if (execution.requiresReview) {
      transition("awaiting-review");
      const userDecision = await review.waitForUser(signal);
      await feedback.save(userDecision);
      await executeAfterIdentityGuard(profile, userDecision);
    } else {
      await executeAfterIdentityGuard(profile, execution.action);
    }

    await tempFiles.cleanup(profile.observationId);
    transition("cooldown");
    await uiStability.wait();
  }
}
```

---

# 29. Identity Guard before Action

```ts
async function executeAfterIdentityGuard(
  captured: CapturedProfile,
  action: SwipeAction
) {
  const currentHash = await twinby.captureCardFingerprint();

  if (!fingerprintService.matches(
    captured.cardFingerprint,
    currentHash
  )) {
    throw new ProfileChangedError();
  }

  const screen = await twinby.detectScreen();

  if (screen.type !== "feed") {
    throw new UnsafeActionStateError();
  }

  await twinby.performAction(action);
  await twinby.waitForCardChange();

  await actionRepository.save({
    observationId: captured.observationId,
    action,
    success: true,
  });
}
```

---

# 30. Appium Inspector Workflow

Создать `docs/locator-discovery.md`.

1. Запустить emulator.
2. Открыть Twinby feed.
3. Запустить Appium.
4. Запустить standalone Appium Inspector.
5. Создать session.
6. Сохранить screenshot, page source, app version, resolution и density.
7. Найти feed root, like, dislike, details, name, age, distance, compatibility, bio, interests, next photo, match modal, premium modal, no profiles и network error.
8. Внести locators в versioned profile.
9. Запустить diagnostics.
10. Не тестировать like на реальном профиле без подтверждения.

Использовать standalone Inspector или plugin, не устаревший сторонний web-host.

---

# 31. Mock Mode

Обязателен adapter без Twinby.

```ts
interface MockDatingAppAdapter extends DatingAppAdapter {}
```

Fixtures:

```text
packages/test-fixtures/profiles/
├─ profile-001/
│  ├─ data.json
│  ├─ photo-1.jpg
│  └─ photo-2.jpg
└─ profile-002/
```

Mock mode покрывает UI, AI, decision engine, history, review, costs, state machine и tests. До реальных locators приложение должно полностью работать в mock mode.

---

# 32. Tests

## Unit

- hard filters;
- weights;
- thresholds;
- effective confidence;
- execution policy;
- state transitions;
- retry policy;
- costs;
- JSON parser;
- image hash;
- crop;
- cleanup.

## Contract

- model list;
- text completion;
- vision completion;
- JSON object;
- malformed response;
- missing usage;
- 401;
- 429;
- timeout;
- unsupported model.

Не запускать платные live tests в CI.

## Adapter

Fake WebDriver:

- screen detection;
- locator fallback;
- modal recovery;
- profile capture;
- repeated photo;
- timeout;
- changed profile guard.

## Integration

```text
Start session
→ capture fixture
→ AI mock decision
→ review
→ correction
→ save history
→ next profile
→ stop
```

## Electron smoke

- launch;
- setup;
- save settings;
- navigation;
- mock session;
- stop;
- reopen;
- persistence.

## Manual real checklist

- AVD cold start;
- ADB reconnect;
- Appium restart;
- login pause;
- profile capture;
- three photos;
- modal;
- match dialog;
- no profiles;
- changed profile;
- internet loss;
- AI timeout;
- safe stop.

---

# 33. Quality Requirements

- strict TypeScript;
- no `any` in domain contracts;
- ESLint;
- Prettier;
- structured errors;
- no raw secrets;
- no unbounded loops;
- waits with timeout;
- external inputs validated;
- paths normalized;
- no shell injection;
- no silent auto-actions;
- no action in uncertain state;
- no image retention without opt-in.

---

# 34. Performance Requirements

- responsive UI;
- preprocessing under ~1 second on normal desktop;
- one AI request per candidate in normal path;
- максимум one repair;
- max 3 candidate photos default;
- limited references;
- resize before base64;
- deterministic cleanup;
- no memory growth with session length.

---

# 35. Accessibility and UX

- keyboard navigation;
- visible focus;
- statuses not only by color;
- destructive confirmations;
- clear Russian errors;
- copyable logs;
- visible progress;
- easy pause;
- emergency stop always visible.

---

# 36. MVP Scope

MVP включает:

- Electron + React;
- setup wizard;
- environment doctor;
- AVD list/start;
- Appium connect;
- ArionHub config;
- text + vision tests;
- preferences;
- references;
- mock adapter;
- locator diagnostics;
- recommendation-only session;
- capture;
- image preprocessing;
- structured AI decision;
- manual confirmation;
- history;
- cleanup.

Не включает:

- messaging;
- account creation;
- cloud sync;
- multiple accounts/devices;
- stealth;
- scraping;
- internal API;
- OCR pipeline;
- local LLM;
- embeddings;
- full automation by default.

---

# 37. Этапы реализации

## Этап 1. Project foundation

Результат:

- monorepo;
- Electron;
- React;
- preload;
- typed IPC;
- logging;
- SQLite;
- navigation;
- tests.

## Этап 2. Preferences and references

- CRUD preference profile;
- reference upload;
- thumbnails;
- comments;
- secure paths;
- validation.

## Этап 3. ArionHub provider

- secure key;
- model list;
- text test;
- vision test;
- JSON validation;
- mock server;
- usage/cost.

## Этап 4. Mock session

- state machine;
- fixtures;
- AI decision;
- review;
- feedback;
- history.

## Этап 5. Environment doctor

- SDK;
- ADB;
- emulator;
- AVD;
- Appium;
- UiAutomator2;
- diagnostics.

## Этап 6. Emulator lifecycle

- list;
- start;
- wait boot;
- stop;
- reconnect.

## Этап 7. Appium client

- server;
- session;
- screenshot;
- page source;
- commands;
- Inspector guide.

## Этап 8. Twinby discovery

- real snapshots;
- versioned locator profile;
- screen detectors;
- no actions yet.

## Этап 9. Twinby capture

- text;
- details;
- multiple photos;
- crop;
- hash;
- cleanup.

## Этап 10. Recommendation-only real session

- real capture;
- ArionHub analysis;
- user confirm;
- action;
- identity guard;
- recovery.

## Этап 11. Auto-high-confidence

Только после ручного тестового периода:

- thresholds;
- limits;
- emergency stop;
- audit.

## Этап 12. Packaging

- Windows installer;
- first-run docs;
- setup checks;
- reliable paths;
- migrations.

---

# 38. Acceptance Criteria

MVP готов, если:

1. Запускается на Windows.
2. Не требует постоянно открытой Android Studio.
3. Находит SDK и AVD.
4. Запускает emulator.
5. Дожидается ADB-ready.
6. Запускает Appium.
7. Создаёт UiAutomator2 session.
8. Открывает Twinby или просит открыть вручную.
9. Безопасно определяет feed.
10. Снимает данные одной анкеты.
11. Собирает от одного до заданного числа фото.
12. Обрезает UI или использует configured crop.
13. Уменьшает изображения.
14. Отправляет vision request в ArionHub.
15. Валидирует JSON.
16. Показывает решение.
17. Не нажимает без подтверждения в recommendation-only.
18. Проверяет identity перед action.
19. Выполняет like/dislike безопасно.
20. Обрабатывает match popup.
21. Останавливается при unknown screen.
22. Удаляет temp images.
23. Не раскрывает key.
24. Пишет обезличенную историю.
25. Имеет emergency stop.
26. Имеет mock mode.
27. Имеет tests основного flow.

---

# 39. Definition of Done каждого слоя

Слой готов только если:

- есть interface;
- есть implementation;
- есть Zod contracts;
- есть unit tests;
- есть structured errors;
- есть logging;
- есть docs;
- есть mock;
- нет опасного silent fallback.

---

# 40. Неизвестные данные, которые нельзя придумывать

До фактического исследования неизвестны:

- текущий package Twinby;
- main activity;
- resource-id;
- accessibility ids;
- photo carousel structure;
- match screen;
- premium screen;
- error texts;
- доступность данных через page source;
- vision support моделей ArionHub;
- `response_format` support;
- models endpoint behavior;
- реальные тарифы;
- image token accounting;
- rate limits.

Для каждого неизвестного создать discovery task, runtime probe, configurable value и user-facing diagnostic.

---

# 41. Документация

README:

- назначение;
- риски;
- requirements;
- установка;
- Android Studio;
- AVD;
- Twinby;
- Appium;
- ArionHub;
- запуск;
- mock mode;
- tests;
- troubleshooting;
- privacy;
- cleanup.

Документы:

```text
docs/setup-windows.md
docs/setup-android-emulator.md
docs/setup-appium.md
docs/setup-arionhub.md
docs/locator-discovery.md
docs/privacy.md
docs/troubleshooting.md
```

---

# 42. Команды проекта

```bash
pnpm install
pnpm dev
pnpm build
pnpm test
pnpm lint
pnpm typecheck

pnpm doctor
pnpm android:list-avds
pnpm android:list-devices
pnpm android:start
pnpm appium:doctor
pnpm appium:start
pnpm twinby:detect-package
pnpm ai:test-text
pnpm ai:test-vision
pnpm mock:session
```

---

# 43. Формат работы coding-agent

На каждом этапе предоставляй:

1. Что реализовано.
2. Какие файлы добавлены.
3. Полный код или patch.
4. Команды.
5. Tests.
6. Что должен увидеть пользователь.
7. Что неизвестно.
8. Следующий безопасный этап.

Не писать фиктивные результаты тестов. Если тест нельзя выполнить, сказать об этом и дать локальную команду.

---

# 44. Стартовая задача

Начни с **Этапа 1 — Project foundation**.

Первый ответ должен:

1. Предложить окончательную monorepo structure.
2. Создать `package.json`, workspace и TS config.
3. Настроить Electron + React + Vite.
4. Настроить secure preload.
5. Сделать typed IPC ping.
6. Добавить страницы Welcome, Setup, Dashboard, Preferences, References, AI, Device, Session, History, Privacy.
7. Добавить Zustand только для UI state.
8. Добавить SQLite bootstrap.
9. Добавить logging.
10. Добавить Vitest.
11. Добавить smoke test.
12. Дать Windows run commands.

Пока не подключать Twinby, Appium и real AI. Создать interfaces, mocks и package boundaries.

---

# 45. Источники и технические ориентиры

## Android Emulator

- AVD:
  https://developer.android.com/studio/run/managing-avds

- Command-line emulator:
  https://developer.android.com/studio/run/emulator-commandline

## Appium

- Documentation:
  https://appium.io/

- Quickstart:
  https://appium.io/docs/en/2.0/quickstart/

- Appium Inspector:
  https://github.com/appium/appium-inspector

## WebdriverIO

- Appium setup:
  https://webdriver.io/docs/appium/

## ArionHub

- Documentation:
  https://arionhub.pro/docs?section=quick-start

- Default Base URL:
  `https://arionhub.pro/v1`

## Twinby

- User agreement:
  https://twinby.ru/legal/user-agreement

## Аналогичные проекты

- SpicySwipe:
  https://github.com/ramailo1/SpicySwipe

- Auto-Tinder:
  https://github.com/joelbarmettlerUZH/auto-tinder

- Tinder Automation Bot:
  https://github.com/nathandev0/Tinder_Automation_Bot

---

# 46. Финальный принцип

```text
UI не знает об Appium.
Appium не знает об AI.
AI не нажимает кнопки.
Decision Engine не зависит от Twinby.
Twinby Adapter не хранит секреты.
Renderer не видит API key.
Неизвестный экран никогда не приводит к свайпу.
Невалидный ответ модели никогда не приводит к свайпу.
Изменившаяся анкета никогда не получает действие от старого решения.
```

Главный приоритет:

- предсказуемость;
- контролируемость;
- проверяемость;
- безопасность локальных данных;
- ручная остановка;
- отсутствие выдуманных интеграционных деталей.
