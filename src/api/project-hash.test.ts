import { describe, it, expect } from 'vitest';
import { computeProjectHash } from './project-hash.js';

describe('computeProjectHash', () => {
  it('returns a 12-character hex string', () => {
    const hash = computeProjectHash(['/sitecore.json']);
    expect(hash).toMatch(/^[0-9a-f]{12}$/);
  });

  it('is stable across calls with the same input', () => {
    const inputs = ['/sitecore.json', '/content/sitecore.json'];
    expect(computeProjectHash(inputs)).toBe(computeProjectHash(inputs));
  });

  it('is order-independent (sorts paths before hashing)', () => {
    const a = computeProjectHash(['/sitecore.json', '/content/sitecore.json']);
    const b = computeProjectHash(['/content/sitecore.json', '/sitecore.json']);
    expect(a).toBe(b);
  });

  it('differs when paths differ', () => {
    const a = computeProjectHash(['/sitecore.json']);
    const b = computeProjectHash(['/other/sitecore.json']);
    expect(a).not.toBe(b);
  });

  it('throws on empty input', () => {
    expect(() => computeProjectHash([])).toThrow(/at least one path/);
  });
});
