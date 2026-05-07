import { describe, expect, it } from 'vitest';
import {
  generateUid,
  encodeParams,
  decodeParams,
  computeConditioning,
} from '../../../src/web/components/detail/field-editors/renderings/utils';

describe('generateUid', () => {
  it('produces a braced uppercase GUID', () => {
    const uid = generateUid();
    expect(uid).toMatch(/^\{[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}\}$/);
  });

  it('produces distinct values across calls', () => {
    const a = generateUid();
    const b = generateUid();
    expect(a).not.toBe(b);
  });
});

describe('decodeParams / encodeParams', () => {
  it('round-trips an empty string to {}', () => {
    expect(decodeParams('')).toEqual({});
    expect(encodeParams({})).toBe('');
  });

  it('decodes percent-encoded GUID values', () => {
    expect(decodeParams('DynamicPlaceholderId=2&DataSourceItem=%7BABC%7D'))
      .toEqual({ DynamicPlaceholderId: '2', DataSourceItem: '{ABC}' });
  });

  it('decodes &amp; (Sitecore writes both & and &amp;)', () => {
    expect(decodeParams('a=1&amp;b=2')).toEqual({ a: '1', b: '2' });
  });

  it('encodes braces as %7B/%7D and joins with &', () => {
    expect(encodeParams({ DynamicPlaceholderId: '2', DataSourceItem: '{ABC}' }))
      .toBe('DynamicPlaceholderId=2&DataSourceItem=%7BABC%7D');
  });

  it('preserves empty-value flag form (sticky behavior used by SXA)', () => {
    // SXA stores boolean-like flags as bare keys: "StickyAt&TopSticky"
    // decode -> { StickyAt: '', TopSticky: '' }; encode -> "StickyAt=&TopSticky="
    expect(decodeParams('StickyAt&TopSticky')).toEqual({ StickyAt: '', TopSticky: '' });
    // Round-trip stays semantically identical when re-encoded; we accept the
    // canonical key=&-form on output (matches Sitecore's serializer).
    expect(encodeParams({ StickyAt: '', TopSticky: '' })).toBe('StickyAt=&TopSticky=');
  });
});

describe('computeConditioning', () => {
  it('first entry per placeholder gets pBefore="*", others get pAfter pointing at predecessor uid', () => {
    const entries = [
      { uid: '{A}', placeholder: '/main', renderingId: '', dataSource: '', params: {} },
      { uid: '{B}', placeholder: '/main', renderingId: '', dataSource: '', params: {} },
      { uid: '{C}', placeholder: '/main', renderingId: '', dataSource: '', params: {} },
    ];
    expect(computeConditioning(entries)).toEqual([
      { uid: '{A}', pBefore: '*' },
      { uid: '{B}', pAfter: "r[@uid='{A}']" },
      { uid: '{C}', pAfter: "r[@uid='{B}']" },
    ]);
  });

  it('multiple placeholders each restart with pBefore="*"', () => {
    const entries = [
      { uid: '{A}', placeholder: '/main', renderingId: '', dataSource: '', params: {} },
      { uid: '{B}', placeholder: '/sidebar', renderingId: '', dataSource: '', params: {} },
    ];
    expect(computeConditioning(entries)).toEqual([
      { uid: '{A}', pBefore: '*' },
      { uid: '{B}', pBefore: '*' },
    ]);
  });
});
