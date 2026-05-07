// src/web/lib/url-state.test.ts
import { describe, it, expect } from 'vitest';
import { parseUrl, serializeUrl, DEFAULT_NAV_STATE } from './url-state';

describe('parseUrl', () => {
  it('parses a /tree/{id} path', () => {
    const state = parseUrl(new URL('http://localhost/tree/item-x'));
    expect(state.selectedId).toBe('item-x');
    expect(state.dialog).toBeNull();
  });

  it('parses a / path as no selection', () => {
    const state = parseUrl(new URL('http://localhost/'));
    expect(state.selectedId).toBeNull();
    expect(state.dialog).toBeNull();
  });

  it('parses ?dialog=<name>', () => {
    const state = parseUrl(new URL('http://localhost/tree/foo?dialog=add-rendering'));
    expect(state.dialog).toBe('add-rendering');
  });

  it('ignores unknown dialog values', () => {
    const state = parseUrl(new URL('http://localhost/tree/foo?dialog=bogus'));
    expect(state.dialog).toBeNull();
  });

  it('ignores legacy database / lang / tab params (silently dropped)', () => {
    const state = parseUrl(new URL('http://localhost/tree/foo?database=web&lang=fr&tab=layout'));
    // Structural assertion: result has only the two NavState fields, regardless of input query.
    expect(state).toEqual({ selectedId: 'foo', dialog: null });
  });
});

describe('serializeUrl', () => {
  it('serializes a selection to /tree/{id}', () => {
    expect(serializeUrl({ selectedId: 'item-x', dialog: null })).toBe('/tree/item-x');
  });

  it('serializes no selection to /tree (NOT /, which would land on LaunchPage)', () => {
    expect(serializeUrl(DEFAULT_NAV_STATE)).toBe('/tree');
  });

  it('serializes the dialog flag as a query param', () => {
    expect(serializeUrl({ selectedId: 'foo', dialog: 'add-rendering' })).toBe('/tree/foo?dialog=add-rendering');
  });
});
