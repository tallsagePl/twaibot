import { randomUUID } from 'node:crypto';

export type PhotoRole =
  | 'main-face'
  | 'full-body'
  | 'lifestyle'
  | 'social'
  | 'intellectual'
  | 'humor'
  | 'conversation-hook'
  | 'activity'
  | 'style'
  | 'emotional'
  | 'trust'
  | 'mystery'
  | 'other';

export interface ProfileStrategy {
  id: string;
  name: string;
  primaryTraits: string[];
  secondaryTraits: string[];
  suppressedTraits: string[];
  forbiddenSignals: string[];
  intendedFirstImpression: string[];
  intendedEmotionalTone: string[];
  intendedConversationHooks: string[];
  audienceModelVersion: number;
  identityModelVersion: number;
  userNotes?: string;
  createdAt: string;
}

export interface AuthenticityAssessment {
  identityPreservationScore: number;
  strategyAmplificationScore: number;
  directlySupportedSignalCount: number;
  amplifiedSignalCount: number;
  misleadingSignalCount: number;
  fabricatedSignalCount: number;
  blockingConflicts: string[];
  warnings: string[];
}

export interface MetricRange {
  low: number;
  median?: number;
  high: number;
}

export interface ExpectedPerformance {
  incomingLikesPerDay?: MetricRange;
  targetIncomingLikesPerDay?: MetricRange;
  matchesPerSession?: MetricRange;
  confidence: number;
  assumptions: string[];
}

export interface GeneratedProfileSet {
  id: string;
  name: string;
  strategy: ProfileStrategy;
  photoIds: string[];
  bio: string;
  photoRoles: Array<{
    photoId: string;
    role: PhotoRole;
    explanation: string;
  }>;
  strengths: string[];
  weaknesses: string[];
  killerFeatures: string[];
  risks: string[];
  authenticityAssessment: AuthenticityAssessment;
  expectedPerformance: ExpectedPerformance;
}

export interface ProfileSetConstraints {
  availablePhotoIds: string[];
  pinnedPhotoIds?: string[];
  forbiddenPhotoIds?: string[];
  maxPhotos?: number;
  city?: string;
  occupation?: string;
  realInterests?: string[];
  explicitNonIdentity?: string[];
  relationshipIntent?: string;
  toneHints?: string[];
  strategyNames?: [string, string, string];
}

export interface ProfileSetGenerationResult {
  sets: GeneratedProfileSet[];
  recommendedSetId: string;
  missingPhotos: string[];
  notes: string[];
}

export interface ProfileSetGenerator {
  generate(constraints: ProfileSetConstraints): Promise<ProfileSetGenerationResult>;
}

const DEFAULT_STRATEGY_NAMES: [string, string, string] = [
  'Спокойный и уверенный',
  'Интеллектуальный',
  'Ироничный и лёгкий',
];

const ROLE_ORDER: PhotoRole[] = [
  'main-face',
  'full-body',
  'lifestyle',
  'intellectual',
  'conversation-hook',
];

function nowIso(): string {
  return new Date().toISOString();
}

function pickPhotos(
  constraints: ProfileSetConstraints,
  setIndex: number,
): string[] {
  const forbidden = new Set(constraints.forbiddenPhotoIds ?? []);
  const pinned = (constraints.pinnedPhotoIds ?? []).filter((id) => !forbidden.has(id));
  const available = constraints.availablePhotoIds.filter((id) => !forbidden.has(id));
  const maxPhotos = Math.min(constraints.maxPhotos ?? 6, Math.max(1, available.length || pinned.length));

  const selected: string[] = [...pinned];
  const pool = available.filter((id) => !selected.includes(id));
  // Rotate starting offset so sets differ when enough photos exist
  const offset = setIndex % Math.max(1, pool.length);
  for (let i = 0; i < pool.length && selected.length < maxPhotos; i += 1) {
    const id = pool[(i + offset) % pool.length];
    if (id && !selected.includes(id)) selected.push(id);
  }
  return selected.slice(0, maxPhotos);
}

function buildBio(
  constraints: ProfileSetConstraints,
  strategyName: string,
  setIndex: number,
): string {
  const interests = (constraints.realInterests ?? []).slice(0, 3).join(', ');
  const city = constraints.city ? `${constraints.city}. ` : '';
  const job = constraints.occupation ? `${constraints.occupation}. ` : '';
  const intent = constraints.relationshipIntent
    ? `${constraints.relationshipIntent}. `
    : '';
  const tone = constraints.toneHints?.[setIndex] ?? strategyName;
  const interestLine = interests ? `Интересы: ${interests}. ` : '';
  return `${city}${job}${intent}${interestLine}${tone}.`.trim();
}

function buildStrategy(
  name: string,
  constraints: ProfileSetConstraints,
  index: number,
): ProfileStrategy {
  const traits = constraints.realInterests ?? [];
  return {
    id: `strategy-placeholder-${index + 1}`,
    name,
    primaryTraits: traits.slice(0, 2),
    secondaryTraits: traits.slice(2, 4),
    suppressedTraits: constraints.explicitNonIdentity ?? [],
    forbiddenSignals: constraints.explicitNonIdentity ?? [],
    intendedFirstImpression: [name],
    intendedEmotionalTone: constraints.toneHints ?? [name],
    intendedConversationHooks: traits.slice(0, 1),
    audienceModelVersion: 1,
    identityModelVersion: 1,
    createdAt: nowIso(),
  };
}

function placeholderAuthenticity(
  constraints: ProfileSetConstraints,
): AuthenticityAssessment {
  const supported = (constraints.realInterests ?? []).length;
  return {
    identityPreservationScore: supported > 0 ? 70 : 50,
    strategyAmplificationScore: 30,
    directlySupportedSignalCount: supported,
    amplifiedSignalCount: 0,
    misleadingSignalCount: 0,
    fabricatedSignalCount: 0,
    blockingConflicts: [],
    warnings: supported === 0 ? ['Мало подтверждённых интересов'] : [],
  };
}

/**
 * Pure placeholder generator: always returns exactly 3 differentiated sets.
 */
export class PlaceholderProfileSetGenerator implements ProfileSetGenerator {
  async generate(
    constraints: ProfileSetConstraints,
  ): Promise<ProfileSetGenerationResult> {
    return generateProfileSets(constraints);
  }
}

function shuffleNames(names: [string, string, string]): [string, string, string] {
  const copy = [...names] as [string, string, string];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = copy[i]!;
    copy[i] = copy[j]!;
    copy[j] = tmp;
  }
  return copy;
}

export function generateProfileSets(
  constraints: ProfileSetConstraints,
): ProfileSetGenerationResult {
  const baseNames = constraints.strategyNames ?? DEFAULT_STRATEGY_NAMES;
  // Fresh order each click so UI clearly changes on regenerate.
  const names = constraints.strategyNames ? baseNames : shuffleNames(baseNames);
  const missingPhotos: string[] = [];
  if (constraints.availablePhotoIds.length === 0) {
    missingPhotos.push('main-face', 'full-body', 'lifestyle');
  }
  const generatedAt = nowIso();
  const photoOffset = Math.floor(Math.random() * 6);

  const sets: GeneratedProfileSet[] = names.map((name, index) => {
    const photoIds = pickPhotos(constraints, index + photoOffset);
    const strategy = {
      ...buildStrategy(name, constraints, index),
      id: `strategy-${randomUUID()}`,
    };
    const bio = buildBio(constraints, name, index);
    const photoRoles = photoIds.map((photoId, i) => ({
      photoId,
      role: ROLE_ORDER[i] ?? ('other' as const),
      explanation: `Роль для набора «${name}»`,
    }));

    return {
      id: randomUUID(),
      name,
      strategy,
      photoIds,
      bio,
      photoRoles,
      strengths: [
        `Акцент: ${name}`,
        `Сгенерировано ${new Date(generatedAt).toLocaleTimeString('ru-RU')}`,
      ],
      weaknesses:
        photoIds.length < 3
          ? ['Мало фото для полного набора']
          : ['Черновик набора — уточните фото и формулировки'],
      killerFeatures: strategy.primaryTraits.slice(0, 1),
      risks: (constraints.explicitNonIdentity ?? []).map(
        (x) => `Не изображать: ${x}`,
      ),
      authenticityAssessment: placeholderAuthenticity(constraints),
      expectedPerformance: {
        confidence: 0.2,
        assumptions: ['Expected performance — черновик'],
        incomingLikesPerDay: { low: 1, high: 4 },
      },
    };
  });

  return {
    sets,
    recommendedSetId: sets[0]!.id,
    missingPhotos,
    notes: [
      'Сгенерированы 3 набора из Identity/constraints',
      missingPhotos.length > 0
        ? 'Недостаточно фото — добавьте материалы перед деплоем'
        : 'Фото распределены с ротацией между наборами',
    ],
  };
}
