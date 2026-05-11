import type { Engine } from './index.js';
import type { ScsItem } from './types.js';
import { synthesizeItemFromRegistry } from './layout/item-fields.js';

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
 * Falls back to the OOTB registry when `rootId` is not in the user tree, so
 * registry-resident branch prototypes (e.g. SXA Headless tenant + site
 * branches at {2D3805B9-...} and {45CF9F42-...}) can be walked the same way
 * as tree-side branches. Registry items are synthesized into ScsItem shape
 * via `synthesizeItemFromRegistry`.
 *
 * Visited set keys by source GUID to break pathological cycles.
 */
export function walkSubtree(
  engine: Engine,
  rootId: string,
  opts: WalkSubtreeOptions = {},
): ScsItem[] {
  const includeRoot = opts.includeRoot ?? true;
  const visited = new Set<string>();
  const out: ScsItem[] = [];

  const treeNode = engine.getItemById(rootId);
  if (treeNode) {
    if (includeRoot) {
      visited.add(treeNode.item.id);
      out.push(treeNode.item);
    }
    for (const child of treeNode.children.values()) {
      walkInto(engine, child.item, visited, out);
    }
    return out;
  }

  const regItem = engine.getRegistryItem(rootId);
  if (!regItem) return [];

  if (includeRoot) {
    const synth = synthesizeItemFromRegistry(regItem);
    visited.add(synth.id);
    out.push(synth);
  }
  for (const regChild of engine.getRegistryChildren(regItem.id)) {
    walkIntoRegistry(engine, regChild.id, visited, out);
  }
  return out;
}

function walkInto(engine: Engine, item: ScsItem, visited: Set<string>, out: ScsItem[]): void {
  if (visited.has(item.id)) return;
  visited.add(item.id);
  out.push(item);
  const node = engine.getItemById(item.id);
  if (node) {
    for (const child of node.children.values()) {
      walkInto(engine, child.item, visited, out);
    }
    return;
  }
  // Tree-resident root may have registry-resident descendants in mixed-source
  // subtrees (rare but possible). Fall through to registry walk.
  for (const regChild of engine.getRegistryChildren(item.id)) {
    walkIntoRegistry(engine, regChild.id, visited, out);
  }
}

function walkIntoRegistry(engine: Engine, regItemId: string, visited: Set<string>, out: ScsItem[]): void {
  if (visited.has(regItemId)) return;
  const reg = engine.getRegistryItem(regItemId);
  if (!reg) return;
  visited.add(reg.id);
  out.push(synthesizeItemFromRegistry(reg));
  for (const regChild of engine.getRegistryChildren(reg.id)) {
    walkIntoRegistry(engine, regChild.id, visited, out);
  }
}
