import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

async function adb(args: string[]): Promise<string> {
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  const bin = sdk
    ? join(sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb')
    : 'adb';
  const { stdout } = await execFileAsync(bin, args, {
    encoding: 'utf8',
    windowsHide: true,
    shell: !sdk,
  });
  return String(stdout ?? '').trim();
}

async function main(): Promise<void> {
  const pathOut = await adb(['shell', 'pm', 'path', 'com.twinby']).catch(() => '');
  const installed = pathOut.includes('package:');
  if (!installed) {
    console.log(
      JSON.stringify(
        {
          ok: false,
          package: null,
          message: 'com.twinby не найден. Установите Twinby и подключите устройство.',
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
    return;
  }

  const dump = await adb(['shell', 'dumpsys', 'package', 'com.twinby']);
  const versionName = dump.match(/versionName=([^\s]+)/)?.[1];
  const versionCode = dump.match(/versionCode=(\d+)/)?.[1];

  console.log(
    JSON.stringify(
      {
        ok: true,
        package: 'com.twinby',
        versionName,
        versionCode,
        path: pathOut,
        locatorProfileHint: 'packages/twinby-adapter/profiles/com.twinby-2.3.0-720x1280.json',
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
