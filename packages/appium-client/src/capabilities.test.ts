import { describe, expect, it } from 'vitest';
import { buildAndroidCapabilities } from './capabilities';

describe('buildAndroidCapabilities', () => {
  it('defaults Twinby package/activity on generic emulator', () => {
    const caps = buildAndroidCapabilities({ udid: 'emulator-5554' });
    expect(caps.platformName).toBe('Android');
    expect(caps['appium:automationName']).toBe('UiAutomator2');
    expect(caps['appium:udid']).toBe('emulator-5554');
    expect(caps['appium:deviceName']).toBe('Android Emulator');
    expect(caps['appium:appPackage']).toBe('com.twinby');
    expect(caps['appium:appActivity']).toBe('com.twinby/.MainActivity');
    expect(caps['appium:noReset']).toBe(true);
    expect(caps['appium:newCommandTimeout']).toBe(300);
  });

  it('uses BlueStacks deviceName for 127.0.0.1 udid', () => {
    const caps = buildAndroidCapabilities({ udid: '127.0.0.1:5555' });
    expect(caps['appium:deviceName']).toBe('BlueStacks');
    expect(caps['appium:udid']).toBe('127.0.0.1:5555');
    expect(caps['appium:appPackage']).toBe('com.twinby');
    expect(caps['appium:appActivity']).toBe('com.twinby/.MainActivity');
  });

  it('includes optional package when provided', () => {
    const caps = buildAndroidCapabilities({
      udid: 'emulator-5554',
      appPackage: 'com.example.app',
      appActivity: '.Main',
    });
    expect(caps['appium:appPackage']).toBe('com.example.app');
    expect(caps['appium:appActivity']).toBe('.Main');
  });
});
