type AiWaitingProps = {
  label?: string;
  /** Larger block variant for cards / banners */
  block?: boolean;
  /** Sticky top banner — use for any in-flight neural request */
  sticky?: boolean;
};

/** Inline/block/sticky spinner while waiting on ArionHub. */
export function AiWaiting({
  label = 'Нейронка обрабатывает запрос…',
  block = false,
  sticky = false,
}: AiWaitingProps) {
  const className = [
    'ai-waiting',
    block ? 'ai-waiting--block' : '',
    sticky ? 'ai-waiting--sticky' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={className} role="status" aria-live="polite" aria-busy="true">
      <span className="ai-waiting__spinner" aria-hidden="true" />
      <span className="ai-waiting__label">{label}</span>
    </div>
  );
}
