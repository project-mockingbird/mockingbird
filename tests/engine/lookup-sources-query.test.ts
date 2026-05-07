/**
 * Unit tests for the child-axis multi-segment XPath resolver added in
 * lookup-sources.ts.
 *
 * Covers:
 *   - parseChildAxisQuery (parser unit tests, exported for direct testing)
 *   - resolveChildAxisQuery via resolveLookupSource (integration round-trip)
 */

import { describe, it, expect } from 'vitest';
import { Engine } from '../../src/engine/index.js';
import { ItemTree } from '../../src/engine/tree.js';
import type { ScsItem } from '../../src/engine/types.js';
import {
  resolveLookupSource,
  parseChildAxisQuery,
} from '../../src/engine/lookup-sources.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NULL_GUID = '00000000-0000-0000-0000-000000000000';

function makeItem(
  overrides: Partial<ScsItem> & { id: string; path: string },
): ScsItem {
  return {
    parent: NULL_GUID,
    template: NULL_GUID,
    sharedFields: [],
    languages: [],
    ...overrides,
  };
}

/**
 * Build a minimal Engine stub from a flat list of ScsItems.
 * Uses the same Object.create pattern as item-query.test.ts.
 */
function buildEngine(items: ScsItem[]): Engine {
  const engine = Object.create(Engine.prototype) as Engine;
  const tree = new ItemTree();
  for (const item of items) tree.addItem(item, `/fake/${item.id}.yml`);
  (engine as any).tree = tree;
  (engine as any).registry = null;
  (engine as any).options = { rootDir: '/fake' };
  return engine;
}

// ---------------------------------------------------------------------------
// parseChildAxisQuery - parser unit tests
// ---------------------------------------------------------------------------

describe('parseChildAxisQuery', () => {
  it('parses a single @@name segment', () => {
    const result = parseChildAxisQuery("/sitecore/Foo/*[@@name='Bar']");
    expect(result).not.toBeNull();
    expect(result!.basePath).toBe('/sitecore/Foo');
    expect(result!.steps).toHaveLength(1);
    expect(result!.steps[0]).toEqual({ kind: 'name', value: 'bar' });
  });

  it('parses a single @@templatename segment', () => {
    const result = parseChildAxisQuery("/sitecore/Foo/*[@@templatename='Tag Folder']");
    expect(result).not.toBeNull();
    expect(result!.basePath).toBe('/sitecore/Foo');
    expect(result!.steps).toHaveLength(1);
    expect(result!.steps[0]).toEqual({ kind: 'templatename', value: 'tag folder' });
  });

  it('parses multi-segment query matching the Tag Treelist content tree shape', () => {
    const q =
      "$site/*[@@name='Data']/*[@@templatename='Tag Folder']/*[@@name='Sections']";
    const result = parseChildAxisQuery(q);
    expect(result).not.toBeNull();
    expect(result!.basePath).toBe('$site');
    expect(result!.steps).toHaveLength(3);
    expect(result!.steps[0]).toEqual({ kind: 'name', value: 'data' });
    expect(result!.steps[1]).toEqual({ kind: 'templatename', value: 'tag folder' });
    expect(result!.steps[2]).toEqual({ kind: 'name', value: 'sections' });
  });

  it('accepts double quotes', () => {
    const result = parseChildAxisQuery('/sitecore/Foo/*[@@name="Bar"]');
    expect(result).not.toBeNull();
    expect(result!.steps[0]).toEqual({ kind: 'name', value: 'bar' });
  });

  it('accepts mixed quote styles across segments', () => {
    const result = parseChildAxisQuery(
      "/sitecore/Foo/*[@@name='Data']/*[@@templatename=\"Tag Folder\"]",
    );
    expect(result).not.toBeNull();
    expect(result!.steps).toHaveLength(2);
    expect(result!.steps[0].value).toBe('data');
    expect(result!.steps[1].value).toBe('tag folder');
  });

  it('lower-cases values (case-insensitive match)', () => {
    const result = parseChildAxisQuery("/sitecore/Foo/*[@@name='UPPERCASE']");
    expect(result!.steps[0].value).toBe('uppercase');
  });

  it('returns null for unsupported predicate key @@id', () => {
    const result = parseChildAxisQuery(
      "/sitecore/Foo/*[@@id='{ABCD-1234}']",
    );
    expect(result).toBeNull();
  });

  it('returns null when query contains // (descendant axis)', () => {
    const result = parseChildAxisQuery(
      "/sitecore/Foo//*[@@templatename='Bar']",
    );
    expect(result).toBeNull();
  });

  it('returns null when there are no predicate segments', () => {
    expect(parseChildAxisQuery('/sitecore/Foo')).toBeNull();
  });

  it('returns null when basePath is empty', () => {
    expect(parseChildAxisQuery("/*[@@name='Bar']")).toBeNull();
  });

  it('accepts literal name segments after a predicate (literal = @@name shorthand)', () => {
    const result = parseChildAxisQuery(
      "/sitecore/Foo/*[@@name='Bar']/extra",
    );
    expect(result).toEqual({
      basePath: '/sitecore/Foo',
      steps: [
        { kind: 'name', value: 'bar' },
        { kind: 'name', value: 'extra' },
      ],
    });
  });

  it('accepts mixed predicate + literal segments (Tag Treelist Months/Years pattern)', () => {
    const result = parseChildAxisQuery(
      "$site/*[@@name='Data']/Tags/Months",
    );
    expect(result).toEqual({
      basePath: '$site',
      steps: [
        { kind: 'name', value: 'data' },
        { kind: 'name', value: 'tags' },
        { kind: 'name', value: 'months' },
      ],
    });
  });

  it('returns null when a literal segment contains predicate-like chars', () => {
    const result = parseChildAxisQuery(
      "/sitecore/Foo/*[@@name='Bar']/baz[qux]",
    );
    expect(result).toBeNull();
  });

  it('returns null for a gap between segments (descendant-axis guard)', () => {
    // Contains '//' so rejected by the early guard.
    const result = parseChildAxisQuery(
      "/sitecore/Foo/*[@@name='A']///*[@@name='B']",
    );
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Integration - item tree fixture
// ---------------------------------------------------------------------------

/**
 * Template GUIDs (36 chars, proper format).
 * getTemplateName resolves by looking up the template item, then reading its
 * path's last segment as the name. The path segment must match the query
 * value case-insensitively.
 */
const TAG_FOLDER_TPL_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-000000000001';
const TAG_TPL_ID        = 'bbbbbbbb-bbbb-bbbb-bbbb-000000000002';
const HEADLESS_SITE_TPL = 'cccccccc-cccc-cccc-cccc-000000000003';

/**
 * Build a small item tree that mirrors the SXA Tag Folder convention:
 *
 *   /sitecore/content/Site (template: Headless Site)
 *     /Data
 *       /Tag Folder  (template: Tag Folder)
 *         /Sections
 *           /About
 *           /Case Studies
 *         /Keywords
 *           /React
 *           /TypeScript
 *
 * Template items are seeded so getTemplateName can resolve them.
 * The path last segment is used as the template name by getName(), so the
 * template item path must end with exactly the template name.
 */
function buildTagTree() {
  // Template definition items. The name of each is the last path segment.
  const siteTpl = makeItem({
    id: HEADLESS_SITE_TPL,
    path: '/sitecore/templates/Foundation/Headless Site',
    parent: NULL_GUID,
    template: NULL_GUID,
  });
  const tagFolderTpl = makeItem({
    id: TAG_FOLDER_TPL_ID,
    path: '/sitecore/templates/Foundation/Tag Folder',
    parent: NULL_GUID,
    template: NULL_GUID,
  });

  // Content tree items.
  const siteItem = makeItem({
    id: '11111111-1111-1111-1111-000000000001',
    path: '/sitecore/content/Site',
    parent: NULL_GUID,
    template: HEADLESS_SITE_TPL,
  });
  const dataItem = makeItem({
    id: '11111111-1111-1111-1111-000000000002',
    path: '/sitecore/content/Site/Data',
    parent: '11111111-1111-1111-1111-000000000001',
    template: NULL_GUID,
  });
  const tagFolderItem = makeItem({
    id: '11111111-1111-1111-1111-000000000003',
    path: '/sitecore/content/Site/Data/Tag Folder',
    parent: '11111111-1111-1111-1111-000000000002',
    template: TAG_FOLDER_TPL_ID,
  });
  const sectionsItem = makeItem({
    id: '11111111-1111-1111-1111-000000000004',
    path: '/sitecore/content/Site/Data/Tag Folder/Sections',
    parent: '11111111-1111-1111-1111-000000000003',
    template: NULL_GUID,
  });
  const keywordsItem = makeItem({
    id: '11111111-1111-1111-1111-000000000005',
    path: '/sitecore/content/Site/Data/Tag Folder/Keywords',
    parent: '11111111-1111-1111-1111-000000000003',
    template: NULL_GUID,
  });
  const aboutTag = makeItem({
    id: '11111111-1111-1111-1111-000000000006',
    path: '/sitecore/content/Site/Data/Tag Folder/Sections/About',
    parent: '11111111-1111-1111-1111-000000000004',
    template: TAG_TPL_ID,
  });
  const caseTag = makeItem({
    id: '11111111-1111-1111-1111-000000000007',
    path: '/sitecore/content/Site/Data/Tag Folder/Sections/Case Studies',
    parent: '11111111-1111-1111-1111-000000000004',
    template: TAG_TPL_ID,
  });
  const reactTag = makeItem({
    id: '11111111-1111-1111-1111-000000000008',
    path: '/sitecore/content/Site/Data/Tag Folder/Keywords/React',
    parent: '11111111-1111-1111-1111-000000000005',
    template: TAG_TPL_ID,
  });
  const tsTag = makeItem({
    id: '11111111-1111-1111-1111-000000000009',
    path: '/sitecore/content/Site/Data/Tag Folder/Keywords/TypeScript',
    parent: '11111111-1111-1111-1111-000000000005',
    template: TAG_TPL_ID,
  });

  return buildEngine([
    siteTpl,
    tagFolderTpl,
    siteItem,
    dataItem,
    tagFolderItem,
    sectionsItem,
    keywordsItem,
    aboutTag,
    caseTag,
    reactTag,
    tsTag,
  ]);
}

// ---------------------------------------------------------------------------
// resolveLookupSource - integration round-trip tests
// ---------------------------------------------------------------------------

describe('resolveLookupSource - child-axis queries', () => {
  it('resolves Sections tags via 3-segment child-axis query', () => {
    const engine = buildTagTree();
    const source =
      "query:/sitecore/content/Site/*[@@name='Data']/*[@@templatename='Tag Folder']/*[@@name='Sections']";
    const result = resolveLookupSource(source, undefined, engine);
    expect(result.resolved).toBe(true);
    const names = result.items.map(i => i.name).sort();
    expect(names).toEqual(['About', 'Case Studies']);
  });

  it('resolves Keywords tags via 3-segment child-axis query', () => {
    const engine = buildTagTree();
    const source =
      "query:/sitecore/content/Site/*[@@name='Data']/*[@@templatename='Tag Folder']/*[@@name='Keywords']";
    const result = resolveLookupSource(source, undefined, engine);
    expect(result.resolved).toBe(true);
    const names = result.items.map(i => i.name).sort();
    expect(names).toEqual(['React', 'TypeScript']);
  });

  it('returns empty items (resolved:true) when no node matches a step', () => {
    const engine = buildTagTree();
    const source =
      "query:/sitecore/content/Site/*[@@name='NonExistent']/*[@@templatename='Tag Folder']/*[@@name='Sections']";
    const result = resolveLookupSource(source, undefined, engine);
    expect(result.resolved).toBe(true);
    expect(result.items).toHaveLength(0);
  });

  it('returns resolved:false with reason when base path does not exist', () => {
    const engine = buildTagTree();
    const source = "query:/sitecore/content/Missing/*[@@name='Data']/*[@@name='Sections']";
    const result = resolveLookupSource(source, undefined, engine);
    expect(result.resolved).toBe(false);
    expect(result.reason).toMatch(/path not found/i);
  });

  it('deduplicates items with the same id', () => {
    // Verify no duplicates appear in the normal case.
    const engine = buildTagTree();
    const source =
      "query:/sitecore/content/Site/*[@@name='Data']/*[@@templatename='Tag Folder']/*[@@name='Sections']";
    const result = resolveLookupSource(source, undefined, engine);
    const ids = result.items.map(i => i.id);
    const uniqueIds = new Set(ids);
    expect(ids.length).toBe(uniqueIds.size);
  });

  it('accepts double-quoted predicates', () => {
    const engine = buildTagTree();
    const source =
      'query:/sitecore/content/Site/*[@@name="Data"]/*[@@templatename="Tag Folder"]/*[@@name="Keywords"]';
    const result = resolveLookupSource(source, undefined, engine);
    expect(result.resolved).toBe(true);
    expect(result.items.map(i => i.name).sort()).toEqual(['React', 'TypeScript']);
  });

  it('matches names case-insensitively', () => {
    const engine = buildTagTree();
    // 'DATA' should match item named 'Data'
    const source =
      "query:/sitecore/content/Site/*[@@name='DATA']/*[@@templatename='Tag Folder']/*[@@name='Sections']";
    const result = resolveLookupSource(source, undefined, engine);
    expect(result.resolved).toBe(true);
    expect(result.items).toHaveLength(2);
  });

  it('matches templatenames case-insensitively', () => {
    const engine = buildTagTree();
    const source =
      "query:/sitecore/content/Site/*[@@name='Data']/*[@@templatename='TAG FOLDER']/*[@@name='Keywords']";
    const result = resolveLookupSource(source, undefined, engine);
    expect(result.resolved).toBe(true);
    expect(result.items).toHaveLength(2);
  });

  it('returns resolved:false with "unsupported query syntax" for unknown query form', () => {
    const engine = buildTagTree();
    // fast: prefix is not handled - should reach the fallback error
    const source = 'query:fast:/sitecore/content/Site/@@id=test';
    const result = resolveLookupSource(source, undefined, engine);
    expect(result.resolved).toBe(false);
    expect(result.reason).toMatch(/unsupported query syntax/i);
  });

  it('does not break the existing descendant-axis query form', () => {
    // Verify Pattern 1 (descendant axis) still works after the dispatch change.
    const tagFolderTpl = makeItem({
      id: TAG_FOLDER_TPL_ID,
      path: '/sitecore/templates/Foundation/Tag Folder',
      parent: NULL_GUID,
      template: NULL_GUID,
    });
    const root = makeItem({
      id: '22222222-2222-2222-2222-000000000001',
      path: '/sitecore/content/Site',
      parent: NULL_GUID,
      template: NULL_GUID,
    });
    const child = makeItem({
      id: '22222222-2222-2222-2222-000000000002',
      path: '/sitecore/content/Site/Page',
      parent: '22222222-2222-2222-2222-000000000001',
      template: TAG_FOLDER_TPL_ID,
    });
    const engine = buildEngine([tagFolderTpl, root, child]);
    const source = "query:/sitecore/content/Site//*[@@templatename='Tag Folder']";
    const result = resolveLookupSource(source, undefined, engine);
    expect(result.resolved).toBe(true);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].path).toBe('/sitecore/content/Site/Page');
  });
});

// ---------------------------------------------------------------------------
// Sortorder - items sorted by __Sortorder ascending
// ---------------------------------------------------------------------------

const SORTORDER_FIELD_ID = 'ba3f86a2-4a1c-4d78-b63d-91c2779c1b5e';

describe('resolveLookupSource - __Sortorder sorting', () => {
  it('pipe-path: items with explicit __Sortorder appear in ascending order', () => {
    const parent = makeItem({
      id: 'aaaaaaaa-0000-0000-0000-000000000001',
      path: '/sitecore/content/Parent',
    });
    // Alpha registered first but has sortorder 200 - should appear second.
    const alpha = makeItem({
      id: 'aaaaaaaa-0000-0000-0000-000000000002',
      path: '/sitecore/content/Parent/Alpha',
      parent: 'aaaaaaaa-0000-0000-0000-000000000001',
      sharedFields: [{ id: SORTORDER_FIELD_ID, hint: '__Sortorder', value: '200' }],
    });
    // Beta registered second but has sortorder 50 - should appear first.
    const beta = makeItem({
      id: 'aaaaaaaa-0000-0000-0000-000000000003',
      path: '/sitecore/content/Parent/Beta',
      parent: 'aaaaaaaa-0000-0000-0000-000000000001',
      sharedFields: [{ id: SORTORDER_FIELD_ID, hint: '__Sortorder', value: '50' }],
    });
    const engine = buildEngine([parent, alpha, beta]);
    const result = resolveLookupSource('/sitecore/content/Parent', undefined, engine);
    expect(result.resolved).toBe(true);
    expect(result.items).toHaveLength(2);
    expect(result.items[0].name).toBe('Beta');
    expect(result.items[1].name).toBe('Alpha');
  });

  it('pipe-path: items without __Sortorder default to 100 and sort stably by name', () => {
    const parent = makeItem({
      id: 'bbbbbbbb-0000-0000-0000-000000000001',
      path: '/sitecore/content/P2',
    });
    const zebra = makeItem({
      id: 'bbbbbbbb-0000-0000-0000-000000000002',
      path: '/sitecore/content/P2/Zebra',
      parent: 'bbbbbbbb-0000-0000-0000-000000000001',
      sharedFields: [],
    });
    const apple = makeItem({
      id: 'bbbbbbbb-0000-0000-0000-000000000003',
      path: '/sitecore/content/P2/Apple',
      parent: 'bbbbbbbb-0000-0000-0000-000000000001',
      sharedFields: [],
    });
    const engine = buildEngine([parent, zebra, apple]);
    const result = resolveLookupSource('/sitecore/content/P2', undefined, engine);
    expect(result.resolved).toBe(true);
    expect(result.items).toHaveLength(2);
    // Both default to 100; name tiebreak puts Apple before Zebra.
    expect(result.items[0].name).toBe('Apple');
    expect(result.items[1].name).toBe('Zebra');
  });

  it('child-axis query: items sorted by __Sortorder ascending', () => {
    const parentA = makeItem({
      id: 'cccccccc-0000-0000-0000-000000000001',
      path: '/sitecore/content/Root',
    });
    const parentB = makeItem({
      id: 'cccccccc-0000-0000-0000-000000000002',
      path: '/sitecore/content/Root/Sub',
      parent: 'cccccccc-0000-0000-0000-000000000001',
    });
    const first = makeItem({
      id: 'cccccccc-0000-0000-0000-000000000003',
      path: '/sitecore/content/Root/Sub/First',
      parent: 'cccccccc-0000-0000-0000-000000000002',
      sharedFields: [{ id: SORTORDER_FIELD_ID, hint: '__Sortorder', value: '10' }],
    });
    const third = makeItem({
      id: 'cccccccc-0000-0000-0000-000000000004',
      path: '/sitecore/content/Root/Sub/Third',
      parent: 'cccccccc-0000-0000-0000-000000000002',
      sharedFields: [{ id: SORTORDER_FIELD_ID, hint: '__Sortorder', value: '300' }],
    });
    const second = makeItem({
      id: 'cccccccc-0000-0000-0000-000000000005',
      path: '/sitecore/content/Root/Sub/Second',
      parent: 'cccccccc-0000-0000-0000-000000000002',
      sharedFields: [{ id: SORTORDER_FIELD_ID, hint: '__Sortorder', value: '100' }],
    });
    const engine = buildEngine([parentA, parentB, first, third, second]);
    const source = "query:/sitecore/content/Root/*[@@name='Sub']";
    const result = resolveLookupSource(source, undefined, engine);
    expect(result.resolved).toBe(true);
    expect(result.items).toHaveLength(3);
    expect(result.items.map(i => i.name)).toEqual(['First', 'Second', 'Third']);
  });
});
