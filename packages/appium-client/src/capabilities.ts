import {
  isBlueStacksUdid,
  resolveAppiumSessionDefaults,
  type CreateAppiumSessionInput,
} from '@twinby/contracts';

export interface TwinbyCapabilitiesInput {
  udid: string;
  deviceName?: string;
  appPackage?: string;
  appActivity?: string;
  noReset?: boolean;
  newCommandTimeout?: number;
  autoGrantPermissions?: boolean;
  disableWindowAnimation?: boolean;
}

/**
 * W3C / Appium 2+ capabilities.
 * BlueStacks (127.0.0.1:5555) + Twinby MainActivity are filled by defaults.
 */
export function buildAndroidCapabilities(
  input: TwinbyCapabilitiesInput,
): Record<string, unknown> {
  const resolved = resolveAppiumSessionDefaults(input);
  const caps: Record<string, unknown> = {
    platformName: 'Android',
    'appium:automationName': 'UiAutomator2',
    'appium:deviceName': resolved.deviceName,
    'appium:udid': resolved.udid,
    'appium:appPackage': resolved.appPackage,
    'appium:appActivity': resolved.appActivity,
    'appium:noReset': resolved.noReset,
    'appium:newCommandTimeout': resolved.newCommandTimeout,
    'appium:disableWindowAnimation': input.disableWindowAnimation ?? true,
  };

  if (isBlueStacksUdid(resolved.udid)) {
    // BlueStacks is a desktop Android runtime — skip some phone-only waits.
    caps['appium:skipDeviceInitialization'] = false;
    caps['appium:ignoreHiddenApiPolicyError'] = true;
    caps['appium:ensureWebviewsHavePages'] = true;
  }

  if (input.autoGrantPermissions != null) {
    caps['appium:autoGrantPermissions'] = input.autoGrantPermissions;
  }

  return caps;
}

export function toTwinbyCapabilitiesInput(
  input: CreateAppiumSessionInput,
): TwinbyCapabilitiesInput {
  return resolveAppiumSessionDefaults(input);
}
