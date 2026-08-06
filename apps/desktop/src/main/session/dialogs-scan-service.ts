import { parseChatListRows } from '@twinby/twinby-adapter';
import { getLogger } from '@twinby/logging';
import { captureOpenCandidateIdentity } from './candidate-profile-reader';
import { openProfileFromConversation } from './conversation-profile';
import type { TwinbyNavigationService } from './twinby-navigation-service';
import { sleep } from './session-utils';

export interface DialogScanItem {
  identityFingerprint: string;
  name?: string;
  age?: number;
  primaryPhotoHash?: string;
  bioFingerprint?: string;
  isSystem: boolean;
}

export interface DialogsScanResult {
  /** Order-independent set of top dialog identities (excl. system). */
  topIdentities: DialogScanItem[];
  scannedAt: string;
}

/**
 * §19.2 — chats → chat → avatar → profile → Back×2 to chats list.
 * No messages.
 */
export class DialogsScanService {
  constructor(private readonly navigation: TwinbyNavigationService) {}

  async scanTop(limit = 5): Promise<DialogsScanResult> {
    const actions = await this.navigation.createActionExecutor();
    if (!actions) {
      throw new Error('Locator profile Twinby не найден');
    }
    const log = getLogger('session');
    await this.navigation.openDialogs();
    await sleep(500);

    let source = await actions.getPageSource();
    const rows = parseChatListRows(source)
      .filter((r) => !r.isSystem)
      .slice(0, limit);

    const topIdentities: DialogScanItem[] = [];

    for (const row of rows) {
      try {
        await this.navigation.openDialogs();
        await sleep(400);
        source = await actions.getPageSource();
        const fresh = parseChatListRows(source).find(
          (r) => r.name === row.name && !r.isSystem,
        );
        const target = fresh ?? row;
        await actions.tapAtBounds(target.bounds);
        await sleep(700);
        const chatScreen = await actions.detectScreen();
        if (chatScreen.type !== 'conversation') {
          throw new Error(`Ожидали conversation, получили ${chatScreen.type}`);
        }
        await openProfileFromConversation(actions);
        const captured = await captureOpenCandidateIdentity(actions);
        topIdentities.push({
          identityFingerprint: captured.identityFingerprint,
          name: captured.name ?? row.name,
          age: captured.age,
          primaryPhotoHash: captured.primaryPhotoHash,
          bioFingerprint: captured.bioFingerprint,
          isSystem: false,
        });
        // profile → conversation → chats list
        await actions.pressBack(2);
        await sleep(400);
      } catch (err) {
        log.warn(
          { name: row.name, err: err instanceof Error ? err.message : String(err) },
          'dialogs scan: failed to open profile, using list fallback',
        );
        topIdentities.push({
          identityFingerprint: row.identityFingerprint,
          name: row.name,
          isSystem: false,
        });
        try {
          await actions.pressBack(2);
          await sleep(300);
        } catch {
          await this.navigation.returnToBottomNav();
        }
        await this.navigation.openDialogs();
        await sleep(400);
      }
    }

    return {
      topIdentities,
      scannedAt: new Date().toISOString(),
    };
  }
}
