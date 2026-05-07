import type { RenderingEntry } from './types';

/**
 * Given a parent entry, the full entries array, and the parent's exposed
 * placeholder path (e.g. "/main/container-1"), return every entry whose
 * placeholder is strictly nested under that path. The parent itself is
 * excluded even if its own placeholder equals exposedPath.
 *
 * Matching is prefix + "/" so siblings like "/main/container-10" do not
 * collide with "/main/container-1".
 */
export function findDescendants(
  parent: RenderingEntry,
  all: RenderingEntry[],
  exposedPath: string,
): RenderingEntry[] {
  const prefix = exposedPath + '/';
  return all.filter(
    e => e.uid !== parent.uid && (e.placeholder === exposedPath || e.placeholder.startsWith(prefix)),
  );
}
