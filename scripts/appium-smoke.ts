import { ManagedAppiumClient } from '../packages/appium-client/src/index';
import { ensureAppDirectories, resolveAppPaths } from '@twinby/config';

async function main(): Promise<void> {
  const paths = resolveAppPaths();
  ensureAppDirectories(paths);
  const client = new ManagedAppiumClient({
    logsDir: paths.logs,
    temporaryDir: paths.temporary,
  });

  const status = await client.startServer();
  console.log('server', { ready: status.ready, version: status.version, owned: status.owned });

  const session = await client.createSession({ udid: 'emulator-5554' });
  console.log('session', session.sessionId);

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
