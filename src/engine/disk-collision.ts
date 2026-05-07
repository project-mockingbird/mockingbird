import { stat } from 'fs/promises';

export type DiskCollision = {
  kind: 'file' | 'dir';
  path: string;
};

/**
 * Pre-flight check for rename/move: surface orphan files or directories
 * at the destination paths BEFORE attempting fs.rename.
 *
 * The sibling-collision validator only sees tree-registered items. A
 * file or directory with the destination name that has no matching
 * .yml (no parser pass -> no tree node) stays invisible to the
 * validator and ambushes fs.rename, which on Windows surfaces as a
 * raw EPERM (existing-dir target). Stat both targets up front and
 * return a clear collision record so the caller can throw an
 * actionable error instead of leaking the OS error.
 *
 * Returns the first collision found, or null if both paths are clear.
 */
export async function findDiskCollision(
  newFilePath: string,
  newDirPath: string,
): Promise<DiskCollision | null> {
  if (await pathExists(newFilePath)) {
    return { kind: 'file', path: newFilePath };
  }
  if (await pathExists(newDirPath)) {
    return { kind: 'dir', path: newDirPath };
  }
  return null;
}

export function diskCollisionError(newName: string, collision: DiskCollision): string {
  const what = collision.kind === 'dir' ? 'directory' : 'file';
  return (
    `Cannot use the name "${newName}": a ${what} with that name already ` +
    `exists on disk at "${collision.path}" but is not registered in the ` +
    `engine. Manually remove it before retrying.`
  );
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
