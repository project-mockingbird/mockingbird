import { describe, it, expect } from 'vitest';
import { Engine } from '../../../src/engine/index.js';
import { ItemTree } from '../../../src/engine/tree.js';
import { Registry } from '../../../src/engine/registry.js';
import type { ScsItem } from '../../../src/engine/types.js';
import { collectSources } from '../../../src/engine/package/collect.js';
import type { CartSource } from '../../../src/engine/package/types.js';

// ---------------------------------------------------------------------------
// Engine fixture builders (mirror item-xml.test.ts / properties.test.ts)
// ---------------------------------------------------------------------------

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
  (engine as unknown as { tree: ItemTree }).tree = tree;
  (engine as unknown as { registry: Registry | null }).registry = null;
  (engine as unknown as { options: { rootDir: string } }).options = { rootDir: '/fake' };
  return engine;
}

/** Fixed test ids so each test reads naturally. */
const ROOT_ID = '11111111-1111-1111-1111-111111111111';
const A_ID    = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const A_B_ID  = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const A_B_C   = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const D_ID    = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

/**
 * Synthetic tree:
 *   /sitecore                       (ROOT_ID)
 *     /sitecore/a                   (A_ID)
 *       /sitecore/a/b               (A_B_ID)
 *         /sitecore/a/b/c           (A_B_C)
 *     /sitecore/d                   (D_ID)
 */
function buildSyntheticTree(): Engine {
  const items: ScsItem[] = [
    makeItem({ id: ROOT_ID, parent: '00000000-0000-0000-0000-000000000000', path: '/sitecore' }),
    makeItem({ id: A_ID,    parent: ROOT_ID, path: '/sitecore/a' }),
    makeItem({ id: A_B_ID,  parent: A_ID,    path: '/sitecore/a/b' }),
    makeItem({ id: A_B_C,   parent: A_B_ID,  path: '/sitecore/a/b/c' }),
    makeItem({ id: D_ID,    parent: ROOT_ID, path: '/sitecore/d' }),
  ];
  return buildEngine(items);
}

function source(overrides: Partial<CartSource> & { rootItemId: string }): CartSource {
  return {
    id: `src-${overrides.rootItemId.slice(0, 8)}`,
    rootItemId: overrides.rootItemId,
    rootItemPath: overrides.rootItemPath ?? '/sitecore/unknown',
    rootItemName: overrides.rootItemName ?? 'unknown',
    scope: overrides.scope ?? 'itemAndDescendants',
    database: 'master',
    ...overrides,
  };
}

// ===========================================================================

describe('collectSources - scope expansion', () => {
  it('itemAndDescendants resolves to the root plus every descendant', () => {
    const engine = buildSyntheticTree();
    const result = collectSources(engine, [
      source({ rootItemId: A_ID, scope: 'itemAndDescendants' }),
    ]);
    expect(result.warnings).toEqual([]);
    expect(result.items.map(i => i.id)).toEqual([A_ID, A_B_ID, A_B_C]);
  });

  it('descendantsOnly skips the root and returns its subtree', () => {
    const engine = buildSyntheticTree();
    const result = collectSources(engine, [
      source({ rootItemId: A_ID, scope: 'descendantsOnly' }),
    ]);
    expect(result.warnings).toEqual([]);
    expect(result.items.map(i => i.id)).toEqual([A_B_ID, A_B_C]);
  });

  it('itemAndChildren returns the root plus direct children only (no grandchildren)', () => {
    const engine = buildSyntheticTree();
    const result = collectSources(engine, [
      source({ rootItemId: ROOT_ID, scope: 'itemAndChildren' }),
    ]);
    expect(result.warnings).toEqual([]);
    // ROOT_ID + A_ID + D_ID (no A_B_ID, no A_B_C).
    expect(result.items.map(i => i.id).sort()).toEqual([ROOT_ID, A_ID, D_ID].sort());
    // Should NOT include grandchildren.
    expect(result.items.map(i => i.id)).not.toContain(A_B_ID);
    expect(result.items.map(i => i.id)).not.toContain(A_B_C);
  });

  it('childrenOnly returns just the direct children (no root, no grandchildren)', () => {
    const engine = buildSyntheticTree();
    const result = collectSources(engine, [
      source({ rootItemId: ROOT_ID, scope: 'childrenOnly' }),
    ]);
    expect(result.warnings).toEqual([]);
    expect(result.items.map(i => i.id).sort()).toEqual([A_ID, D_ID].sort());
    expect(result.items.map(i => i.id)).not.toContain(ROOT_ID);
    expect(result.items.map(i => i.id)).not.toContain(A_B_ID);
  });
});

describe('collectSources - dedupe + ordering', () => {
  it('deduplicates overlapping sources by id (recursive root + single child)', () => {
    const engine = buildSyntheticTree();
    const result = collectSources(engine, [
      source({ rootItemId: A_ID, scope: 'itemAndDescendants' }),
      // Overlap: this source's child is already covered by the first.
      source({ rootItemId: A_B_ID, scope: 'itemAndChildren' }),
    ]);
    expect(result.warnings).toEqual([]);
    const ids = result.items.map(i => i.id);
    // No duplicates.
    expect(new Set(ids).size).toBe(ids.length);
    // All three are present exactly once.
    expect(ids.sort()).toEqual([A_ID, A_B_ID, A_B_C].sort());
  });

  it('orders items by path-prefix (parents before children)', () => {
    const engine = buildSyntheticTree();
    // Add the root last to make sure ordering is path-driven, not insertion-driven.
    const result = collectSources(engine, [
      source({ rootItemId: A_B_ID, scope: 'itemAndDescendants' }),
      source({ rootItemId: A_ID, scope: 'itemAndDescendants' }),
    ]);
    expect(result.warnings).toEqual([]);
    const paths = result.items.map(i => i.path);
    // Path-lex sort should place /a before /a/b before /a/b/c.
    expect(paths).toEqual(['/sitecore/a', '/sitecore/a/b', '/sitecore/a/b/c']);
  });
});

describe('collectSources - error / edge cases', () => {
  it('emits an unresolved-root warning when rootItemId is missing, and continues with the rest', () => {
    const engine = buildSyntheticTree();
    const result = collectSources(engine, [
      source({
        id: 'src-dead',
        rootItemId: 'deadbeef-dead-beef-dead-beefdeadbeef',
        rootItemPath: '/sitecore/dead',
        scope: 'itemAndDescendants',
      }),
      source({ rootItemId: D_ID, scope: 'itemAndDescendants' }),
    ]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toEqual({
      kind: 'unresolved-root',
      sourceId: 'src-dead',
      rootPath: '/sitecore/dead',
    });
    expect(result.items.map(i => i.id)).toEqual([D_ID]);
  });

  it('returns { items: [], warnings: [] } for an empty source list', () => {
    const engine = buildSyntheticTree();
    const result = collectSources(engine, []);
    expect(result.items).toEqual([]);
    expect(result.warnings).toEqual([]);
  });
});
