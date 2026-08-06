export type EvidenceStatus =
  | 'observed'
  | 'claimed'
  | 'inferred'
  | 'validated';

export type EvidenceLikelihood = 'unlikely' | 'possible' | 'probable';

export type AudienceSignalPolarity =
  | 'positive'
  | 'negative'
  | 'hard-reject'
  | 'tolerated';

export type AudienceFitLabel =
  | 'core'
  | 'acceptable'
  | 'borderline'
  | 'outside';

export type AudienceCorrectionReason =
  | 'appearance-misread'
  | 'combination-missed'
  | 'text-overweighted'
  | 'negative-signal-missed'
  | 'positive-signal-missed'
  | 'other';

export interface AudienceSignal {
  id: string;
  key: string;
  statement: string;
  polarity: AudienceSignalPolarity;
  status: EvidenceStatus;
  likelihood: EvidenceLikelihood;
  confidence: number;
  evidence: string[];
  contradictions: string[];
  sourceRefs: string[];
  createdAt: string;
  lastConfirmedAt?: string;
}

export interface AudienceModel {
  id: string;
  version: number;
  positiveSignals: AudienceSignal[];
  negativeSignals: AudienceSignal[];
  hardRejects: AudienceSignal[];
  toleratedVariations: AudienceSignal[];
  visualCore: AudienceSignal[];
  presentationPatterns: AudienceSignal[];
  secondaryInterests: AudienceSignal[];
  createdAt: string;
  supersededAt?: string;
}

export interface AudienceModelDraft {
  positiveSignals?: AudienceSignal[];
  negativeSignals?: AudienceSignal[];
  hardRejects?: AudienceSignal[];
  toleratedVariations?: AudienceSignal[];
  visualCore?: AudienceSignal[];
  presentationPatterns?: AudienceSignal[];
  secondaryInterests?: AudienceSignal[];
}

export interface AudienceFitAssessment {
  modelLabel: AudienceFitLabel;
  modelScore: number;
  modelConfidence: number;
  modelReasons: string[];
  finalLabel: AudienceFitLabel;
  correctedByUser: boolean;
  correctionReasons: AudienceCorrectionReason[];
  correctionComment?: string;
  correctedAt?: string;
}

export interface CandidateEvidence {
  observations: Array<{
    key: string;
    value: string;
    source: 'photo' | 'text' | 'ui';
    confidence: number;
  }>;
  claims: Array<{
    statement: string;
    sourceText: string;
  }>;
  inferences: Array<{
    statement: string;
    likelihood: EvidenceLikelihood;
    evidence: string[];
    contradictions: string[];
  }>;
  imageAuthenticityRisks: string[];
}

export interface AudienceModelRepository {
  getCurrent(): Promise<AudienceModel>;
  getVersion(version: number): Promise<AudienceModel>;
  saveDraft(draft: AudienceModelDraft): Promise<AudienceModel>;
  confirmVersion(id: string): Promise<AudienceModel>;
}

export interface AudienceFitEvaluator {
  evaluate(
    evidence: CandidateEvidence,
    model: AudienceModel,
  ): Promise<AudienceFitAssessment>;
}

export const audienceFitLabels: Record<AudienceFitLabel, string> = {
  core: 'Ядро аудитории',
  acceptable: 'Подходит',
  borderline: 'На границе',
  outside: 'Вне аудитории',
};

function nowIso(): string {
  return new Date().toISOString();
}

function emptyModel(version = 1): AudienceModel {
  return {
    id: `audience-v${version}`,
    version,
    positiveSignals: [],
    negativeSignals: [],
    hardRejects: [],
    toleratedVariations: [],
    visualCore: [],
    presentationPatterns: [],
    secondaryInterests: [],
    createdAt: nowIso(),
  };
}

function collectEvidenceText(evidence: CandidateEvidence): string {
  const parts = [
    ...evidence.observations.map((o) => `${o.key} ${o.value}`),
    ...evidence.claims.map((c) => `${c.statement} ${c.sourceText}`),
    ...evidence.inferences.map((i) => i.statement),
  ];
  return parts.join(' ').toLowerCase();
}

function signalHits(haystack: string, signals: AudienceSignal[]): AudienceSignal[] {
  return signals.filter((s) => {
    const key = s.key.trim().toLowerCase();
    const statement = s.statement.trim().toLowerCase();
    return (key.length > 0 && haystack.includes(key)) ||
      (statement.length > 0 && haystack.includes(statement));
  });
}

export function scoreAudienceFit(
  evidence: CandidateEvidence,
  model: AudienceModel,
): AudienceFitAssessment {
  const haystack = collectEvidenceText(evidence);
  const hardHits = signalHits(haystack, model.hardRejects);
  const negativeHits = signalHits(haystack, model.negativeSignals);
  const positiveHits = signalHits(haystack, [
    ...model.positiveSignals,
    ...model.visualCore,
    ...model.presentationPatterns,
    ...model.secondaryInterests,
  ]);
  const toleratedHits = signalHits(haystack, model.toleratedVariations);

  const reasons: string[] = [];
  let score = 50;

  if (hardHits.length > 0) {
    score = 0;
    reasons.push(
      ...hardHits.map((h) => `Hard reject: ${h.statement || h.key}`),
    );
  } else {
    score += positiveHits.length * 12;
    score -= negativeHits.length * 15;
    score += toleratedHits.length * 2;
    if (positiveHits.length > 0) {
      reasons.push(`Положительных совпадений: ${positiveHits.length}`);
    }
    if (negativeHits.length > 0) {
      reasons.push(`Отрицательных совпадений: ${negativeHits.length}`);
    }
    if (reasons.length === 0) {
      reasons.push('Недостаточно сигналов для уверенной оценки');
    }
  }

  score = Math.max(0, Math.min(100, score));

  let modelLabel: AudienceFitLabel;
  if (hardHits.length > 0 || score < 25) {
    modelLabel = 'outside';
  } else if (score >= 75 && positiveHits.length >= 2) {
    modelLabel = 'core';
  } else if (score >= 55) {
    modelLabel = 'acceptable';
  } else {
    modelLabel = 'borderline';
  }

  const modelConfidence = hardHits.length > 0
    ? 0.95
    : Math.min(0.9, 0.35 + positiveHits.length * 0.12 + negativeHits.length * 0.05);

  return {
    modelLabel,
    modelScore: score,
    modelConfidence: Math.round(modelConfidence * 1000) / 1000,
    modelReasons: reasons,
    finalLabel: modelLabel,
    correctedByUser: false,
    correctionReasons: [],
  };
}

export class InMemoryAudienceModelRepository implements AudienceModelRepository {
  private current: AudienceModel;
  private byVersion = new Map<number, AudienceModel>();
  private byId = new Map<string, AudienceModel>();

  constructor(seed?: AudienceModel) {
    this.current = seed ?? emptyModel(1);
    this.byVersion.set(this.current.version, this.current);
    this.byId.set(this.current.id, this.current);
  }

  async getCurrent(): Promise<AudienceModel> {
    return this.current;
  }

  async getVersion(version: number): Promise<AudienceModel> {
    const found = this.byVersion.get(version);
    if (!found) {
      throw new Error(`Audience model version ${version} not found`);
    }
    return found;
  }

  async saveDraft(draft: AudienceModelDraft): Promise<AudienceModel> {
    const nextVersion = this.current.version + 1;
    const model: AudienceModel = {
      id: `audience-draft-${nextVersion}`,
      version: nextVersion,
      positiveSignals: draft.positiveSignals ?? this.current.positiveSignals,
      negativeSignals: draft.negativeSignals ?? this.current.negativeSignals,
      hardRejects: draft.hardRejects ?? this.current.hardRejects,
      toleratedVariations:
        draft.toleratedVariations ?? this.current.toleratedVariations,
      visualCore: draft.visualCore ?? this.current.visualCore,
      presentationPatterns:
        draft.presentationPatterns ?? this.current.presentationPatterns,
      secondaryInterests:
        draft.secondaryInterests ?? this.current.secondaryInterests,
      createdAt: nowIso(),
    };
    this.byVersion.set(model.version, model);
    this.byId.set(model.id, model);
    this.current = model;
    return model;
  }

  async confirmVersion(id: string): Promise<AudienceModel> {
    const model = this.byId.get(id);
    if (!model) {
      throw new Error(`Audience model ${id} not found`);
    }
    this.current = model;
    return model;
  }
}

export class DefaultAudienceFitEvaluator implements AudienceFitEvaluator {
  async evaluate(
    evidence: CandidateEvidence,
    model: AudienceModel,
  ): Promise<AudienceFitAssessment> {
    return scoreAudienceFit(evidence, model);
  }
}
