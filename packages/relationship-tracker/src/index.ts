export type RelationshipStage =
  | 'incoming-like'
  | 'matched'
  | 'conversation-started'
  | 'substantive-conversation'
  | 'telegram-exchanged'
  | 'date-proposed'
  | 'date-scheduled'
  | 'date-completed'
  | 'closed';

export type RelationshipEventType =
  | 'incoming-like-detected'
  | 'matched'
  | 'conversation-started'
  | 'substantive-conversation'
  | 'telegram-exchanged'
  | 'date-proposed'
  | 'date-scheduled'
  | 'date-completed'
  | 'closed';

export type AudienceFitLabel =
  | 'core'
  | 'acceptable'
  | 'borderline'
  | 'outside';

export interface AudienceFitAssessment {
  modelLabel: AudienceFitLabel;
  modelScore: number;
  modelConfidence: number;
  modelReasons: string[];
  finalLabel: AudienceFitLabel;
  correctedByUser: boolean;
  correctionReasons: string[];
}

export interface RelationshipRecord {
  id: string;
  candidateIdentityId: string;
  origin: 'incoming-like-first' | 'outgoing-like-first' | 'unknown';
  currentStage: RelationshipStage;
  audienceFit: AudienceFitAssessment;
  attributedProfileSnapshotId: string;
  attributedProfileVariantId?: string;
  experimentId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RelationshipEvent {
  id: string;
  relationshipId: string;
  type: RelationshipEventType;
  occurredAt: string;
  source: 'twinby-scan' | 'user-feedback';
  metadata?: Record<string, unknown>;
}

export interface ScannedCandidate {
  identityId: string;
  seenIn: 'incoming-likes' | 'matches' | 'dialogs';
  audienceFit?: AudienceFitAssessment;
  attributedProfileSnapshotId?: string;
  attributedProfileVariantId?: string;
  experimentId?: string;
  dialogDepth?: 'none' | 'started' | 'substantive' | 'telegram';
}

export interface PreflightScanResult {
  scannedAt: string;
  activeSnapshotId: string;
  incomingLikes: ScannedCandidate[];
  matches: ScannedCandidate[];
  dialogs: ScannedCandidate[];
}

export interface ReconciliationResult {
  kept: RelationshipRecord[];
  added: RelationshipRecord[];
  advanced: RelationshipRecord[];
  closed: RelationshipRecord[];
  events: RelationshipEvent[];
}

export interface RelationshipReconciler {
  reconcile(input: PreflightScanResult): Promise<ReconciliationResult>;
}

export const RELATIONSHIP_STAGE_ORDER: RelationshipStage[] = [
  'incoming-like',
  'matched',
  'conversation-started',
  'substantive-conversation',
  'telegram-exchanged',
  'date-proposed',
  'date-scheduled',
  'date-completed',
];

export function stageIndex(stage: RelationshipStage): number {
  if (stage === 'closed') return Number.POSITIVE_INFINITY;
  return RELATIONSHIP_STAGE_ORDER.indexOf(stage);
}

/** Forward-only stage transitions; `closed` is reachable from any stage. */
export function canAdvanceStage(
  from: RelationshipStage,
  to: RelationshipStage,
): boolean {
  if (from === to) return true;
  if (to === 'closed') return from !== 'closed';
  if (from === 'closed') return false;
  return stageIndex(to) > stageIndex(from);
}

export function nextStage(
  from: RelationshipStage,
): RelationshipStage | null {
  if (from === 'closed' || from === 'date-completed') return null;
  const idx = stageIndex(from);
  return RELATIONSHIP_STAGE_ORDER[idx + 1] ?? null;
}

export function stageFromScan(candidate: ScannedCandidate): RelationshipStage {
  if (candidate.dialogDepth === 'telegram') return 'telegram-exchanged';
  if (candidate.dialogDepth === 'substantive') return 'substantive-conversation';
  if (candidate.dialogDepth === 'started') return 'conversation-started';
  if (candidate.seenIn === 'dialogs') return 'conversation-started';
  if (candidate.seenIn === 'matches') return 'matched';
  return 'incoming-like';
}

function defaultFit(): AudienceFitAssessment {
  return {
    modelLabel: 'borderline',
    modelScore: 50,
    modelConfidence: 0.3,
    modelReasons: ['Fit not assessed'],
    finalLabel: 'borderline',
    correctedByUser: false,
    correctionReasons: [],
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

let eventSeq = 0;
function nextEventId(): string {
  eventSeq += 1;
  return `rel-event-${eventSeq}`;
}

let relSeq = 0;
function nextRelId(): string {
  relSeq += 1;
  return `rel-${relSeq}`;
}

export class InMemoryRelationshipReconciler implements RelationshipReconciler {
  private current = new Map<string, RelationshipRecord>();
  private events: RelationshipEvent[] = [];

  constructor(seed: RelationshipRecord[] = []) {
    for (const r of seed) this.current.set(r.candidateIdentityId, r);
  }

  getCurrent(): RelationshipRecord[] {
    return [...this.current.values()].filter((r) => r.currentStage !== 'closed');
  }

  async reconcile(input: PreflightScanResult): Promise<ReconciliationResult> {
    const seen = new Map<string, ScannedCandidate>();
    for (const c of [
      ...input.incomingLikes,
      ...input.matches,
      ...input.dialogs,
    ]) {
      const prev = seen.get(c.identityId);
      if (!prev) {
        seen.set(c.identityId, c);
        continue;
      }
      // Prefer the highest stage implied by scan sources
      const prevStage = stageFromScan(prev);
      const next = stageFromScan(c);
      if (stageIndex(next) >= stageIndex(prevStage)) {
        seen.set(c.identityId, {
          ...prev,
          ...c,
          dialogDepth: c.dialogDepth ?? prev.dialogDepth,
        });
      }
    }

    const kept: RelationshipRecord[] = [];
    const added: RelationshipRecord[] = [];
    const advanced: RelationshipRecord[] = [];
    const closed: RelationshipRecord[] = [];
    const events: RelationshipEvent[] = [];

    for (const [identityId, candidate] of seen) {
      const targetStage = stageFromScan(candidate);
      const existing = this.current.get(identityId);
      if (!existing || existing.currentStage === 'closed') {
        const record: RelationshipRecord = {
          id: existing?.id ?? nextRelId(),
          candidateIdentityId: identityId,
          origin: 'incoming-like-first',
          currentStage: targetStage,
          audienceFit: candidate.audienceFit ?? defaultFit(),
          attributedProfileSnapshotId:
            candidate.attributedProfileSnapshotId ?? input.activeSnapshotId,
          attributedProfileVariantId: candidate.attributedProfileVariantId,
          experimentId: candidate.experimentId,
          createdAt: existing?.createdAt ?? input.scannedAt,
          updatedAt: input.scannedAt,
        };
        this.current.set(identityId, record);
        added.push(record);
        const event: RelationshipEvent = {
          id: nextEventId(),
          relationshipId: record.id,
          type:
            targetStage === 'incoming-like'
              ? 'incoming-like-detected'
              : (targetStage as RelationshipEventType),
          occurredAt: input.scannedAt,
          source: 'twinby-scan',
        };
        events.push(event);
        this.events.push(event);
        continue;
      }

      if (canAdvanceStage(existing.currentStage, targetStage) &&
        existing.currentStage !== targetStage) {
        const updated: RelationshipRecord = {
          ...existing,
          currentStage: targetStage,
          updatedAt: input.scannedAt,
          attributedProfileSnapshotId:
            existing.attributedProfileSnapshotId ||
            candidate.attributedProfileSnapshotId ||
            input.activeSnapshotId,
        };
        this.current.set(identityId, updated);
        advanced.push(updated);
        const event: RelationshipEvent = {
          id: nextEventId(),
          relationshipId: updated.id,
          type: targetStage as RelationshipEventType,
          occurredAt: input.scannedAt,
          source: 'twinby-scan',
        };
        events.push(event);
        this.events.push(event);
      } else {
        kept.push(existing);
      }
    }

    for (const [identityId, record] of this.current) {
      if (record.currentStage === 'closed') continue;
      if (seen.has(identityId)) continue;
      // Only auto-close pure incoming-likes that disappeared from likes/matches/dialogs
      if (record.currentStage === 'incoming-like') {
        const closedRecord: RelationshipRecord = {
          ...record,
          currentStage: 'closed',
          updatedAt: input.scannedAt,
        };
        this.current.set(identityId, closedRecord);
        closed.push(closedRecord);
        const event: RelationshipEvent = {
          id: nextEventId(),
          relationshipId: closedRecord.id,
          type: 'closed',
          occurredAt: input.scannedAt,
          source: 'twinby-scan',
          metadata: { reason: 'missing-from-incoming-likes' },
        };
        events.push(event);
        this.events.push(event);
      } else {
        kept.push(record);
      }
    }

    return { kept, added, advanced, closed, events };
  }
}
