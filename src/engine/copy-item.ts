import type { Engine } from './index.js';
import type { ItemNode } from './types.js';
import { copySubtree } from './copy-subtree.js';
import { getCopyOfName } from './get-copy-of-name.js';
import { getSiblingNames } from './name-validation.js';

export type CopyItemArgs = {
  sourceId: string;
  destinationParentId: string;
  /**
   * Optional explicit name. When omitted, the engine computes a
   * conflict-free name via `getCopyOfName` (Sitecore parity:
   * "<name>" -> "Copy of <name>" -> "Copy of <name> 1" -> ...).
   * The web UI always omits this; tests and scripted callers may set it.
   */
  name?: string;
};

export type CopyItemResult = {
  rootItemId: string;
  createdItems: ItemNode[];
};

/**
 * Sitecore-parity Copy: deep-copy an item subtree into a picked destination
 * with fresh GUIDs throughout. Intra-subtree references are rewritten to
 * point at the new copies; references outside the subtree are preserved.
 *
 * Mirrors `Sitecore.Shell.Framework.Pipelines.CopyItems.CopyItem`:
 *   string copyName = ItemUtil.GetCopyOfName(target, itemToCopy.Name);
 *   Item copy = ItemManager.CopyItem(itemToCopy, target, deep: true,
 *                                    copyName, ID.NewID);
 */
export async function copyItem(
  engine: Engine,
  args: CopyItemArgs,
): Promise<CopyItemResult> {
  const sourceNode = engine.getItemById(args.sourceId);
  if (!sourceNode) {
    if (engine.getRegistryItem(args.sourceId)) {
      throw new Error(
        `Cannot copy registry-only item: ${args.sourceId}. ` +
        `Editable OOTB items are not yet supported.`,
      );
    }
    throw new Error(`Source item not found: ${args.sourceId}`);
  }

  const destinationParent = engine.getItemById(args.destinationParentId);
  if (!destinationParent) {
    throw new Error(`Destination parent not found: ${args.destinationParentId}`);
  }

  const sourceName = sourceNode.item.path.split('/').pop() ?? '';
  const siblings = getSiblingNames(destinationParent);
  const name = args.name ?? getCopyOfName(siblings, sourceName);

  return copySubtree(engine, {
    sourceId: args.sourceId,
    destinationParentId: args.destinationParentId,
    rootName: name,
    rewriteIntraSubtreeRefs: true,
  });
}
