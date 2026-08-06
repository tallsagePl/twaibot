# Locator discovery (Appium Inspector)

**Не выдумывать** селекторы. Все локаторы — из Inspector / page source на фактической версии Twinby.

## Profiles

| Файл | Разрешение | Источник |
|------|------------|----------|
| `packages/twinby-adapter/profiles/com.twinby-2.3.0-1080x1920.json` | 1080×1920 | BlueStacks dumps 2026-08-07 |
| `packages/twinby-adapter/profiles/com.twinby-2.3.0-720x1280.json` | 720×1280 | FiiO + nav ids |

`findLocatorProfile` выбирает по `appVersion` + размеру окна.

## Bottom navigation (LTR)

| # | Вкладка | accessibility-id | Использование |
|---|---------|------------------|---------------|
| 1 | Чаты и мэтчи | `navigationBar-Chat` | Диалоги + «Все» → мэтчи |
| 2 | Лайки | `navigationBar-Likes` | Входящие лайки (read-only) |
| 3 | Лента | `navigationBar-Feed` | Eurydice swipe |
| 4 | Games | `navigationBar-Games` | **Не трогаем** |
| 5 | Профиль | `navigationBar-Profile` | Own profile snapshot |

## Back / Esc (подтверждено пользователем 2026-08-07)

| Контекст | Действие |
|----------|----------|
| Открытая анкета | **1×** → предыдущий экран (обычно чат) |
| Чат или edit профиля | **2×** → список чатов / нижняя навигация |
| Профиль через «Все»→чат→аватар | **2×** → «Новые пары»; **3×** → nav |
| Профиль через чаты→чат→аватар | **2×** → чаты / nav |
| «Просмотр» своей анкеты | swipe вниз, затем reverse Back |

### Путь к анкете мэтча / диалога

1. Чаты (или Чаты → «Все» → строка мэтча).
2. Строка открывает **чат** (`conversation`), не анкету.
3. Сверху **иконка аватара** (ImageView ~`[69,60][129,120]`) — тап открывает профиль.
4. Кнопка `%` совместимости — **не** основной вход в профиль.

## Потоки (dumps `data/discovery/twinby-2026-08-07T11-*`)

### Чаты → все мэтчи

1. Tab Chat.
2. `Все` (accessibility-id) у «Новые пары».
3. Список строк: `Имя | N% | N км` (опц. «Ранее»).
4. Строки чатов: `Имя | сообщение | ДД.ММ.ГГГГ`; **пропускать** `Twinby`.

### Лайки

1. Tab Likes, заголовок `Лайки`.
2. Карточки: `N% | Имя, возраст`.
3. Открытая анкета: как profile-details; выход **1×** Back. **Не** авто-лайкать.

### Свой профиль

1. Tab Profile → `profilePage-ProfileWidget-Avatar`.
2. Edit: `Мои фото`, слоты `Главное фото` / `1`…`N`, bio в content-desc после `Био`, кнопка `Просмотр`.
3. Preview → swipe down → 1–2× Back до nav.

## Feed (720 dump)

`profileFeed-ProfileCard`, Like/Dislike/… — resource-id. Имя: content-desc `Имя, возраст`.

## Политика

- Не писать в чаты, не авто-отвечать на лайки, не менять свою анкету.
- Preflight (§19): own-profile + dialogs(top5, open profile) + matches (open) + likes (open + Audience fit) + reconcile.
- Identity: composite `cid:…` (name+age+pHash+bioFp), не Twinby API id.
- Own photo previews: JPEG quality 55–70, длинная сторона ~512–768 (§18.3).

Живой прогон: `pnpm twinby:preflight-smoke`.
