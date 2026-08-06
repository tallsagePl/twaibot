import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function resolveAdbPath(env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = env.ANDROID_HOME || env.ANDROID_SDK_ROOT;
  const candidates = [
    fromEnv ? join(fromEnv, 'platform-tools', 'adb.exe') : undefined,
    fromEnv ? join(fromEnv, 'platform-tools', 'adb') : undefined,
    join(homedir(), 'AppData', 'Local', 'Android', 'Sdk', 'platform-tools', 'adb.exe'),
    join(homedir(), 'AppData', 'Local', 'Android', 'Sdk', 'platform-tools', 'adb'),
  ];
  for (const c of candidates) {
    if (c && existsSync(c)) {
      return c;
    }
  }
  return 'adb';
}

/**
 * Fast path for BlueStacks/emulator: adb screencap bypasses Appium HTTP (~often 2–5×).
 */
export async function adbScreencapPng(
  udid: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<Buffer> {
  const adb = resolveAdbPath(env);
  const { stdout } = await execFileAsync(
    adb,
    ['-s', udid, 'exec-out', 'screencap', '-p'],
    {
      encoding: 'buffer',
      maxBuffer: 25 * 1024 * 1024,
      windowsHide: true,
      timeout: 8_000,
    },
  );
  const buf = Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout);
  if (buf.length < 100 || buf[0] !== 0x89 || buf[1] !== 0x50) {
    throw new Error(`adb screencap вернул не PNG (${buf.length} bytes)`);
  }
  return buf;
}

/** Fast tap via adb — skips Appium mobile: clickGesture round-trip. */
export async function adbTap(
  udid: string,
  x: number,
  y: number,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const adb = resolveAdbPath(env);
  await execFileAsync(
    adb,
    ['-s', udid, 'shell', 'input', 'tap', String(Math.round(x)), String(Math.round(y))],
    {
      windowsHide: true,
      timeout: 4_000,
    },
  );
}

export function isAdbFastUdid(udid: string): boolean {
  return (
    /^127\.0\.0\.1:\d+$/i.test(udid) ||
    /^localhost:\d+$/i.test(udid) ||
    udid.startsWith('emulator-')
  );
}
