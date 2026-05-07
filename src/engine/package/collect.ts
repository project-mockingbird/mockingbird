// src/engine/package/collect.ts
//
// Source-resolution pass for the package builder. Takes a list of cart
// sources (root id + scope), expands each source against the engine's tree,
// dedupes by item id, and returns the result sorted parents-before-children.
//
// Key design choices:
//   - Sources are processed in input order, but the final `items` list is
//     sorted by sitecore path lexicographically, which trivially places
//     parents before children (every ancestor's path is a strict prefix of
//     every descendant's path).
//   - Dedupe is by item id, first-occurrence-wins. The user can pile on
//     overlapping sources without producing duplicate entries; source order
//     does not affect the output set.
//   - Unresolved roots (item id no longer in the tree) produce a warning
//     and the source is skipped; the caller continues with the remaining
//     sources rather than aborting the whole build.

import type { Engine } from '../index.js';
import type { ItemNode, ScsItem } from '../types.js';
import { walkSubtree } from '../walk-subtree.js';
import type { CartSource, PackageWarning } from './types.js';

export interface CollectResult {
  /** Deduped, parents-before-children-sorted items. */
  items: ScsItem[];
  /** Per-source warnings (e.g. unresolved roots). */
  warnings: PackageWarning[];
}

/**
 * Resolve a list of cart sources against the engine, dedupe by id, and
 * return the result in path-lex order.
 */
export function collectSources(engine: Engine, sources: CartSource[]): CollectResult {
  const seen = new Set<string>();
  const items: ScsItem[] = [];
  const warnings: PackageWarning[] = [];

  for (const source of sources) {
    const node = engine.getItemById(source.rootItemId);
    if (!node) {
      warnings.push({
        kind: 'unresolved-root',
        sourceId: source.id,
        rootPath: source.rootItemPath,
      });
      continue;
    }
    const subset = expandSource(engine, node, source.scope);
    for (const item of subset) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      items.push(item);
    }
  }

  // Path-prefix ordering trivially places parents before children.
  items.sort((a, b) => a.path.localeCompare(b.path));
  return { items, warnings };
}

/**
 * Expand a single cart source according to its scope. Mirrors the four-way
 * scope dropdown in the cart UI (and Sitecore's Quick Download Tree as
 * Package menu).
 */
function expandSource(
  engine: Engine,
  node: ItemNode,
  scope: CartSource['scope'],
): ScsItem[] {
  switch (scope) {
    case 'itemAndDescendants':
      return walkSubtree(engine, node.item.id);
    case 'descendantsOnly':
      return walkSubtree(engine, node.item.id, { includeRoot: false });
    case 'itemAndChildren':
      return [node.item, ...[...node.children.values()].map(c => c.item)];
    case 'childrenOnly':
      return [...node.children.values()].map(c => c.item);
  }
}
