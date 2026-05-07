import { describe, it, expect } from 'vitest';
import { Engine } from '../../src/engine/index.js';
import { ItemTree } from '../../src/engine/tree.js';
import type { ScsItem } from '../../src/engine/types.js';
import { resolveSearch, encodeCursor, decodeCursor, normalizeGuid } from '../../src/engine/search/index.js';

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
    // One item with a different template — should be excluded by the template filter.
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
