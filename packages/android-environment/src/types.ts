export type EnvironmentItemStatus = 'ok' | 'warning' | 'error' | 'unknown';

export interface EnvironmentReportItem {
  id: string;
  label: string;
  status: EnvironmentItemStatus;
  detail: string;
  fixCommand?: string;
  path?: string;
  version?: string;
}

export interface EnvironmentReport {
  ok: boolean;
  checkedAt: string;
  items: EnvironmentReportItem[];
}

export interface AndroidVirtualDevice {
  name: string;
  path?: string;
}

export interface AndroidDevice {
  udid: string;
  state: 'device' | 'offline' | 'unauthorized' | 'unknown';
  isEmulator: boolean;
}

export interface AndroidEnvironmentManager {
  runDoctor(): Promise<EnvironmentReport>;
  listAvds(): Promise<AndroidVirtualDevice[]>;
  startAvd(avdName: string): Promise<void>;
  stopAvd(): Promise<void>;
  listDevices(): Promise<AndroidDevice[]>;
}
