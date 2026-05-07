import { describe, it, expect } from 'vitest';
import type { ScsItem } from '../../../src/engine/types.js';
import { buildItemKey } from '../../../src/engine/package/item-key.js';

function makeItem(overrides: Partial<ScsItem> & { id: string; path: string }): ScsItem {
  return {
    parent: '00000000-0000-0000-0000-000000000000',
    template: 'ab86861a-6030-46c5-b394-e8f99e8b87db',
    sharedFields: [],
    languages: [],
    ...overrides,
  };
}

describe('buildItemKey', () => {
  it('builds the canonical zip key for a typical content item', () => {
    const item = makeItem({
      id: 'a1b2c3d4-e5f6-7890-1234-5678901234ab',
      path: '/sitecore/content/Site/Hello',
    });
    const key = buildItemKey(item, { language: 'en', version: 1 }, 'master');
    expect(key).toBe(
      'items/master/sitecore/content/Site/Hello/{A1B2C3D4-E5F6-7890-1234-5678901234AB}/en/1/xml',
    );
  });

  it('emits the literal string "invariant" for language-invariant versions', () => {
    const item = makeItem({
      id: 'a1b2c3d4-e5f6-7890-1234-5678901234ab',
      path: '/sitecore/media library/Foo',
    });
    const key = buildItemKey(item, { language: 'invariant', version: 1 }, 'master');
    expect(key).toBe(
      'items/master/sitecore/media library/Foo/{A1B2C3D4-E5F6-7890-1234-5678901234AB}/invariant/1/xml',
    );
  });

  it('preserves spaces in path segments verbatim (no URL escaping)', () => {
    const item = makeItem({
      id: 'a1b2c3d4-e5f6-7890-1234-5678901234ab',
      path: '/sitecore/content/Foo Bar/Baz Qux',
    });
    const key = buildItemKey(item, { language: 'en', version: 2 }, 'master');
    expect(key).toBe(
      'items/master/sitecore/content/Foo Bar/Baz Qux/{A1B2C3D4-E5F6-7890-1234-5678901234AB}/en/2/xml',
    );
  });

  it('handles the database-root path "/sitecore" without empty segments', () => {
    const item = makeItem({
      id: '11111111-1111-1111-1111-111111111111',
      path: '/sitecore',
    });
    const key = buildItemKey(item, { language: 'en', version: 1 }, 'master');
    expect(key).toBe(
      'items/master/sitecore/{11111111-1111-1111-1111-111111111111}/en/1/xml',
    );
  });

  it('upper-cases and braces the id regardless of input casing', () => {
    const item = makeItem({
      id: 'AbCdEf01-2345-6789-aBcD-eF0123456789',
      path: '/sitecore/content/X',
    });
    const key = buildItemKey(item, { language: 'en', version: 1 }, 'master');
    expect(key).toContain('{ABCDEF01-2345-6789-ABCD-EF0123456789}');
  });

  it('formats version numbers as plain integers', () => {
    const item = makeItem({
      id: 'a1b2c3d4-e5f6-7890-1234-5678901234ab',
      path: '/sitecore/content/Hello',
    });
    const key = buildItemKey(item, { language: 'en', version: 42 }, 'master');
    expect(key.endsWith('/en/42/xml')).toBe(true);
  });
});
