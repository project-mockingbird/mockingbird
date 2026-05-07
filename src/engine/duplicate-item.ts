import type { Engine } from './index.js';
import type { ItemNode } from './types.js';
import { copySubtree } from './copy-subtree.js';

/**
 * Sitecore-parity duplicate of an item + its descendants.
 *
 * Sitecore: `Item.Duplicate(copyName)` -> `CopyTo(parent, copyName)` ->
 * `CopyTo(destination, copyName, ID.NewID, deep: true)` ->
 * `ItemManager.CopyItem(this, destination, deep, copyName, copyID)`.
 *
 * Implementation note: Duplicate is "Copy to source's own parent without
 * intra-subtree ref retargeting" - Sitecore's Duplicate copies field values
 * verbatim, including any existing references to items inside the copied
 * subtree (refs continue to point at the original items, not the copies).
 * The shared `copySubtree` primitive handles both Duplicate and Copy-to-
 * picked-destination via the `rewriteIntraSubtreeRefs` flag.
 */
export type DuplicateItemArgs = {
  sourceId: string;
  name: string;
};

export type DuplicateItemResult = {
  rootItemId: string;
  createdItems: ItemNode[];
};

export async function duplicateItem(
  engine: Engine,
  args: DuplicateItemArgs,
): Promise<DuplicateItemResult> {
  const sourceNode = engine.getItemById(args.sourceId);
  if (!sourceNode) {
    if (engine.getRegistryItem(args.sourceId)) {
      throw new Error(
        `Cannot duplicate registry-only item: ${args.sourceId}. ` +
        `Editable OOTB items are not yet supported.`,
      );
    }
    throw new Error(`Source item not found: ${args.sourceId}`);
  }

  return copySubtree(engine, {
    sourceId: args.sourceId,
    destinationParentId: sourceNode.item.parent,
    rootName: args.name,
    rewriteIntraSubtreeRefs: false,
  });
}
