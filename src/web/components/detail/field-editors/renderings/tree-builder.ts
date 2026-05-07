// src/web/components/detail/field-editors/renderings/tree-builder.ts

import type { RenderingEntry, TreeNode, TreePlaceholderNode, TreeRenderingNode } from './types';

export interface DiscoveredPlaceholderPath {
  value: string;
  /** UID of the rendering that exposes this path via its declared placeholder
   *  pattern, as computed by the engine's getPlaceholderPaths. The tree-builder
   *  uses this to nest the placeholder under its owning rendering instead of
   *  inferring ownership from segment shape. */
  ownerUid?: string;
}

export interface BuildTreeInput {
  entries: RenderingEntry[];
  /**
   * Non-token-form placeholder paths from GET /api/items/:id/placeholder-paths.
   * "Token-form" paths are SXA dynamic-placeholder substitution sources that
   * still contain literal tokens like '{*}', '{0}', or '{N}' (e.g.
   * '/main/{*}-container'). The caller (RenderingsList) filters those out
   * via the API response's per-path `isTokenForm` flag before passing here.
   */
  discoveredPaths: DiscoveredPlaceholderPath[];
}

/**
 * Convert a flat list of RenderingEntry plus a list of discovered placeholder
 * paths into a nested TreeNode[]. Roots are always placeholder nodes.
 *
 * Algorithm:
 *   1. Collect every placeholder path referenced by entries OR discovery,
 *      plus every '/'-separated ancestor of those paths.
 *   2. Build one placeholder node per path, indexed by full path. Build
 *      one rendering node per entry (with empty children).
 *   3. Compute the claim map: each rendering with a DynamicPlaceholderId
 *      claims any immediate-child placeholder path whose segment matches
 *      its DPI (bare `{dpi}`, `name-{dpi}`, `name-N-{dpi}`, or three-tail
 *      Carousel pattern `name-N-M-K`). First-claim wins for shared shapes.
 *   4. Attach placeholder nodes either to their claiming rendering (if any)
 *      or to their longest strict-prefix placeholder parent (or roots).
 *   5. Append rendering nodes to their exact-path placeholder, preserving
 *      input order.
 *   6. Within each placeholder's children: renderings first (input order),
 *      placeholders second (lexicographic by segment). Within each
 *      rendering's children: placeholders sorted by segment.
 *   7. Roots are sorted by full path.
 */
export function buildTree({ entries, discoveredPaths }: BuildTreeInput): TreeNode[] {
  // Step 1: collect all paths + claim map (path -> owning rendering uid)
  // sourced authoritatively from the engine's discovered-paths response.
  const allPaths = new Set<string>();
  const claims = new Map<string, string>();
  for (const entry of entries) {
    addPathAndAncestors(entry.placeholder, allPaths);
  }
  for (const p of discoveredPaths) {
    addPathAndAncestors(p.value, allPaths);
    if (p.ownerUid) claims.set(p.value, p.ownerUid);
  }

  // Step 2: one placeholder node per path; one rendering node per entry.
  const phNodes = new Map<string, TreePlaceholderNode>();
  for (const path of allPaths) {
    phNodes.set(path, {
      kind: 'placeholder',
      path,
      segment: lastSegment(path),
      children: [],
    });
  }
  const rendNodes = new Map<string, TreeRenderingNode>();
  for (const entry of entries) {
    rendNodes.set(entry.uid, {
      kind: 'rendering',
      entry,
      children: [],
    });
  }

  // Step 3 was: heuristic claim-map computation. Now sourced directly from
  // the engine's ownerUid attribution above.

  // Step 4: attach placeholders. If a path is claimed by a rendering, attach
  // to that rendering's children. Otherwise attach to longest-prefix parent
  // or push to roots.
  const roots: TreePlaceholderNode[] = [];
  for (const node of phNodes.values()) {
    const claimingUid = claims.get(node.path);
    if (claimingUid && rendNodes.has(claimingUid)) {
      rendNodes.get(claimingUid)!.children.push(node);
      continue;
    }
    const parent = findParent(node.path, phNodes);
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  // Step 5: append rendering leaves to their exact-path placeholder. Normalise
  // the raw placeholder before lookup so trailing slashes / double slashes
  // resolve to the same key that addPathAndAncestors built.
  for (const entry of entries) {
    const ph = phNodes.get(normalizePath(entry.placeholder));
    if (!ph) continue; // dropped (empty/malformed placeholder); see step 1
    ph.children.push(rendNodes.get(entry.uid)!);
  }

  // Step 6: sort children of every placeholder + every rendering's exposed list.
  for (const node of phNodes.values()) {
    sortChildren(node.children);
  }
  for (const node of rendNodes.values()) {
    node.children.sort((a, b) => a.segment.localeCompare(b.segment));
  }

  // Step 7: stable sort of roots.
  roots.sort((a, b) => a.path.localeCompare(b.path));

  return roots;
}

/** Normalise a placeholder path: collapse empty segments from leading/trailing
 *  slashes or double slashes. Returns '' for blank/empty-segment input. */
function normalizePath(path: string): string {
  const segs = path.split('/').filter(Boolean);
  if (segs.length === 0) return '';
  return '/' + segs.join('/');
}

function addPathAndAncestors(path: string, into: Set<string>): void {
  if (!path) return;
  const segs = path.split('/').filter(Boolean);
  if (segs.length === 0) return;
  let acc = '';
  for (const s of segs) {
    acc = acc + '/' + s;
    into.add(acc);
  }
}

function lastSegment(path: string): string {
  const segs = path.split('/').filter(Boolean);
  return segs[segs.length - 1] ?? '';
}

function findParent(
  path: string,
  phNodes: Map<string, TreePlaceholderNode>,
): TreePlaceholderNode | undefined {
  const idx = path.lastIndexOf('/');
  if (idx <= 0) return undefined;
  const parentPath = path.slice(0, idx);
  return phNodes.get(parentPath);
}

function sortChildren(children: TreeNode[]): void {
  // Stable partition: collect renderings (already in input order) and
  // placeholders (sorted by segment), then rebuild children in order.
  const renderings: TreeNode[] = [];
  const placeholders: TreePlaceholderNode[] = [];
  for (const c of children) {
    if (c.kind === 'rendering') renderings.push(c);
    else placeholders.push(c);
  }
  placeholders.sort((a, b) => a.segment.localeCompare(b.segment));
  children.length = 0;
  children.push(...renderings, ...placeholders);
}
