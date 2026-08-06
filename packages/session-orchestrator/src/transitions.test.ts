import { describe, expect, it } from 'vitest';
import { canTransition } from './index';

describe('canTransition live paths', () => {
  it('allows env bootstrap chain', () => {
    expect(canTransition('idle', 'validating-environment')).toBe(true);
    expect(canTransition('validating-environment', 'starting-appium')).toBe(true);
    expect(canTransition('starting-appium', 'connecting')).toBe(true);
    expect(canTransition('connecting', 'opening-twinby')).toBe(true);
    expect(canTransition('opening-twinby', 'ready')).toBe(true);
  });

  it('allows resume from error', () => {
    expect(canTransition('error', 'recovering')).toBe(true);
    expect(canTransition('error', 'cooldown')).toBe(true);
    expect(canTransition('error', 'awaiting-review')).toBe(true);
    expect(canTransition('capturing-profile', 'recovering')).toBe(true);
    expect(canTransition('evaluating', 'recovering')).toBe(true);
  });
});
