# Android Emulator (Windows)

Нужен для live-сессий на эмуляторе (doctor, Appium, Twinby). Старт AVD из UI приложения пока stub — запускайте AVD вручную или через Android Studio.

## Установка

1. Установите [Android Studio](https://developer.android.com/studio).
2. SDK Manager → SDK Platforms: API с Google Play (рекомендуется актуальный стабильный).
3. SDK Tools: Android SDK Platform-Tools, Android Emulator, Android SDK Command-line Tools.
4. Device Manager → Create Device → Pixel-профиль + system image с Google Play.

## Переменные

```bat
setx ANDROID_HOME "%LOCALAPPDATA%\Android\Sdk"
setx ANDROID_SDK_ROOT "%LOCALAPPDATA%\Android\Sdk"
```

Добавьте в PATH:

- `%ANDROID_HOME%\platform-tools`
- `%ANDROID_HOME%\emulator`

Откройте новый терминал после `setx`.

## Проверка

```bash
pnpm doctor
pnpm android:list-avds
pnpm android:list-devices
```

Запуск AVD из приложения — этап 6. Не используйте `-wipe-data` без подтверждения.

## Twinby

Установите Twinby из Play Store на эмулятор вручную. Вход и верификация — вручную.
