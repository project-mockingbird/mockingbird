// src/web/lib/url-state.test.ts
import { describe, it, expect } from 'vitest';
import { parseUrl, serializeUrl, DEFAULT_NAV_STATE, resolveDetailTab } from './url-state';

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

// The Builder tab only exists for template items; Yaml only when editable. The
// resolver must fall back when a persisted tab isn't valid for the current item
// (e.g. a persisted 'builder' on a non-template, or 'yaml' on a read-only item)
// rather than leaving the Tabs control on a value with no panel.
describe('resolveDetailTab', () => {
  it('keeps a persisted tab that is valid for the item', () => {
    expect(resolveDetailTab({ persisted: 'layout', isTemplate: false, readOnly: false, settingDefault: 'content' })).toBe('layout');
  });

  it('defaults to Builder for a template when nothing is persisted', () => {
    expect(resolveDetailTab({ persisted: null, isTemplate: true, readOnly: false, settingDefault: 'content' })).toBe('builder');
  });

  it('defaults to the setting for a non-template when nothing is persisted', () => {
    expect(resolveDetailTab({ persisted: null, isTemplate: false, readOnly: false, settingDefault: 'standard' })).toBe('standard');
  });

  it('falls back when a persisted Builder tab is on a non-template', () => {
    expect(resolveDetailTab({ persisted: 'builder', isTemplate: false, readOnly: false, settingDefault: 'content' })).toBe('content');
  });

  it('falls back when a persisted Yaml tab is on a read-only item', () => {
    expect(resolveDetailTab({ persisted: 'yaml', isTemplate: false, readOnly: true, settingDefault: 'content' })).toBe('content');
  });

  it('keeps Builder when persisted on a template', () => {
    expect(resolveDetailTab({ persisted: 'builder', isTemplate: true, readOnly: false, settingDefault: 'content' })).toBe('builder');
  });
});
