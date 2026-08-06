# Troubleshooting

## `pnpm doctor` vs `pnpm run doctor`

`pnpm doctor` — встроенная команда pnpm. Для проверки Android/Appium окружения проекта: **`pnpm run doctor`**.

## Сессия: нет API-ключа

Задайте ключ в **ИИ**, сохраните. Live и mock не стартуют без ключа в `safeStorage`.

## Appium / устройство

- `adb devices` — устройство `device`, не `unauthorized`.
- Twinby на переднем плане, экран feed.
- Сессия Appium с `appPackage: com.twinby`, `noReset: true`.
- См. [`setup-appium.md`](setup-appium.md), [`locator-discovery.md`](locator-discovery.md).

## Identity mismatch / recapture

Перед свайпом сверяется fingerprint карточки. При mismatch действие отменяется, идёт recapture.
После нескольких подряд mismatch — dislike только чтобы сдвинуть ленту (`identity-mismatch-recapture-exhausted`).

## Auto «заснул» на review

Не должен: auto не уходит в `awaiting-review`. Серый/`review` → dislike и дальше.
Остановка — Stop, лимиты (`maxAutoActions`, duration, spend), no-profiles, фатальные ошибки.

## AI отменён после Stop

Ожидаемо: Stop abort'ит in-flight `evaluateProfile`. В логах может быть «отменён» / abort.

## Лимит расходов AI

Если заданы `sessionSpendingLimitUsd` / `dailySpendingLimitUsd`, оценка идёт по токенам × `usdPer1kTokens` (грубо). Без лимитов в конфиге стопа по $ нет.

## History / фото анкет

Temp capture чистится после анализа. Detail последней сессии (имя/фото) может остаться для feedback — см. [`privacy.md`](privacy.md).
