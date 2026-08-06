import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { extname, join } from 'node:path';
import { ensureAppDirectories, resolveAppPaths } from '@twinby/config';
import {
  clearSessionHasDetail,
  deleteHistoryProfileDetailsForSession,
  insertHistoryProfileDetail,
  listDetailedSessionIds,
  type AppDatabase,
} from '@twinby/database';

export function getHistoryRoot(projectRoot: string): string {
  const paths = resolveAppPaths({ projectRoot });
  ensureAppDirectories(paths);
  return paths.history;
}

/** Drop media + DB detail for one session (keeps lite history_events). */
export function purgeSessionDetail(
  db: AppDatabase,
  historyRoot: string,
  sessionId: string,
): void {
  deleteHistoryProfileDetailsForSession(db, sessionId);
  clearSessionHasDetail(db, sessionId);
  const dir = join(historyRoot, sessionId);
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Drop media + DB detail rows for any previous detailed session. */
export function purgePreviousDetailedSessions(
  db: AppDatabase,
  historyRoot: string,
  exceptSessionId?: string,
): void {
  const ids = listDetailedSessionIds(db).filter((id) => id !== exceptSessionId);
  for (const sessionId of ids) {
    purgeSessionDetail(db, historyRoot, sessionId);
  }
}

export function wipeAllHistoryFiles(historyRoot: string): void {
  if (existsSync(historyRoot)) {
    rmSync(historyRoot, { recursive: true, force: true });
  }
  mkdirSync(historyRoot, { recursive: true });
}

function mimeFromExt(ext: string): string {
  const e = ext.toLowerCase();
  if (e === '.png') return 'image/png';
  if (e === '.webp') return 'image/webp';
  return 'image/jpeg';
}

export function photoPathsToDataUrls(paths: string[]): string[] {
  const out: string[] = [];
  for (const path of paths.slice(0, 3)) {
    if (!existsSync(path)) {
      continue;
    }
    try {
      const buf = readFileSync(path);
      const mime = mimeFromExt(extname(path));
      out.push(`data:${mime};base64,${buf.toString('base64')}`);
    } catch {
      // skip unreadable
    }
  }
  return out;
}

const VISIBILITY_RU: Record<string, string> = {
  clear: 'чётко',
  partial: 'частично',
  none: 'нет',
  unclear: 'неясно',
};

const BODY_TYPE_RU: Record<string, string> = {
  petite: 'хрупкое',
  slim: 'стройное',
  average: 'среднее',
  curvy: 'пышное',
  athletic: 'спортивное',
  plus: 'полное',
  unknown: '',
};

function visibilityRu(value?: string): string {
  if (!value) {
    return '?';
  }
  return VISIBILITY_RU[value] ?? value;
}

function bodyTypeRu(value?: string): string {
  if (!value || value === 'unknown') {
    return '';
  }
  return BODY_TYPE_RU[value] ?? value;
}

function joinList(items: string[] | undefined, limit = 12): string {
  return (items ?? [])
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, limit)
    .join(', ');
}

/**
 * Full AI description for expanded history review (not a short excerpt).
 * Keeps evidence + decision layers so the user can agree/correct with context.
 */
export function buildModelDescription(
  reasons: string[],
  aiRawJson?: string,
): string {
  const blocks: string[] = [];
  if (aiRawJson) {
    try {
      const raw = JSON.parse(aiRawJson) as {
        pipeline?: string;
        evidence?: {
          observations?: {
            faceVisibility?: string;
            bodyVisibility?: string;
            bodyTypeHint?: string;
            photoTypes?: string[];
            presentation?: string[];
            bioSignals?: string[];
            notableVisual?: string[];
          };
          uncertainties?: string[];
          evidenceCompleteness?: number;
        };
        decision?: {
          action?: string;
          overallScore?: number;
          confidence?: number;
          shortReason?: string;
          matchedPreferences?: string[];
          concerns?: string[];
          uncertainties?: string[];
          breakdown?: {
            visualFit?: number | null;
            presentationFit?: number | null;
            bioFit?: number | null;
            interestsFit?: number | null;
            compatibilityFit?: number | null;
            distanceFit?: number | null;
          };
        };
        shortReason?: string;
        overallScore?: number;
        confidence?: number;
        matchedPreferences?: string[];
        concerns?: string[];
        uncertainties?: string[];
        reasons?: string[];
        rationale?: string;
        explanation?: string;
      };

      if (raw.pipeline === 'two-stage' && raw.evidence?.observations) {
        const o = raw.evidence.observations;
        const bodyHint = bodyTypeRu(o.bodyTypeHint);
        const sawBits = [
          `лицо ${visibilityRu(o.faceVisibility)}`,
          `тело ${visibilityRu(o.bodyVisibility)}${bodyHint ? ` (${bodyHint})` : ''}`,
        ];
        const notable = joinList(o.notableVisual);
        if (notable) sawBits.push(notable);
        blocks.push(`Что увидела: ${sawBits.join('; ')}.`);

        const photoTypes = joinList(o.photoTypes);
        if (photoTypes) blocks.push(`Типы кадров: ${photoTypes}.`);

        const presentation = joinList(o.presentation);
        if (presentation) blocks.push(`Подача: ${presentation}.`);

        const bioSignals = joinList(o.bioSignals);
        if (bioSignals) blocks.push(`Сигналы из текста: ${bioSignals}.`);

        const evidenceGaps = (raw.evidence.uncertainties ?? [])
          .map((u) => u.trim())
          .filter((u) => u && !/bio|interest|candidate-\d+/i.test(u));
        if (evidenceGaps.length) {
          blocks.push(`Сомнения по фото: ${evidenceGaps.join('; ')}.`);
        }

        const decision = raw.decision;
        if (decision) {
          const matched = joinList(decision.matchedPreferences);
          if (matched) blocks.push(`Совпало с предпочтениями: ${matched}.`);

          const concerns = joinList(decision.concerns);
          if (concerns) blocks.push(`Минусы / риски: ${concerns}.`);

          const decisionGaps = (decision.uncertainties ?? [])
            .map((u) => u.trim())
            .filter(Boolean);
          if (decisionGaps.length) {
            blocks.push(`Неуверенность решения: ${decisionGaps.join('; ')}.`);
          }

          const scoreBits: string[] = [];
          if (typeof decision.overallScore === 'number') {
            scoreBits.push(`оценка ${Math.round(decision.overallScore)}`);
          }
          if (typeof decision.confidence === 'number') {
            scoreBits.push(`уверенность ${Math.round(decision.confidence * 100)}%`);
          }
          const b = decision.breakdown;
          if (b) {
            const fits = [
              b.visualFit != null ? `visual ${Math.round(b.visualFit)}` : '',
              b.presentationFit != null
                ? `подача ${Math.round(b.presentationFit)}`
                : '',
              b.bioFit != null ? `bio ${Math.round(b.bioFit)}` : '',
              b.interestsFit != null
                ? `интересы ${Math.round(b.interestsFit)}`
                : '',
            ].filter(Boolean);
            if (fits.length) scoreBits.push(fits.join(', '));
          }
          if (scoreBits.length) {
            blocks.push(`Цифры: ${scoreBits.join(' · ')}.`);
          }

          if (decision.shortReason?.trim()) {
            blocks.push(`Вывод: ${decision.shortReason.trim()}`);
          }
        }
      } else {
        const matched = joinList(raw.matchedPreferences);
        if (matched) blocks.push(`Совпало с предпочтениями: ${matched}.`);
        const concerns = joinList(raw.concerns);
        if (concerns) blocks.push(`Минусы / риски: ${concerns}.`);
        const gaps = joinList(raw.uncertainties);
        if (gaps) blocks.push(`Неуверенность: ${gaps}.`);
        if (Array.isArray(raw.reasons) && raw.reasons.length > 0) {
          blocks.push(...raw.reasons.map((r) => r.trim()).filter(Boolean));
        }
        const text =
          raw.shortReason ?? raw.rationale ?? raw.explanation ?? '';
        if (text.trim()) {
          blocks.push(`Вывод: ${String(text).trim()}`);
        }
        if (typeof raw.overallScore === 'number' || typeof raw.confidence === 'number') {
          const scoreBits: string[] = [];
          if (typeof raw.overallScore === 'number') {
            scoreBits.push(`оценка ${Math.round(raw.overallScore)}`);
          }
          if (typeof raw.confidence === 'number') {
            scoreBits.push(`уверенность ${Math.round(raw.confidence * 100)}%`);
          }
          blocks.push(`Цифры: ${scoreBits.join(' · ')}.`);
        }
      }
    } catch {
      // fall through to reasons
    }
  }
  if (blocks.length === 0 && reasons.length > 0) {
    blocks.push(...reasons.map((r) => r.trim()).filter(Boolean));
  }
  if (blocks.length === 0 && aiRawJson) {
    return aiRawJson.slice(0, 4000);
  }
  return blocks.join('\n').slice(0, 4000);
}

/** @deprecated Use buildModelDescription — kept for call-site compatibility. */
export function buildModelExcerpt(reasons: string[], aiRawJson?: string): string {
  return buildModelDescription(reasons, aiRawJson);
}

/** Rebuild full description from on-disk ai-raw.json when available. */
export function resolveModelDescription(input: {
  historyRoot: string;
  sessionId: string;
  eventId: string;
  reasons?: string[];
  fallbackExcerpt?: string;
}): string | undefined {
  const rawPath = join(
    input.historyRoot,
    input.sessionId,
    input.eventId,
    'ai-raw.json',
  );
  if (existsSync(rawPath)) {
    try {
      const aiRawJson = readFileSync(rawPath, 'utf8');
      const rebuilt = buildModelDescription(input.reasons ?? [], aiRawJson);
      if (rebuilt.trim()) {
        return rebuilt;
      }
    } catch {
      // fall back
    }
  }
  return input.fallbackExcerpt;
}

export function buildProfileText(input: {
  displayName?: string;
  age?: number;
  bio?: string;
  interests?: string[];
  relationshipGoal?: string;
  distanceKm?: number;
}): string {
  const parts: string[] = [];
  if (input.displayName) {
    parts.push(
      input.age != null ? `${input.displayName}, ${input.age}` : input.displayName,
    );
  } else if (input.age != null) {
    parts.push(`Возраст ${input.age}`);
  }
  if (input.distanceKm != null) {
    parts.push(`${input.distanceKm} км`);
  }
  if (input.relationshipGoal) {
    parts.push(`Цель: ${input.relationshipGoal}`);
  }
  if (input.bio) {
    parts.push(input.bio);
  }
  const interests = (input.interests ?? []).filter(
    (item) =>
      item.trim() &&
      !/^(финансы|finance|finances|деньги|зарплата|доход|инвестиции|бюджет|капитал)$/i.test(
        item.trim(),
      ),
  );
  if (interests.length > 0) {
    parts.push(`Интересы: ${interests.join(', ')}`);
  }
  return parts.join('\n').slice(0, 2000);
}

function copyPhotosToDetailDir(
  destDir: string,
  sourcePaths: string[],
  dataUrls: string[] = [],
): string[] {
  mkdirSync(destDir, { recursive: true });
  const saved: string[] = [];
  const fromPaths = sourcePaths.filter((p) => p && existsSync(p)).slice(0, 3);
  for (let i = 0; i < fromPaths.length; i += 1) {
    const src = fromPaths[i]!;
    const ext = extname(src) || '.jpg';
    const dest = join(destDir, `photo-${i}${ext}`);
    copyFileSync(src, dest);
    saved.push(dest);
  }
  if (saved.length >= 3) {
    return saved;
  }
  for (let i = 0; i < dataUrls.length && saved.length < 3; i += 1) {
    const url = dataUrls[i]!;
    const match = /^data:(image\/[a-zA-Z+]+);base64,(.+)$/.exec(url);
    if (!match) {
      continue;
    }
    const mime = match[1]!;
    const ext = mime.includes('png') ? '.png' : mime.includes('webp') ? '.webp' : '.jpg';
    const dest = join(destDir, `photo-${saved.length}${ext}`);
    writeFileSync(dest, Buffer.from(match[2]!, 'base64'));
    saved.push(dest);
  }
  return saved;
}

export function persistProfileDetail(input: {
  db: AppDatabase;
  historyRoot: string;
  historyEventId: string;
  sessionId: string;
  displayName?: string;
  bio?: string;
  age?: number;
  interests?: string[];
  relationshipGoal?: string;
  distanceKm?: number;
  modelDecision?: string;
  modelReasons: string[];
  aiRawJson?: string;
  sourcePhotoPaths?: string[];
  photoDataUrls?: string[];
}): void {
  const destDir = join(input.historyRoot, input.sessionId, input.historyEventId);
  const photoPaths = copyPhotosToDetailDir(
    destDir,
    input.sourcePhotoPaths ?? [],
    input.photoDataUrls ?? [],
  );
  if (input.aiRawJson?.trim()) {
    writeFileSync(join(destDir, 'ai-raw.json'), input.aiRawJson, 'utf8');
  }
  insertHistoryProfileDetail(input.db, {
    historyEventId: input.historyEventId,
    sessionId: input.sessionId,
    displayName: input.displayName,
    bio: input.bio,
    profileText: buildProfileText({
      displayName: input.displayName,
      age: input.age,
      bio: input.bio,
      interests: input.interests,
      relationshipGoal: input.relationshipGoal,
      distanceKm: input.distanceKm,
    }),
    modelDecision: input.modelDecision,
    modelExcerpt: buildModelDescription(input.modelReasons, input.aiRawJson),
    photoPaths,
  });
}
