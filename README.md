# Orpheus & Eurydice

Локальное **Windows**-приложение (Electron) для работы с dating-приложением **Twinby** на Android через **Appium**. Два продукта в одном окне:

| Модуль | Назначение |
|--------|------------|
| **Eurydice** | Читает анкеты в ленте, оценивает их мультимодальной моделью (ArionHub), предлагает или выполняет `like` / `dislike`. |
| **Orpheus** | Собственный профиль Twinby: identity/audience, облачные фото, варианты анкеты, слепок «план ↔ факт», эксперименты и preflight перед сессией. |

UI — **русский**. Код, IPC, схемы БД — **английский**.

> **Риск:** автоматизация может нарушать [пользовательское соглашение Twinby](https://twinby.ru/legal/user-agreement) и привести к ограничению аккаунта. Приложение не гарантирует безопасность аккаунта и не маскирует бота для сервиса.

---

## Бизнес-логика

### Eurydice (свайп и отбор)

1. Пользователь задаёт **вкус**: текстовые предпочтения, hard filters, референс-фото (positive/negative).
2. Перед live-сессией опционально **preflight**: слепок своего профиля, скан диалогов/мэтчей/входящих лайков (read-only, без автолайков).
3. **Сессия** на устройстве или эмуляторе: capture анкеты (фото + bio) → hard filters → vision evaluate через LLM → решение.
4. Режимы: **recommendation-only** (подтверждение каждого свайпа) или **auto** (unattended в рамках лимитов).
5. **История** и feedback уточняют preference summary; лимиты сессии (число анкет, likes, длительность) настраиваются.

Ответы модели для evaluate сформулированы от **женского лица** (продуктовое решение для целевой аудитории промпта).

### Orpheus (свой профиль и эксперименты)

1. **Identity** — кто вы на самом деле; **Audience** — кому хотите понравиться (общая модель с Eurydice).
2. **Облако** (Google Drive / Яндекс Диск, read-only): lazy index фото, AI-описания, поиск по смыслу.
3. **Profile builder**: три варианта анкеты (фото, порядок, bio, гипотеза); constraints и regeneration.
4. **Verified snapshot** Twinby: capture с экрана редактирования, pHash, сопоставление с indexed assets, **сверка плана с фактом** (`matches-plan` / partial / mismatch).
5. **Эксперимент** запускается вручную после понятного deployment status; baseline из текущего Twinby; imperfect deployment при частичном совпадении.

Подробная продуктовая спека: [`Orpheus.md`](Orpheus.md) (если файл есть в вашем клоне).

---

## Техническая архитектура

```text
┌─────────────────────────────────────────────────────────┐
│  apps/desktop (Electron)                                 │
│  renderer (React)  ←IPC→  main (Node)                  │
│       │                      │                           │
│       │                 SQLite (Drizzle)                 │
│       │                 Appium / Twinby adapter          │
│       │                 ArionHub client                  │
└───────┼──────────────────────┼──────────────────────────┘
        │                      │
        ▼                      ▼
   Zod contracts          Android + Twinby
   packages/*             (UiAutomator2)
```

- **Контракты:** `packages/contracts` — Zod-схемы для IPC и domain views.
- **БД:** `packages/database` — SQLite WAL, миграции, history, Orpheus entities, encrypted settings.
- **AI:** `packages/ai-provider` — OpenAI-compatible ArionHub, evaluate, summaries, profile sets.
- **Решения:** `packages/decision-engine` — hard filters, score → action, execution policy.
- **Twinby:** `packages/twinby-adapter` — locator profiles, screen detector, action executor, parsers.
- **Capture:** `packages/profile-capture`, `image-pipeline` (Sharp, perceptual hash).
- **Orpheus domain:** `own-profile`, `relationship-tracker`, `profile-experiments`, `cloud-photo-sources`, и др.

Main process держит секреты и Appium; renderer только вызывает `window.desktopApi.*` (preload).

---

## Текущий статус (кратко)

Рабочий monorepo: mock + **live** Eurydice, Orpheus (identity/audience, cloud index, snapshot + deployment verification, experiments, preflight, history с AI-описаниями).

**Не готово / stub:** Windows installer, запуск AVD из приложения (этап 6).

---

## Требования

- Windows 10/11 x64  
- Node.js 20+, pnpm 10+  
- Live: Android SDK / ADB, Twinby на устройстве или эмуляторе, Appium + UiAutomator2, ключ [ArionHub](docs/setup-arionhub.md)

---

## Установка и запуск

```bash
pnpm install
pnpm run build:packages
pnpm dev
```

Сборка и тесты:

```bash
pnpm build
pnpm test
pnpm typecheck
pnpm run doctor    # не pnpm doctor
```

Первый запуск: экран рисков → согласие → настройка API key, устройства, предпочтений.

---

## Структура репозитория

```text
apps/desktop/           Electron main, preload, React UI
packages/contracts/     IPC + domain schemas (Zod)
packages/database/      SQLite + Drizzle
packages/ai-provider/   LLM client + prompts
packages/twinby-adapter/  Twinby UI automation
packages/decision-engine/
packages/profile-capture/
packages/own-profile/   Plan vs actual compare
packages/cloud-photo-sources/
packages/*              Остальные доменные пакеты
scripts/                doctor, appium, twinby discover
docs/                   Setup, privacy, public repo checklist
data/                   Локальные данные (не коммитить медиа/БД)
```

Evaluate system prompt (источник истины): `packages/ai-provider/src/index.ts` (`SYSTEM_PROMPT`).

---

## Документация

| Файл | О чём |
|------|--------|
| [`docs/setup-windows.md`](docs/setup-windows.md) | Установка и первый запуск |
| [`docs/setup-android-emulator.md`](docs/setup-android-emulator.md) | SDK / AVD |
| [`docs/setup-appium.md`](docs/setup-appium.md) | Appium + UiAutomator2 |
| [`docs/setup-arionhub.md`](docs/setup-arionhub.md) | API key и модели |
| [`docs/locator-discovery.md`](docs/locator-discovery.md) | Локаторы Twinby |
| [`docs/privacy.md`](docs/privacy.md) | Локальные данные и секреты |
| [`docs/public-repository.md`](docs/public-repository.md) | **Перед публикацией в open source** |
| [`docs/troubleshooting.md`](docs/troubleshooting.md) | Частые сбои |

---

## Локальные данные (не для git)

Каталог `data/` создаётся при работе приложения. В репозитории должны остаться только `.gitkeep`. Не коммитьте `application.sqlite`, референсы, discovery dumps, cloud previews. См. [`docs/public-repository.md`](docs/public-repository.md).

---

## Лицензия

Уточните лицензию перед публикацией (файл `LICENSE` в корне при необходимости).
