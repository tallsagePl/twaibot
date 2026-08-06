import { listAvds, resolveAndroidSdkPaths } from '../packages/android-environment/src/index';

async function main(): Promise<void> {
  const sdk = resolveAndroidSdkPaths();
  const avds = await listAvds();
  console.log(
    JSON.stringify(
      {
        ok: avds.length > 0,
        sdk: sdk.androidHome ?? null,
        emulator: sdk.emulator ?? null,
        avds,
        message:
          avds.length > 0
            ? `Найдено AVD: ${avds.length}`
            : 'AVD не найдены. Создайте устройство в Android Studio.',
      },
      null,
      2,
    ),
  );
  if (avds.length === 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
