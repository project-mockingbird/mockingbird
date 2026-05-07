import type { Engine } from './index.js';
import type { ScsItem } from './types.js';

export type WalkSubtreeOptions = {
  /**
   * If true (default), the result starts with the root item itself, then its
   * descendants. If false, the root is skipped and only descendants are
   * returned (matches Sitecore's `BranchItem.AddFromBranchTemplate` which
   * iterates `branch.Children` not the branch itself).
   */
  includeRoot?: boolean;
};

/**
 * Pre-order DFS over an item subtree. Returns the root (optionally) followed
 * by every descendant in the order Sitecore's tree walkers process them.
 *
 * Visited set keys by source GUID to break pathological cycles.
 */
export function walkSubtree(
  engine: Engine,
  rootId: string,
  opts: WalkSubtreeOptions = {},
): ScsItem[] {
  const includeRoot = opts.includeRoot ?? true;
  const node = engine.getItemById(rootId);
  if (!node) return [];
  const visited = new Set<string>();
  const out: ScsItem[] = [];
  if (includeRoot) {
    visited.add(node.item.id);
    out.push(node.item);
    for (const child of node.children.values()) {
      walkInto(engine, child.item, visited, out);
    }
  } else {
    for (const child of node.children.values()) {
      walkInto(engine, child.item, visited, out);
    }
  }
  return out;
}

function walkInto(engine: Engine, item: ScsItem, visited: Set<string>, out: ScsItem[]): void {
  if (visited.has(item.id)) return;
  visited.add(item.id);
  out.push(item);
  const node = engine.getItemById(item.id);
  if (!node) return;
  for (const child of node.children.values()) {
    walkInto(engine, child.item, visited, out);
  }
}
