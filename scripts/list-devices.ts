import { listDevices, resolveAndroidSdkPaths } from '../packages/android-environment/src/index';

async function main(): Promise<void> {
  const sdk = resolveAndroidSdkPaths();
  const devices = await listDevices();
  console.log(
    JSON.stringify(
      {
        ok: true,
        adb: sdk.adb ?? null,
        devices,
        message:
          devices.length > 0
            ? `Найдено устройств: ${devices.length}`
            : 'Нет устройств в adb. Запуск эмулятора — этап 6.',
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
