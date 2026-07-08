import { describe, it, expect } from 'vitest';
import { Engine } from '../../src/engine/index.js';
import { ItemTree } from '../../src/engine/tree.js';
import type { ScsItem } from '../../src/engine/types.js';
import { resolveSearch, encodeCursor, decodeCursor, normalizeGuid } from '../../src/engine/search/index.js';
import { TEMPLATE_TEMPLATE_ID, FIELD_IDS } from '../../src/engine/constants.js';

function makeItem(overrides: Partial<ScsItem> & { id: string; path: string }): ScsItem {
  return {
    parent: '00000000-0000-0000-0000-000000000000',
    template: 'ab86861a-6030-46c5-b394-e8f99e8b87db',
    sharedFields: [],
    languages: [],
    ...overrides,
  };
}

function buildEngine(items: ScsItem[]): Engine {
  const engine = Object.create(Engine.prototype) as Engine;
  const tree = new ItemTree();
  for (const item of items) tree.addItem(item, `/fake/${item.id}.yml`);
  (engine as any).tree = tree;
  (engine as any).registry = null;
  (engine as any).options = { rootDir: '/fake' };
  return engine;
}

const TMPL_TOKEN = '7d659ee9-d487-4d40-8a92-10c6d68844c8';
const TMPL_OTHER = '11111111-1111-1111-1111-111111111111';

describe('normalizeGuid', () => {
  it('strips braces + dashes and lowercases', () => {
    expect(normalizeGuid('{DC2CE08C-6C71-48D9-8D16-C73FE6739DCA}')).toBe('dc2ce08c6c7148d98d16c73fe6739dca');
  });
  it('accepts already-normalized 32-hex form', () => {
    expect(normalizeGuid('7d659ee9d4874d408a9210c6d68844c8')).toBe('7d659ee9d4874d408a9210c6d68844c8');
  });
  it('accepts bare dashed form', () => {
    expect(normalizeGuid('7d659ee9-d487-4d40-8a92-10c6d68844c8')).toBe('7d659ee9d4874d408a9210c6d68844c8');
  });
  it('returns undefined for non-GUID input', () => {
    expect(normalizeGuid('hello')).toBeUndefined();
  });
});

describe('encodeCursor / decodeCursor', () => {
  it('round-trips an integer offset', () => {
    expect(decodeCursor(encodeCursor(0))).toBe(0);
    expect(decodeCursor(encodeCursor(42))).toBe(42);
    expect(decodeCursor(encodeCursor(999))).toBe(999);
  });
  it('returns 0 for missing/empty cursor', () => {
    expect(decodeCursor(undefined)).toBe(0);
    expect(decodeCursor('')).toBe(0);
    expect(decodeCursor(null)).toBe(0);
  });
  it('returns 0 for malformed cursor', () => {
    expect(decodeCursor('bogus')).toBe(0);
  });
});

describe('resolveSearch', () => {
  function makeTokenFixture(): { engine: Engine; tokenItems: ScsItem[] } {
    const tokenItems: ScsItem[] = [];
    for (let i = 0; i < 5; i++) {
      tokenItems.push(makeItem({
        id: `${i.toString(16).padStart(8, '0')}-token-token-token-token000token`.replace(/token/g, 'aaaa'),
        path: `/sitecore/content/site/tokens/Token${i}`,
        template: TMPL_TOKEN,
        sharedFields: [
          { id: 'aaa1', hint: 'Key', value: `key-${i}` },
          { id: 'aaa2', hint: 'Value', value: `value-${i}` },
        ],
        languages: [{ language: 'en', fields: [], versions: [{ version: 1, fields: [] }] }],
      }));
    }
    // One item with a different template - should be excluded by the template filter.
    const other = makeItem({
      id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      path: '/sitecore/content/site/other',
      template: TMPL_OTHER,
      languages: [{ language: 'en', fields: [], versions: [{ version: 1, fields: [] }] }],
    });
    return { engine: buildEngine([...tokenItems, other]), tokenItems };
  }

  it('filters by _templates using the 32-hex no-braces format', () => {
    const { engine, tokenItems } = makeTokenFixture();
    const result = resolveSearch(engine, {
      AND: [
        { name: '_templates', value: '7D659EE9D4874D408A9210C6D68844C8', operator: 'CONTAINS' },
      ],
    });
    expect(result.results.map(r => r.item.id).sort()).toEqual(tokenItems.map(t => t.id).sort());
  });

  it('filters by _templates using the brace-wrapped dashed format (caller 2)', () => {
    const { engine, tokenItems } = makeTokenFixture();
    const result = resolveSearch(engine, {
      AND: [
        { name: '_templates', value: '{7D659EE9-D487-4D40-8A92-10C6D68844C8}', operator: 'CONTAINS' },
      ],
    });
    expect(result.results).toHaveLength(tokenItems.length);
  });

  it('filters by _language (only returns items with a version in that language)', () => {
    const items = [
      makeItem({ id: '11111111-1111-1111-1111-111111111111', path: '/a', template: TMPL_TOKEN, languages: [{ language: 'en', fields: [], versions: [{ version: 1, fields: [] }] }] }),
      makeItem({ id: '22222222-2222-2222-2222-222222222222', path: '/b', template: TMPL_TOKEN, languages: [{ language: 'fr', fields: [], versions: [{ version: 1, fields: [] }] }] }),
    ];
    const result = resolveSearch(buildEngine(items), {
      AND: [
        { name: '_templates', value: TMPL_TOKEN, operator: 'CONTAINS' },
        { name: '_language', value: 'en' },
      ],
    });
    expect(result.results.map(r => r.item.id)).toEqual(['11111111-1111-1111-1111-111111111111']);
  });

  it('filters by _path (returns only descendants of the given ancestor id)', () => {
    const ancestorId = 'dc2ce08c-6c71-48d9-8d16-c73fe6739dca';
    const ancestor = makeItem({
      id: ancestorId,
      path: '/sitecore/content/site/Events',
    });
    const insideA = makeItem({
      id: 'aaaa0001-0000-0000-0000-000000000000',
      parent: ancestorId,
      path: '/sitecore/content/site/Events/2026/Spring',
    });
    const insideB = makeItem({
      id: 'aaaa0002-0000-0000-0000-000000000000',
      parent: ancestorId,
      path: '/sitecore/content/site/Events/2026/Summer',
    });
    const outside = makeItem({
      id: 'bbbb0001-0000-0000-0000-000000000000',
      path: '/sitecore/content/site/Home/About',
    });
    const result = resolveSearch(buildEngine([ancestor, insideA, insideB, outside]), {
      AND: [
        { name: '_path', value: '{DC2CE08C-6C71-48D9-8D16-C73FE6739DCA}', operator: 'CONTAINS' },
      ],
    });
    expect(result.results.map(r => r.item.id).sort()).toEqual([
      'aaaa0001-0000-0000-0000-000000000000',
      'aaaa0002-0000-0000-0000-000000000000',
    ]);
  });

  it('paginates with first + after', () => {
    const { engine } = makeTokenFixture();
    const first = resolveSearch(engine, {
      AND: [{ name: '_templates', value: TMPL_TOKEN, operator: 'CONTAINS' }],
    }, { first: 2 });
    expect(first.results).toHaveLength(2);
    expect(first.pageInfo.hasNext).toBe(true);
    expect(first.pageInfo.endCursor).not.toBeNull();

    const second = resolveSearch(engine, {
      AND: [{ name: '_templates', value: TMPL_TOKEN, operator: 'CONTAINS' }],
    }, { first: 2, after: first.pageInfo.endCursor ?? undefined });
    expect(second.results).toHaveLength(2);
    expect(second.pageInfo.hasNext).toBe(true);

    const third = resolveSearch(engine, {
      AND: [{ name: '_templates', value: TMPL_TOKEN, operator: 'CONTAINS' }],
    }, { first: 2, after: second.pageInfo.endCursor ?? undefined });
    expect(third.results).toHaveLength(1);
    expect(third.pageInfo.hasNext).toBe(false);
  });

  it('returns the empty-connection shape when nothing matches', () => {
    const engine = buildEngine([]);
    const result = resolveSearch(engine, {
      AND: [{ name: '_templates', value: TMPL_TOKEN, operator: 'CONTAINS' }],
    });
    expect(result.results).toEqual([]);
    expect(result.pageInfo).toEqual({ hasNext: false, endCursor: null });
  });

  it('defaults operator to EQ when missing (_language clause)', () => {
    const items = [
      makeItem({ id: '11111111-1111-1111-1111-111111111111', path: '/a', template: TMPL_TOKEN, languages: [{ language: 'en', fields: [], versions: [{ version: 1, fields: [] }] }] }),
    ];
    const result = resolveSearch(buildEngine(items), {
      AND: [{ name: '_language', value: 'en' }],
    });
    expect(result.results).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// D2: orderBy, full operators, _name, base-template CONTAINS, nested OR
// ---------------------------------------------------------------------------

const TMPL_ALPHA = 'cccc0001-cccc-cccc-cccc-cccccccccccc';
const TMPL_BASE = 'aaaa0001-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TMPL_DERIVED = 'bbbb0001-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

describe('resolveSearch - orderBy', () => {
  function makeOrderItems(): { engine: Engine } {
    const items: ScsItem[] = [
      makeItem({ id: 'c1111111-cccc-cccc-cccc-cccccccccccc', path: '/a/Item1', template: TMPL_ALPHA, sharedFields: [{ id: 'f001', hint: 'Order', value: '10' }] }),
      makeItem({ id: 'c2222222-cccc-cccc-cccc-cccccccccccc', path: '/a/Item2', template: TMPL_ALPHA, sharedFields: [{ id: 'f001', hint: 'Order', value: '5' }] }),
      makeItem({ id: 'c3333333-cccc-cccc-cccc-cccccccccccc', path: '/a/Item3', template: TMPL_ALPHA, sharedFields: [{ id: 'f001', hint: 'Order', value: '20' }] }),
    ];
    return { engine: buildEngine(items) };
  }

  it('sorts by numeric field DESC (highest first)', () => {
    const { engine } = makeOrderItems();
    const result = resolveSearch(
      engine,
      { AND: [{ name: '_templates', value: TMPL_ALPHA, operator: 'EQ' }] },
      { orderBy: { name: 'Order', direction: 'DESC' } },
    );
    const names = result.results.map(r => r.item.path.split('/').pop());
    expect(names).toEqual(['Item3', 'Item1', 'Item2']);
  });

  it('sorts by numeric field ASC (lowest first)', () => {
    const { engine } = makeOrderItems();
    const result = resolveSearch(
      engine,
      { AND: [{ name: '_templates', value: TMPL_ALPHA, operator: 'EQ' }] },
      { orderBy: { name: 'Order', direction: 'ASC' } },
    );
    const names = result.results.map(r => r.item.path.split('/').pop());
    expect(names).toEqual(['Item2', 'Item1', 'Item3']);
  });

  it('defaults direction to ASC when direction is not specified', () => {
    const { engine } = makeOrderItems();
    const result = resolveSearch(
      engine,
      { AND: [{ name: '_templates', value: TMPL_ALPHA, operator: 'EQ' }] },
      { orderBy: { name: 'Order' } },
    );
    const names = result.results.map(r => r.item.path.split('/').pop());
    expect(names).toEqual(['Item2', 'Item1', 'Item3']);
  });

  it('total remains the full filtered count regardless of orderBy', () => {
    const { engine } = makeOrderItems();
    const result = resolveSearch(
      engine,
      { AND: [{ name: '_templates', value: TMPL_ALPHA, operator: 'EQ' }] },
      { orderBy: { name: 'Order', direction: 'DESC' }, first: 2 },
    );
    expect(result.total).toBe(3);
    expect(result.results).toHaveLength(2);
  });

  it('sorts lexically when field values are not numeric', () => {
    const items: ScsItem[] = [
      makeItem({ id: 'c1111111-cccc-cccc-cccc-cccccccccccc', path: '/a/Alpha', template: TMPL_ALPHA, sharedFields: [{ id: 'f001', hint: 'Label', value: 'Zebra' }] }),
      makeItem({ id: 'c2222222-cccc-cccc-cccc-cccccccccccc', path: '/a/Beta', template: TMPL_ALPHA, sharedFields: [{ id: 'f001', hint: 'Label', value: 'Apple' }] }),
      makeItem({ id: 'c3333333-cccc-cccc-cccc-cccccccccccc', path: '/a/Gamma', template: TMPL_ALPHA, sharedFields: [{ id: 'f001', hint: 'Label', value: 'Mango' }] }),
    ];
    const result = resolveSearch(
      buildEngine(items),
      { AND: [{ name: '_templates', value: TMPL_ALPHA, operator: 'EQ' }] },
      { orderBy: { name: 'Label', direction: 'ASC' } },
    );
    const names = result.results.map(r => r.item.path.split('/').pop());
    expect(names).toEqual(['Beta', 'Gamma', 'Alpha']); // Apple < Mango < Zebra
  });
});

describe('resolveSearch - _name clause', () => {
  function makeNameItems(): Engine {
    return buildEngine([
      makeItem({ id: 'c1111111-cccc-cccc-cccc-cccccccccccc', path: '/a/Alpha', template: TMPL_ALPHA }),
      makeItem({ id: 'c2222222-cccc-cccc-cccc-cccccccccccc', path: '/a/BetaPage', template: TMPL_ALPHA }),
      makeItem({ id: 'c3333333-cccc-cccc-cccc-cccccccccccc', path: '/a/GammaPage', template: TMPL_ALPHA }),
    ]);
  }

  it('EQ filters by item name (case-insensitive)', () => {
    const result = resolveSearch(makeNameItems(), {
      AND: [{ name: '_name', value: 'alpha', operator: 'EQ' }],
    });
    expect(result.results).toHaveLength(1);
    expect(result.results[0].item.id).toBe('c1111111-cccc-cccc-cccc-cccccccccccc');
  });

  it('EQ is case-insensitive', () => {
    const result = resolveSearch(makeNameItems(), {
      AND: [{ name: '_name', value: 'ALPHA', operator: 'EQ' }],
    });
    expect(result.results).toHaveLength(1);
  });

  it('CONTAINS matches items whose name contains the substring', () => {
    const result = resolveSearch(makeNameItems(), {
      AND: [{ name: '_name', value: 'page', operator: 'CONTAINS' }],
    });
    expect(result.results).toHaveLength(2);
  });

  it('NEQ excludes items whose name equals the value', () => {
    const result = resolveSearch(makeNameItems(), {
      AND: [{ name: '_name', value: 'alpha', operator: 'NEQ' }],
    });
    expect(result.results).toHaveLength(2);
    const ids = result.results.map(r => r.item.id);
    expect(ids).not.toContain('c1111111-cccc-cccc-cccc-cccccccccccc');
  });

  it('NCONTAINS excludes items whose name contains the substring', () => {
    const result = resolveSearch(makeNameItems(), {
      AND: [{ name: '_name', value: 'page', operator: 'NCONTAINS' }],
    });
    expect(result.results).toHaveLength(1);
    expect(result.results[0].item.id).toBe('c1111111-cccc-cccc-cccc-cccccccccccc');
  });
});

describe('resolveSearch - _templates CONTAINS with base-template chain', () => {
  function makeBaseTemplateFixture() {
    const items: ScsItem[] = [
      // Template definition items (their template = TEMPLATE_TEMPLATE_ID)
      makeItem({
        id: TMPL_BASE,
        path: '/sitecore/templates/Base',
        template: TEMPLATE_TEMPLATE_ID,
      }),
      makeItem({
        id: TMPL_DERIVED,
        path: '/sitecore/templates/Derived',
        template: TEMPLATE_TEMPLATE_ID,
        sharedFields: [
          { id: FIELD_IDS.baseTemplate, hint: '__Base template', value: `{${TMPL_BASE.toUpperCase()}}` },
        ],
      }),
      // Content items
      makeItem({ id: 'c1111111-cccc-cccc-cccc-cccccccccccc', path: '/sitecore/content/BaseItem', template: TMPL_BASE }),
      makeItem({ id: 'c2222222-cccc-cccc-cccc-cccccccccccc', path: '/sitecore/content/DerivedItem', template: TMPL_DERIVED }),
      makeItem({ id: 'c3333333-cccc-cccc-cccc-cccccccccccc', path: '/sitecore/content/OtherItem', template: TMPL_TOKEN }),
    ];
    return buildEngine(items);
  }

  it('CONTAINS matches items using the exact base template', () => {
    const engine = makeBaseTemplateFixture();
    const result = resolveSearch(engine, {
      AND: [{ name: '_templates', value: TMPL_BASE, operator: 'CONTAINS' }],
    });
    const ids = result.results.map(r => r.item.id);
    expect(ids).toContain('c1111111-cccc-cccc-cccc-cccccccccccc');
  });

  it('CONTAINS matches items using a template that inherits the base template', () => {
    const engine = makeBaseTemplateFixture();
    const result = resolveSearch(engine, {
      AND: [{ name: '_templates', value: TMPL_BASE, operator: 'CONTAINS' }],
    });
    const ids = result.results.map(r => r.item.id);
    expect(ids).toContain('c2222222-cccc-cccc-cccc-cccccccccccc');
  });

  it('CONTAINS does not match items using an unrelated template', () => {
    const engine = makeBaseTemplateFixture();
    const result = resolveSearch(engine, {
      AND: [{ name: '_templates', value: TMPL_BASE, operator: 'CONTAINS' }],
    });
    const ids = result.results.map(r => r.item.id);
    expect(ids).not.toContain('c3333333-cccc-cccc-cccc-cccccccccccc');
  });

  it('EQ does not match items using a derived template (only exact match)', () => {
    const engine = makeBaseTemplateFixture();
    const result = resolveSearch(engine, {
      AND: [{ name: '_templates', value: TMPL_BASE, operator: 'EQ' }],
    });
    const ids = result.results.map(r => r.item.id);
    expect(ids).toContain('c1111111-cccc-cccc-cccc-cccccccccccc');
    expect(ids).not.toContain('c2222222-cccc-cccc-cccc-cccccccccccc');
  });

  it('CONTAINS handles a cycle in the base-template chain without hanging', () => {
    const TMPL_A = 'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const TMPL_B = 'bbbb1111-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    const items: ScsItem[] = [
      makeItem({
        id: TMPL_A,
        path: '/sitecore/templates/TemplA',
        template: TEMPLATE_TEMPLATE_ID,
        sharedFields: [{ id: FIELD_IDS.baseTemplate, hint: '__Base template', value: `{${TMPL_B.toUpperCase()}}` }],
      }),
      makeItem({
        id: TMPL_B,
        path: '/sitecore/templates/TemplB',
        template: TEMPLATE_TEMPLATE_ID,
        sharedFields: [{ id: FIELD_IDS.baseTemplate, hint: '__Base template', value: `{${TMPL_A.toUpperCase()}}` }],
      }),
      makeItem({ id: 'c1111111-cccc-cccc-cccc-cccccccccccc', path: '/sitecore/content/Cyclic', template: TMPL_B }),
    ];
    expect(() => {
      resolveSearch(buildEngine(items), {
        AND: [{ name: '_templates', value: TMPL_A, operator: 'CONTAINS' }],
      });
    }).not.toThrow();
  });
});

describe('resolveSearch - nested OR and AND', () => {
  function makeOrItems(): Engine {
    return buildEngine([
      makeItem({ id: 'c1111111-cccc-cccc-cccc-cccccccccccc', path: '/a/Alpha', template: TMPL_TOKEN }),
      makeItem({ id: 'c2222222-cccc-cccc-cccc-cccccccccccc', path: '/a/Beta', template: TMPL_TOKEN }),
      makeItem({ id: 'c3333333-cccc-cccc-cccc-cccccccccccc', path: '/a/Gamma', template: TMPL_OTHER }),
    ]);
  }

  it('top-level OR returns the union of both branches', () => {
    const result = resolveSearch(makeOrItems(), {
      OR: [
        { name: '_name', value: 'alpha', operator: 'EQ' },
        { name: '_name', value: 'gamma', operator: 'EQ' },
      ],
    });
    expect(result.results).toHaveLength(2);
    const ids = result.results.map(r => r.item.id).sort();
    expect(ids).toContain('c1111111-cccc-cccc-cccc-cccccccccccc');
    expect(ids).toContain('c3333333-cccc-cccc-cccc-cccccccccccc');
  });

  it('AND combined with OR: both must hold', () => {
    const result = resolveSearch(makeOrItems(), {
      AND: [{ name: '_templates', value: TMPL_TOKEN, operator: 'EQ' }],
      OR: [
        { name: '_name', value: 'alpha', operator: 'EQ' },
        { name: '_name', value: 'beta', operator: 'EQ' },
      ],
    });
    expect(result.results).toHaveLength(2);
    const ids = result.results.map(r => r.item.id).sort();
    expect(ids).toContain('c1111111-cccc-cccc-cccc-cccccccccccc');
    expect(ids).toContain('c2222222-cccc-cccc-cccc-cccccccccccc');
  });

  it('nested OR inside AND clause list', () => {
    // where: { AND: [ templateClause, { OR: [nameAlpha, nameBeta] } ] }
    const result = resolveSearch(makeOrItems(), {
      AND: [
        { name: '_templates', value: TMPL_TOKEN, operator: 'EQ' },
        { OR: [
          { name: '_name', value: 'alpha', operator: 'EQ' },
          { name: '_name', value: 'beta', operator: 'EQ' },
        ] },
      ],
    });
    expect(result.results).toHaveLength(2);
  });

  it('OR with zero matching clauses returns empty', () => {
    const result = resolveSearch(makeOrItems(), {
      OR: [
        { name: '_name', value: 'nonexistent', operator: 'EQ' },
      ],
    });
    expect(result.results).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Null/undefined guard: _name clause with no value must not throw
// ---------------------------------------------------------------------------

describe('resolveSearch - _name null guard', () => {
  it('does not throw when _name clause has no value', () => {
    const engine = buildEngine([
      makeItem({ id: 'c1111111-cccc-cccc-cccc-cccccccccccc', path: '/a/Alpha', template: TMPL_ALPHA }),
    ]);
    // GraphQL inputs may omit `value` entirely; the resulting undefined must
    // not reach `applyStringOp` raw (which calls .toLowerCase() on it).
    expect(() =>
      resolveSearch(engine, { AND: [{ name: '_name', operator: 'EQ' }] }),
    ).not.toThrow();
  });

  it('returns zero results when _name clause has no value and operator is EQ', () => {
    const engine = buildEngine([
      makeItem({ id: 'c1111111-cccc-cccc-cccc-cccccccccccc', path: '/a/Alpha', template: TMPL_ALPHA }),
    ]);
    // value coerces to '' - EQ '' matches items whose name is literally empty.
    // 'Alpha' !== '' so zero results.
    const result = resolveSearch(engine, { AND: [{ name: '_name', operator: 'EQ' }] });
    expect(result.results).toHaveLength(0);
  });
});
