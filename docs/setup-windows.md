# Установка на Windows

## Node.js

1. Установите Node.js LTS 20+.
2. Установите pnpm: `npm install -g pnpm`
3. В корне репозитория: `pnpm install` и `pnpm run build:packages`

## Запуск desktop

```bash
pnpm run build:packages
pnpm dev
```

При первом запуске:

1. Экран предупреждения о рисках Twinby.
2. Чекбокс согласия.
3. Дальше — мастер / панель: ИИ (API key), предпочтения, устройство, сессия.

## Окружение Android / Appium / AI

```bash
pnpm run doctor
pnpm appium:doctor
```

Подробнее:

- [`setup-android-emulator.md`](setup-android-emulator.md) — SDK / AVD (старт AVD из приложения пока stub)
- [`setup-appium.md`](setup-appium.md)
- [`setup-arionhub.md`](setup-arionhub.md)
- [`troubleshooting.md`](troubleshooting.md)
