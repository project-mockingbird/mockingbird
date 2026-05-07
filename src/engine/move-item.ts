import { rename, mkdir } from 'fs/promises';
import { dirname, join } from 'path';
import type { Engine } from './index.js';
import type { ItemNode } from './types.js';
import { walkSubtree } from './walk-subtree.js';
import { getSiblingNames } from './name-validation.js';
import { findDiskCollision, diskCollisionError } from './disk-collision.js';

export type MoveItemArgs = {
  sourceId: string;
  destinationParentId: string;
};

export type MoveItemResult = {
  movedRootId: string;
  fromPath: string;
  /** Updated ItemNode for the moved root (post-move). */
  movedRoot: ItemNode;
  /** Every node in the moved subtree (root + descendants), post-move. */
  movedItems: ItemNode[];
};

/**
 * Sitecore-parity Move: relocate an item subtree under a new parent.
 * Item IDs are preserved; YAML files are renamed atomically.
 *
 * Mirrors `Sitecore.Shell.Framework.Pipelines.MoveItems.Move` ->
 * `Item.MoveTo(destination)` -> `ItemManager.MoveItem(...)`. Sitecore's
 * `Item.MoveTo` asserts duplicate-item-name UNLESS the destination is
 * already the current parent (no-op) - we go further and explicitly
 * refuse moving to current parent rather than silently no-op'ing.
 */
export async function moveItem(
  engine: Engine,
  args: MoveItemArgs,
): Promise<MoveItemResult> {
  const sourceNode = engine.getItemById(args.sourceId);
  if (!sourceNode) {
    if (engine.getRegistryItem(args.sourceId)) {
      throw new Error(
        `Cannot move registry-only item: ${args.sourceId}. ` +
        `Editable OOTB items are not yet supported.`,
      );
    }
    throw new Error(`Source item not found: ${args.sourceId}`);
  }

  const destinationParent = engine.getItemById(args.destinationParentId);
  if (!destinationParent) {
    throw new Error(`Destination parent not found: ${args.destinationParentId}`);
  }

  if (args.sourceId === args.destinationParentId) {
    throw new Error(`Cannot move an item into itself`);
  }

  const subtree = walkSubtree(engine, args.sourceId, { includeRoot: true });
  const subtreeIds = new Set(subtree.map(s => s.id));
  if (subtreeIds.has(args.destinationParentId)) {
    throw new Error(`Cannot move an item into one of its own descendants`);
  }

  if (sourceNode.item.parent === args.destinationParentId) {
    throw new Error(
      `Item is already a child of ${destinationParent.item.path}`,
    );
  }

  const sourceName = sourceNode.item.path.split('/').pop() ?? '';
  const sourceNameLower = sourceName.toLowerCase();
  const collision = getSiblingNames(destinationParent).find(
    (s) => s.toLowerCase() === sourceNameLower,
  );
  if (collision) {
    throw new Error(
      `An item named ${sourceName} already exists at ${destinationParent.item.path}`,
    );
  }

  // -- Compute disk paths --
  // The on-disk convention mirrors Sitecore's SCS layout: an item's children
  // live in `<parent-stem>/` next to the parent's `.yml` file, where
  // `<parent-stem>` is the parent's filePath with the `.yml` stripped. So
  // moving SOURCE under DEST means SOURCE's new location is
  // `<dest-stem>/<sourceName>.yml`, with its own children dir at
  // `<dest-stem>/<sourceName>/`.
  const oldRootPath = sourceNode.item.path;
  const oldFilePath = sourceNode.filePath;
  const oldDirPath = oldFilePath.replace(/\.yml$/i, '');
  const hasChildrenDir = subtree.length > 1;

  const newRootName = sourceName;
  const newRootPath = `${destinationParent.item.path}/${newRootName}`;
  const destStem = destinationParent.filePath.replace(/\.yml$/i, '');
  const newFilePath = join(destStem, `${newRootName}.yml`);
  const newDirPath = newFilePath.replace(/\.yml$/i, '');

  // -- Pre-flight: catch orphan files/dirs at the destination that the
  // sibling-name validator can't see (e.g. a leftover empty subtree from
  // a partial-write failure). On Windows, hitting one of these with
  // fs.rename surfaces as a raw EPERM, which is opaque to the user.
  const diskCollision = await findDiskCollision(newFilePath, newDirPath);
  if (diskCollision) {
    throw new Error(diskCollisionError(newRootName, diskCollision));
  }

  // -- Suppress watcher for every path involved BEFORE any fs op.
  // Otherwise chokidar would echo the rename's add(newPath) back into
  // tree.addItem, parse the still-stale-content YAML, and re-link the
  // moved node to its old parent. Suppression is registered up-front
  // (sync map writes) so the watcher's async event handler sees the
  // entries no matter how fast chokidar fires.
  engine.suppressWatcherFor(oldFilePath);
  engine.suppressWatcherFor(newFilePath);
  for (const src of subtree) {
    if (src.id === args.sourceId) continue;
    const node = engine.getItemById(src.id);
    if (!node) continue;
    const oldDescPath = node.filePath;
    const newDescPath = newDirPath + oldDescPath.slice(oldDirPath.length);
    engine.suppressWatcherFor(oldDescPath);
    engine.suppressWatcherFor(newDescPath);
  }

  // -- Atomic rename: .yml file first, then children-directory if present.
  // If the directory rename fails, roll back the .yml rename so the source
  // isn't left split across two locations on disk.
  await mkdir(dirname(newFilePath), { recursive: true });
  await rename(oldFilePath, newFilePath);
  if (hasChildrenDir) {
    try {
      await rename(oldDirPath, newDirPath);
    } catch (err) {
      await rename(newFilePath, oldFilePath).catch(() => {});
      throw err;
    }
  }

  // -- Update live tree.
  // `relinkItem` handles the recursive path index refresh (byPath /
  // byUrlSafePath) for the root and every descendant in one pass. It also
  // mutates each item's `path` field in place and the moved root's
  // `parent` field, so subsequent serialization captures the correct
  // post-move state.
  engine.getTree().relinkItem(args.sourceId, destinationParent.item.id, newRootPath);

  // -- Refresh per-node filePath for the moved subtree.
  // relinkItem updates `item.path` but does not touch `node.filePath` -
  // we map each node's old on-disk location into the destination by
  // prefix-replacing the old root file/dir with the new ones. Mirrors
  // what `relinkItem` does for the in-memory `item.path`.
  const movedItems: ItemNode[] = [];
  for (const src of subtree) {
    const node = engine.getItemById(src.id)!;
    if (src.id === args.sourceId) {
      node.filePath = newFilePath;
    } else if (node.filePath.startsWith(oldDirPath)) {
      node.filePath = newDirPath + node.filePath.slice(oldDirPath.length);
    }
    movedItems.push(node);
  }

  // -- Rewrite YAMLs with post-move content. The fs.rename above only
  // moved bytes; the YAML's `Parent` and `Path` fields still point at the
  // pre-move state. Re-serialize each in-memory item (relinkItem just
  // updated `item.path` recursively and `item.parent` for the moved root)
  // and overwrite the file at the new location. Watcher echoes from this
  // write are also covered by the suppressions registered above.
  for (const node of movedItems) {
    await engine.writeItemFileAt(node.item, node.filePath);
  }

  return {
    movedRootId: args.sourceId,
    fromPath: oldRootPath,
    movedRoot: engine.getItemById(args.sourceId)!,
    movedItems,
  };
}
