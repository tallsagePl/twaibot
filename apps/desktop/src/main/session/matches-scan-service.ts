import { parseMatchListRows } from '@twinby/twinby-adapter';
import { getLogger } from '@twinby/logging';
import { captureOpenCandidateIdentity } from './candidate-profile-reader';
import { openProfileFromConversation } from './conversation-profile';
import type { TwinbyNavigationService } from './twinby-navigation-service';
import { sleep } from './session-utils';

export interface MatchScanItem {
  identityFingerprint: string;
  name?: string;
  age?: number;
  primaryPhotoHash?: string;
  bioFingerprint?: string;
  isNew: boolean;
}

export interface MatchesScanResult {
  items: MatchScanItem[];
  scannedAt: string;
}

/**
 * §19.3 — Chat → «Все» → row opens conversation → avatar → profile.
 * Esc: profile→list = 2×; profile→nav = 3× (user 2026-08-07).
 * No messages / conversation starters.
 */
export class MatchesScanService {
  constructor(private readonly navigation: TwinbyNavigationService) {}

  async scan(): Promise<MatchesScanResult> {
    const actions = await this.navigation.createActionExecutor();
    if (!actions) {
      throw new Error('Locator profile Twinby не найден');
    }
    const log = getLogger('session');
    await this.navigation.returnToBottomNav();
    await this.navigation.openMatches();
    await sleep(500);

    let source = await actions.getPageSource();
    let screen = await actions.detectScreen();
    if (screen.type !== 'matches-list') {
      await this.navigation.openMatches();
      await sleep(500);
      source = await actions.getPageSource();
    }

    const rows = parseMatchListRows(source);
    const items: MatchScanItem[] = [];

    for (const row of rows) {
      try {
        source = await actions.getPageSource();
        const fresh =
          parseMatchListRows(source).find((r) => r.name === row.name) ?? row;
        // Row → conversation (not profile)
        await actions.tapAtBounds(fresh.bounds);
        await sleep(700);
        const chatScreen = await actions.detectScreen();
        if (chatScreen.type !== 'conversation') {
          throw new Error(`Ожидали conversation после строки мэтча, получили ${chatScreen.type}`);
        }
        await openProfileFromConversation(actions);
        const captured = await captureOpenCandidateIdentity(actions);
        items.push({
          identityFingerprint: captured.identityFingerprint,
          name: captured.name ?? row.name,
          age: captured.age,
          primaryPhotoHash: captured.primaryPhotoHash,
          bioFingerprint: captured.bioFingerprint,
          isNew: row.isNew,
        });
        // profile → conversation → matches list
        await actions.pressBack(2);
        await sleep(500);
        const now = await actions.detectScreen();
        if (now.type !== 'matches-list') {
          await this.navigation.openMatches();
          await sleep(400);
        }
      } catch (err) {
        log.warn(
          { name: row.name, err: err instanceof Error ? err.message : String(err) },
          'matches scan: failed to open profile',
        );
        items.push({
          identityFingerprint: row.identityFingerprint,
          name: row.name,
          isNew: row.isNew,
        });
        try {
          await actions.pressBack(2);
          await sleep(300);
        } catch {
          /* ignore */
        }
        await this.navigation.openMatches();
        await sleep(400);
      }
    }

    // matches list → chats (nav)
    await actions.pressBack(1);
    return {
      items,
      scannedAt: new Date().toISOString(),
    };
  }
}
