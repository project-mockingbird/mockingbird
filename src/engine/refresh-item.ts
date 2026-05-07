import type { Engine } from './index.js';
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
};

/**
 * Manual reload of an item + its on-disk descendants. Re-parses the item's
 * own YAML and walks the wrapping children directory (`<itemFilePath stem>/`)
 * recursively, calling `addItem` (idempotent) for every YAML found. Useful
 * when the in-memory tree drifts from disk - manual edits to YAML, items
 * that fell outside the startup scanner's include scope but exist on disk,
 * or recovery after a partial failure.
 *
 * Out of scope (intentional): does NOT remove items whose YAMLs no longer
 * exist on disk. That's a more invasive operation; v1 is additive.
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
  for (const rel of ymls) {
    const abs = resolve(childrenDir, rel);
    if (abs === node.filePath) continue;
    try {
      const item = await parseItem(abs);
      tree.addItem(item, abs, node.module);
      refreshed++;
    } catch {
      // Skip unparseable YAMLs; surface via the per-call result count.
    }
  }

  return { rootItemId: args.itemId, refreshed };
}
