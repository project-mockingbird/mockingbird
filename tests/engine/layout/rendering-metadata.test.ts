import { describe, it, expect } from 'vitest';
import { buildEngine, makeItem } from './_helpers.js';
import { getDeclaredPlaceholderKeys, shouldEmitFields, emptyPlaceholdersFromLayoutItem } from '../../../src/engine/layout/rendering-metadata.js';
import {
  PLACEHOLDERS_FIELD_ID,
  PLACEHOLDER_KEY_FIELD_ID,
  RENDERING_CONTENTS_RESOLVER_FIELD_ID,
} from '../../../src/engine/constants.js';

describe('getDeclaredPlaceholderKeys', () => {
  it('returns [] when rendering has no Placeholders field', () => {
    const engine = buildEngine([
      makeItem({
        id: 'aa000001-0000-0000-0000-000000000001',
        path: '/sitecore/layout/renderings/test/container',
        sharedFields: [],
      }),
    ]);
    expect(getDeclaredPlaceholderKeys(engine, 'aa000001-0000-0000-0000-000000000001')).toEqual([]);
  });

  it('resolves a single declared slot', () => {
    const engine = buildEngine([
      makeItem({
        id: 'aa000001-0000-0000-0000-000000000002',
        path: '/sitecore/layout/renderings/test/container',
        sharedFields: [
          {
            id: PLACEHOLDERS_FIELD_ID,
            hint: 'Placeholders',
            value: '{BB000001-0000-0000-0000-000000000001}',
          },
        ],
      }),
      makeItem({
        id: 'bb000001-0000-0000-0000-000000000001',
        path: '/sitecore/layout/placeholder settings/test/slot-a',
        sharedFields: [
          {
            id: PLACEHOLDER_KEY_FIELD_ID,
            hint: 'Placeholder Key',
            value: 'slot-a',
          },
        ],
      }),
    ]);
    expect(getDeclaredPlaceholderKeys(engine, 'aa000001-0000-0000-0000-000000000002')).toEqual(['slot-a']);
  });

  it('preserves declaration order for multiple slots', () => {
    const engine = buildEngine([
      makeItem({
        id: 'aa000001-0000-0000-0000-000000000003',
        path: '/sitecore/layout/renderings/test/container',
        sharedFields: [
          {
            id: PLACEHOLDERS_FIELD_ID,
            hint: 'Placeholders',
            value: '{BB000001-0000-0000-0000-000000000002}|{BB000001-0000-0000-0000-000000000003}',
          },
        ],
      }),
      makeItem({
        id: 'bb000001-0000-0000-0000-000000000002',
        path: '/sitecore/layout/placeholder settings/test/slot-a',
        sharedFields: [{ id: PLACEHOLDER_KEY_FIELD_ID, hint: 'Placeholder Key', value: 'slot-a' }],
      }),
      makeItem({
        id: 'bb000001-0000-0000-0000-000000000003',
        path: '/sitecore/layout/placeholder settings/test/slot-b',
        sharedFields: [{ id: PLACEHOLDER_KEY_FIELD_ID, hint: 'Placeholder Key', value: 'slot-b' }],
      }),
    ]);
    expect(getDeclaredPlaceholderKeys(engine, 'aa000001-0000-0000-0000-000000000003')).toEqual([
      'slot-a',
      'slot-b',
    ]);
  });

  it('filters slots with empty Placeholder Key', () => {
    const engine = buildEngine([
      makeItem({
        id: 'aa000001-0000-0000-0000-000000000004',
        path: '/sitecore/layout/renderings/test/container',
        sharedFields: [
          {
            id: PLACEHOLDERS_FIELD_ID,
            hint: 'Placeholders',
            value: '{BB000001-0000-0000-0000-000000000004}|{BB000001-0000-0000-0000-000000000005}',
          },
        ],
      }),
      makeItem({
        id: 'bb000001-0000-0000-0000-000000000004',
        path: '/sitecore/layout/placeholder settings/test/empty',
        sharedFields: [{ id: PLACEHOLDER_KEY_FIELD_ID, hint: 'Placeholder Key', value: '' }],
      }),
      makeItem({
        id: 'bb000001-0000-0000-0000-000000000005',
        path: '/sitecore/layout/placeholder settings/test/real',
        sharedFields: [{ id: PLACEHOLDER_KEY_FIELD_ID, hint: 'Placeholder Key', value: 'real-slot' }],
      }),
    ]);
    expect(getDeclaredPlaceholderKeys(engine, 'aa000001-0000-0000-0000-000000000004')).toEqual(['real-slot']);
  });

  it('drops unresolvable Placeholder Settings references', () => {
    const engine = buildEngine([
      makeItem({
        id: 'aa000001-0000-0000-0000-000000000005',
        path: '/sitecore/layout/renderings/test/container',
        sharedFields: [
          {
            id: PLACEHOLDERS_FIELD_ID,
            hint: 'Placeholders',
            value: '{BB000001-0000-0000-0000-000000000006}',
          },
        ],
      }),
    ]);
    expect(getDeclaredPlaceholderKeys(engine, 'aa000001-0000-0000-0000-000000000005')).toEqual([]);
  });

  it('returns [] for an unknown rendering id', () => {
    const engine = buildEngine([]);
    expect(getDeclaredPlaceholderKeys(engine, 'aa000001-0000-0000-0000-000000000099')).toEqual([]);
  });
});

describe('shouldEmitFields', () => {
  it('returns true when dsItem is present', () => {
    const engine = buildEngine([]);
    const dsItem = makeItem({ id: 'dd000001-0000-0000-0000-000000000001', path: '/x' });
    expect(
      shouldEmitFields(engine, 'aa000001-0000-0000-0000-000000000001', dsItem, undefined),
    ).toBe(true);
  });

  it('returns true when componentQueryResult is set', () => {
    const engine = buildEngine([]);
    expect(
      shouldEmitFields(engine, 'aa000001-0000-0000-0000-000000000001', undefined, { value: 'x' }),
    ).toBe(true);
  });

  it('returns false when no ds, no cq, rendering has no RCR field (default RCR case)', () => {
    const engine = buildEngine([
      makeItem({
        id: 'aa000001-0000-0000-0000-000000000010',
        path: '/sitecore/layout/renderings/test/default-rcr',
        sharedFields: [],
      }),
    ]);
    expect(
      shouldEmitFields(engine, 'aa000001-0000-0000-0000-000000000010', undefined, undefined),
    ).toBe(false);
  });

  it('returns true when RCR has UseContextItem=1', () => {
    const engine = buildEngine([
      makeItem({
        id: 'aa000001-0000-0000-0000-000000000011',
        path: '/sitecore/layout/renderings/test/ctx-rcr',
        sharedFields: [
          {
            id: RENDERING_CONTENTS_RESOLVER_FIELD_ID,
            hint: 'Rendering Contents Resolver',
            value: '{CC000001-0000-0000-0000-000000000001}',
          },
        ],
      }),
      makeItem({
        id: 'cc000001-0000-0000-0000-000000000001',
        path: '/sitecore/system/settings/rendering contents resolvers/context',
        sharedFields: [
          { id: 'ee000001-0000-0000-0000-000000000001', hint: 'UseContextItem', value: '1' },
        ],
      }),
    ]);
    expect(
      shouldEmitFields(engine, 'aa000001-0000-0000-0000-000000000011', undefined, undefined),
    ).toBe(true);
  });

  it('returns false when RCR has ItemSelectorQuery but UseContextItem=0 and no datasource (0.4.0.15)', () => {
    // Port of Sitecore `RenderingContentsResolver.ResolveContents`
    // (`Sitecore.LayoutService.decompiled.cs:4200-4228`):
    //   contextItem = UseContextItem ? Context.Item : GetDataSourceItem(rendering)
    //   if (contextItem == null) return null;   // → fields OMITTED
    //   if (string.IsNullOrWhiteSpace(ItemSelectorQuery)) return ProcessItem(contextItem, ...);
    //   ...
    // ItemSelectorQuery is evaluated ONLY after the contextItem null-check
    // passes. A query-carrying RCR with `UseContextItem=false` + no
    // datasource on the rendering yields `contextItem=null` before the query
    // ever runs, so Contents is null and `fields` is omitted. 0.4.0.14
    // incorrectly returned `true` here; 0.4.0.15 matches Sitecore.
    const engine = buildEngine([
      makeItem({
        id: 'aa000001-0000-0000-0000-000000000012',
        path: '/sitecore/layout/renderings/test/query-rcr',
        sharedFields: [
          {
            id: RENDERING_CONTENTS_RESOLVER_FIELD_ID,
            hint: 'Rendering Contents Resolver',
            value: '{CC000001-0000-0000-0000-000000000002}',
          },
        ],
      }),
      makeItem({
        id: 'cc000001-0000-0000-0000-000000000002',
        path: '/sitecore/system/settings/rendering contents resolvers/query',
        sharedFields: [
          { id: 'ee000001-0000-0000-0000-000000000002', hint: 'UseContextItem', value: '' },
          { id: 'ee000001-0000-0000-0000-000000000003', hint: 'ItemSelectorQuery', value: 'ancestor::*' },
        ],
      }),
    ]);
    expect(
      shouldEmitFields(engine, 'aa000001-0000-0000-0000-000000000012', undefined, undefined),
    ).toBe(false);
  });

  it('returns false when RCR exists with both UseContextItem=0 and no ItemSelectorQuery', () => {
    const engine = buildEngine([
      makeItem({
        id: 'aa000001-0000-0000-0000-000000000013',
        path: '/sitecore/layout/renderings/test/no-ctx-rcr',
        sharedFields: [
          {
            id: RENDERING_CONTENTS_RESOLVER_FIELD_ID,
            hint: 'Rendering Contents Resolver',
            value: '{CC000001-0000-0000-0000-000000000003}',
          },
        ],
      }),
      makeItem({
        id: 'cc000001-0000-0000-0000-000000000003',
        path: '/sitecore/system/settings/rendering contents resolvers/no-ctx',
        sharedFields: [
          { id: 'ee000001-0000-0000-0000-000000000004', hint: 'UseContextItem', value: '' },
        ],
      }),
    ]);
    expect(
      shouldEmitFields(engine, 'aa000001-0000-0000-0000-000000000013', undefined, undefined),
    ).toBe(false);
  });

  it('returns false when RCR reference is set but target is unresolvable', () => {
    const engine = buildEngine([
      makeItem({
        id: 'aa000001-0000-0000-0000-000000000014',
        path: '/sitecore/layout/renderings/test/dangling-rcr',
        sharedFields: [
          {
            id: RENDERING_CONTENTS_RESOLVER_FIELD_ID,
            hint: 'Rendering Contents Resolver',
            value: '{CC000001-0000-0000-0000-000000000099}',
          },
        ],
      }),
    ]);
    expect(
      shouldEmitFields(engine, 'aa000001-0000-0000-0000-000000000014', undefined, undefined),
    ).toBe(false);
  });
});

describe('emptyPlaceholdersFromLayoutItem', () => {
  it('returns empty map when layout has no Placeholders field', () => {
    const engine = buildEngine([]);
    expect(emptyPlaceholdersFromLayoutItem(engine, 'aa000001-0000-0000-0000-000000000901')).toEqual({});
  });

  it('returns one empty array per declared slot', () => {
    const engine = buildEngine([
      makeItem({
        id: 'aa000001-0000-0000-0000-000000000902',
        path: '/sitecore/layout/layouts/jss-layout',
        sharedFields: [
          {
            id: PLACEHOLDERS_FIELD_ID,
            hint: 'Placeholders',
            value:
              '{BB000001-0000-0000-0000-000000000801}|{BB000001-0000-0000-0000-000000000802}|{BB000001-0000-0000-0000-000000000803}',
          },
        ],
      }),
      makeItem({
        id: 'bb000001-0000-0000-0000-000000000801',
        path: '/sitecore/layout/placeholder settings/headless-header',
        sharedFields: [{ id: PLACEHOLDER_KEY_FIELD_ID, hint: 'Placeholder Key', value: 'headless-header' }],
      }),
      makeItem({
        id: 'bb000001-0000-0000-0000-000000000802',
        path: '/sitecore/layout/placeholder settings/headless-main',
        sharedFields: [{ id: PLACEHOLDER_KEY_FIELD_ID, hint: 'Placeholder Key', value: 'headless-main' }],
      }),
      makeItem({
        id: 'bb000001-0000-0000-0000-000000000803',
        path: '/sitecore/layout/placeholder settings/headless-footer',
        sharedFields: [{ id: PLACEHOLDER_KEY_FIELD_ID, hint: 'Placeholder Key', value: 'headless-footer' }],
      }),
    ]);
    const result = emptyPlaceholdersFromLayoutItem(engine, 'aa000001-0000-0000-0000-000000000902');
    expect(result).toEqual({
      'headless-header': [],
      'headless-main': [],
      'headless-footer': [],
    });
  });
});
