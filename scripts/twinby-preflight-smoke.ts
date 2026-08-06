/**
 * Live smoke aligned with §19: open profiles + composite identity (read-only).
 * Usage: pnpm twinby:preflight-smoke
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ManagedAppiumClient } from '../packages/appium-client/src/index';
import { listDevices } from '../packages/android-environment/src/index';
import { ensureAppDirectories, resolveAppPaths } from '@twinby/config';
import { DEFAULT_SESSION_LIMITS, SPEED_PRESET_VALUES } from '../packages/contracts/src/index';
import { SharpImagePipeline } from '../packages/image-pipeline/src/index';
import {
  TwinbyActionExecutor,
  bioFingerprintFromText,
  buildCompositeFingerprint,
  detectScreenFromPageSource,
  findConversationAvatarBounds,
  findLocatorProfile,
  getDefaultLocatorProfile,
  parseChatListRows,
  parseIncomingLikeCards,
  parseMatchListRows,
  parseOwnProfileEdit,
  readOpenedProfileFromSource,
} from '../packages/twinby-adapter/src/index';

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function captureIdentity(
  actions: TwinbyActionExecutor,
  images: SharpImagePipeline,
): Promise<Record<string, unknown>> {
  const source = await actions.getPageSource();
  const fields = readOpenedProfileFromSource(source);
  if (!fields.displayName) {
    throw new Error('Нет Name, age на экране — профиль не открыт');
  }
  const png = await actions.takeScreenshotPng();
  const rect = await actions.getWindowRect();
  const primaryPhotoHash = await images.perceptualHash(png, {
    left: Math.round(rect.width * 0.05),
    top: Math.round(rect.height * 0.08),
    width: Math.round(rect.width * 0.9),
    height: Math.round(rect.height * 0.55),
  });
  const bioFingerprint = bioFingerprintFromText(fields.bioSnippet ?? '');
  return {
    identityFingerprint: buildCompositeFingerprint({
      name: fields.displayName,
      age: fields.age,
      primaryPhotoHash,
      bioFingerprint,
    }),
    name: fields.displayName,
    age: fields.age,
    bioPreview: fields.bioSnippet?.slice(0, 80),
    primaryPhotoHash,
  };
}

async function main(): Promise<void> {
  const paths = resolveAppPaths();
  ensureAppDirectories(paths);
  const outDir = join(paths.data, 'discovery', 'preflight-smoke');
  mkdirSync(outDir, { recursive: true });
  const images = new SharpImagePipeline();

  const devices = await listDevices();
  const device = devices.find((d) => d.state === 'device');
  if (!device) {
    throw new Error('Нет device в adb');
  }

  const client = new ManagedAppiumClient({
    logsDir: paths.logs,
    temporaryDir: paths.temporary,
  });
  await client.startServer();
  await client.createSession({
    udid: device.udid,
    appPackage: 'com.twinby',
    noReset: true,
    deviceName: 'device',
  });

  try {
    await client.activateApp('com.twinby');
  } catch {
    /* already open */
  }
  await sleep(2000);

  const rect = await client.getWindowRect();
  const profile =
    findLocatorProfile({
      screenWidth: rect.width,
      screenHeight: rect.height,
    }) ?? getDefaultLocatorProfile();
  if (!profile) {
    throw new Error('Locator profile не найден');
  }

  const limits = {
    ...DEFAULT_SESSION_LIMITS,
    ...SPEED_PRESET_VALUES.turbo,
  };
  const actions = new TwinbyActionExecutor(client, profile, limits);
  const report: Record<string, unknown> = {
    ok: false,
    profileId: profile.id,
    windowRect: rect,
    steps: [] as Array<Record<string, unknown>>,
  };
  const steps = report.steps as Array<Record<string, unknown>>;
  const push = (name: string, data: Record<string, unknown>) => {
    steps.push({ name, ...data });
    console.log(JSON.stringify({ step: name, ...data }, null, 2));
  };

  try {
    // Wait until Flutter semantics expose a real screen (nav-only dump = not ready)
    for (let i = 0; i < 20; i++) {
      const screen = await actions.detectScreen();
      if (screen.type !== 'unknown' || screen.confidence >= 0.7) {
        break;
      }
      try {
        await actions.openBottomTab('feed');
      } catch {
        /* relative fallback may still fail while tree empty */
      }
      await sleep(700);
    }
    // Leave overlays / nested screens before scanning
    for (let i = 0; i < 3; i++) {
      const screen = await actions.detectScreen();
      if (
        screen.type === 'feed' ||
        screen.type === 'chats' ||
        screen.type === 'likes' ||
        screen.type === 'own-profile-hub'
      ) {
        break;
      }
      await actions.pressBack(1);
      await sleep(400);
    }
    push('start', { screen: await actions.detectScreen() });

    // dialogs: open first 2 human chats → profile
    await actions.openBottomTab('chat');
    await sleep(500);
    let source = await actions.getPageSource();
    const chatRows = parseChatListRows(source).filter((r) => !r.isSystem).slice(0, 2);
    const dialogIds: unknown[] = [];
    for (const row of chatRows) {
      await actions.openBottomTab('chat');
      await sleep(400);
      source = await actions.getPageSource();
      const fresh =
        parseChatListRows(source).find((r) => r.name === row.name && !r.isSystem) ??
        row;
      await actions.tapAtBounds(fresh.bounds);
      await sleep(700);
      let chatScreen = await actions.detectScreen();
      if (chatScreen.type !== 'conversation') {
        dialogIds.push({
          name: row.name,
          error: `ожидали conversation, получили ${chatScreen.type}`,
        });
        await actions.pressBack(1);
        continue;
      }
      source = await actions.getPageSource();
      const avatar = findConversationAvatarBounds(source);
      if (!avatar) {
        dialogIds.push({ name: row.name, error: 'avatar ImageView не найден' });
        await actions.pressBack(1);
        continue;
      }
      await actions.tapAtBounds(avatar);
      await sleep(900);
      const opened = await actions.detectScreen();
      try {
        dialogIds.push({
          ...(await captureIdentity(actions, images)),
          detectedScreen: opened.type,
          avatar,
        });
      } catch (err) {
        dialogIds.push({
          name: row.name,
          error: err instanceof Error ? err.message : String(err),
          detectedScreen: opened.type,
          avatar,
        });
      }
      // profile → chat → chats list
      await actions.pressBack(2);
      await sleep(500);
    }
    push('dialogs', { top: dialogIds });

    // matches: open each
    await actions.openBottomTab('chat');
    await sleep(400);
    await actions.tapNav(profile.navigation.allMatchesLink);
    await sleep(600);
    source = await actions.getPageSource();
    const matchRows = parseMatchListRows(source);
    const matchIds: unknown[] = [];
    for (const row of matchRows) {
      source = await actions.getPageSource();
      const fresh = parseMatchListRows(source).find((r) => r.name === row.name) ?? row;
      await actions.tapAtBounds(fresh.bounds);
      await sleep(700);
      const afterRow = await actions.detectScreen();
      if (afterRow.type !== 'conversation') {
        matchIds.push({
          name: row.name,
          error: `ожидали conversation после строки, получили ${afterRow.type}`,
        });
        await actions.pressBack(1);
        continue;
      }
      source = await actions.getPageSource();
      const matchAvatar = findConversationAvatarBounds(source);
      if (!matchAvatar) {
        matchIds.push({ name: row.name, error: 'avatar не найден' });
        await actions.pressBack(1);
        continue;
      }
      await actions.tapAtBounds(matchAvatar);
      await sleep(900);
      const matchScreen = await actions.detectScreen();
      try {
        matchIds.push({
          ...(await captureIdentity(actions, images)),
          isNew: row.isNew,
          detectedScreen: matchScreen.type,
          avatar: matchAvatar,
        });
      } catch (err) {
        matchIds.push({
          name: row.name,
          error: err instanceof Error ? err.message : String(err),
          detectedScreen: matchScreen.type,
          avatar: matchAvatar,
        });
      }
      // profile → conversation → matches list
      await actions.pressBack(2);
      await sleep(500);
    }
    await actions.pressBack(1);
    push('matches', {
      screen: detectScreenFromPageSource(await actions.getPageSource()),
      items: matchIds,
    });

    // likes: open each
    await actions.openBottomTab('likes');
    await sleep(500);
    source = await actions.getPageSource();
    const likeCards = parseIncomingLikeCards(source);
    const likeIds: unknown[] = [];
    for (const card of likeCards) {
      await actions.tapAtBounds(card.bounds);
      await sleep(800);
      try {
        likeIds.push(await captureIdentity(actions, images));
      } catch (err) {
        likeIds.push({
          name: card.name,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      await actions.pressBack(1);
      await sleep(400);
    }
    push('likes', { items: likeIds });

    // own profile edit
    await actions.openBottomTab('profile');
    await sleep(400);
    await actions.tapNav(profile.navigation.ownProfileAvatar);
    await sleep(600);
    source = await actions.getPageSource();
    const edit = parseOwnProfileEdit(source);
    push('own-profile-edit', {
      screen: detectScreenFromPageSource(source),
      fillPercent: edit.fillPercent,
      bioPreview: edit.bio.slice(0, 100),
      photoSlots: edit.photos.map((p) => p.position),
    });
    await actions.returnToBottomNav();
    await actions.openBottomTab('feed');
    push('feed', { screen: await actions.detectScreen() });

    const hasDialog = dialogIds.some(
      (d) => typeof d === 'object' && d && 'identityFingerprint' in d,
    );
    const hasMatch = matchIds.some(
      (d) => typeof d === 'object' && d && 'identityFingerprint' in d,
    );
    report.ok = hasDialog || hasMatch || likeIds.length > 0 || edit.photos.length > 0;
  } catch (err) {
    report.ok = false;
    report.error = err instanceof Error ? err.message : String(err);
    try {
      push('recover', { screen: await actions.returnToBottomNav() });
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportPath = join(outDir, `smoke-${stamp}.json`);
    writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
    console.log(JSON.stringify({ reportPath, ok: report.ok }, null, 2));
    try {
      await client.endSession();
    } catch {
      /* BlueStacks sometimes hangs on deleteSession */
    }
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : String(err));
  process.exitCode = 1;
});
