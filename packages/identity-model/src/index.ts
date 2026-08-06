export type EvidenceStatus =
  | 'observed'
  | 'claimed'
  | 'inferred'
  | 'validated';

export type EvidenceLikelihood = 'unlikely' | 'possible' | 'probable';

export interface IdentitySignal {
  id: string;
  key: string;
  statement: string;
  status: EvidenceStatus;
  likelihood: EvidenceLikelihood;
  confidence: number;
  evidence: string[];
  createdAt: string;
}

export interface IdentityResource {
  id: string;
  kind: string;
  description: string;
  available: boolean;
}

export interface IdentityConstraint {
  id: string;
  rule: string;
  severity: 'warning' | 'blocking';
}

export interface AuthenticityRule {
  id: string;
  description: string;
  blocking: boolean;
}

export interface IdentityModel {
  id: string;
  version: number;
  age?: number;
  city?: string;
  occupation?: string;
  professionalArea?: string;
  currentSelf: IdentitySignal[];
  amplifiableTraits: IdentitySignal[];
  desiredPresentation: IdentitySignal[];
  explicitNonIdentity: IdentitySignal[];
  realInterests: IdentitySignal[];
  lifestyle: IdentitySignal[];
  relationshipIntent?: string;
  resources: IdentityResource[];
  constraints: IdentityConstraint[];
  authenticityRules: AuthenticityRule[];
  positiveReferenceIds: string[];
  negativeReferenceIds: string[];
  aiSummary: string;
  userConfirmedAt?: string;
  createdAt: string;
  supersededAt?: string;
}

export interface IdentityModelDraft {
  age?: number;
  city?: string;
  occupation?: string;
  professionalArea?: string;
  currentSelf?: IdentitySignal[];
  amplifiableTraits?: IdentitySignal[];
  desiredPresentation?: IdentitySignal[];
  explicitNonIdentity?: IdentitySignal[];
  realInterests?: IdentitySignal[];
  lifestyle?: IdentitySignal[];
  relationshipIntent?: string;
  resources?: IdentityResource[];
  constraints?: IdentityConstraint[];
  authenticityRules?: AuthenticityRule[];
  positiveReferenceIds?: string[];
  negativeReferenceIds?: string[];
  aiSummary?: string;
}

export interface IdentityConflict {
  id: string;
  profileVariantId?: string;
  signal: string;
  conflictingIdentityRuleId: string;
  severity: 'warning' | 'blocking';
  explanation: string;
}

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

export interface ProposedProfileSet {
  id?: string;
  photoIds?: string[];
  bio?: string;
  positioningSignals?: string[];
  claimedTraits?: string[];
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

export interface IdentityModelRepository {
  getCurrent(): Promise<IdentityModel | null>;
  saveDraft(draft: IdentityModelDraft): Promise<IdentityModel>;
  confirmVersion(id: string): Promise<IdentityModel>;
}

export interface IdentityConflictDetector {
  detect(
    identity: IdentityModel,
    strategy: ProfileStrategy,
    profile: ProposedProfileSet,
  ): Promise<IdentityConflict[]>;
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalize(text: string): string {
  return text.trim().toLowerCase();
}

function collectProfileText(profile: ProposedProfileSet, strategy: ProfileStrategy): string {
  return [
    profile.bio ?? '',
    ...(profile.positioningSignals ?? []),
    ...(profile.claimedTraits ?? []),
    ...strategy.primaryTraits,
    ...strategy.secondaryTraits,
    ...strategy.intendedFirstImpression,
  ]
    .join(' ')
    .toLowerCase();
}

export function detectIdentityConflicts(
  identity: IdentityModel,
  strategy: ProfileStrategy,
  profile: ProposedProfileSet,
): IdentityConflict[] {
  const haystack = collectProfileText(profile, strategy);
  const conflicts: IdentityConflict[] = [];
  let n = 0;

  for (const non of identity.explicitNonIdentity) {
    const needle = normalize(non.key || non.statement);
    if (!needle) continue;
    if (haystack.includes(needle)) {
      n += 1;
      conflicts.push({
        id: `conflict-non-${n}`,
        signal: non.statement || non.key,
        conflictingIdentityRuleId: non.id,
        severity: 'blocking',
        explanation: `Профиль нарушает explicitNonIdentity: «${non.statement || non.key}»`,
      });
    }
  }

  for (const constraint of identity.constraints) {
    const needle = normalize(constraint.rule);
    if (!needle) continue;
    if (haystack.includes(needle)) {
      n += 1;
      conflicts.push({
        id: `conflict-constraint-${n}`,
        signal: constraint.rule,
        conflictingIdentityRuleId: constraint.id,
        severity: constraint.severity,
        explanation: `Конфликт с ограничением identity: «${constraint.rule}»`,
      });
    }
  }

  for (const forbidden of strategy.forbiddenSignals) {
    const needle = normalize(forbidden);
    if (!needle) continue;
    if (haystack.includes(needle)) {
      n += 1;
      conflicts.push({
        id: `conflict-forbidden-${n}`,
        signal: forbidden,
        conflictingIdentityRuleId: strategy.id,
        severity: 'blocking',
        explanation: `Стратегия запрещает сигнал «${forbidden}», но он присутствует в профиле`,
      });
    }
  }

  for (const rule of identity.authenticityRules) {
    const needle = normalize(rule.description);
    if (!needle) continue;
    if (haystack.includes(needle) && rule.blocking) {
      n += 1;
      conflicts.push({
        id: `conflict-auth-${n}`,
        signal: rule.description,
        conflictingIdentityRuleId: rule.id,
        severity: 'blocking',
        explanation: `Нарушено authenticity rule: «${rule.description}»`,
      });
    }
  }

  return conflicts;
}

export function assessAuthenticity(
  identity: IdentityModel,
  strategy: ProfileStrategy,
  profile: ProposedProfileSet,
): AuthenticityAssessment {
  const conflicts = detectIdentityConflicts(identity, strategy, profile);
  const supportedKeys = new Set(
    [...identity.currentSelf, ...identity.realInterests, ...identity.lifestyle]
      .map((s) => normalize(s.key || s.statement))
      .filter(Boolean),
  );
  const claimed = [
    ...(profile.claimedTraits ?? []),
    ...strategy.primaryTraits,
    ...strategy.secondaryTraits,
  ].map(normalize).filter(Boolean);

  let directlySupported = 0;
  let amplified = 0;
  let fabricated = 0;
  for (const trait of claimed) {
    if (supportedKeys.has(trait) || [...supportedKeys].some((k) => trait.includes(k) || k.includes(trait))) {
      directlySupported += 1;
    } else if (
      identity.amplifiableTraits.some((a) => {
        const key = normalize(a.key || a.statement);
        return key && (trait.includes(key) || key.includes(trait));
      })
    ) {
      amplified += 1;
    } else {
      fabricated += 1;
    }
  }

  const total = Math.max(1, claimed.length);
  const blocking = conflicts.filter((c) => c.severity === 'blocking').map((c) => c.explanation);
  const warnings = conflicts.filter((c) => c.severity === 'warning').map((c) => c.explanation);

  return {
    identityPreservationScore: Math.round((directlySupported / total) * 100),
    strategyAmplificationScore: Math.round((amplified / total) * 100),
    directlySupportedSignalCount: directlySupported,
    amplifiedSignalCount: amplified,
    misleadingSignalCount: 0,
    fabricatedSignalCount: fabricated,
    blockingConflicts: blocking,
    warnings,
  };
}

export class InMemoryIdentityModelRepository implements IdentityModelRepository {
  private current: IdentityModel | null;
  private byId = new Map<string, IdentityModel>();

  constructor(seed?: IdentityModel | null) {
    this.current = seed ?? null;
    if (seed) this.byId.set(seed.id, seed);
  }

  async getCurrent(): Promise<IdentityModel | null> {
    return this.current;
  }

  async saveDraft(draft: IdentityModelDraft): Promise<IdentityModel> {
    const version = (this.current?.version ?? 0) + 1;
    const model: IdentityModel = {
      id: `identity-draft-${version}`,
      version,
      age: draft.age ?? this.current?.age,
      city: draft.city ?? this.current?.city,
      occupation: draft.occupation ?? this.current?.occupation,
      professionalArea: draft.professionalArea ?? this.current?.professionalArea,
      currentSelf: draft.currentSelf ?? this.current?.currentSelf ?? [],
      amplifiableTraits:
        draft.amplifiableTraits ?? this.current?.amplifiableTraits ?? [],
      desiredPresentation:
        draft.desiredPresentation ?? this.current?.desiredPresentation ?? [],
      explicitNonIdentity:
        draft.explicitNonIdentity ?? this.current?.explicitNonIdentity ?? [],
      realInterests: draft.realInterests ?? this.current?.realInterests ?? [],
      lifestyle: draft.lifestyle ?? this.current?.lifestyle ?? [],
      relationshipIntent:
        draft.relationshipIntent ?? this.current?.relationshipIntent,
      resources: draft.resources ?? this.current?.resources ?? [],
      constraints: draft.constraints ?? this.current?.constraints ?? [],
      authenticityRules:
        draft.authenticityRules ?? this.current?.authenticityRules ?? [],
      positiveReferenceIds:
        draft.positiveReferenceIds ?? this.current?.positiveReferenceIds ?? [],
      negativeReferenceIds:
        draft.negativeReferenceIds ?? this.current?.negativeReferenceIds ?? [],
      aiSummary: draft.aiSummary ?? this.current?.aiSummary ?? '',
      createdAt: nowIso(),
    };
    this.byId.set(model.id, model);
    this.current = model;
    return model;
  }

  async confirmVersion(id: string): Promise<IdentityModel> {
    const model = this.byId.get(id);
    if (!model) {
      throw new Error(`Identity model ${id} not found`);
    }
    this.current = {
      ...model,
      userConfirmedAt: nowIso(),
    };
    this.byId.set(id, this.current);
    return this.current;
  }
}

export class DefaultIdentityConflictDetector implements IdentityConflictDetector {
  async detect(
    identity: IdentityModel,
    strategy: ProfileStrategy,
    profile: ProposedProfileSet,
  ): Promise<IdentityConflict[]> {
    return detectIdentityConflicts(identity, strategy, profile);
  }
}
