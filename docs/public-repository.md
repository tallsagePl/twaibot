# Публикация репозитория

Перед `git push` в **публичный** remote убедитесь, что в истории и в индексе нет личных данных.

## Что должно остаться только локально

| Каталог / файл | Содержимое |
|----------------|------------|
| `data/application.sqlite` | Все настройки, история, Orpheus-модели, OAuth (зашифр.), indexed photos meta |
| `data/references/` | Ваши референс-фото для вкуса Eurydice |
| `data/history/`, `data/temporary/` | Скриншоты и capture кандидатов |
| `data/discovery/` | Page source / скриншоты Twinby при discovery локаторов |
| `data/cloud-previews/` | Превью из Google Drive / Яндекс Диска |
| `data/backups/` | Бэкапы SQLite |
| `.env` | Любые переменные окружения |

Секреты в приложении хранятся в main через Electron `safeStorage` (ключ ArionHub, OAuth Google/Yandex) — **внутри** `application.sqlite`, не в renderer.

## Проверка перед push

```bash
# Не должно находить бинарники и БД
git ls-files data | rg -v '\.gitkeep$'

# Не должно находить .env
git ls-files | rg '\.env'

# Поиск случайных ключей в отслеживаемых файлах (ручной просмотр)
git grep -i 'sk-[a-zA-Z0-9]' -- ':!*.md' || true
```

Ожидаемый вывод для `git ls-files data`: только `.gitkeep` в подпапках `data/`.

## Если личные файлы уже были закоммичены

1. Удалить из индекса (файлы на диске останутся):

```bash
git rm -r --cached data/references data/discovery 2>/dev/null || true
git rm -r --cached .idea 2>/dev/null || true
```

2. Закоммитить `.gitignore` и удаление из индекса.

3. Если репозиторий **уже пушился** с фото/БД — одного коммита недостаточно: старые объекты останутся в истории Git. Нужна перепись истории (`git filter-repo`, BFG) или новый чистый репозиторий без старых коммитов.

## Что можно публиковать

- Исходный код `apps/` и `packages/`
- Документация `docs/`, спека `Orpheus.md` (без персональных данных)
- JSON-профили локаторов Twinby в `packages/twinby-adapter/profiles/` (координаты UI, не пользовательские фото)
- `pnpm-lock.yaml`, конфиги сборки

## Лицензия и риски

В README указано: автоматизация Twinby может нарушать пользовательское соглашение сервиса. Публикуя код, вы не публикуете аккаунт пользователя — но **исполнитель** несёт ответственность за использование.
