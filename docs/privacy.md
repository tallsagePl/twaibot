# Приватность

## Принцип

Приложение **локальное**: данные по умолчанию не отправляются на ваш сервер. Исключения — явные вызовы API (ArionHub для vision/текста, Google/Yandex для read-only доступа к фото при настройке Orpheus).

## Секреты

- API key ArionHub не попадает в renderer и маскируется в логах (`packages/logging`, `apps/desktop/src/main/security/secrets.ts`).
- OAuth Google / token Яндекс Диска шифруются через `safeStorage` и лежат в SQLite (`app_settings`), не в git.

## Фото и анкеты

- Временные фото capture (`data/temporary/…`) удаляются после анализа / свайпа.
- Для **последней** сессии может храниться detail (имя, bio, фото) локально — feedback и калибровка вкуса; при новой сессии или accept feedback detail очищается.
- Долгосрок: metadata решений (like/dislike, reasons), не полный архив всех анкет Twinby.
- Референсы вкуса (`data/references/`) — только на диске пользователя, **не** для публичного репозитория.

## Orpheus

- Verified snapshot собственного профилya Twinby, indexed cloud photos, identity/audience drafts — в `application.sqlite` и `data/cloud-previews/`.
- Облачные провайдеры: read-only, без записи в облако из приложения.

## Публикация кода

См. [`public-repository.md`](public-repository.md) — чеклист перед выкладкой репозитория в открытый доступ.

## Согласие

Текст рисков Twinby показывается при первом запуске; версия согласия хранится локально вместе с версией приложения.
