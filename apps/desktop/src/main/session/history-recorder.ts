import type { CapturedProfile, SwipeDecision } from '@twinby/contracts';
import {
  insertHistoryEvent,
  type AppDatabase,
} from '@twinby/database';
import { getLogger } from '@twinby/logging';
import { getHistoryRoot, persistProfileDetail } from './history-detail-store';

export type HistoryPendingEvent = Parameters<typeof insertHistoryEvent>[1];

export type LiveHistoryDetailSource = {
  sessionId: string;
  captured: CapturedProfile;
  photoDataUrls: string[];
  modelDecision?: SwipeDecision;
  modelReasons: string[];
  aiRawJson?: string;
};

export type MockHistoryDetailSource = {
  sessionId: string;
  displayName: string;
  bio?: string;
  age?: number;
  interests?: string[];
  relationshipGoal?: string;
  distanceKm?: number;
  photoDataUrls: string[];
  sourcePhotoPaths: string[];
  modelDecision?: SwipeDecision;
  modelReasons: string[];
  aiRawJson?: string;
};

export class HistoryRecorder {
  constructor(private readonly getProjectRoot: () => string) {}

  persistLive(
    db: AppDatabase,
    pendingHistory: HistoryPendingEvent,
    source: LiveHistoryDetailSource | null,
  ): void {
    const event = insertHistoryEvent(db, pendingHistory);
    if (!source) {
      return;
    }
    try {
      const fields = source.captured.fields;
      persistProfileDetail({
        db,
        historyRoot: getHistoryRoot(this.getProjectRoot()),
        historyEventId: event.id,
        sessionId: source.sessionId,
        displayName: fields.displayName,
        bio: fields.bio,
        age: fields.age,
        interests: fields.interests,
        relationshipGoal: fields.relationshipGoal,
        distanceKm: fields.distanceKm,
        modelDecision: source.modelDecision,
        modelReasons: source.modelReasons,
        aiRawJson: source.aiRawJson,
        sourcePhotoPaths: source.captured.images.map((img) => img.path),
        photoDataUrls: source.photoDataUrls,
      });
    } catch (err) {
      getLogger('session').warn(
        { err: err instanceof Error ? err.message : String(err) },
        'Failed to persist history profile detail',
      );
    }
  }

  persistMock(
    db: AppDatabase,
    pendingHistory: HistoryPendingEvent,
    source: MockHistoryDetailSource | null,
  ): void {
    const event = insertHistoryEvent(db, pendingHistory);
    if (!source) {
      return;
    }
    try {
      persistProfileDetail({
        db,
        historyRoot: getHistoryRoot(this.getProjectRoot()),
        historyEventId: event.id,
        sessionId: source.sessionId,
        displayName: source.displayName,
        bio: source.bio,
        age: source.age,
        interests: source.interests,
        relationshipGoal: source.relationshipGoal,
        distanceKm: source.distanceKm,
        modelDecision: source.modelDecision,
        modelReasons: source.modelReasons,
        aiRawJson: source.aiRawJson,
        sourcePhotoPaths: source.sourcePhotoPaths,
        photoDataUrls: source.photoDataUrls,
      });
    } catch (err) {
      getLogger('session').warn(
        { err: err instanceof Error ? err.message : String(err) },
        'Failed to persist mock history profile detail',
      );
    }
  }
}
