import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { APP_VERSION } from '@twinby/contracts';

export const APP_NAME = 'Orpheus & Eurydice';
/** Short brand mark for UI chrome. */
export const APP_BRAND_MARK = 'E&O';
/** Keep legacy slug so existing local data/paths keep working. */
export const APP_NAME_SLUG = 'twinby-ai-swiper';

export interface AppPaths {
  root: string;
  data: string;
  references: string;
  temporary: string;
  history: string;
  logs: string;
  database: string;
}

/**
 * Resolve data directories.
 * In development uses repo `data/`; in packaged app uses userData when provided.
 */
export function resolveAppPaths(options?: {
  projectRoot?: string;
  userDataPath?: string;
  useUserData?: boolean;
}): AppPaths {
  const projectRoot =
    options?.projectRoot ??
    resolve(process.cwd().includes('apps') ? join(process.cwd(), '../..') : process.cwd());

  const useUserData = options?.useUserData === true && Boolean(options.userDataPath);
  const dataRoot = useUserData
    ? (options.userDataPath as string)
    : join(projectRoot, 'data');

  const paths: AppPaths = {
    root: useUserData ? (options.userDataPath as string) : projectRoot,
    data: dataRoot,
    references: join(dataRoot, 'references'),
    temporary: join(dataRoot, 'temporary'),
    history: join(dataRoot, 'history'),
    logs: join(dataRoot, 'logs'),
    database: join(dataRoot, 'application.sqlite'),
  };

  return paths;
}

export function ensureAppDirectories(paths: AppPaths): void {
  for (const dir of [
    paths.data,
    paths.references,
    paths.temporary,
    paths.history,
    paths.logs,
  ]) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }
}

export function getDefaultUserDataHint(): string {
  return join(homedir(), 'AppData', 'Roaming', APP_NAME_SLUG);
}

export function getAppMeta() {
  return {
    name: APP_NAME,
    brandMark: APP_BRAND_MARK,
    version: APP_VERSION,
  };
}
