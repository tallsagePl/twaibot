import type { TwinbyActionExecutor } from '@twinby/twinby-adapter';
import {
  findConversationAvatarBounds,
  findConversationNameHeader,
} from '@twinby/twinby-adapter';
import { sleep } from './session-utils';

/**
 * Conversation → tap header avatar → profile-details.
 * Dump: ImageView [69,60][129,120] (2026-08-07). Not the % button.
 */
export async function openProfileFromConversation(
  actions: TwinbyActionExecutor,
): Promise<void> {
  const source = await actions.getPageSource();
  const avatar = findConversationAvatarBounds(source);
  if (avatar) {
    await actions.tapAtBounds(avatar);
    await sleep(700);
    return;
  }
  const header = findConversationNameHeader(source);
  if (header) {
    // Tap left third of name strip (avatar side)
    const width = header.right - header.left;
    await actions.tapAtBounds({
      left: header.left,
      top: header.top,
      right: header.left + Math.round(width * 0.22),
      bottom: header.bottom,
    });
    await sleep(700);
    return;
  }
  const rect = await actions.getWindowRect();
  await actions.tapAtBounds({
    left: Math.round(rect.width * 0.06),
    top: Math.round(rect.height * 0.03),
    right: Math.round(rect.width * 0.13),
    bottom: Math.round(rect.height * 0.08),
  });
  await sleep(700);
}
