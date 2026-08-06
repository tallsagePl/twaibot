import type { ProfileVariantView, VerifiedProfileSnapshotView } from '@twinby/contracts';
import type {
  OwnProfileVariant,
  VerifiedProfileSnapshot,
} from '@twinby/own-profile';
// OwnProfileVariant used for status cast below.

/** Map DB/API variant view to own-profile compare input. */
export function toPlannedVariant(variant: ProfileVariantView): OwnProfileVariant {
  return {
    id: variant.id,
    version: variant.version,
    name: variant.name,
    status: variant.status as OwnProfileVariant['status'],
    strategyId: variant.strategyId ?? 'unknown',
    plannedProfile: {
      photoAssetIds: variant.photoIds,
      bio: variant.bio,
    },
    hypothesis: variant.hypothesis,
    changedSignalBundle: {
      id: variant.changeSetId ?? variant.id,
      name: variant.name,
      changedSignals: [],
      commonHypothesis: variant.hypothesis,
      expectedEffect: {
        funnelStage: 'incoming-like',
        direction: 'increase',
      },
    },
    createdAgainstAudienceVersion: variant.createdAgainstAudienceVersion,
    createdAgainstIdentityVersion: variant.createdAgainstIdentityVersion,
    createdAt: variant.createdAt,
    activatedAt: variant.activatedAt,
    deactivatedAt: variant.deactivatedAt,
    archivedAt: variant.archivedAt,
    verifiedSnapshotId: variant.verifiedSnapshotId,
  };
}

export function toActualSnapshot(
  snapshot: VerifiedProfileSnapshotView,
): VerifiedProfileSnapshot {
  return {
    id: snapshot.id,
    profileVariantId: snapshot.profileVariantId,
    capturedAt: snapshot.capturedAt,
    photos: snapshot.photos,
    bio: snapshot.bio,
    occupation: snapshot.occupation,
    interests: snapshot.interests,
    relationshipGoal: snapshot.relationshipGoal,
    plannedSimilarity: snapshot.plannedSimilarity,
    differencesFromPlan: snapshot.differencesFromPlan,
    deploymentStatus: snapshot.deploymentStatus,
    source: 'twinby-profile-capture',
  };
}
