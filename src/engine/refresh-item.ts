import type { Engine } from './index.js';
import type { ItemNode } from './types.js';
import type { ItemTree } from './tree.js';
import { parseItem } from './parser.js';
import { glob } from 'glob';
import { resolve } from 'path';

export type RefreshItemArgs = {
  itemId: string;
};

export type RefreshItemResult = {
  rootItemId: string;
  /** Total YAMLs re-parsed (root + descendants found on disk). */
  refreshed: number;
  /** In-memory descendants removed because their YAML no longer exists on disk. */
  removed: number;
};

/**
 * Manual reconcile of an item + its on-disk descendants against disk. Re-parses
 * the item's own YAML and walks the wrapping children directory
 * (`<itemFilePath stem>/`) recursively, calling `addItem` (idempotent) for every
 * YAML found (adds new files, updates changed ones), then prunes in-memory
 * descendants whose YAML is no longer on disk.
 *
 * This is the manual escape hatch for environments where the live file watcher
 * can't see host-side changes - notably Docker Desktop / WSL2 bind mounts, where
 * host inotify events never reach the container, so adds/edits/deletes made on
 * the host don't propagate until a Refresh.
 *
 * The prune reuses the same glob results the add pass already collected, so it
 * never stats per-node - that would reintroduce the bind-mount stat-storm the
 * index cache deliberately avoids. To protect live data, a node is removed only
 * when its own YAML is gone AND its entire in-memory subtree is gone from disk;
 * a deleted item whose descendant YAML still exists (partial deletion) is kept
 * rather than cascade-removed, so an on-disk item is never destroyed.
 */
export async function refreshItem(
  engine: Engine,
  args: RefreshItemArgs,
): Promise<RefreshItemResult> {
  const node = engine.getItemById(args.itemId);
  if (!node) {
    if (engine.getRegistryItem(args.itemId)) {
      throw new Error(
        `Cannot refresh registry-only item: ${args.itemId}. ` +
        `Editable OOTB items are not yet supported.`,
      );
    }
    throw new Error(`Item not found: ${args.itemId}`);
  }

  const tree = engine.getTree();
  let refreshed = 0;

  const rootItem = await parseItem(node.filePath);
  tree.addItem(rootItem, node.filePath, node.module);
  refreshed++;

  // Walk the wrapping children directory if it exists. The convention is:
  // `<dir>/<name>.yml` is the item, `<dir>/<name>/` (sibling directory) is
  // the children root. Some items use the deep-nested layout where the item
  // YAML lives inside its own directory; handle both.
  const childrenDir = node.filePath.replace(/\.yml$/i, '');
  const ymls = await glob('**/*.yml', { cwd: childrenDir }).catch(() => [] as string[]);

  // The set of absolute on-disk YAML paths for this subtree (root + every
  // descendant found by the glob above). Reused by the prune pass below so it
  // never re-stats the filesystem.
  const onDisk = new Set<string>([node.filePath]);

  for (const rel of ymls) {
    const abs = resolve(childrenDir, rel);
    onDisk.add(abs);
    if (abs === node.filePath) continue;
    try {
      const item = await parseItem(abs);
      tree.addItem(item, abs, node.module);
      refreshed++;
    } catch {
      // Skip unparseable YAMLs; surface via the per-call result count.
    }
  }

  const removed = pruneMissingDescendants(tree, node, onDisk);

  return { rootItemId: args.itemId, refreshed, removed };
}

/** Count of nodes in `node`'s subtree, inclusive. */
function countSubtree(node: ItemNode): number {
  let n = 1;
  for (const [, child] of node.children) n += countSubtree(child);
  return n;
}

/** Does any node in `node`'s subtree (inclusive) still have a YAML on disk? */
function subtreeHasLiveFile(node: ItemNode, onDisk: Set<string>): boolean {
  if (onDisk.has(node.filePath)) return true;
  for (const [, child] of node.children) {
    if (subtreeHasLiveFile(child, onDisk)) return true;
  }
  return false;
}

/**
 * Remove in-memory descendants of `root` whose YAML no longer exists on disk.
 * Returns the number of nodes removed (a removed subtree counts every node in
 * it). The root itself is never removed - refresh is rooted at an item that is
 * still present (its own YAML was just re-parsed).
 */
function pruneMissingDescendants(
  tree: ItemTree,
  root: ItemNode,
  onDisk: Set<string>,
): number {
  let removed = 0;

  const walk = (node: ItemNode): void => {
    // Snapshot children: removeItem mutates the parent's children Map.
    for (const child of Array.from(node.children.values())) {
      if (subtreeHasLiveFile(child, onDisk)) {
        // child or something beneath it is still on disk - keep child, but
        // recurse to prune any fully-dead branches deeper down.
        walk(child);
      } else {
        // The entire subtree under (and including) child is gone from disk -
        // remove it wholesale. removeItem cascades, which is safe here because
        // nothing in the subtree is on disk.
        const count = countSubtree(child);
        tree.removeItem(child.item.id);
        removed += count;
      }
    }
  };

  walk(root);
  return removed;
}
