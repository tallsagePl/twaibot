import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface MockProfileFixture {
  id: string;
  age: number;
  distanceKm: number;
  bio: string;
  interests: string[];
  goal: string;
  compatibilityPercent: number;
  photoPaths: string[];
  directory: string;
}

function resolveProfilesRoot(): string {
  // dist/index.js → ../profiles
  const candidates = [
    join(__dirname, '..', 'profiles'),
    join(process.cwd(), 'packages', 'test-fixtures', 'profiles'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return candidates[0]!;
}

export function getFixturesRoot(): string {
  return resolveProfilesRoot();
}

export function listMockProfiles(root = resolveProfilesRoot()): MockProfileFixture[] {
  if (!existsSync(root)) {
    return [];
  }

  const dirs = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('profile-'))
    .map((entry) => entry.name)
    .sort();

  const profiles: MockProfileFixture[] = [];
  for (const dirName of dirs) {
    const directory = join(root, dirName);
    const dataPath = join(directory, 'data.json');
    if (!existsSync(dataPath)) {
      continue;
    }
    const raw = JSON.parse(readFileSync(dataPath, 'utf8')) as {
      id: string;
      age: number;
      distanceKm: number;
      bio?: string;
      interests?: string[];
      goal?: string;
      compatibilityPercent?: number;
    };

    const photoPaths = readdirSync(directory)
      .filter((name) => /\.(jpe?g|png|webp)$/i.test(name))
      .sort()
      .map((name) => join(directory, name));

    profiles.push({
      id: raw.id ?? dirName,
      age: raw.age,
      distanceKm: raw.distanceKm,
      bio: raw.bio ?? '',
      interests: raw.interests ?? [],
      goal: raw.goal ?? '',
      compatibilityPercent: raw.compatibilityPercent ?? 0,
      photoPaths,
      directory,
    });
  }

  return profiles;
}
