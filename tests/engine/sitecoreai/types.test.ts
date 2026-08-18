import { describe, it, expect } from 'vitest';
import { isConflictStrategy, ALL_STRATEGIES } from '../../../src/engine/sitecoreai/types.js';

describe('conflict strategy guard', () => {
  it('accepts the three known strategies', () => {
    for (const s of ALL_STRATEGIES) expect(isConflictStrategy(s)).toBe(true);
  });
  it('rejects anything else', () => {
    expect(isConflictStrategy('nuke')).toBe(false);
  });
});
