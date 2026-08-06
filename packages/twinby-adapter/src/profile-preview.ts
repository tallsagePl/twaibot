import type { TwinbyProfilePreview } from '@twinby/contracts';
import { isIgnoredTwinbyInterest } from './interests-filter';
import { extractContentDescs, parseNameAgeFromDesc } from './screen-detector';

const SKIP_DESC =
  /navigationBar|Вкладка|Фильтры|profileFeed-Button|Чат|Лайки|Анкеты|Игры|Профиль/i;

const GOAL_RE = /общение|отношен|дружб|без конкрет|серьёз|свидан/i;

/**
 * Parse visible Twinby feed fields from page source (no taps).
 * Full bio usually needs details scroll — stage 9 + requireBio.
 */
export function readVisibleProfileFromSource(pageSource: string): TwinbyProfilePreview {
  const descs = extractContentDescs(pageSource);
  const interests: string[] = [];
  const otherVisibleText: string[] = [];
  const preview: TwinbyProfilePreview = {
    interests,
    otherVisibleText,
    bioVisibleOnFace: false,
  };

  for (const desc of descs) {
    if (SKIP_DESC.test(desc) && !desc.includes('%')) {
      continue;
    }

    const nameAge = parseNameAgeFromDesc(desc);
    if (nameAge.name && !preview.displayName) {
      preview.displayName = nameAge.name;
      preview.age = nameAge.age;
      continue;
    }

    if (desc.includes('%') && /Compatibility|profileFeed-Button-Compatibility/i.test(desc)) {
      const compat = desc.match(/(\d{1,3})\s*%/);
      if (compat) {
        preview.compatibilityPercent = Number(compat[1]);
      }
      continue;
    }

    if (desc.includes('\n')) {
      const parts = desc
        .split('\n')
        .map((p) => p.trim())
        .filter(Boolean);
      for (const part of parts) {
        if (/^\d+$/.test(part) && part.length > 8) {
          continue;
        }
        const distance = part.match(/^(\d+)\s*км$/i);
        if (distance && preview.distanceKm == null) {
          preview.distanceKm = Number(distance[1]);
          continue;
        }
        if (GOAL_RE.test(part) && !preview.goal) {
          preview.goal = part;
          continue;
        }
        if (
          /москва|санкт|екатеринбург|новосибир|казань|краснодар|ростов|сочи|минск/i.test(part) &&
          !preview.city
        ) {
          preview.city = part;
          continue;
        }
        if (/см$|рыбы|овен|телец|близнец|рак|лев|дева|весы|скорпион|стрелец|козерог|водолей/i.test(part)) {
          if (!otherVisibleText.includes(part)) {
            otherVisibleText.push(part);
          }
          continue;
        }
        if (part.length > 40 && !preview.bioSnippet) {
          preview.bioSnippet = part;
          preview.bioVisibleOnFace = true;
        }
      }
      continue;
    }

    if (
      desc.length >= 2 &&
      desc.length <= 32 &&
      !/\d+\s*км/i.test(desc) &&
      !/,\s*\d{2}/.test(desc) &&
      !SKIP_DESC.test(desc) &&
      !isIgnoredTwinbyInterest(desc)
    ) {
      if (!interests.includes(desc) && interests.length < 12) {
        interests.push(desc);
      }
    }
  }

  return preview;
}
