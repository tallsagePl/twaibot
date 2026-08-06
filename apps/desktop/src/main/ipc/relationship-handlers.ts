import {
  AudienceCorrectionInputSchema,
  CloseRelationshipInputSchema,
  ListRelationshipsQuerySchema,
  SetRelationshipStageInputSchema,
  type RelationshipView,
} from '@twinby/contracts';
import {
  applyAudienceCorrectionToRelationship,
  closeRelationship,
  getRelationship,
  listRelationships,
  setRelationshipStage,
  type AppDatabase,
} from '@twinby/database';
import { requireDb } from './db-helpers';

export function createRelationshipHandlers(getDb: () => AppDatabase | null) {
  return {
    list(raw?: unknown): RelationshipView[] {
      const query = ListRelationshipsQuerySchema.parse(raw ?? {});
      return listRelationships(requireDb(getDb()), query);
    },
    get(id: unknown): RelationshipView {
      if (typeof id !== 'string' || !id) {
        throw new Error('Некорректный id relationship');
      }
      return getRelationship(requireDb(getDb()), id);
    },
    setStage(raw: unknown): RelationshipView {
      const input = SetRelationshipStageInputSchema.parse(raw);
      return setRelationshipStage(requireDb(getDb()), input);
    },
    applyAudienceCorrection(raw: unknown): RelationshipView {
      const input = AudienceCorrectionInputSchema.parse(raw);
      return applyAudienceCorrectionToRelationship(requireDb(getDb()), input);
    },
    close(raw: unknown): RelationshipView {
      const input = CloseRelationshipInputSchema.parse(raw);
      return closeRelationship(requireDb(getDb()), input);
    },
  };
}
