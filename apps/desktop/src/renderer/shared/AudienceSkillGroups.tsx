import {
  countAudienceSkills,
  skillsFromAudienceView,
  type AudienceSkillsForm,
} from './audienceSkills';
import type { AudienceModelView } from '@twinby/contracts';
import type { ReactNode } from 'react';
import {
  SignalCheckIcon,
  SignalMinusIcon,
  SignalPlusIcon,
  SignalStopIcon,
} from './SignalIcons';
import { SignalScale } from './SignalScale';

const GROUPS: Array<{
  key: keyof AudienceSkillsForm;
  title: string;
  chipClassName: string;
  iconClassName: string;
  icon: ReactNode;
}> = [
  {
    key: 'important',
    title: 'Что особенно важно',
    chipClassName: 'tag-chip--important',
    iconClassName: 'signal-icon--important',
    icon: <SignalCheckIcon />,
  },
  {
    key: 'likes',
    title: 'Кто нравится',
    chipClassName: 'tag-chip--like',
    iconClassName: 'signal-icon--like',
    icon: <SignalPlusIcon />,
  },
  {
    key: 'dislikes',
    title: 'Кто не нравится',
    chipClassName: 'tag-chip--neg',
    iconClassName: 'signal-icon--neg',
    icon: <SignalMinusIcon />,
  },
  {
    key: 'stops',
    title: 'Стоп-сигналы',
    chipClassName: 'tag-chip--hard',
    iconClassName: 'signal-icon--hard',
    icon: <SignalStopIcon />,
  },
];

export function AudienceSkillGroups({
  audience,
}: {
  audience: AudienceModelView;
}) {
  const skills = skillsFromAudienceView(audience);
  if (countAudienceSkills(skills) === 0) {
    return <p className="muted">Сигналы не заданы.</p>;
  }

  return (
    <SignalScale>
      {GROUPS.map((group) => {
        const tags = skills[group.key];
        if (tags.length === 0) return null;
        return (
          <div key={group.key} className="signal-group">
            <div className="signal-group__title">
              <span className={`signal-icon ${group.iconClassName}`}>
                {group.icon}
              </span>
              {group.title}
              <span className="muted"> · {tags.length}</span>
            </div>
            <ul className="tag-chips">
              {tags.map((tag) => (
                <li key={tag} className={`tag-chip ${group.chipClassName}`}>
                  <span className={`signal-icon signal-icon--chip ${group.iconClassName}`}>
                    {group.icon}
                  </span>
                  <span>{tag}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </SignalScale>
  );
}
