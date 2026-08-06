import type { AndroidDevice, AndroidVirtualDevice } from './types';

export function parseAdbDevices(output: string): AndroidDevice[] {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const devices: AndroidDevice[] = [];
  for (const line of lines) {
    if (line.startsWith('List of devices')) {
      continue;
    }
    const [udid, stateRaw] = line.split(/\s+/);
    if (!udid || !stateRaw) {
      continue;
    }
    const state =
      stateRaw === 'device' ||
      stateRaw === 'offline' ||
      stateRaw === 'unauthorized'
        ? stateRaw
        : 'unknown';
    const isEmulator =
      udid.startsWith('emulator-') ||
      udid.toLowerCase().includes('emulator') ||
      /^127\.0\.0\.1:\d+$/i.test(udid) ||
      /^localhost:\d+$/i.test(udid);
    devices.push({ udid, state, isEmulator });
  }
  return devices;
}

export function parseAvdList(output: string): AndroidVirtualDevice[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((name) => ({ name }));
}

export function parseNodeVersion(output: string): string | null {
  const match = output.match(/v?(\d+\.\d+\.\d+)/);
  return match?.[1] ?? null;
}

export function parseJavaVersion(output: string): string | null {
  const match =
    output.match(/version\s+"([^"]+)"/i) ??
    output.match(/openjdk\s+(\d+(?:\.\d+)*)/i);
  return match?.[1] ?? null;
}

export function hasInstalledDriver(
  driverListOutput: string,
  driverName: string,
): boolean {
  const lower = driverListOutput.toLowerCase();
  const name = driverName.toLowerCase();
  if (!lower.includes(name)) {
    return false;
  }
  // Prefer JSON parse when available
  try {
    const parsed = JSON.parse(driverListOutput) as Record<
      string,
      { installed?: boolean } | boolean
    >;
    const entry = parsed[driverName] ?? parsed[name];
    if (typeof entry === 'boolean') {
      return entry;
    }
    if (entry && typeof entry === 'object' && 'installed' in entry) {
      return Boolean(entry.installed);
    }
  } catch {
    // plain text fallback
  }
  return (
    lower.includes(`${name}`) &&
    (lower.includes('installed') || lower.includes('[installed'))
  );
}
