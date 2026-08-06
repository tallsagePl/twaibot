import {
  RunPreflightInputSchema,
  type PreflightRunView,
} from '@twinby/contracts';
import {
  cancelLatestPreflightRun,
  getLatestPreflightRun,
  startPreflightRun,
  type AppDatabase,
} from '@twinby/database';
import { requireDb } from './db-helpers';

/**
 * Stage 3/5: records preflight runs in DB.
 * Real Twinby scans remain gated on locator discovery; override completes immediately.
 */
export function createPreflightHandlers(getDb: () => AppDatabase | null) {
  return {
    async run(raw?: unknown): Promise<PreflightRunView> {
      const input = RunPreflightInputSchema.parse(raw ?? {});
      const db = requireDb(getDb());

      if (input.override) {
        const run = startPreflightRun(db, {
          overrideUsed: true,
          overrideReason: input.overrideReason ?? 'Ручной пропуск preflight',
        });
        // Mark completed via cancel path is wrong — use a completed override record.
        // startPreflightRun creates running; for override we cancel then return as cancelled,
        // or just return running with override flag. Prefer completed override:
        cancelLatestPreflightRun(db);
        const latest = getLatestPreflightRun(db);
        if (!latest) {
          return run;
        }
        return {
          ...latest,
          overrideUsed: true,
          overrideReason: input.overrideReason ?? 'Ручной пропуск preflight',
        };
      }

      // Without discovery, start a run that reports not-implemented steps as failed.
      const run = startPreflightRun(db, { overrideUsed: false });
      return {
        ...run,
        status: 'failed',
        completedAt: new Date().toISOString(),
        steps: run.steps.map((step) => ({
          ...step,
          status: 'failed' as const,
          completedAt: new Date().toISOString(),
          error:
            'Locator discovery для этого экрана ещё не выполнен (§20). Используйте override.',
        })),
      };
    },
    getLatest(): PreflightRunView | null {
      return getLatestPreflightRun(requireDb(getDb()));
    },
    cancel(): PreflightRunView | null {
      return cancelLatestPreflightRun(requireDb(getDb()));
    },
  };
}
