/**
 * Twinby paints some chips on almost every profile (notably «Финансы»).
 * Never treat them as real interests for capture, AI, or history.
 */
const IGNORED_TWINBY_INTEREST_RE =
  /^(финансы|finance|finances|деньги|зарплата|доход|инвестиции|бюджет|капитал|wealth|income|salary|money)$/i;

export function isIgnoredTwinbyInterest(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return true;
  }
  return IGNORED_TWINBY_INTEREST_RE.test(trimmed);
}

export function filterTwinbyInterests(interests: readonly string[]): string[] {
  const out: string[] = [];
  for (const interest of interests) {
    const trimmed = interest.trim();
    if (!trimmed || isIgnoredTwinbyInterest(trimmed)) {
      continue;
    }
    if (!out.includes(trimmed)) {
      out.push(trimmed);
    }
  }
  return out;
}
