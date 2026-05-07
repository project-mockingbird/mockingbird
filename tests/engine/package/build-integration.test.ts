import { describe, it, expect } from 'vitest';
import { existsSync } from 'fs';
import { resolve as resolvePath } from 'path';
import { unzipSync } from 'fflate';
import { Engine } from '../../../src/engine/index.js';
import { buildPackage } from '../../../src/engine/package/index.js';
import type { CartSource } from '../../../src/engine/package/types.js';
import type { ItemNode } from '../../../src/engine/types.js';

// ---------------------------------------------------------------------------
// Phase 12 - server-side live-tree integration test for buildPackage.
//
// Companion to build.test.ts (synthetic-fixture coverage of layout +
// warnings + validation) and content tree.test.ts (per-emitter sweep over the
// live tree). This test exercises the full buildPackage entry-point against
// real items picked dynamically from the live serialization tree, so we
// catch shape regressions that the synthetic fixtures don't surface.
//
// Item ids are picked at runtime via engine.getAllItems() - the test code
// never literal-references any path or id from the host tree. Skips
// gracefully when the tree is empty (CI / fresh checkout / no bind-mount).
// ---------------------------------------------------------------------------

describe('buildPackage live-tree integration (Phase 12)', () => {
  it('builds a multi-source package against representative real items', async () => {
    const rootDir = process.env.MOCKINGBIRD_ROOT_DIR ?? process.cwd();
    if (!existsSync(resolvePath(rootDir, 'sitecore.json'))) {
      // No live tree available - skip rather than fail.
      return;
    }

    // Wire up the registry too so OOTB template lookups resolve. Mirrors
    // content tree.test.ts engine setup.
    const registryPath = resolvePath(rootDir, 'data/registry.json.gz');
    const engine = new Engine({
      rootDir,
      watch: false,
      registryPath: existsSync(registryPath) ? registryPath : undefined,
    });
    await engine.startInit();
    await engine.readiness.ready();

    const all = engine.getAllItems();
    if (all.length === 0) {
      // Tree present on disk but empty after parse - still skip.
      return;
    }

    // Pick three representative items.
    //
    // 1. small subtree: any node with 1..19 direct children. We further
    //    require the full descendant count to be < 50 so the test stays
    //    fast - heuristic, not contractual.
    // 2. leaf datasource-ish item: any childless node distinct from #1.
    // 3. media item: any node under /sitecore/media library/. Optional;
    //    skipped if the tree has no media root.
    const subtreeNode = pickSmallSubtree(all);
    const leafNode = pickLeaf(all, subtreeNode);
    const mediaNode = pickMediaItem(all, [subtreeNode, leafNode]);

    const sources: CartSource[] = [];
    if (subtreeNode) {
      sources.push({
        id: 's1',
        rootItemId: subtreeNode.item.id,
        rootItemPath: subtreeNode.item.path,
        rootItemName: lastSegment(subtreeNode.item.path),
        scope: 'itemAndDescendants',
        database: 'master',
      });
    }
    if (leafNode) {
      sources.push({
        id: 's2',
        rootItemId: leafNode.item.id,
        rootItemPath: leafNode.item.path,
        rootItemName: lastSegment(leafNode.item.path),
        scope: 'itemAndChildren',
        database: 'master',
      });
    }
    if (mediaNode) {
      sources.push({
        id: 's3',
        rootItemId: mediaNode.item.id,
        rootItemPath: mediaNode.item.path,
        rootItemName: lastSegment(mediaNode.item.path),
        scope: 'itemAndDescendants',
        database: 'master',
      });
    }

    if (sources.length === 0) {
      // No usable items in the live tree. Skip.
      return;
    }

    const result = await buildPackage(engine, sources, {
      name: 'integration-test',
      author: 'mockingbird',
      version: '1.0',
    });

    // 1. Output is non-empty bytes.
    expect(result.zip.byteLength).toBeGreaterThan(0);

    // 2. We picked real items, so collectSources should produce no
    //    unresolved-root warnings. (parse-failure warnings would also
    //    flag broken items in the live tree - we want zero of either.)
    expect(result.warnings).toEqual([]);

    // 3. itemCount is at least the number of root sources (subtrees may
    //    contribute more).
    expect(result.itemCount).toBeGreaterThanOrEqual(sources.length);

    // 4. Outer zip carries exactly one entry: package.zip.
    const outer = unzipSync(result.zip);
    expect(Object.keys(outer)).toEqual(['package.zip']);

    // 5. Inner zip has the canonical entries.
    const inner = unzipSync(outer['package.zip']);
    expect(inner['installer/version']).toBeDefined();
    expect(
      Object.keys(inner).filter(k => k.startsWith('metadata/sc_')).length,
    ).toBeGreaterThan(0);

    const xmlKeys = Object.keys(inner).filter(k => k.startsWith('items/master/'));
    const propsKeys = Object.keys(inner).filter(k =>
      k.startsWith('properties/items/master/'),
    );
    expect(xmlKeys.length).toBeGreaterThanOrEqual(sources.length);
    // One properties companion per item-version XML body.
    expect(propsKeys.length).toBe(xmlKeys.length);

    // 6. Every items/ entry has a paired properties/items/ entry. The
    //    properties key is `properties/<xml-key>`; stripping the prefix
    //    gives back the xml-key.
    const propsKeysStripped = new Set(propsKeys.map(k => k.replace(/^properties\//, '')));
    for (const xmlKey of xmlKeys) {
      expect(propsKeysStripped.has(xmlKey)).toBe(true);
    }

    // 7. Path-prefix sort sanity. collectSources sorts items by
    //    sitecore-path lexicographically (parents-before-children), and
    //    fflate preserves the insertion order in zip output, so the
    //    items/master/ entries should appear in the same lexicographic
    //    order as the path part of the key (everything between
    //    `items/master/` and the trailing `/{id}/{lang}/{ver}/xml`).
    const pathParts = xmlKeys.map(extractPathPart);
    const sortedParts = [...pathParts].sort((a, b) => a.localeCompare(b));
    expect(pathParts).toEqual(sortedParts);
  }, 60_000);
});

// ---------------------------------------------------------------------------
// Item-picking heuristics. All operate on engine.getAllItems() output;
// they never reference literal paths or ids from the host tree.
// ---------------------------------------------------------------------------

function pickSmallSubtree(all: ItemNode[]): ItemNode | undefined {
  // Prefer a node with a modest direct-child count. We don't enforce a
  // descendant cap because counting descendants requires another walk; in
  // practice the small-direct-child filter is a good enough proxy.
  for (const n of all) {
    if (n.children.size > 0 && n.children.size < 20) return n;
  }
  return undefined;
}

function pickLeaf(all: ItemNode[], skip: ItemNode | undefined): ItemNode | undefined {
  for (const n of all) {
    if (n === skip) continue;
    if (n.children.size === 0) return n;
  }
  return undefined;
}

function pickMediaItem(
  all: ItemNode[],
  skip: Array<ItemNode | undefined>,
): ItemNode | undefined {
  const skipSet = new Set(skip.filter((n): n is ItemNode => !!n));
  for (const n of all) {
    if (skipSet.has(n)) continue;
    // Match the canonical media-library root path (case-insensitive).
    if (n.item.path.toLowerCase().startsWith('/sitecore/media library/')) {
      return n;
    }
  }
  return undefined;
}

function lastSegment(path: string): string {
  const i = path.lastIndexOf('/');
  return i < 0 ? path : path.slice(i + 1);
}

/**
 * The xml-key shape is:
 *   items/master/<sitecore-path>/{ID}/<lang>/<ver>/xml
 * Strip the `items/master/` prefix and the trailing
 * `/{ID}/<lang>/<ver>/xml` to recover the path part used for ordering.
 */
function extractPathPart(xmlKey: string): string {
  const withoutPrefix = xmlKey.replace(/^items\/master\//, '');
  return withoutPrefix.replace(/\/\{[^}]+\}\/[^/]+\/[^/]+\/xml$/, '');
}
