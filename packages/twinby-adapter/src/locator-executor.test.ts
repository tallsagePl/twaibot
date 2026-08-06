import { describe, expect, it } from 'vitest';
import { parseBoundsForResourceId } from './locator-executor';

describe('parseBoundsForResourceId', () => {
  it('parses bounds after resource-id', () => {
    const xml =
      '<node resource-id="profileFeed-ProfileCard" bounds="[16,212][704,1120]" />';
    expect(parseBoundsForResourceId(xml, 'profileFeed-ProfileCard')).toEqual({
      left: 16,
      top: 212,
      width: 688,
      height: 908,
      right: 704,
      bottom: 1120,
    });
  });
});
