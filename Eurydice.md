# Промпт на разработку Eurydice (ex Twinby AI Swiper)

> Полная спецификация настольного приложения **Eurydice**, которое управляет Android-версией Twinby через Appium, анализирует фотографии и текст анкет через мультимодальную модель, доступную через ArionHub, и предлагает либо выполняет свайп в соответствии с пользовательскими предпочтениями. Продуктовое имя — Eurydice; Twinby — целевое dating-приложение.
>
> **Статус документа:** смешанный — дорожная карта + as-built. Актуальный статус продукта: [`README.md`](README.md).  
> Промпты AI: код `packages/ai-provider` (см. §16; ответы от женского лица). Auto / identity: §17–18 (обновлены под unattended + recapture).

---

## 0. Роль исполнителя

Ты — senior/full-stack разработчик и архитектор, специализирующийся на TypeScript, React, Electron, Node.js, Appium, Android Emulator, ADB, WebdriverIO, мультимодальных LLM API, локальном хранении данных и безопасной работе с пользовательскими секретами.

Твоя задача — спроектировать и поэтапно реализовать рабочее Windows-приложение **Eurydice**.

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

### Free-form description

- «Кто нравится»;
- «Кто не нравится»;
- «Что особенно важно»;
- «Что считать стоп-сигналом»;
- «Как действовать при сомнении».

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

> **Источник истины промптов:** `packages/ai-provider/src/index.ts`
> (`SYSTEM_PROMPT`, `SUMMARY_*`, `FEEDBACK_*`, `buildEvaluatePrompt`).
> Ниже — сжатое отражение as-built; при расхождении править код, затем этот раздел.

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
  };
  /** Только если нет preferenceSummary */
  positiveReferences?: AiImageInput[];
  negativeReferences?: AiImageInput[];
  candidateImages: AiImageInput[];
  recentFeedback?: UserDecisionFeedback[];
  signal?: AbortSignal;
}
```

Не передавать без необходимости:

- имя;
- точную геолокацию;
- ID анкеты;
- телефон;
- username;
- сообщения;
- токены API;
- page source целиком;
- скрытые данные.

Имя удалять перед AI request.

## System prompt модели (evaluate)

Четыре слоя: **Намерение → Контекст (C0–C6) → Процедура → Контракт**.
Голос ассистента: **Eurydice**, ответы на русском **от женского лица**.

Кратко (полная версия в коде):

- цель = вкус пользователя для свайпа, не «объективная красота»;
- C0 hardRejects veto; C1 фото главный evidence; C3 не отменяет C0;
- review только если фото нет/нечитаемы; иначе like/dislike;
- action согласован с overallScore и likeScore/dislikeScore;
- неполнота тела/blur → uncertainties, не выдумывать силуэт;
- shortReason / concerns с префиксами `[C0]`…`[C5]`;
- safety: не определять расу/этнос/религию/здоровье/ориентацию/достаток/возраст по внешности.

User message несёт экземпляр контекста (narrative, summary, feedback, пороги, поля анкеты) + image parts `[C1 candidate]`.

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
4. Validate Zod (+ soft-cap массивов).
5. При ошибке один repair request без изображений.
6. При повторной ошибке: recommendation-only → ручной review UI; auto → dislike / continue (не like).
7. Никогда не auto-like после invalid output. Decision-engine дополнительно сверяет score↔action.

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

Unattended-режим: работает без пауз и без `awaiting-review` (пользователь может отойти / спать).
Исполняет like/dislike на verified feed при отсутствии жёстких safety-блоков и непревышенных limits
(`maxAutoActions`, duration, AI spend).
Серый / uncertain / `review` → **dislike** и продолжение цикла (не like, не стоп сессии из‑за неуверенности).
Emergency stop / лимиты по-прежнему останавливают сессию.

### full-allowed

Даже здесь не исполнять `review`, unknown screen, invalid JSON, unsupported model, rate limit или action после cost limit.

В продукте доступны `recommendation-only` и `auto-high-confidence`.
`full-allowed` в текущих контрактах отсутствует.

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
3. При различии **не** выполнять задуманный like/dislike.
4. Cleanup → recapture → новый evaluate (без свайпа).
5. После нескольких подряд mismatch — dislike только чтобы сдвинуть ленту
   (`identity-mismatch-recapture-exhausted`), иначе unattended auto зациклится.

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

### As-built (уже в репозитории)

- Electron + React; setup / risk consent; environment doctor;
- Appium connect; Twinby capture + image preprocess; locator profile 2.3.0;
- ArionHub (key, models, vision evaluate, summary, feedback);
- preferences + references;
- mock + live session; recommendation-only и auto-high-confidence (unattended);
- identity recapture; spend/limits; history + last-session detail для feedback;
- cleanup temp captures.

### Ещё не в MVP / отложено

- Windows installer (этап 12);
- старт/стоп AVD из приложения (этап 6 stub — list devices есть);
- messaging; account creation; cloud sync; multi-account;
- stealth / scraping / internal API; OCR; local LLM; embeddings;
- `full-allowed` mode; полная audit-схема из §20 (есть упрощённая history).

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

- unattended (без pause-on-uncertain / без review);
- gray → dislike;
- limits + spend stop;
- emergency stop;
- identity recapture;
- audit (history).

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
