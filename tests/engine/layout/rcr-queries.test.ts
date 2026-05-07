import { describe, it, expect } from 'vitest';
import { lookupRcrQuery, RCR_QUERIES, siblingsExcludingTemplate, childrenOfSiblingOfTemplate, siblingsMatchingTemplate } from '../../../src/engine/layout/rcr-queries.js';
import { buildEngine, makeItem } from './_helpers.js';

const SORTORDER_FIELD_ID = 'ba3f86a2-4a1c-4d78-b63d-91c2779c1b5e';

function item(id: string, parent: string, template: string, name: string, sortOrder: number) {
  return makeItem({
    id,
    parent,
    template,
    path: `/sitecore/content/${name}`,
    sharedFields: [{ id: SORTORDER_FIELD_ID, hint: '__Sortorder', value: String(sortOrder) }],
    languages: [{ language: 'en', fields: [], versions: [{ version: 1, fields: [] }] }],
  });
}

describe('lookupRcrQuery — normalization', () => {
  it('returns undefined for an unregistered query', () => {
    expect(lookupRcrQuery("./bogus[@@x='y']")).toBeUndefined();
  });

  it('treats whitespace variations as equivalent', () => {
    // Register a sentinel entry for this test only.
    const key = "../*[@@templateid='{AAAAAAAA-0000-0000-0000-000000000001}']";
    const sentinel = () => [];
    RCR_QUERIES[key] = sentinel;
    try {
      expect(lookupRcrQuery(key)).toBe(sentinel);
      expect(lookupRcrQuery("../*[@@templateid = '{AAAAAAAA-0000-0000-0000-000000000001}']")).toBe(sentinel);
      expect(lookupRcrQuery("  ../*[@@templateid='{AAAAAAAA-0000-0000-0000-000000000001}']  ")).toBe(sentinel);
    } finally {
      delete RCR_QUERIES[key];
    }
  });
});

describe('siblingsExcludingTemplate', () => {
  const PARENT_ID = 'parent00-0000-0000-0000-000000000000';
  const TMPL_KEEP = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const TMPL_SKIP = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

  function tree() {
    const parent = makeItem({ id: PARENT_ID, path: '/sitecore/content/parent', template: TMPL_KEEP });
    const a = item('a0000000-0000-0000-0000-000000000001', PARENT_ID, TMPL_KEEP, 'parent/a', 300);
    const b = item('b0000000-0000-0000-0000-000000000002', PARENT_ID, TMPL_SKIP, 'parent/b', 100);
    const c = item('c0000000-0000-0000-0000-000000000003', PARENT_ID, TMPL_KEEP, 'parent/c', 200);
    const d = item('d0000000-0000-0000-0000-000000000004', PARENT_ID, TMPL_SKIP, 'parent/d', 400);
    return { engine: buildEngine([parent, a, b, c, d]), parent, a, b, c, d };
  }

  it('drops children whose template matches, sorts the rest by __Sortorder', () => {
    const { engine, a, c } = tree();
    const query = siblingsExcludingTemplate(TMPL_SKIP);
    const result = query(a, engine);
    expect(result.map(r => r.id)).toEqual([c.id, a.id]); // sortorder 200, 300
  });

  it('includes the base item when its template does not match the exclusion', () => {
    const { engine, a } = tree();
    const query = siblingsExcludingTemplate(TMPL_SKIP);
    const result = query(a, engine);
    expect(result.map(r => r.id)).toContain(a.id);
  });

  it('returns empty when base has no parent in the engine', () => {
    const orphan = item('orphan00-0000-0000-0000-000000000001', 'missing0-0000-0000-0000-000000000000', TMPL_KEEP, 'orphan', 0);
    const engine = buildEngine([orphan]);
    const query = siblingsExcludingTemplate(TMPL_SKIP);
    expect(query(orphan, engine)).toEqual([]);
  });

  it('is case-insensitive on template id comparison', () => {
    const { engine, a } = tree();
    const query = siblingsExcludingTemplate(TMPL_SKIP.toUpperCase());
    const result = query(a, engine);
    expect(result.every(r => r.template !== TMPL_SKIP)).toBe(true);
  });
});

describe('childrenOfSiblingOfTemplate', () => {
  const PARENT_ID = 'parent01-0000-0000-0000-000000000000';
  const TMPL_CONTAINER = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  const TMPL_OTHER = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  const TMPL_LEAF = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

  function tree() {
    const parent = makeItem({ id: PARENT_ID, path: '/sitecore/content/parent', template: TMPL_OTHER });
    const container = item('cont0000-0000-0000-0000-000000000001', PARENT_ID, TMPL_CONTAINER, 'parent/container', 100);
    const otherSibling = item('othe0000-0000-0000-0000-000000000002', PARENT_ID, TMPL_OTHER, 'parent/other', 200);
    const leaf1 = item('leaf0001-0000-0000-0000-000000000001', container.id, TMPL_LEAF, 'parent/container/leaf1', 300);
    const leaf2 = item('leaf0002-0000-0000-0000-000000000002', container.id, TMPL_LEAF, 'parent/container/leaf2', 100);
    // child of the non-matching sibling — must NOT appear in results
    const strayLeaf = item('stra0000-0000-0000-0000-000000000001', otherSibling.id, TMPL_LEAF, 'parent/other/stray', 50);
    return {
      engine: buildEngine([parent, container, otherSibling, leaf1, leaf2, strayLeaf]),
      container, leaf1, leaf2, otherSibling, strayLeaf,
    };
  }

  it('returns grandchildren via a templated intermediate sibling, sorted', () => {
    const { engine, container, leaf1, leaf2 } = tree();
    const query = childrenOfSiblingOfTemplate(TMPL_CONTAINER);
    const result = query(container, engine);
    expect(result.map(r => r.id)).toEqual([leaf2.id, leaf1.id]); // sortorder 100, 300
  });

  it('ignores children of non-matching siblings', () => {
    const { engine, container, strayLeaf } = tree();
    const query = childrenOfSiblingOfTemplate(TMPL_CONTAINER);
    const result = query(container, engine);
    expect(result.map(r => r.id)).not.toContain(strayLeaf.id);
  });

  it('returns empty when no sibling matches the template', () => {
    const { engine, container } = tree();
    const query = childrenOfSiblingOfTemplate('ffffffff-ffff-ffff-ffff-ffffffffffff');
    expect(query(container, engine)).toEqual([]);
  });

  it('flattens across multiple matching siblings', () => {
    const parent = makeItem({ id: 'mult0000-0000-0000-0000-000000000000', path: '/x', template: TMPL_OTHER });
    const c1 = item('c1000000-0000-0000-0000-000000000001', parent.id, TMPL_CONTAINER, 'x/c1', 100);
    const c2 = item('c2000000-0000-0000-0000-000000000002', parent.id, TMPL_CONTAINER, 'x/c2', 200);
    const l1 = item('ll100000-0000-0000-0000-000000000001', c1.id, TMPL_LEAF, 'x/c1/l1', 50);
    const l2 = item('ll200000-0000-0000-0000-000000000002', c2.id, TMPL_LEAF, 'x/c2/l2', 25);
    const engine = buildEngine([parent, c1, c2, l1, l2]);
    const query = childrenOfSiblingOfTemplate(TMPL_CONTAINER);
    const result = query(c1, engine);
    expect(result.map(r => r.id)).toEqual([l2.id, l1.id]); // flattened, sorted by sortorder 25, 50
  });
});

describe('siblingsMatchingTemplate', () => {
  const PARENT_ID = 'parent02-0000-0000-0000-000000000000';
  const TMPL_MATCH = 'eeeeeeee-1111-eeee-1111-eeeeeeeeeeee';
  const TMPL_OTHER = 'ffffffff-1111-ffff-1111-ffffffffffff';

  function tree() {
    const parent = makeItem({ id: PARENT_ID, path: '/sitecore/content/parent2', template: TMPL_OTHER });
    const a = item('aa000000-0000-0000-0000-000000000001', PARENT_ID, TMPL_MATCH, 'parent2/a', 300);
    const b = item('bb000000-0000-0000-0000-000000000002', PARENT_ID, TMPL_OTHER, 'parent2/b', 100);
    const c = item('cc000000-0000-0000-0000-000000000003', PARENT_ID, TMPL_MATCH, 'parent2/c', 200);
    const d = item('dd000000-0000-0000-0000-000000000004', PARENT_ID, TMPL_OTHER, 'parent2/d', 400);
    return { engine: buildEngine([parent, a, b, c, d]), parent, a, b, c, d };
  }

  it('keeps only children whose template matches, sorted by __Sortorder', () => {
    const { engine, a, c } = tree();
    const query = siblingsMatchingTemplate(TMPL_MATCH);
    const result = query(a, engine);
    expect(result.map(r => r.id)).toEqual([c.id, a.id]); // sortorder 200, 300
  });

  it('includes the base item when its template matches', () => {
    const { engine, a } = tree();
    const query = siblingsMatchingTemplate(TMPL_MATCH);
    const result = query(a, engine);
    expect(result.map(r => r.id)).toContain(a.id);
  });

  it('returns empty when base has no parent in the engine', () => {
    const orphan = item('orphan01-0000-0000-0000-000000000001', 'missing1-0000-0000-0000-000000000000', TMPL_MATCH, 'orphan2', 0);
    const engine = buildEngine([orphan]);
    const query = siblingsMatchingTemplate(TMPL_MATCH);
    expect(query(orphan, engine)).toEqual([]);
  });

  it('returns empty when no sibling matches the template', () => {
    const { engine, a } = tree();
    const query = siblingsMatchingTemplate('99999999-9999-9999-9999-999999999999');
    expect(query(a, engine)).toEqual([]);
  });

  it('is case-insensitive on template id comparison', () => {
    const { engine, a } = tree();
    const query = siblingsMatchingTemplate(TMPL_MATCH.toUpperCase());
    const result = query(a, engine);
    expect(result.every(r => r.template === TMPL_MATCH)).toBe(true);
    expect(result.length).toBe(2);
  });
});

describe('RCR_QUERIES - registered entries', () => {
  it('resolves InteractionNavigation query', () => {
    const q = lookupRcrQuery("../*[@@templateid!='{DC341F6B-784E-45E5-97D1-FAA87EFA6F06}']");
    expect(q).toBeDefined();
  });

  it('resolves BigQueryLinks query', () => {
    const q = lookupRcrQuery("../*[@@templateid='{353C1A17-77EE-4432-948E-2395A1FF0197}']/*");
    expect(q).toBeDefined();
  });

  it('resolves Related Links query (children of DC341F6B template)', () => {
    const q = lookupRcrQuery("../*[@@templateid='{DC341F6B-784E-45E5-97D1-FAA87EFA6F06}']/*");
    expect(q).toBeDefined();
  });

  it('resolves Data Attributes query (children of 1B75D33C template)', () => {
    const q = lookupRcrQuery("../*[@@templateid='{1B75D33C-1E5F-4128-B623-58387020E17E}']/*");
    expect(q).toBeDefined();
  });

  it('resolves Data Notes query (siblings of 1B75D33C template)', () => {
    const q = lookupRcrQuery("../*[@@templateid='{1B75D33C-1E5F-4128-B623-58387020E17E}']");
    expect(q).toBeDefined();
  });
});

describe('RCR comparators — name tiebreak on equal __Sortorder (0.4.0.11)', () => {
  // All three RCR factories previously sorted by `__Sortorder` only.
  // When all siblings share the default sort order, the emission order
  // came from NTFS-enumerated insertion (reverse-alphabetical on the
  // developer's machine). Item 1 of 0.4.0.11 adds a case-insensitive
  // name tiebreak via the shared `compareSitecoreSiblings` helper.

  const TEMPLATE_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const TEMPLATE_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

  it('siblingsExcludingTemplate: equal sort orders → alphabetical tiebreak', () => {
    const parent = makeItem({ id: 'parent', path: '/root', template: TEMPLATE_A });
    const base = makeItem({ id: 'ba5e', path: '/root/base', template: TEMPLATE_A, parent: 'parent' });
    const c1 = makeItem({ id: 'c1', path: '/root/pathology', template: TEMPLATE_A, parent: 'parent' });
    const c2 = makeItem({ id: 'c2', path: '/root/flowsheet', template: TEMPLATE_A, parent: 'parent' });
    const c3 = makeItem({ id: 'c3', path: '/root/lab', template: TEMPLATE_A, parent: 'parent' });
    const excl = makeItem({ id: 'ex', path: '/root/excluded', template: TEMPLATE_B, parent: 'parent' });
    const engine = buildEngine([parent, base, c1, c2, c3, excl]);
    const factory = siblingsExcludingTemplate(TEMPLATE_B);
    const result = factory(base, engine).map(i => i.path.split('/').pop());
    expect(result).toEqual(['base', 'flowsheet', 'lab', 'pathology']);
  });

  it('siblingsMatchingTemplate: equal sort orders → alphabetical tiebreak', () => {
    const parent = makeItem({ id: 'parent', path: '/root', template: TEMPLATE_A });
    const base = makeItem({ id: 'ba5e', path: '/root/base', template: TEMPLATE_A, parent: 'parent' });
    const c1 = makeItem({ id: 'c1', path: '/root/zeta', template: TEMPLATE_B, parent: 'parent' });
    const c2 = makeItem({ id: 'c2', path: '/root/alpha', template: TEMPLATE_B, parent: 'parent' });
    const c3 = makeItem({ id: 'c3', path: '/root/beta', template: TEMPLATE_B, parent: 'parent' });
    const engine = buildEngine([parent, base, c1, c2, c3]);
    const factory = siblingsMatchingTemplate(TEMPLATE_B);
    const result = factory(base, engine).map(i => i.path.split('/').pop());
    expect(result).toEqual(['alpha', 'beta', 'zeta']);
  });

  it('childrenOfSiblingOfTemplate: equal sort orders → alphabetical tiebreak', () => {
    // Regression guard for the third RCR factory (covers the `grandchildren`
    // sort at rcr-queries.ts:91). Same helper; identical tiebreak semantics
    // as the two factories above.
    const parent = makeItem({ id: 'parent', path: '/root', template: TEMPLATE_A });
    const base = makeItem({ id: 'ba5e', path: '/root/base', template: TEMPLATE_A, parent: 'parent' });
    const container = makeItem({ id: 'cont', path: '/root/container', template: TEMPLATE_B, parent: 'parent' });
    const g1 = makeItem({ id: 'g1', path: '/root/container/zeta', template: TEMPLATE_A, parent: 'cont' });
    const g2 = makeItem({ id: 'g2', path: '/root/container/alpha', template: TEMPLATE_A, parent: 'cont' });
    const g3 = makeItem({ id: 'g3', path: '/root/container/beta', template: TEMPLATE_A, parent: 'cont' });
    const engine = buildEngine([parent, base, container, g1, g2, g3]);
    const factory = childrenOfSiblingOfTemplate(TEMPLATE_B);
    const result = factory(base, engine).map(i => i.path.split('/').pop());
    expect(result).toEqual(['alpha', 'beta', 'zeta']);
  });
});
