# Appium (Windows)

Нужен для discovery локаторов и live-сессий Twinby.

## Установка

```bash
npm install -g appium
appium driver install uiautomator2
```

Проверка:

```bash
appium -v
appium driver list --installed
pnpm appium:doctor
```

Опционально полный doctor драйвера:

```bash
appium driver doctor uiautomator2
```

## Appium Inspector

Скачайте standalone Windows build:

https://github.com/appium/appium-inspector/releases

Нужен для этапа 8 (discovery локаторов Twinby). Не выдумывайте селекторы.

## Запуск сервера

```bash
pnpm appium:start
pnpm appium:start:keep   # не завершать скрипт
```

Или в приложении: **Устройство → Старт Appium**.

Discovery локаторов: `docs/locator-discovery.md`.
