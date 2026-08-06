import { describe, expect, it } from 'vitest';
import {
  hasInstalledDriver,
  parseAdbDevices,
  parseAvdList,
  parseJavaVersion,
  parseNodeVersion,
} from './parse';

describe('parseAdbDevices', () => {
  it('parses device list', () => {
    const devices = parseAdbDevices(`List of devices attached
emulator-5554\tdevice
ABC123\toffline
`);
    expect(devices).toEqual([
      { udid: 'emulator-5554', state: 'device', isEmulator: true },
      { udid: 'ABC123', state: 'offline', isEmulator: false },
    ]);
  });
});

describe('parseAvdList', () => {
  it('parses names', () => {
    expect(parseAvdList('Pixel_7\nPixel_Tablet\n')).toEqual([
      { name: 'Pixel_7' },
      { name: 'Pixel_Tablet' },
    ]);
  });
});

describe('versions', () => {
  it('parses node and java', () => {
    expect(parseNodeVersion('v22.19.0')).toBe('22.19.0');
    expect(parseJavaVersion('openjdk version "17.0.12" 2024-07-16')).toBe('17.0.12');
  });
});

describe('hasInstalledDriver', () => {
  it('reads json', () => {
    expect(
      hasInstalledDriver(
        JSON.stringify({ uiautomator2: { installed: true } }),
        'uiautomator2',
      ),
    ).toBe(true);
  });

  it('reads text', () => {
    expect(hasInstalledDriver('- uiautomator2@3.0.0 [installed]', 'uiautomator2')).toBe(
      true,
    );
  });
});
