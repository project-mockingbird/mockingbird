import { describe, it, expect } from 'vitest';
import { parseSitecoreDate } from '../../../src/engine/sorting/dates.js';

describe('parseSitecoreDate', () => {
  it('parses a valid Sitecore date', () => {
    // 2026-04-10 12:00:00 UTC
    const expected = Date.UTC(2026, 3, 10, 12, 0, 0);
    expect(parseSitecoreDate('20260410T120000Z')).toBe(expected);
  });

  it('parses midnight on Jan 1 2000', () => {
    const expected = Date.UTC(2000, 0, 1, 0, 0, 0);
    expect(parseSitecoreDate('20000101T000000Z')).toBe(expected);
  });

  it('returns 0 for undefined', () => {
    expect(parseSitecoreDate(undefined)).toBe(0);
  });

  it('returns 0 for empty string', () => {
    expect(parseSitecoreDate('')).toBe(0);
  });

  it('returns 0 for malformed (no T separator)', () => {
    expect(parseSitecoreDate('20260410120000Z')).toBe(0);
  });

  it('returns 0 for malformed (missing trailing Z)', () => {
    expect(parseSitecoreDate('20260410T120000')).toBe(0);
  });

  it('returns 0 for malformed (wrong length)', () => {
    expect(parseSitecoreDate('2026041T120000Z')).toBe(0);
  });

  it('returns 0 for non-numeric chars in date portion', () => {
    expect(parseSitecoreDate('2026XX10T120000Z')).toBe(0);
  });
});
