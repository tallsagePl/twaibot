export type ExperimentStatus =
  | 'draft'
  | 'ready'
  | 'running'
  | 'completed'
  | 'stopped-early-positive'
  | 'stopped-early-negative'
  | 'stopped-by-user'
  | 'stopped-profile-changed'
  | 'insufficient-data';

export type ExperimentCompletionReason =
  | 'completed'
  | 'stopped-early-positive'
  | 'stopped-early-negative'
  | 'stopped-by-user'
  | 'stopped-profile-changed'
  | 'insufficient-data';

export interface CreateExperimentInput {
  name: string;
  profileVariantId: string;
  hypothesis: string;
  plannedDays?: number;
  minDays?: number;
  maxDays?: number;
}

export interface ProfileChangeDuringExperimentInput {
  experimentId: string;
  profileVariantId: string;
  detectedAt: string;
  autoStop?: boolean;
}

export interface ProfileExperiment {
  id: string;
  name: string;
  profileVariantId: string;
  hypothesis: string;
  status: ExperimentStatus;
  plannedDays: number;
  minDays: number;
  maxDays: number;
  createdAt: string;
  readyAt?: string;
  startedAt?: string;
  completedAt?: string;
  completionReason?: ExperimentCompletionReason;
}

export interface ExperimentManager {
  create(input: CreateExperimentInput): Promise<ProfileExperiment>;
  start(id: string): Promise<ProfileExperiment>;
  complete(
    id: string,
    reason: ExperimentCompletionReason,
  ): Promise<ProfileExperiment>;
  handleProfileChange(
    input: ProfileChangeDuringExperimentInput,
  ): Promise<void>;
}

const TERMINAL: ReadonlySet<ExperimentStatus> = new Set([
  'completed',
  'stopped-early-positive',
  'stopped-early-negative',
  'stopped-by-user',
  'stopped-profile-changed',
  'insufficient-data',
]);

export function isTerminalExperimentStatus(status: ExperimentStatus): boolean {
  return TERMINAL.has(status);
}

/** Allowed forward transitions for the experiment FSM. */
export function canTransition(
  from: ExperimentStatus,
  to: ExperimentStatus,
): boolean {
  if (from === to) return true;
  if (isTerminalExperimentStatus(from)) return false;

  if (from === 'draft') return to === 'ready';
  if (from === 'ready') return to === 'running';
  if (from === 'running') {
    return (
      to === 'completed' ||
      to === 'stopped-early-positive' ||
      to === 'stopped-early-negative' ||
      to === 'stopped-by-user' ||
      to === 'stopped-profile-changed' ||
      to === 'insufficient-data'
    );
  }
  return false;
}

export function completionReasonToStatus(
  reason: ExperimentCompletionReason,
): ExperimentStatus {
  return reason;
}

function nowIso(): string {
  return new Date().toISOString();
}

let seq = 0;
function nextId(): string {
  seq += 1;
  return `experiment-${seq}`;
}

export class InMemoryExperimentManager implements ExperimentManager {
  private experiments = new Map<string, ProfileExperiment>();

  async create(input: CreateExperimentInput): Promise<ProfileExperiment> {
    const experiment: ProfileExperiment = {
      id: nextId(),
      name: input.name,
      profileVariantId: input.profileVariantId,
      hypothesis: input.hypothesis,
      status: 'draft',
      plannedDays: input.plannedDays ?? 5,
      minDays: input.minDays ?? 3,
      maxDays: input.maxDays ?? 7,
      createdAt: nowIso(),
    };
    this.experiments.set(experiment.id, experiment);
    return experiment;
  }

  /** Move draft → ready (implicit prepare). */
  async markReady(id: string): Promise<ProfileExperiment> {
    const exp = this.require(id);
    if (!canTransition(exp.status, 'ready')) {
      throw new Error(`Cannot mark ready from status ${exp.status}`);
    }
    const next: ProfileExperiment = {
      ...exp,
      status: 'ready',
      readyAt: nowIso(),
    };
    this.experiments.set(id, next);
    return next;
  }

  async start(id: string): Promise<ProfileExperiment> {
    let exp = this.require(id);
    if (exp.status === 'draft') {
      exp = await this.markReady(id);
    }
    if (!canTransition(exp.status, 'running')) {
      throw new Error(`Cannot start experiment from status ${exp.status}`);
    }
    const running = [...this.experiments.values()].find(
      (e) => e.status === 'running' && e.id !== id,
    );
    if (running) {
      throw new Error(
        `EXPERIMENT_ALREADY_RUNNING: ${running.id} is already running`,
      );
    }
    const next: ProfileExperiment = {
      ...exp,
      status: 'running',
      startedAt: nowIso(),
    };
    this.experiments.set(id, next);
    return next;
  }

  async complete(
    id: string,
    reason: ExperimentCompletionReason,
  ): Promise<ProfileExperiment> {
    const exp = this.require(id);
    const status = completionReasonToStatus(reason);
    if (!canTransition(exp.status, status)) {
      throw new Error(
        `Cannot complete experiment from ${exp.status} with reason ${reason}`,
      );
    }
    const next: ProfileExperiment = {
      ...exp,
      status,
      completedAt: nowIso(),
      completionReason: reason,
    };
    this.experiments.set(id, next);
    return next;
  }

  async handleProfileChange(
    input: ProfileChangeDuringExperimentInput,
  ): Promise<void> {
    const exp = this.require(input.experimentId);
    if (exp.status !== 'running') return;
    if (input.autoStop === false) return;
    await this.complete(input.experimentId, 'stopped-profile-changed');
  }

  get(id: string): ProfileExperiment | undefined {
    return this.experiments.get(id);
  }

  list(): ProfileExperiment[] {
    return [...this.experiments.values()];
  }

  private require(id: string): ProfileExperiment {
    const exp = this.experiments.get(id);
    if (!exp) throw new Error(`Experiment ${id} not found`);
    return exp;
  }
}
