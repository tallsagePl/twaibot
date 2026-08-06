import { buildCompositeFingerprint } from './composite-identity';
import { parseNameAgeFromDesc } from './screen-detector';

export interface ContentDescNode {
  desc: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
  clickable: boolean;
}

export interface ChatListRow {
  name: string;
  lastMessage?: string;
  date?: string;
  isSystem: boolean;
  identityFingerprint: string;
  bounds: { left: number; top: number; right: number; bottom: number };
}

export interface MatchListRow {
  name: string;
  compatibilityPercent?: number;
  distanceKm?: number;
  isNew: boolean;
  identityFingerprint: string;
  bounds: { left: number; top: number; right: number; bottom: number };
}

export interface IncomingLikeCard {
  name: string;
  age?: number;
  compatibilityPercent?: number;
  identityFingerprint: string;
  bounds: { left: number; top: number; right: number; bottom: number };
}

export interface OwnProfilePhotoSlot {
  /** 0 = Главное фото; иначе номер слота из content-desc */
  position: number;
  label: string;
  bounds: { left: number; top: number; width: number; height: number };
}

export interface OwnProfileEditParse {
  bio: string;
  financeLine?: string;
  fillPercent?: number;
  photos: OwnProfilePhotoSlot[];
}

const SYSTEM_CHAT_NAMES = /^(twinby)$/i;

function decodeDesc(raw: string): string {
  return raw
    .replace(/&#10;/g, '\n')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\u00a0/g, ' ');
}

/** Stable id until Twinby exposes numeric profile id on list screens. */
export function fingerprintFromName(name: string): string {
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N} _-]/gu, '');
  return `name:${normalized || 'unknown'}`;
}

export function extractContentDescNodes(pageSource: string): ContentDescNode[] {
  const nodes: ContentDescNode[] = [];
  const re =
    /<[^>]*content-desc="([^"]+)"[^>]*>/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(pageSource)) !== null) {
    const tag = match[0];
    const desc = decodeDesc(match[1] ?? '').trim();
    if (!desc) {
      continue;
    }
    const bd = tag.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
    if (!bd) {
      continue;
    }
    const clickable = /clickable="true"/.test(tag);
    nodes.push({
      desc,
      left: Number(bd[1]),
      top: Number(bd[2]),
      right: Number(bd[3]),
      bottom: Number(bd[4]),
      clickable,
    });
  }
  return nodes;
}

/**
 * Chat tab rows: `Name | last message | date`. Skip Twinby system row.
 * Horizontal «Новые пары» avatars (name-only) are ignored.
 */
export function parseChatListRows(pageSource: string): ChatListRow[] {
  const rows: ChatListRow[] = [];
  for (const node of extractContentDescNodes(pageSource)) {
    if (!node.clickable) {
      continue;
    }
    const parts = node.desc
      .split('\n')
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length < 2) {
      continue;
    }
    // Skip tab bar / nav
    if (/вкладка|navigationBar/i.test(node.desc)) {
      continue;
    }
    const name = parts[0]!.replace(/\s+$/, '').trim();
    if (!name || name === 'Все' || name === 'Новые пары') {
      continue;
    }
    // Match row style has % — not a chat row
    if (parts.some((p) => /^\d{1,3}%$/.test(p))) {
      continue;
    }
    const date = parts.find((p) => /^\d{2}\.\d{2}\.\d{4}$/.test(p));
    const lastMessage = parts.find(
      (p) => p !== name && p !== date && !/^\d{1,3}%$/.test(p),
    );
    // Require date OR message-like middle part spanning full width-ish row
    if (!date && parts.length < 2) {
      continue;
    }
    const width = node.right - node.left;
    if (width < 400) {
      continue;
    }
    rows.push({
      name,
      lastMessage,
      date,
      isSystem: SYSTEM_CHAT_NAMES.test(name),
      identityFingerprint: fingerprintFromName(name),
      bounds: {
        left: node.left,
        top: node.top,
        right: node.right,
        bottom: node.bottom,
      },
    });
  }
  // Prefer unique names keeping first (list order = recent)
  const seen = new Set<string>();
  return rows.filter((r) => {
    if (seen.has(r.identityFingerprint)) {
      return false;
    }
    seen.add(r.identityFingerprint);
    return true;
  });
}

/** Matches list after «Все»: `Name | N% | N км` (optional «Ранее»). */
export function parseMatchListRows(pageSource: string): MatchListRow[] {
  const rows: MatchListRow[] = [];
  for (const node of extractContentDescNodes(pageSource)) {
    if (!node.clickable) {
      continue;
    }
    const parts = node.desc
      .split('\n')
      .map((p) => p.trim())
      .filter(Boolean);
    const pct = parts.find((p) => /^\d{1,3}%$/.test(p));
    const km = parts.find((p) => /^\d+\s*км$/i.test(p));
    if (!pct && !km) {
      continue;
    }
    const isNew = parts.some((p) => /^ранее$/i.test(p));
    const namePart = parts.find(
      (p) =>
        !/^ранее$/i.test(p) &&
        !/^\d{1,3}%$/.test(p) &&
        !/^\d+\s*км$/i.test(p) &&
        !/вкладка|navigationBar/i.test(p),
    );
    if (!namePart) {
      continue;
    }
    const name = namePart.replace(/\s+$/, '').trim();
    rows.push({
      name,
      compatibilityPercent: pct ? Number(pct.replace('%', '')) : undefined,
      distanceKm: km ? Number(km.replace(/[^\d]/g, '')) : undefined,
      isNew,
      identityFingerprint: fingerprintFromName(name),
      bounds: {
        left: node.left,
        top: node.top,
        right: node.right,
        bottom: node.bottom,
      },
    });
  }
  const seen = new Set<string>();
  return rows.filter((r) => {
    if (seen.has(r.identityFingerprint)) {
      return false;
    }
    seen.add(r.identityFingerprint);
    return true;
  });
}

/** Likes grid cards: `N% | Name, age`. */
export function parseIncomingLikeCards(pageSource: string): IncomingLikeCard[] {
  const cards: IncomingLikeCard[] = [];
  for (const node of extractContentDescNodes(pageSource)) {
    if (!node.clickable) {
      continue;
    }
    if (/вкладка|navigationBar/i.test(node.desc)) {
      continue;
    }
    const parts = node.desc
      .split('\n')
      .map((p) => p.trim())
      .filter(Boolean);
    const pct = parts.find((p) => /^\d{1,3}%$/.test(p));
    const nameLine = parts.find((p) => /,\s*\d{2}\s*$/.test(p));
    if (!nameLine) {
      continue;
    }
    const { name, age } = parseNameAgeFromDesc(nameLine);
    if (!name) {
      continue;
    }
    cards.push({
      name,
      age,
      compatibilityPercent: pct ? Number(pct.replace('%', '')) : undefined,
      identityFingerprint: buildCompositeFingerprint({ name, age }),
      bounds: {
        left: node.left,
        top: node.top,
        right: node.right,
        bottom: node.bottom,
      },
    });
  }
  const seen = new Set<string>();
  return cards.filter((c) => {
    if (seen.has(c.identityFingerprint)) {
      return false;
    }
    seen.add(c.identityFingerprint);
    return true;
  });
}

/**
 * Own profile edit screen: photo slots + bio content-desc under «Био».
 */
export function parseOwnProfileEdit(pageSource: string): OwnProfileEditParse {
  const nodes = extractContentDescNodes(pageSource);
  const photos: OwnProfilePhotoSlot[] = [];
  let bio = '';
  let financeLine: string | undefined;
  let fillPercent: number | undefined;
  let sawBioLabel = false;
  let sawFinanceLabel = false;

  for (const node of nodes) {
    const desc = node.desc.trim();
    const fill = desc.match(/заполнен на\s*(\d+)\s*%/i);
    if (fill) {
      fillPercent = Number(fill[1]);
    }

    if (desc === 'Главное фото' && node.clickable) {
      photos.push({
        position: 0,
        label: desc,
        bounds: {
          left: node.left,
          top: node.top,
          width: node.right - node.left,
          height: node.bottom - node.top,
        },
      });
      continue;
    }

    if (/^\d+$/.test(desc) && node.clickable && Number(desc) >= 1 && Number(desc) <= 12) {
      const n = Number(desc);
      photos.push({
        position: n,
        label: desc,
        bounds: {
          left: node.left,
          top: node.top,
          width: node.right - node.left,
          height: node.bottom - node.top,
        },
      });
      continue;
    }

    if (desc === 'Био') {
      sawBioLabel = true;
      continue;
    }
    if (sawBioLabel && node.clickable && desc.length > 8 && !bio) {
      bio = desc.replace(/\n/g, '\n').trim();
      sawBioLabel = false;
      continue;
    }

    if (desc === 'Финансы') {
      sawFinanceLabel = true;
      continue;
    }
    if (sawFinanceLabel && node.clickable && desc.length > 2 && !financeLine) {
      financeLine = desc.replace(/\n/g, ' · ').trim();
      sawFinanceLabel = false;
    }
  }

  photos.sort((a, b) => a.position - b.position);
  return { bio, financeLine, fillPercent, photos };
}
