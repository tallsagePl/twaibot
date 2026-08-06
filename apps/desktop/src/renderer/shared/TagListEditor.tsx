import { useState, type KeyboardEvent, type ReactNode } from 'react';

export function TagListEditor({
  label,
  hint,
  tags,
  placeholder,
  disabled,
  chipClassName,
  icon,
  iconClassName,
  onChange,
}: {
  label: string;
  hint?: string;
  tags: string[];
  placeholder: string;
  disabled?: boolean;
  chipClassName?: string;
  icon?: ReactNode;
  iconClassName?: string;
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState('');

  function addTag() {
    const value = draft.trim().replace(/,+$/, '');
    if (!value) return;
    const exists = tags.some((t) => t.toLowerCase() === value.toLowerCase());
    if (!exists) onChange([...tags, value]);
    setDraft('');
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag();
    }
  }

  return (
    <div className="tag-editor">
      <span className="tag-editor__label">
        {icon ? (
          <span
            className={['signal-icon', iconClassName].filter(Boolean).join(' ')}
          >
            {icon}
          </span>
        ) : null}
        {label}
      </span>
      {hint ? <p className="field-hint">{hint}</p> : null}
      <div className="tag-editor__row">
        <input
          value={draft}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <button
          type="button"
          className="btn"
          disabled={disabled || !draft.trim()}
          onClick={addTag}
        >
          Добавить
        </button>
      </div>
      {tags.length > 0 ? (
        <ul className="tag-chips">
          {tags.map((tag) => (
            <li
              key={tag}
              className={['tag-chip', chipClassName].filter(Boolean).join(' ')}
            >
              {icon ? (
                <span
                  className={['signal-icon', 'signal-icon--chip', iconClassName]
                    .filter(Boolean)
                    .join(' ')}
                >
                  {icon}
                </span>
              ) : null}
              <span>{tag}</span>
              <button
                type="button"
                className="tag-chip__remove"
                aria-label={`Удалить «${tag}»`}
                disabled={disabled}
                onClick={() => onChange(tags.filter((t) => t !== tag))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
