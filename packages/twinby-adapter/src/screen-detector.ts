import type { DetectedScreen, TwinbyScreenType } from '@twinby/contracts';

export function extractResourceIds(pageSource: string): string[] {
  const ids = [...pageSource.matchAll(/resource-id="([^"]+)"/g)].map((m) => m[1]!);
  return [...new Set(ids.filter(Boolean))];
}

export function extractContentDescs(pageSource: string): string[] {
  const descs = [...pageSource.matchAll(/content-desc="([^"]+)"/g)]
    .map((m) => (m[1] ?? '').replace(/&#10;/g, '\n'))
    .filter(Boolean);
  return [...new Set(descs)];
}

function extractVisibleTexts(pageSource: string): string {
  const texts = [...pageSource.matchAll(/\stext="([^"]+)"/g)].map((m) => m[1] ?? '');
  return `${texts.join('\n')}\n`.toLowerCase();
}

function hasNav(ids: string[], descsJoined: string): boolean {
  return (
    ids.some((id) => id.startsWith('navigationBar-')) ||
    /navigationbar-(chat|likes|feed|games|profile)/i.test(descsJoined)
  );
}

/**
 * Heuristic screen detection from Appium page source.
 * Uses only observed Twinby markers — no invented selectors.
 */
export function detectScreenFromPageSource(pageSource: string): DetectedScreen {
  const ids = extractResourceIds(pageSource);
  const descList = extractContentDescs(pageSource);
  const descs = descList.join('\n').toLowerCase();
  const texts = extractVisibleTexts(pageSource);
  const blob = `${descs}\n${texts}`;
  const evidence: string[] = [];

  const has = (id: string) => ids.includes(id);
  /** Exact content-desc or label\\n… (Flutter often packs label + a11y hint). */
  const hasDesc = (exact: string) =>
    descList.some((d) => d === exact || d.startsWith(`${exact}\n`));
  /** Exact single-line title (not tab «Лайки\\nВкладка 2 из 5»). */
  const hasExactDesc = (exact: string) => descList.some((d) => d.trim() === exact);

  // Accept partial feed dumps (BlueStacks sometimes omits a button id).
  if (
    has('profileFeed-ProfileCard') &&
    (has('profileFeed-Button-Like') || has('profileFeed-Button-Dislike'))
  ) {
    evidence.push('profileFeed-ProfileCard');
    if (has('profileFeed-Button-Like')) {
      evidence.push('profileFeed-Button-Like');
    }
    if (has('profileFeed-Button-Dislike')) {
      evidence.push('profileFeed-Button-Dislike');
    }
    return { type: 'feed', confidence: 0.9, evidence };
  }

  if (has('profileFeed-ProfileCard')) {
    evidence.push('profileFeed-ProfileCard only');
    return { type: 'feed', confidence: 0.75, evidence };
  }

  if (
    /заполнен на/.test(blob) ||
    (hasExactDesc('Мои фото') &&
      /перетащите, чтобы изменить порядок|главное фото/.test(blob))
  ) {
    evidence.push('own-profile-edit markers');
    return { type: 'own-profile-edit', confidence: 0.9, evidence };
  }

  if (
    hasDesc('profilePage-ProfileWidget-Avatar') ||
    has('profilePage-ProfileWidget-Avatar') ||
    (/режим путешествия|продвижения|суперлайки|тесты twinby/.test(blob) &&
      hasNav(ids, descs))
  ) {
    evidence.push('own-profile-hub markers');
    return { type: 'own-profile-hub', confidence: 0.85, evidence };
  }

  const hasVseLink = hasExactDesc('Все') || hasDesc('Все');
  const hasChatsSection =
    hasExactDesc('Чаты') ||
    /^чаты$/m.test(descs) ||
    /(?:^|\n)чаты(?:\n|$)/.test(blob);

  // Chat tab before likes: bottom-tab a11y is «Лайки\\nВкладка…», not title «Лайки»
  if (
    /новые пары/.test(blob) &&
    (hasVseLink || hasChatsSection || has('navigationBar-Chat')) &&
    !has('profileFeed-ProfileCard')
  ) {
    // Matches-only list: Новые пары + %/км rows, without «Все» / «Чаты»
    const looksLikeFullMatchesList =
      !hasVseLink &&
      !hasChatsSection &&
      (/\d{1,3}%/.test(blob) || /\d+\s*км/.test(blob));
    if (!looksLikeFullMatchesList) {
      evidence.push('chats markers');
      return { type: 'chats', confidence: 0.85, evidence };
    }
  }

  // Full matches list after «Все»
  if (
    /новые пары/.test(blob) &&
    (/\d{1,3}%/.test(blob) || /\d+\s*км/.test(blob)) &&
    !hasVseLink &&
    !hasChatsSection
  ) {
    evidence.push('matches-list markers');
    return { type: 'matches-list', confidence: 0.8, evidence };
  }

  // Likes tab: exact title «Лайки» (not bottom-tab a11y string)
  if (
    hasExactDesc('Лайки') &&
    hasNav(ids, descs) &&
    !has('profileFeed-ProfileCard')
  ) {
    evidence.push('likes tab markers');
    return { type: 'likes', confidence: 0.8, evidence };
  }

  // Opened profile (match / like / own preview): Name, age; often + Био
  if (
    descList.some((d) => /,\s*\d{2}\s*$/.test(d.trim())) &&
    !has('profileFeed-ProfileCard') &&
    !/мои фото|заполнен на|перетащите/.test(blob) &&
    !hasExactDesc('Лайки') &&
    !hasVseLink
  ) {
    if (/био/.test(blob) || !hasNav(ids, descs)) {
      evidence.push('profile-details markers');
      return { type: 'profile-details', confidence: 0.75, evidence };
    }
  }

  // 1:1 conversation (opened chat) — not the chats list / bottom-nav screen
  if (
    /был\(а\)|вопросы, чтобы стать/.test(blob) &&
    !has('profileFeed-ProfileCard') &&
    !hasExactDesc('Чаты') &&
    !hasVseLink
  ) {
    evidence.push('conversation markers');
    return { type: 'conversation', confidence: 0.8, evidence };
  }

  if (descs.includes('ошибка входа') || /email|войти|continue/.test(descs)) {
    if (!has('profileFeed-ProfileCard')) {
      evidence.push('login-like copy without feed card');
      return { type: 'login', confidence: 0.7, evidence };
    }
  }

  if (/нет анкет|no profiles|закончились/.test(descs)) {
    evidence.push('no-profiles text');
    return { type: 'no-profiles', confidence: 0.65, evidence };
  }

  if (/premium|подписк|twinby plus/.test(descs)) {
    evidence.push('premium keywords');
    return { type: 'premium-dialog', confidence: 0.55, evidence };
  }

  if (/это взаимно|совпаден|it's a match/.test(descs)) {
    evidence.push('match keywords');
    return { type: 'match-dialog', confidence: 0.55, evidence };
  }

  if (has('navigationBar-Feed') || descs.includes('navigationbar-feed')) {
    evidence.push('navigation present, feed card missing');
    return { type: 'unknown', confidence: 0.4, evidence };
  }

  return {
    type: 'unknown' satisfies TwinbyScreenType,
    confidence: 0.2,
    evidence: ['no known Twinby feed markers'],
  };
}

export function parseNameAgeFromDesc(desc: string): { name?: string; age?: number } {
  const cleaned = desc.replace(/\s+/g, ' ').trim();
  const match = cleaned.match(/^(.+?),\s*(\d{2})\s*$/);
  if (!match) {
    return {};
  }
  return { name: match[1]?.trim(), age: Number(match[2]) };
}

/** Screens where bottom tab bar is expected to be usable. */
export function isBottomNavScreen(type: TwinbyScreenType): boolean {
  return (
    type === 'feed' ||
    type === 'chats' ||
    type === 'likes' ||
    type === 'own-profile-hub' ||
    type === 'no-profiles'
  );
}
