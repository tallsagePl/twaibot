import type { ReactNode } from 'react';

/** Vertical green→red rail beside ranked signal groups. */
export function SignalScale({ children }: { children: ReactNode }) {
  return (
    <div className="signal-scale">
      <div className="signal-scale__rail" aria-hidden="true" />
      <div className="signal-scale__groups">{children}</div>
    </div>
  );
}
