import type { Engine } from './index.js';
import type { ItemNode } from './types.js';
import { rename, mkdir } from 'fs/promises';
import { dirname, join } from 'path';
import { walkSubtree } from './walk-subtree.js';
import { getNameVsSiblingsError, getSiblingNames } from './name-validation.js';
import { findDiskCollision, diskCollisionError } from './disk-collision.js';

export type RenameItemArgs = {
  itemId: string;
  newName: string;
};

export type RenameItemResult = {
  itemId: string;
  fromPath: string;
  toPath: string;
  /** Updated ItemNode for the renamed root (post-rename). */
  renamedRoot: ItemNode;
};

/**
 * Rename an item: change its last-path-segment, propagate the path change to
 * every descendant, and rename the YAML on disk (file + wrapping children
 * directory if present). IDs are preserved.
 *
 * Mirrors `Sitecore.Shell.Framework.Commands.Rename` -> `Item.Name = newName`,
 * which under the hood renames the item and recursively rewrites
 * descendant paths.
 *
 * Refuses on:
 *   - Source missing or registry-only
 *   - Same name (no-op)
 *   - Invalid name (per Sitecore name rules)
 *   - Sibling name collision (no auto-rename - Sitecore parity)
 *
 * Disk-path computation mirrors moveItem: rename within the SAME parent
 * directory rather than re-resolving via `engine.resolveFilePath`, which
 * would produce a deep-nested layout incompatible with the existing
 * sibling-style on-disk shape.
 */
export async function renameItem(
  engine: Engine,
  args: RenameItemArgs,
): Promise<RenameItemResult> {
  const node = engine.getItemById(args.itemId);
  if (!node) {
    if (engine.getRegistryItem(args.itemId)) {
      throw new Error(
        `Cannot rename registry-only item: ${args.itemId}. ` +
        `Editable OOTB items are not yet supported.`,
      );
    }
    throw new Error(`Item not found: ${args.itemId}`);
  }

  const oldName = node.item.path.split('/').pop() ?? '';
  const newName = args.newName.trim();

  if (newName === oldName) {
    throw new Error(`Item is already named ${oldName}`);
  }

  const parentNode = node.parentNode;
  if (!parentNode) {
    throw new Error(`Cannot rename a root-level item: ${args.itemId}`);
  }
  const siblings = getSiblingNames(parentNode).filter(
    n => n.toLowerCase() !== oldName.toLowerCase(),
  );
  const err = getNameVsSiblingsError(newName, siblings);
  if (err) throw new Error(err);

  // -- Compute disk paths in the SAME parent directory (rename in place).
  const oldRootPath = node.item.path;
  const oldFilePath = node.filePath;
  const oldDirPath = oldFilePath.replace(/\.yml$/i, '');
  const subtree = walkSubtree(engine, args.itemId, { includeRoot: true });
  const hasChildrenDir = subtree.length > 1;

  const parentDir = dirname(oldFilePath);
  const newFilePath = join(parentDir, `${newName}.yml`);
  const newDirPath = join(parentDir, newName);
  const newRootPath = `${parentNode.item.path}/${newName}`;

  // -- Pre-flight: catch orphan files/dirs at the destination that the
  // sibling-name validator can't see (e.g. a leftover empty `Data/` from
  // a partial-write failure). On Windows, hitting one of these with
  // fs.rename surfaces as a raw EPERM, which is opaque to the user.
  const collision = await findDiskCollision(newFilePath, newDirPath);
  if (collision) {
    throw new Error(diskCollisionError(newName, collision));
  }

  // -- Suppress watcher for every affected path BEFORE any fs op.
  // Without this, chokidar's add(newPath) echo would race the YAML
  // rewrite below and re-index the node under its old `Path` field via
  // tree.addItem's idempotent re-add. See `move-item.ts` for the
  // identical concern in the parent-change case.
  engine.suppressWatcherFor(oldFilePath);
  engine.suppressWatcherFor(newFilePath);
  for (const src of subtree) {
    if (src.id === args.itemId) continue;
    const childNode = engine.getItemById(src.id);
    if (!childNode) continue;
    const oldDescPath = childNode.filePath;
    const newDescPath = newDirPath + oldDescPath.slice(oldDirPath.length);
    engine.suppressWatcherFor(oldDescPath);
    engine.suppressWatcherFor(newDescPath);
  }

  // -- Atomic rename: .yml first, then wrapping dir if present.
  await mkdir(parentDir, { recursive: true });
  await rename(oldFilePath, newFilePath);
  if (hasChildrenDir) {
    try {
      await rename(oldDirPath, newDirPath);
    } catch (err) {
      // Roll back the .yml rename so the source isn't left split between
      // two filenames.
      await rename(newFilePath, oldFilePath).catch(() => {});
      throw err;
    }
  }

  // -- Update live tree.
  // relinkItem with the same parent id re-keys byPath / byUrlSafePath for
  // the root and every descendant via its `updatePathsRecursive` pass. The
  // unlink-then-relink to the SAME parent is harmless.
  engine.getTree().relinkItem(args.itemId, parentNode.item.id, newRootPath);

  // -- Refresh per-node filePath via prefix-replace, mirroring moveItem.
  for (const src of subtree) {
    const itemNode = engine.getItemById(src.id)!;
    if (src.id === args.itemId) {
      itemNode.filePath = newFilePath;
    } else if (itemNode.filePath.startsWith(oldDirPath)) {
      itemNode.filePath = newDirPath + itemNode.filePath.slice(oldDirPath.length);
    }
  }

  // -- Rewrite YAMLs with the post-rename `Path` field. fs.rename only
  // moved bytes; without re-serializing each item, the file at the new
  // location still contains the pre-rename `Path: ...` value. Watcher
  // echoes are suppressed at the top of this function.
  for (const src of subtree) {
    const itemNode = engine.getItemById(src.id)!;
    await engine.writeItemFileAt(itemNode.item, itemNode.filePath);
  }

  return {
    itemId: args.itemId,
    fromPath: oldRootPath,
    toPath: newRootPath,
    renamedRoot: engine.getItemById(args.itemId)!,
  };
}
