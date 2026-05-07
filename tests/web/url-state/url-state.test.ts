import { describe, it, expect } from 'vitest';
import { parseUrl, serializeUrl, DEFAULT_NAV_STATE, type NavState } from '@/lib/url-state';

function u(href: string): URL {
  return new URL(href, 'http://localhost:3333');
}

describe('parseUrl', () => {
  it('returns DEFAULT_NAV_STATE for /', () => {
    expect(parseUrl(u('/'))).toEqual(DEFAULT_NAV_STATE);
  });

  it('reads selectedId from /tree/:guid', () => {
    expect(parseUrl(u('/tree/abc'))).toEqual({
      ...DEFAULT_NAV_STATE,
      selectedId: 'abc',
    });
  });

  it('handles full GUID in path', () => {
    const guid = '01b8917b-d36b-4fb1-91ad-017dfe055e55';
    expect(parseUrl(u(`/tree/${guid}`))).toEqual({
      ...DEFAULT_NAV_STATE,
      selectedId: guid,
    });
  });

  it('reads dialog query param when whitelisted', () => {
    expect(parseUrl(u('/tree/abc?dialog=edit-rendering'))).toEqual({
      ...DEFAULT_NAV_STATE,
      selectedId: 'abc',
      dialog: 'edit-rendering',
    });
  });

  it('reads all dialog whitelist values', () => {
    for (const name of ['add-rendering', 'edit-rendering']) {
      expect(parseUrl(u(`/tree/abc?dialog=${name}`)).dialog).toBe(name);
    }
  });

  it('rejects unknown dialog values via whitelist', () => {
    expect(parseUrl(u('/tree/abc?dialog=ghost')).dialog).toBeNull();
  });

  it('rejects retired dialog values via whitelist', () => {
    for (const name of ['move-rendering', 'edit-parameters', 'datasource-picker']) {
      expect(parseUrl(u(`/tree/abc?dialog=${name}`)).dialog).toBeNull();
    }
  });

  it('silently drops legacy database / lang / tab params', () => {
    const result = parseUrl(u('/tree/abc?database=core&lang=fr&tab=layout'));
    expect(result).toEqual({ selectedId: 'abc', dialog: null });
  });

  it('drops unknown query params', () => {
    const result = parseUrl(u('/tree/abc?foo=bar'));
    expect(result).toEqual({ ...DEFAULT_NAV_STATE, selectedId: 'abc' });
    expect(result).not.toHaveProperty('foo');
  });

  it('falls back to DEFAULT for unknown path', () => {
    expect(parseUrl(u('/random/path'))).toEqual(DEFAULT_NAV_STATE);
  });

  it('falls back when /tree/ has no guid segment', () => {
    expect(parseUrl(u('/tree/'))).toEqual(DEFAULT_NAV_STATE);
  });
});

describe('serializeUrl', () => {
  it('returns /tree for DEFAULT_NAV_STATE (NOT /, which would land on LaunchPage)', () => {
    expect(serializeUrl(DEFAULT_NAV_STATE)).toBe('/tree');
  });

  it('emits /tree/:guid for selectedId only', () => {
    expect(serializeUrl({ ...DEFAULT_NAV_STATE, selectedId: 'abc' })).toBe('/tree/abc');
  });

  it('emits dialog when set', () => {
    expect(serializeUrl({ ...DEFAULT_NAV_STATE, selectedId: 'abc', dialog: 'edit-rendering' })).toBe('/tree/abc?dialog=edit-rendering');
  });

  it('emits dialog without other params', () => {
    expect(serializeUrl({ ...DEFAULT_NAV_STATE, selectedId: 'abc', dialog: 'add-rendering' })).toBe('/tree/abc?dialog=add-rendering');
  });

  it('omits dialog when null', () => {
    expect(serializeUrl({ ...DEFAULT_NAV_STATE, selectedId: 'abc', dialog: null })).toBe('/tree/abc');
  });
});

describe('round-trip parse/serialize', () => {
  const cases: NavState[] = [
    DEFAULT_NAV_STATE,
    { ...DEFAULT_NAV_STATE, selectedId: 'abc' },
    { selectedId: 'abc', dialog: 'edit-rendering' },
  ];
  for (const state of cases) {
    it(`round-trips ${JSON.stringify(state)}`, () => {
      const href = serializeUrl(state);
      expect(parseUrl(new URL(href, 'http://localhost:3333'))).toEqual(state);
    });
  }
});
