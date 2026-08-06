import { isIgnoredTwinbyInterest } from './interests-filter';
import { extractContentDescNodes, type ContentDescNode } from './page-source-lists';
import { parseNameAgeFromDesc } from './screen-detector';

export interface OpenedProfileFields {
  displayName?: string;
  age?: number;
  city?: string;
  distanceKm?: number;
  goal?: string;
  bioSnippet?: string;
  compatibilityPercent?: number;
  interests: string[];
}

export interface BoundsRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const SKIP =
  /navigationBar|Вкладка|Фильтры|Тотем|Премиум|Т–Банк|Т-Банк|Пользователь еще не/i;
const GOAL_RE = /общение|отношен|дружб|без конкрет|серьёз|свидан/i;

/**
 * Parse opened Twinby profile (match / like / own preview) from page source.
 */
export function readOpenedProfileFromSource(pageSource: string): OpenedProfileFields {
  const nodes = extractContentDescNodes(pageSource);
  const interests: string[] = [];
  const result: OpenedProfileFields = { interests };
  let afterBio = false;

  for (const node of nodes) {
    const desc = node.desc.trim();
    if (!desc || SKIP.test(desc)) {
      continue;
    }

    if (desc === 'Био') {
      afterBio = true;
      continue;
    }

    if (afterBio && desc.length >= 4 && !/^(Финансы|Интересы|Работа)$/i.test(desc)) {
      result.bioSnippet = desc.replace(/\n/g, '\n').trim();
      afterBio = false;
      continue;
    }

    const nameAge = parseNameAgeFromDesc(desc);
    if (nameAge.name && !result.displayName) {
      result.displayName = nameAge.name;
      result.age = nameAge.age;
      continue;
    }

    if (/^\d+\s*км$/i.test(desc) && result.distanceKm == null) {
      result.distanceKm = Number(desc.replace(/[^\d]/g, ''));
      continue;
    }

    if (/^\d{1,3}%$/.test(desc) && result.compatibilityPercent == null) {
      result.compatibilityPercent = Number(desc.replace('%', ''));
      continue;
    }

    if (GOAL_RE.test(desc) && !result.goal) {
      result.goal = desc;
      continue;
    }

    if (
      /москва|санкт|екатеринбург|новосибир|казань|краснодар|ростов|сочи|минск/i.test(
        desc,
      ) &&
      !result.city
    ) {
      result.city = desc;
      continue;
    }

    if (
      desc.length >= 2 &&
      desc.length <= 28 &&
      !/\d/.test(desc) &&
      interests.length < 10 &&
      !interests.includes(desc) &&
      !isIgnoredTwinbyInterest(desc)
    ) {
      interests.push(desc);
    }
  }

  return result;
}

/**
 * Avatar ImageView in conversation header (dump 2026-08-07):
 * typically bounds [69,60][129,120] — not clickable itself; tap hits parent.
 * Do NOT use the % button for profile open (user: «сверху иконка профиля»).
 */
export function findConversationAvatarBounds(pageSource: string): BoundsRect | null {
  const candidates: BoundsRect[] = [];
  const re =
    /class="[^"]*ImageView"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"|bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"[^>]*class="[^"]*ImageView"/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(pageSource)) !== null) {
    const l = Number(match[1] ?? match[5]);
    const t = Number(match[2] ?? match[6]);
    const r = Number(match[3] ?? match[7]);
    const b = Number(match[4] ?? match[8]);
    const w = r - l;
    const h = b - t;
    if (t > 160 || b > 200) {
      continue;
    }
    if (l < 40 || l > 220) {
      continue;
    }
    if (w < 36 || w > 120 || h < 36 || h > 120) {
      continue;
    }
    candidates.push({ left: l, top: t, right: r, bottom: b });
  }
  if (candidates.length === 0) {
    return null;
  }
  candidates.sort((a, b) => a.left - b.left || a.top - b.top);
  return candidates[0]!;
}

/** Fallback: name+status strip (contains avatar visually on the left). */
export function findConversationNameHeader(pageSource: string): ContentDescNode | null {
  return (
    extractContentDescNodes(pageSource).find(
      (n) => n.clickable && n.top < 200 && /был\(а\)/i.test(n.desc),
    ) ?? null
  );
}

/** Prefer avatar bounds; % button is NOT the profile entry. */
export function findChatProfileHeader(pageSource: string): ContentDescNode | null {
  const avatar = findConversationAvatarBounds(pageSource);
  if (avatar) {
    return {
      desc: 'conversation-avatar',
      left: avatar.left,
      top: avatar.top,
      right: avatar.right,
      bottom: avatar.bottom,
      clickable: true,
    };
  }
  return findConversationNameHeader(pageSource);
}
