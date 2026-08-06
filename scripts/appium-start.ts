import { ManagedAppiumClient } from '../packages/appium-client/src/index';
import { ensureAppDirectories, resolveAppPaths } from '@twinby/config';
import { listDevices } from '../packages/android-environment/src/index';

async function main(): Promise<void> {
  const keepAlive = process.argv.includes('--keep-alive');
  const paths = resolveAppPaths();
  ensureAppDirectories(paths);

  const client = new ManagedAppiumClient({
    logsDir: paths.logs,
    temporaryDir: paths.temporary,
  });

  const status = await client.startServer();
  const devices = await listDevices();

  console.log(
    JSON.stringify(
      {
        stage: 7,
        server: status,
        devices,
        hint: keepAlive
          ? 'Сервер оставлен запущенным (Ctrl+C чтобы выйти из скрипта; стоп — только если owned)'
          : 'Сервер запущен. Для Inspector: http://127.0.0.1:4723. Флаг --keep-alive держит процесс.',
        inspectorDoc: 'docs/locator-discovery.md',
      },
      null,
      2,
    ),
  );

  if (!status.ready) {
    process.exitCode = 1;
    return;
  }

  if (keepAlive) {
    console.error('Appium keep-alive… Ctrl+C для выхода');
    await new Promise(() => {
      /* wait until killed */
    });
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
