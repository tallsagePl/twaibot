import { describe, expect, it } from 'vitest';
import { randomHumanDelayMs } from './human-delay.js';

describe('randomHumanDelayMs', () => {
  it('returns 0..2000 in 100ms steps', () => {
    for (let i = 0; i < 200; i++) {
      const ms = randomHumanDelayMs();
      expect(ms).toBeGreaterThanOrEqual(0);
      expect(ms).toBeLessThanOrEqual(2000);
      expect(ms % 100).toBe(0);
    }
  });
});
