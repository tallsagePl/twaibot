import { ManagedAppiumClient } from '../packages/appium-client/src/index';
import { ensureAppDirectories, resolveAppPaths } from '@twinby/config';
import { listDevices } from '../packages/android-environment/src/index';

async function main(): Promise<void> {
  const paths = resolveAppPaths();
  ensureAppDirectories(paths);
  const devices = await listDevices();
  const online = devices.find((d) => d.state === 'device' && !d.isEmulator) ?? devices.find((d) => d.state === 'device');
  if (!online) {
    throw new Error('Нет online-устройства в adb');
  }

  const client = new ManagedAppiumClient({
    logsDir: paths.logs,
    temporaryDir: paths.temporary,
  });

  const status = await client.startServer();
  console.log('server', { ready: status.ready, version: status.version, owned: status.owned });

  const session = await client.createSession({
    udid: online.udid,
    deviceName: 'FiiO M11S',
    noReset: true,
  });
  console.log('session', session.sessionId, 'udid', session.udid);

  const shot = await client.takeScreenshot();
  console.log('screenshotBytes', Buffer.from(shot.base64, 'base64').length);

  const source = await client.getPageSource();
  console.log('sourceLength', source.source.length, 'saved', source.savedPath);

  const rect = await client.getWindowRect();
  console.log('windowRect', rect);

  await client.endSession();
  console.log('ok');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : String(err));
  process.exitCode = 1;
});
