import {
  cancelLatestPreflightRun,
  getLatestPreflightRun,
  getPendingProfileChange,
  startPreflightRun,
  type AppDatabase,
} from '@twinby/database';
import type { OwnProfileCaptureResultView, PreflightRunView } from '@twinby/contracts';
import type { DialogsScanService } from './dialogs-scan-service';
import type { IncomingLikesScanService } from './incoming-likes-scan-service';
import type { MatchesScanService } from './matches-scan-service';
import type { OwnProfileCaptureService } from './own-profile-capture-service';
import type { RelationshipReconciliationService } from './relationship-reconciliation-service';
import type { TwinbyNavigationService } from './twinby-navigation-service';

export type PreflightStepId =
  | 'own-profile'
  | 'dialogs'
  | 'matches'
  | 'likes'
  | 'reconciliation';

export interface PreflightOrchestratorDeps {
  getDb: () => AppDatabase;
  navigation: TwinbyNavigationService;
  ownProfile: OwnProfileCaptureService;
  dialogs: DialogsScanService;
  matches: MatchesScanService;
  likes: IncomingLikesScanService;
  reconciliation: RelationshipReconciliationService;
}

/**
 * Preflight before each Eurydice session (§19).
 * Scans use discovery locators (1080×1920 content-desc, 2026-08-07).
 */
export class PreflightOrchestrator {
  constructor(private readonly deps: PreflightOrchestratorDeps) {}

  async run(options?: {
    override?: boolean;
    overrideReason?: string;
  }): Promise<PreflightRunView> {
    const db = this.deps.getDb();

    if (options?.override) {
      startPreflightRun(db, {
        overrideUsed: true,
        overrideReason: options.overrideReason ?? 'Ручной пропуск preflight',
      });
      cancelLatestPreflightRun(db);
      const latest = getLatestPreflightRun(db);
      if (!latest) {
        throw new Error('Не удалось записать override preflight');
      }
      return {
        ...latest,
        overrideUsed: true,
        overrideReason: options.overrideReason ?? 'Ручной пропуск preflight',
      };
    }

    const run = startPreflightRun(db, { overrideUsed: false });
    const stepErrors: Partial<Record<PreflightStepId, string>> = {};

    const tryStep = async (id: PreflightStepId, fn: () => Promise<unknown>) => {
      try {
        await fn();
      } catch (err) {
        stepErrors[id] = err instanceof Error ? err.message : String(err);
      }
    };

    let dialogsResult: Awaited<ReturnType<DialogsScanService['scanTop']>> | null =
      null;
    let matchesResult: Awaited<ReturnType<MatchesScanService['scan']>> | null = null;
    let likesResult: Awaited<
      ReturnType<IncomingLikesScanService['scan']>
    > | null = null;
    let snapshotId: string | undefined;
    let profileChanged: boolean | undefined;
    let profileChangeReason: string | undefined;

    await tryStep('own-profile', async () => {
      const ownProfileResult: OwnProfileCaptureResultView =
        await this.deps.ownProfile.capture();
      snapshotId = ownProfileResult.snapshot.id;
      profileChanged = ownProfileResult.changed;
      profileChangeReason = ownProfileResult.reason;
    });
    await tryStep('dialogs', async () => {
      dialogsResult = await this.deps.dialogs.scanTop(5);
    });
    await tryStep('matches', async () => {
      matchesResult = await this.deps.matches.scan();
    });
    await tryStep('likes', async () => {
      likesResult = await this.deps.likes.scan();
    });

    if (
      !stepErrors['own-profile'] &&
      !stepErrors.dialogs &&
      !stepErrors.matches &&
      !stepErrors.likes &&
      dialogsResult &&
      matchesResult &&
      likesResult
    ) {
      await tryStep('reconciliation', () =>
        this.deps.reconciliation.reconcile({
          dialogs: dialogsResult!,
          matches: matchesResult!,
          likes: likesResult!,
          activeSnapshotId: snapshotId,
        }),
      );
    }

    // Preflight ends on likes tab — must return to feed before Eurydice capture.
    // Never leave session start on likes: ensureFeedReady used to Back from likes → launcher.
    try {
      await this.deps.navigation.ensureFeedReady();
    } catch (err) {
      stepErrors.likes =
        stepErrors.likes ??
        `Не удалось вернуться на feed после preflight: ${
          err instanceof Error ? err.message : String(err)
        }`;
    }

    cancelLatestPreflightRun(db);
    const latest = getLatestPreflightRun(db);
    const failed = Object.keys(stepErrors).length > 0;
    const pending = getPendingProfileChange(db) ?? undefined;
    return {
      ...(latest ?? run),
      status: failed ? 'failed' : 'completed',
      completedAt: new Date().toISOString(),
      steps: (latest ?? run).steps.map((step) => {
        const error = stepErrors[step.stepId as PreflightStepId];
        return {
          ...step,
          status: (error ? 'failed' : 'completed') as 'failed' | 'completed',
          completedAt: new Date().toISOString(),
          error,
        };
      }),
      profileChanged,
      profileChangeReason,
      pendingProfileChange: pending,
    };
  }
}
