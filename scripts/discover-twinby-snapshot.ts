import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ManagedAppiumClient } from '../packages/appium-client/src/index';
import { listDevices } from '../packages/android-environment/src/index';
import { ensureAppDirectories, resolveAppPaths } from '@twinby/config';

async function main(): Promise<void> {
  const paths = resolveAppPaths();
  ensureAppDirectories(paths);
  const outDir = join(paths.data, 'discovery');
  mkdirSync(outDir, { recursive: true });

  const devices = await listDevices();
  const device = devices.find((d) => d.state === 'device');
  if (!device) {
    throw new Error('Нет device в adb');
  }

  const client = new ManagedAppiumClient({
    logsDir: paths.logs,
    temporaryDir: paths.temporary,
  });
  await client.startServer();
  await client.createSession({
    udid: device.udid,
    appPackage: 'com.twinby',
    noReset: true,
    deviceName: 'device',
  });

  // Bring Twinby to front without resetting
  try {
    await client.activateApp('com.twinby');
  } catch {
    /* already open */
  }

  await new Promise((r) => setTimeout(r, 1500));

  const shot = await client.takeScreenshot();
  const source = await client.getPageSource();
  const rect = await client.getWindowRect();

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const shotPath = join(outDir, `twinby-${stamp}.png`);
  const xmlPath = join(outDir, `twinby-${stamp}.xml`);
  const metaPath = join(outDir, `twinby-${stamp}.json`);

  writeFileSync(shotPath, Buffer.from(shot.base64, 'base64'));
  writeFileSync(xmlPath, source.source, 'utf8');
  writeFileSync(
    metaPath,
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        udid: device.udid,
        package: 'com.twinby',
        windowRect: rect,
        screenshotPath: shotPath,
        pageSourcePath: xmlPath,
        sourceLength: source.source.length,
      },
      null,
      2,
    ),
    'utf8',
  );

  console.log(JSON.stringify({ ok: true, shotPath, xmlPath, metaPath, rect }, null, 2));
  await client.endSession();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : String(err));
  process.exitCode = 1;
});
