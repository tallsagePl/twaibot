# ArionHub

Приложение использует OpenAI-compatible API ArionHub.

Источник: [Quick Start](https://arionhub.pro/docs?section=quick-start)

## Что уже настроено в приложении

- Base URL: `https://arionhub.pro/v1`
- Provider: ArionHub / OpenAI Compatible
- Primary model default: `claude-sonnet-5` (можно сменить после «Загрузить модели»)
- Fallback default: `gpt-5.5`
- Secure storage ключа через Electron `safeStorage`
- Text / Vision тесты
- JSON schema validation для решений evaluate
- Preference summary по референсам; session feedback / калибровка narrative
- Опциональные лимиты `$` (`sessionSpendingLimitUsd` / `dailySpendingLimitUsd`) с оценкой по токенам × `usdPer1kTokens`

## Что нужно сделать вам

1. Зарегистрируйтесь / войдите на [arionhub.pro](https://arionhub.pro/)
2. **API Keys → Create API key**
3. Скопируйте ключ вида `sk-...`
4. В приложении: экран **ИИ** → вставьте ключ → **Сохранить**
5. **Загрузить модели** → выберите primary (лучше vision-capable)
6. **Проверить текст**
7. **Проверить vision**
8. На экране **Предпочтения** опишите, кто нравится / не нравится; загрузите референсы и постройте summary

## Режим ответа модели

Сейчас все запросы к ArionHub **не стримятся**: приложение ждёт один полный ответ (`chat.completions.create` без `stream`), затем парсит JSON. Live-«размышления» модели в UI не показываются — только спиннер ожидания. Streaming + отображение reasoning — только если позже явно включим `stream: true` (см. `Orpheus.md` §31.4).

## Важно

- Ключ не логируется и не отдаётся в renderer после сохранения (только маска)
- Не хардкодьте цены и список моделей как константы forever — берите из `/v1/models`
- Vision support модели подтверждается только реальным тестом, не именем
- Актуальный evaluate system prompt: `packages/ai-provider/src/index.ts` (`SYSTEM_PROMPT`)
