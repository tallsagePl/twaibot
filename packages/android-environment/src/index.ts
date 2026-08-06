import {
  listAvds as listAvdsImpl,
  listDevices as listDevicesImpl,
  runAppiumDoctorSubset,
  runEnvironmentDoctor,
} from './doctor';
import type {
  AndroidDevice,
  AndroidEnvironmentManager,
  AndroidVirtualDevice,
  EnvironmentReport,
} from './types';

export type {
  AndroidDevice,
  AndroidEnvironmentManager,
  AndroidVirtualDevice,
  EnvironmentItemStatus,
  EnvironmentReport,
  EnvironmentReportItem,
} from './types';

export {
  listAvds,
  listDevices,
  runAppiumDoctorSubset,
  runEnvironmentDoctor,
} from './doctor';
export { resolveAndroidSdkPaths, resolveJavaBinary } from './paths';
export {
  hasInstalledDriver,
  parseAdbDevices,
  parseAvdList,
  parseJavaVersion,
  parseNodeVersion,
} from './parse';

export class AndroidEnvironment implements AndroidEnvironmentManager {
  async runDoctor(): Promise<EnvironmentReport> {
    return runEnvironmentDoctor();
  }

  async listAvds(): Promise<AndroidVirtualDevice[]> {
    return listAvdsImpl();
  }

  async startAvd(_avdName: string): Promise<void> {
    throw new Error('AndroidEnvironment.startAvd будет на этапе 6');
  }

  async stopAvd(): Promise<void> {
    throw new Error('AndroidEnvironment.stopAvd будет на этапе 6');
  }

  async listDevices(): Promise<AndroidDevice[]> {
    return listDevicesImpl();
  }
}

/** @deprecated use AndroidEnvironment */
export class NotImplementedAndroidEnvironment extends AndroidEnvironment {
  override async runDoctor(): Promise<EnvironmentReport> {
    return runEnvironmentDoctor();
  }
}
