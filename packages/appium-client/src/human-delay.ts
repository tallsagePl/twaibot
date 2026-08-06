/**
 * Human-like pause between device UI actions (tap/swipe/back).
 * Uniform over 0.0 … 2.0 s in 0.1 s steps. Not used around AI calls.
 */
export function randomHumanDelayMs(): number {
  return Math.floor(Math.random() * 21) * 100;
}

export async function humanDelay(): Promise<number> {
  const ms = randomHumanDelayMs();
  if (ms > 0) {
    await new Promise<void>((resolve) => setTimeout(resolve, ms));
  }
  return ms;
}
