import type { AudienceFitLabel } from '@twinby/contracts';
import {
  createRelationship,
  getRelationship,
  listCurrentIncomingLikes,
  removeCurrentIncomingLike,
  setRelationshipStage,
  upsertCandidateIdentity,
  upsertCurrentIncomingLike,
  upsertCurrentMatch,
  type AppDatabase,
} from '@twinby/database';
import type { DialogsScanResult } from './dialogs-scan-service';
import type { IncomingLikesScanResult } from './incoming-likes-scan-service';
import type { MatchesScanResult } from './matches-scan-service';

export interface PreflightScanBundle {
  likes: IncomingLikesScanResult;
  matches: MatchesScanResult;
  dialogs: DialogsScanResult;
  activeSnapshotId?: string;
}

export interface ReconciliationResult {
  addedLikes: number;
  transformedToMatch: number;
  removedStaleLikes: number;
  updatedMatches: number;
  updatedDialogs: number;
}

/**
 * Reconciles Twinby current-state scans into relationships + current_* tables (§19.5).
 */
export class RelationshipReconciliationService {
  constructor(private readonly getDb: () => AppDatabase) {}

  async reconcile(input: PreflightScanBundle): Promise<ReconciliationResult> {
    const db = this.getDb();
    let addedLikes = 0;
    let transformedToMatch = 0;
    let removedStaleLikes = 0;
    let updatedMatches = 0;
    let updatedDialogs = 0;

    const likeIds = new Set(input.likes.items.map((i) => i.identityFingerprint));
    const matchIds = new Set(input.matches.items.map((i) => i.identityFingerprint));

    for (const like of input.likes.items) {
      if (like.isKnown) {
        continue;
      }
      const candidateIdentityId = upsertCandidateIdentity(db, {
        id: like.identityFingerprint,
        name: like.name,
        age: like.age,
        primaryPhotoHash: like.primaryPhotoHash,
        bioFingerprint: like.bioFingerprint,
      });
      const fit = (like.audienceFit ?? 'borderline') satisfies AudienceFitLabel;
      const rel = createRelationship(db, {
        candidateIdentityId,
        origin: 'incoming-like-first',
        currentStage: 'incoming-like',
        modelAudienceFit: fit,
        modelScore: like.audienceScore,
        modelReasons: like.audienceReasons,
        attributedProfileSnapshotId: input.activeSnapshotId,
      });
      upsertCurrentIncomingLike(db, {
        relationshipId: rel.id,
        candidateIdentityId,
      });
      addedLikes += 1;
    }

    for (const existing of listCurrentIncomingLikes(db)) {
      const rel = getRelationship(db, existing.relationshipId);
      const candidateId = rel.candidateIdentityId;
      if (!likeIds.has(candidateId) && matchIds.has(candidateId)) {
        setRelationshipStage(db, {
          relationshipId: rel.id,
          stage: 'matched',
        });
        removeCurrentIncomingLike(db, rel.id);
        upsertCurrentMatch(db, {
          relationshipId: rel.id,
          candidateIdentityId: candidateId,
        });
        transformedToMatch += 1;
      } else if (!likeIds.has(candidateId) && !matchIds.has(candidateId)) {
        removeCurrentIncomingLike(db, rel.id);
        removedStaleLikes += 1;
      }
    }

    for (const match of input.matches.items) {
      if (!match.isNew) {
        continue;
      }
      const candidateIdentityId = upsertCandidateIdentity(db, {
        id: match.identityFingerprint,
        name: match.name,
        age: match.age,
        primaryPhotoHash: match.primaryPhotoHash,
        bioFingerprint: match.bioFingerprint,
      });
      const rel = createRelationship(db, {
        candidateIdentityId,
        origin: 'unknown',
        currentStage: 'matched',
        modelAudienceFit: 'acceptable',
        attributedProfileSnapshotId: input.activeSnapshotId,
      });
      upsertCurrentMatch(db, {
        relationshipId: rel.id,
        candidateIdentityId,
      });
      updatedMatches += 1;
    }

    for (const dialog of input.dialogs.topIdentities) {
      if (dialog.isSystem) {
        continue;
      }
      const candidateIdentityId = upsertCandidateIdentity(db, {
        id: dialog.identityFingerprint,
        name: dialog.name,
        age: dialog.age,
        primaryPhotoHash: dialog.primaryPhotoHash,
        bioFingerprint: dialog.bioFingerprint,
      });
      createRelationship(db, {
        candidateIdentityId,
        origin: 'unknown',
        currentStage: 'conversation-started',
        modelAudienceFit: 'acceptable',
        attributedProfileSnapshotId: input.activeSnapshotId,
      });
      updatedDialogs += 1;
    }

    return {
      addedLikes,
      transformedToMatch,
      removedStaleLikes,
      updatedMatches,
      updatedDialogs,
    };
  }
}
