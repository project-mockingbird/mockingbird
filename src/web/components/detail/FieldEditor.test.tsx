import { describe, it, expect } from 'vitest';
import { MULTILINE_TYPES } from './FieldEditor';

describe('MULTILINE_TYPES routing aliases', () => {
  it('includes both hyphenated and unhyphenated multi-line text spellings', () => {
    expect(MULTILINE_TYPES.has('multi-line text')).toBe(true);
    expect(MULTILINE_TYPES.has('multiline text')).toBe(true);
  });

  it('routes the live registry-declared types to multi-line', () => {
    for (const t of ['multi-line text', 'multiline text', 'rich text', 'html', 'memo']) {
      expect(MULTILINE_TYPES.has(t)).toBe(true);
    }
  });

  it('routes graphql to multi-line so SXA Component Query indentation round-trips', () => {
    expect(MULTILINE_TYPES.has('graphql')).toBe(true);
  });
});
