import { createHash } from 'crypto';

/**
 * Computes a stable 12-char hex identifier for a set of workspace-relative
 * layer paths. Order-independent (paths are sorted first). Workspace-relative
 * is intentional - it makes profiles portable when the same repo is mounted
 * on a different machine.
 */
export function computeProjectHash(workspaceRelativePaths: string[]): string {
  if (workspaceRelativePaths.length === 0) {
    throw new Error('computeProjectHash requires at least one path');
  }
  const sorted = [...workspaceRelativePaths].sort();
  const hash = createHash('sha1').update(sorted.join('\n')).digest('hex');
  return hash.slice(0, 12);
}
