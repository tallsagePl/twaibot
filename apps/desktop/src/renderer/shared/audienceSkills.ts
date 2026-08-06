import type {
  AudienceDraftSignalInput,
  AudienceDraftUpdateInput,
  AudienceModelView,
  AudienceSignal,
} from '@twinby/contracts';

export type AudienceSkillGroup = 'important' | 'likes' | 'dislikes' | 'stops';

export type AudienceSkillsForm = {
  important: string[];
  likes: string[];
  dislikes: string[];
  stops: string[];
};

export const EMPTY_AUDIENCE_SKILLS: AudienceSkillsForm = {
  important: [],
  likes: [],
  dislikes: [],
  stops: [],
};

function statements(signals: AudienceSignal[]): string[] {
  return signals.map((s) => s.statement);
}

function sameSortedLists(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const left = [...a].map((s) => s.trim()).filter(Boolean).sort();
  const right = [...b].map((s) => s.trim()).filter(Boolean).sort();
  return left.every((value, index) => value === right[index]);
}

/** Map DB view → four UI skill groups. visual-core = important (✓). */
export function skillsFromAudienceView(aud: AudienceModelView): AudienceSkillsForm {
  return {
    important: statements(aud.visualCore),
    likes: statements(aud.positiveSignals),
    dislikes: statements(aud.negativeSignals),
    stops: statements(aud.hardRejects),
  };
}

export function audienceSkillsChanged(
  current: AudienceSkillsForm,
  next: AudienceSkillsForm,
): boolean {
  return (
    !sameSortedLists(current.important, next.important) ||
    !sameSortedLists(current.likes, next.likes) ||
    !sameSortedLists(current.dislikes, next.dislikes) ||
    !sameSortedLists(current.stops, next.stops)
  );
}

function slugKey(prefix: string, statement: string, index: number): string {
  const slug = statement
    .toLowerCase()
    .replace(/[^a-zа-яё0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return `${prefix}-${slug || index}`;
}

function toSignals(
  items: string[],
  polarity: AudienceDraftSignalInput['polarity'],
  category?: AudienceDraftSignalInput['category'],
): AudienceDraftSignalInput[] {
  return items
    .map((s) => s.trim())
    .filter(Boolean)
    .map((statement, index) => ({
      key: slugKey(polarity === 'hard-reject' ? 'stop' : polarity, statement, index),
      statement,
      polarity,
      category,
      status: 'claimed' as const,
      likelihood: 'possible' as const,
      confidence: 0.6,
      evidence: ['user'],
      contradictions: [],
      sourceRefs: ['orpheus-ui'],
    }));
}

function managedSignalIds(aud: AudienceModelView): string[] {
  return [
    ...aud.visualCore,
    ...aud.positiveSignals,
    ...aud.negativeSignals,
    ...aud.hardRejects,
  ].map((s) => s.id);
}

export function buildAudienceDraftUpdate(input: {
  codeName: string;
  summary: string;
  skills: AudienceSkillsForm;
  audience: AudienceModelView | null;
}): AudienceDraftUpdateInput {
  const removeSignalIds = input.audience ? managedSignalIds(input.audience) : [];
  return {
    codeName: input.codeName,
    summary: input.summary,
    removeSignalIds,
    addSignals: [
      ...toSignals(input.skills.important, 'positive', 'visual-core'),
      ...toSignals(input.skills.likes, 'positive'),
      ...toSignals(input.skills.dislikes, 'negative'),
      ...toSignals(input.skills.stops, 'hard-reject'),
    ],
  };
}

export function countAudienceSkills(skills: AudienceSkillsForm): number {
  return (
    skills.important.length +
    skills.likes.length +
    skills.dislikes.length +
    skills.stops.length
  );
}
