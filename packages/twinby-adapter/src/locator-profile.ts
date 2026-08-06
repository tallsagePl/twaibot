import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { LocatorProfileSchema, type LocatorProfile } from '@twinby/contracts';

const DEFAULT_PROFILE_FILE = 'com.twinby-2.3.0-1080x1920.json';

function profileDirCandidates(): string[] {
  const cwd = process.cwd();
  return [
    // Package dist: .../twinby-adapter/dist → ../profiles
    join(__dirname, '..', 'profiles'),
    // Monorepo / electron cwd variants
    join(cwd, 'packages', 'twinby-adapter', 'profiles'),
    join(cwd, '..', 'packages', 'twinby-adapter', 'profiles'),
    join(cwd, '..', '..', 'packages', 'twinby-adapter', 'profiles'),
    // Bundled main: apps/desktop/out/main → repo packages
    join(__dirname, '..', '..', '..', '..', 'packages', 'twinby-adapter', 'profiles'),
    join(__dirname, '..', '..', '..', 'packages', 'twinby-adapter', 'profiles'),
  ];
}

function profilesDir(): string {
  for (const candidate of profileDirCandidates()) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return profileDirCandidates()[0]!;
}

function loadProfileFile(filePath: string): LocatorProfile | null {
  try {
    if (!existsSync(filePath)) {
      return null;
    }
    return LocatorProfileSchema.parse(JSON.parse(readFileSync(filePath, 'utf8')));
  } catch {
    return null;
  }
}

export function listLocatorProfiles(): LocatorProfile[] {
  const dir = profilesDir();
  if (!existsSync(dir)) {
    const fallback = getDefaultLocatorProfile();
    return fallback ? [fallback] : [];
  }
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => {
      const raw = JSON.parse(readFileSync(join(dir, name), 'utf8'));
      return LocatorProfileSchema.parse(raw);
    });
}

export function getDefaultLocatorProfile(): LocatorProfile | null {
  for (const dir of profileDirCandidates()) {
    const profile = loadProfileFile(join(dir, DEFAULT_PROFILE_FILE));
    if (profile) {
      return profile;
    }
    // any json in dir
    if (existsSync(dir)) {
      const first = readdirSync(dir).find((n) => n.endsWith('.json'));
      if (first) {
        const profile = loadProfileFile(join(dir, first));
        if (profile) {
          return profile;
        }
      }
    }
  }
  return null;
}

export function findLocatorProfile(input: {
  appVersion?: string;
  screenWidth?: number;
  screenHeight?: number;
}): LocatorProfile | null {
  const profiles = listLocatorProfiles();
  if (profiles.length === 0) {
    return getDefaultLocatorProfile();
  }

  const scored = profiles.map((profile) => {
    let score = 0;
    if (input.appVersion && profile.appVersion === input.appVersion) {
      score += 3;
    }
    if (input.screenWidth && profile.screenWidth === input.screenWidth) {
      score += 1;
    }
    if (input.screenHeight && profile.screenHeight === input.screenHeight) {
      score += 1;
    }
    return { profile, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.profile ?? getDefaultLocatorProfile();
}

export function profilesDirectory(): string {
  return profilesDir();
}
