export interface NormalizedPoint {
  xRatio: number;
  yRatio: number;
}

export type LocatorStrategyKind =
  | 'resource-id'
  | 'accessibility-id'
  | 'content-desc'
  | 'visible-text'
  | 'xpath'
  | 'relative-bounds'
  | 'normalized-coordinates';

export interface LocatorStrategy {
  kind: LocatorStrategyKind;
  value: string;
  confidence?: number;
  notes?: string;
  point?: NormalizedPoint;
}

export interface TwinbyLocatorProfile {
  id: string;
  twinbyVersion?: string;
  deviceModel?: string;
  screenWidth: number;
  screenHeight: number;
  orientation: 'portrait';
  theme?: 'light' | 'dark';
  selectors: Record<string, LocatorStrategy[]>;
  createdAt: string;
  lastValidatedAt?: string;
}

export type DiscoveryTargetKey =
  | 'bottom-nav-feed'
  | 'bottom-nav-dialogs'
  | 'bottom-nav-likes'
  | 'bottom-nav-profile'
  | 'own-profile-edit'
  | 'matches-strip'
  | 'incoming-likes-list'
  | 'dialog-list-item'
  | 'candidate-card'
  | 'like-button'
  | 'dislike-button';

export interface DiscoveryUiNode {
  resourceId?: string;
  contentDesc?: string;
  text?: string;
  className?: string;
  bounds?: { x: number; y: number; width: number; height: number };
  clickable?: boolean;
}

export interface LocatorDiscoverySnapshot {
  id: string;
  capturedAt: string;
  screenWidth: number;
  screenHeight: number;
  orientation: 'portrait';
  theme?: 'light' | 'dark';
  twinbyVersion?: string;
  deviceModel?: string;
  screenshotPath?: string;
  pageSourcePath?: string;
  hierarchy: DiscoveryUiNode[];
  labeledTargets?: Partial<Record<DiscoveryTargetKey, NormalizedPoint | LocatorStrategy>>;
  notes?: string[];
}

export interface LocatorDiscoveryResult {
  snapshotId: string;
  profileDraft: TwinbyLocatorProfile;
  unresolvedTargets: DiscoveryTargetKey[];
  resolvedTargets: DiscoveryTargetKey[];
  warnings: string[];
}

export interface LocatorDiscoveryService {
  ingestSnapshot(snapshot: LocatorDiscoverySnapshot): Promise<LocatorDiscoveryResult>;
  getLatestProfile(): Promise<TwinbyLocatorProfile | null>;
}

function nowIso(): string {
  return new Date().toISOString();
}

const PRIORITY_TARGETS: DiscoveryTargetKey[] = [
  'bottom-nav-feed',
  'bottom-nav-dialogs',
  'bottom-nav-likes',
  'bottom-nav-profile',
  'own-profile-edit',
  'matches-strip',
  'incoming-likes-list',
  'dialog-list-item',
  'candidate-card',
  'like-button',
  'dislike-button',
];

/**
 * Stub discovery service: stores snapshots and builds an empty selector profile.
 * Real Appium/UI hierarchy matching is deferred until device discovery runs.
 */
export class StubLocatorDiscoveryService implements LocatorDiscoveryService {
  private latestProfile: TwinbyLocatorProfile | null = null;
  private snapshots: LocatorDiscoverySnapshot[] = [];

  async ingestSnapshot(
    snapshot: LocatorDiscoverySnapshot,
  ): Promise<LocatorDiscoveryResult> {
    this.snapshots.push(snapshot);

    const selectors: Record<string, LocatorStrategy[]> = {};
    const resolvedTargets: DiscoveryTargetKey[] = [];
    const unresolvedTargets: DiscoveryTargetKey[] = [];

    for (const key of PRIORITY_TARGETS) {
      const labeled = snapshot.labeledTargets?.[key];
      if (!labeled) {
        unresolvedTargets.push(key);
        continue;
      }
      resolvedTargets.push(key);
      if ('kind' in labeled) {
        selectors[key] = [labeled];
      } else {
        selectors[key] = [
          {
            kind: 'normalized-coordinates',
            value: `${labeled.xRatio},${labeled.yRatio}`,
            point: labeled,
            confidence: 0.4,
            notes: 'User-labeled coordinate fallback',
          },
        ];
      }
    }

    const profileDraft: TwinbyLocatorProfile = {
      id: `locator-profile-${snapshot.id}`,
      twinbyVersion: snapshot.twinbyVersion,
      deviceModel: snapshot.deviceModel,
      screenWidth: snapshot.screenWidth,
      screenHeight: snapshot.screenHeight,
      orientation: snapshot.orientation,
      theme: snapshot.theme,
      selectors,
      createdAt: nowIso(),
    };

    this.latestProfile = profileDraft;

    return {
      snapshotId: snapshot.id,
      profileDraft,
      unresolvedTargets,
      resolvedTargets,
      warnings: [
        'StubLocatorDiscoveryService: automatic hierarchy matching not implemented',
        unresolvedTargets.length > 0
          ? `Неразрешённые targets: ${unresolvedTargets.join(', ')}`
          : 'Все priority targets размечены пользователем',
      ],
    };
  }

  async getLatestProfile(): Promise<TwinbyLocatorProfile | null> {
    return this.latestProfile;
  }

  listSnapshots(): LocatorDiscoverySnapshot[] {
    return [...this.snapshots];
  }
}

export function pointToPixels(
  point: NormalizedPoint,
  screenWidth: number,
  screenHeight: number,
): { x: number; y: number } {
  return {
    x: Math.round(screenWidth * point.xRatio),
    y: Math.round(screenHeight * point.yRatio),
  };
}
