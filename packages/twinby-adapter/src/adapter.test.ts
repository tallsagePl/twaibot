import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ActionRateLimiter } from './action-rate-limiter';
import {
  bioFingerprintFromText,
  buildCompositeFingerprint,
} from './composite-identity';
import { findConversationAvatarBounds, readOpenedProfileFromSource } from './opened-profile';
import {
  parseChatListRows,
  parseIncomingLikeCards,
  parseMatchListRows,
  parseOwnProfileEdit,
} from './page-source-lists';
import { readVisibleProfileFromSource } from './profile-preview';
import { detectScreenFromPageSource, parseNameAgeFromDesc } from './screen-detector';

function discoveryXml(stem: string): string | null {
  const candidates = [
    join(process.cwd(), 'data', 'discovery', `${stem}.xml`),
    join(process.cwd(), '..', '..', 'data', 'discovery', `${stem}.xml`),
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      return readFileSync(p, 'utf8');
    }
  }
  return null;
}

const FEED_XML = `
<node resource-id="profileFeed-ProfileCard" content-desc="id&#10;Москва&#10;24 км"/>
<node resource-id="profileFeed-Button-Like"/>
<node resource-id="profileFeed-Button-Dislike"/>
`;

const REAL_FEED_SNIPPET = `
<node resource-id="profileFeed-ProfileCard" content-desc="1061633748016431114&#10;Москва&#10;24 км&#10;Рыбы&#10;161 см"/>
<node content-desc="Настасья, 23 "/>
<node content-desc="Финансы"/>
<node content-desc="Работа"/>
<node resource-id="profileFeed-Button-Compatibility" content-desc="profileFeed-Button-Compatibility&#10;89%"/>
<node resource-id="profileFeed-Button-Like"/>
<node resource-id="profileFeed-Button-Dislike"/>
`;

describe('detectScreenFromPageSource', () => {
  it('detects feed from discovered ids', () => {
    const screen = detectScreenFromPageSource(FEED_XML);
    expect(screen.type).toBe('feed');
    expect(screen.confidence).toBeGreaterThan(0.8);
  });

  it('returns unknown without markers', () => {
    expect(detectScreenFromPageSource('<node/>').type).toBe('unknown');
  });
});

describe('parseNameAgeFromDesc', () => {
  it('parses name and age', () => {
    expect(parseNameAgeFromDesc('Настасья, 23 ')).toEqual({
      name: 'Настасья',
      age: 23,
    });
  });
});

describe('readVisibleProfileFromSource', () => {
  it('reads name, distance, interests, compatibility from feed face', () => {
    const preview = readVisibleProfileFromSource(REAL_FEED_SNIPPET);
    expect(preview.displayName).toBe('Настасья');
    expect(preview.age).toBe(23);
    expect(preview.distanceKm).toBe(24);
    expect(preview.city).toBe('Москва');
    expect(preview.compatibilityPercent).toBe(89);
    expect(preview.interests).toEqual(expect.arrayContaining(['Работа']));
    expect(preview.interests).not.toContain('Финансы');
    expect(preview.bioVisibleOnFace).toBe(false);
  });

  it('parses real discovery XML when present', () => {
    const xmlPath = join(
      process.cwd(),
      '..',
      '..',
      'data',
      'discovery',
      'twinby-2026-07-30T12-00-24-785Z.xml',
    );
    let xml: string;
    try {
      xml = readFileSync(xmlPath, 'utf8');
    } catch {
      return;
    }
    const screen = detectScreenFromPageSource(xml);
    expect(screen.type).toBe('feed');
    const preview = readVisibleProfileFromSource(xml);
    expect(preview.displayName).toBe('Настасья');
    expect(preview.age).toBe(23);
  });
});

describe('discovery dumps 2026-08-07', () => {
  it('detects chats / matches / likes / own profile screens', () => {
    const cases: Array<[string, string]> = [
      ['twinby-2026-08-07T11-48-02-978Z', 'chats'],
      ['twinby-2026-08-07T11-49-08-509Z', 'matches-list'],
      ['twinby-2026-08-07T11-51-01-048Z', 'likes'],
      ['twinby-2026-08-07T11-52-10-474Z', 'own-profile-hub'],
      ['twinby-2026-08-07T11-52-27-284Z', 'own-profile-edit'],
    ];
    for (const [stem, type] of cases) {
      const xml = discoveryXml(stem);
      if (!xml) {
        return;
      }
      expect(detectScreenFromPageSource(xml).type, stem).toBe(type);
    }
  });

  it('parses chat rows skipping Twinby system', () => {
    const xml = discoveryXml('twinby-2026-08-07T11-48-02-978Z');
    if (!xml) {
      return;
    }
    const rows = parseChatListRows(xml);
    expect(rows.some((r) => r.isSystem && r.name === 'Twinby')).toBe(true);
    const human = rows.filter((r) => !r.isSystem);
    expect(human[0]?.name).toBe('Виктория');
    expect(human.length).toBeGreaterThanOrEqual(5);
  });

  it('parses matches and likes cards', () => {
    const matchesXml = discoveryXml('twinby-2026-08-07T11-49-08-509Z');
    const likesXml = discoveryXml('twinby-2026-08-07T11-51-01-048Z');
    if (!matchesXml || !likesXml) {
      return;
    }
    const matches = parseMatchListRows(matchesXml);
    expect(matches.map((m) => m.name)).toEqual(
      expect.arrayContaining(['Алина', 'Анна', 'Анастасия']),
    );
    expect(matches.find((m) => m.name === 'Алина')?.isNew).toBe(true);

    const likes = parseIncomingLikeCards(likesXml);
    expect(likes[0]?.name).toBe('Валентина');
    expect(likes[0]?.age).toBe(24);
  });

  it('parses own profile edit bio and photo slots', () => {
    const xml = discoveryXml('twinby-2026-08-07T11-52-27-284Z');
    if (!xml) {
      return;
    }
    const parsed = parseOwnProfileEdit(xml);
    expect(parsed.bio).toMatch(/nerdy/i);
    expect(parsed.fillPercent).toBe(56);
    expect(parsed.photos.some((p) => p.position === 0 && p.label === 'Главное фото')).toBe(
      true,
    );
    expect(parsed.photos.map((p) => p.position).sort((a, b) => a - b)).toEqual([
      0, 1, 2, 3, 4,
    ]);
  });

  it('reads opened match profile and builds composite fingerprint', () => {
    const xml = discoveryXml('twinby-2026-08-07T12-55-12-414Z');
    if (!xml) {
      return;
    }
    const opened = readOpenedProfileFromSource(xml);
    expect(opened.displayName).toBe('Алина');
    expect(opened.age).toBe(20);
    expect(opened.bioSnippet).toMatch(/диджей/i);
    const fp = buildCompositeFingerprint({
      name: opened.displayName,
      age: opened.age,
      primaryPhotoHash: 'abc',
      bioFingerprint: bioFingerprintFromText(opened.bioSnippet ?? ''),
    });
    expect(fp.startsWith('cid:')).toBe(true);
    expect(fp).not.toBe(buildCompositeFingerprint({ name: 'Алина' }));
  });

  it('finds conversation avatar ImageView bounds', () => {
    const xml = discoveryXml('twinby-2026-08-07T12-54-50-918Z');
    if (!xml) {
      return;
    }
    const avatar = findConversationAvatarBounds(xml);
    expect(avatar).toEqual({ left: 69, top: 60, right: 129, bottom: 120 });
  });
});

describe('ActionRateLimiter', () => {
  it('blocks faster than min interval', () => {
    const limiter = new ActionRateLimiter({
      maxActionsPerMinute: 8,
      minActionIntervalMs: 5000,
    });
    expect(limiter.canAct(1000)).toBe(true);
    limiter.recordAction(1000);
    expect(limiter.canAct(2000)).toBe(false);
    expect(limiter.canAct(6000)).toBe(true);
  });

  it('enforces max per minute', () => {
    const limiter = new ActionRateLimiter({
      maxActionsPerMinute: 2,
      minActionIntervalMs: 0,
    });
    limiter.recordAction(1000);
    limiter.recordAction(1100);
    expect(limiter.canAct(1200)).toBe(false);
    expect(limiter.canAct(1000 + 60_000)).toBe(true);
  });
});
