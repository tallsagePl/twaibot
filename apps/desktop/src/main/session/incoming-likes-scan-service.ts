import type { AudienceFitLabel } from '@twinby/contracts';
import {
  getCurrentAudienceModel,
  listCurrentIncomingLikes,
  type AppDatabase,
} from '@twinby/database';
import { scoreAudienceFit, type CandidateEvidence } from '@twinby/audience-model';
import { parseIncomingLikeCards } from '@twinby/twinby-adapter';
import { getLogger } from '@twinby/logging';
import { captureOpenCandidateIdentity } from './candidate-profile-reader';
import type { TwinbyNavigationService } from './twinby-navigation-service';
import { sleep } from './session-utils';

export interface IncomingLikeScanItem {
  identityFingerprint: string;
  name?: string;
  age?: number;
  primaryPhotoHash?: string;
  bioFingerprint?: string;
  isKnown: boolean;
  audienceFit?: AudienceFitLabel;
  audienceScore?: number;
  audienceReasons?: string[];
  bioSnippet?: string;
}

export interface IncomingLikesScanResult {
  items: IncomingLikeScanItem[];
  scannedAt: string;
}

function evidenceFromCapture(input: {
  name?: string;
  age?: number;
  bioSnippet?: string;
  city?: string;
  goal?: string;
  interests: string[];
}): CandidateEvidence {
  const observations: CandidateEvidence['observations'] = [];
  if (input.name) {
    observations.push({
      key: 'name',
      value: input.name,
      source: 'ui',
      confidence: 0.9,
    });
  }
  if (input.age != null) {
    observations.push({
      key: 'age',
      value: String(input.age),
      source: 'ui',
      confidence: 0.9,
    });
  }
  if (input.city) {
    observations.push({
      key: 'city',
      value: input.city,
      source: 'ui',
      confidence: 0.7,
    });
  }
  if (input.goal) {
    observations.push({
      key: 'goal',
      value: input.goal,
      source: 'text',
      confidence: 0.7,
    });
  }
  for (const interest of input.interests) {
    observations.push({
      key: 'interest',
      value: interest,
      source: 'text',
      confidence: 0.6,
    });
  }
  const claims: CandidateEvidence['claims'] = [];
  if (input.bioSnippet) {
    claims.push({
      statement: input.bioSnippet.slice(0, 200),
      sourceText: input.bioSnippet,
    });
  }
  return {
    observations,
    claims,
    inferences: [],
    imageAuthenticityRisks: [],
  };
}

/**
 * §19.4 / §21 — open new likes, assess Audience Model; known → skip AI.
 * Never auto-like.
 */
export class IncomingLikesScanService {
  constructor(
    private readonly deps: {
      navigation: TwinbyNavigationService;
      getDb: () => AppDatabase;
    },
  ) {}

  async scan(): Promise<IncomingLikesScanResult> {
    const actions = await this.deps.navigation.createActionExecutor();
    if (!actions) {
      throw new Error('Locator profile Twinby не найден');
    }
    const log = getLogger('session');
    const db = this.deps.getDb();
    const knownIds = new Set(
      listCurrentIncomingLikes(db).map((r) => r.candidateIdentityId),
    );
    const audience = getCurrentAudienceModel(db);

    await this.deps.navigation.returnToBottomNav();
    await this.deps.navigation.openIncomingLikes();
    await sleep(500);

    let source = await actions.getPageSource();
    const likesScreen = await actions.detectScreen();
    if (likesScreen.type !== 'likes') {
      await this.deps.navigation.openIncomingLikes();
      await sleep(500);
      source = await actions.getPageSource();
    }
    const cards = parseIncomingLikeCards(source);
    const items: IncomingLikeScanItem[] = [];

    for (const card of cards) {
      // Provisional list id (name+age) — refine after open
      const provisionalKnown = knownIds.has(card.identityFingerprint);

      if (provisionalKnown) {
        items.push({
          identityFingerprint: card.identityFingerprint,
          name: card.name,
          age: card.age,
          isKnown: true,
        });
        continue;
      }

      try {
        await actions.tapAtBounds(card.bounds);
        await sleep(500);
        const captured = await captureOpenCandidateIdentity(actions);
        const isKnown = knownIds.has(captured.identityFingerprint);
        let audienceFit: AudienceFitLabel | undefined;
        let audienceScore: number | undefined;
        let audienceReasons: string[] | undefined;

        if (!isKnown) {
          const fit = scoreAudienceFit(
            evidenceFromCapture({
              name: captured.name,
              age: captured.age,
              bioSnippet: captured.bioSnippet,
              city: captured.city,
              goal: captured.goal,
              interests: captured.interests,
            }),
            audience,
          );
          audienceFit = fit.finalLabel;
          audienceScore = fit.modelScore;
          audienceReasons = fit.modelReasons;
        }

        items.push({
          identityFingerprint: captured.identityFingerprint,
          name: captured.name ?? card.name,
          age: captured.age ?? card.age,
          primaryPhotoHash: captured.primaryPhotoHash,
          bioFingerprint: captured.bioFingerprint,
          isKnown,
          audienceFit,
          audienceScore,
          audienceReasons,
          bioSnippet: captured.bioSnippet,
        });
        await actions.pressBack(1);
        await sleep(400);
      } catch (err) {
        log.warn(
          { name: card.name, err: err instanceof Error ? err.message : String(err) },
          'likes scan: failed to open profile',
        );
        items.push({
          identityFingerprint: card.identityFingerprint,
          name: card.name,
          age: card.age,
          isKnown: false,
          audienceFit: 'borderline',
        });
        try {
          await actions.pressBack(1);
          await sleep(300);
        } catch {
          await this.deps.navigation.openIncomingLikes();
          await sleep(400);
        }
      }
    }

    return {
      items,
      scannedAt: new Date().toISOString(),
    };
  }
}
