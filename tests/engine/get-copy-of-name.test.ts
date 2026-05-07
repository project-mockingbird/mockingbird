import { describe, it, expect } from 'vitest';
import { getCopyOfName } from '../../src/engine/get-copy-of-name.js';

describe('getCopyOfName', () => {
  it('returns the original name when no collision', () => {
    expect(getCopyOfName([], 'Foo')).toBe('Foo');
    expect(getCopyOfName(['Bar', 'Baz'], 'Foo')).toBe('Foo');
  });

  it('returns "Copy of <name>" when the original collides', () => {
    expect(getCopyOfName(['Foo'], 'Foo')).toBe('Copy of Foo');
  });

  it('returns "Copy of <name> 1" when both original and "Copy of <name>" collide', () => {
    expect(getCopyOfName(['Foo', 'Copy of Foo'], 'Foo')).toBe('Copy of Foo 1');
  });

  it('walks the integer suffix until a free slot is found', () => {
    const siblings = ['Foo', 'Copy of Foo', 'Copy of Foo 1', 'Copy of Foo 2'];
    expect(getCopyOfName(siblings, 'Foo')).toBe('Copy of Foo 3');
  });

  it('comparison is case-insensitive (Sitecore parity)', () => {
    // Source-name collision is case-insensitive: 'foo' present blocks 'Foo'.
    expect(getCopyOfName(['foo'], 'Foo')).toBe('Copy of Foo');
    // "Copy of <name>" collision is case-insensitive too: 'copy of foo'
    // present blocks the bare "Copy of Foo" candidate, forcing the 1-suffix.
    expect(getCopyOfName(['Foo', 'copy of foo'], 'Foo')).toBe('Copy of Foo 1');
  });
});
