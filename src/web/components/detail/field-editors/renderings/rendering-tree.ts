// src/web/components/detail/field-editors/renderings/rendering-tree.ts

import type { RenderingMeta } from '@/lib/types';
import { isFolderTemplate } from '@/lib/folder-templates';

/**
 * Path-based tree node for the rendering picker. A node is either a folder
 * (intermediate path segment, no rendering) or a leaf (carries the rendering).
 * Folders may have a mix of folder + leaf children.
 */
export interface RenderingTreeNode {
  /** Last segment of the node's full path (e.g. "Foundation", "Rich Text"). */
  segment: string;
  /** Sitecore path including the segment. Used as a stable React key. */
  fullPath: string;
  /** True iff this node represents an actual rendering (has a RenderingMeta). */
  isLeaf: boolean;
  /** Present iff isLeaf is true. */
  rendering?: RenderingMeta;
  /**
   * `__Sortorder` of the underlying RenderingMeta. Captured for both leaves
   * and folder-templated nodes; undefined for purely structural intermediate
   * folders.
   */
  sortOrder?: number;
  children: RenderingTreeNode[];
}

/**
 * Build a tree from a flat list of renderings by walking each rendering's
 * path. The deepest common ancestor is trimmed so the tree starts at the
 * first segment that varies across the input - typical Sitecore content tree
 * renderings live under /sitecore/layout/Renderings/<Project>/... so
 * trimming gives us a tree rooted at the project folders.
 *
 * Items whose template is a folder template (see {@link isFolderTemplate}:
 * Renderings folder, Common Folder, Node, ...) always render as folders even
 * with no children. When
 * a folder-template item shares a path with descendants, the folder-template
 * item itself is hidden from the leaf list (these container items are not
 * meaningful renderings the user would pick - they only exist as containers).
 *
 * Children are sorted by `__Sortorder` ascending (default 100 when absent),
 * then by displayName/segment ascending. Folders and leaves intermix - no
 * folders-first override - so authored sort order is respected.
 */
export function buildRenderingTree(renderings: RenderingMeta[]): RenderingTreeNode[] {
  if (renderings.length === 0) return [];
  const commonPrefix = findCommonPathPrefix(renderings.map(r => r.path));
  const roots: RenderingTreeNode[] = [];
  for (const r of renderings) {
    const relPath = commonPrefix ? r.path.slice(commonPrefix.length) : r.path;
    const segments = relPath.split('/').filter(Boolean);
    if (segments.length === 0) continue; // path equals common prefix - skip
    const treatAsFolder = isFolderTemplate(r.template);
    let level = roots;
    let walked = commonPrefix;
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const isLast = i === segments.length - 1;
      walked = walked + '/' + seg;
      let node = level.find(n => n.segment === seg);
      if (!node) {
        // Create new node. Folder-templated items become folders directly,
        // even if isLast (they're containers, not pickable renderings).
        const asFolder = treatAsFolder && isLast;
        node = {
          segment: seg,
          fullPath: walked,
          isLeaf: isLast && !asFolder,
          rendering: isLast && !asFolder ? r : undefined,
          sortOrder: isLast ? r.sortOrder : undefined,
          children: [],
        };
        level.push(node);
      } else if (isLast) {
        // The arriving item collides with an existing node at this path.
        // If our item is a folder template, mark the existing node as a
        // folder. Otherwise the existing node stays as-is - we drop the
        // duplicate to avoid "ghost" entries (e.g. a Renderings folder
        // item at /Feature shouldn't become a self-named leaf inside the
        // Feature folder it represents).
        if (treatAsFolder && node.isLeaf) {
          node.isLeaf = false;
          node.rendering = undefined;
        }
        if (node.sortOrder === undefined && r.sortOrder !== undefined) {
          node.sortOrder = r.sortOrder;
        }
      } else if (node.isLeaf) {
        // The path needs to descend through an item that was previously
        // created as a leaf. Promote it to a folder. We drop the original
        // rendering data because it's almost always a folder-template
        // container that masqueraded as a leaf only because it arrived
        // before its descendants.
        node.isLeaf = false;
        node.rendering = undefined;
      }
      level = node.children;
    }
  }
  sortChildren(roots);
  return roots;
}

/**
 * Longest path-prefix shared by all input paths. Splits on "/" so the prefix
 * only includes complete segments (e.g. "/a/b" not "/a/b" + partial "c").
 * Returns "" if paths are heterogeneous from the root.
 */
function findCommonPathPrefix(paths: string[]): string {
  if (paths.length === 0) return '';
  if (paths.length === 1) {
    const segs = paths[0].split('/').filter(Boolean);
    return segs.length > 1 ? '/' + segs.slice(0, -1).join('/') : '';
  }
  const splits = paths.map(p => p.split('/').filter(Boolean));
  const minLen = Math.min(...splits.map(s => s.length));
  let i = 0;
  while (i < minLen) {
    const seg = splits[0][i];
    if (!splits.every(s => s[i] === seg)) break;
    i++;
  }
  // Stop one short of the deepest common segment so leaves under the common
  // ancestor still appear in the tree (the immediate parent folder becomes
  // a root). For example, paths sharing /sitecore/layout/Renderings should
  // yield "/sitecore/layout/Renderings" as the prefix, leaving the project
  // folders visible at the tree's root level.
  if (i === minLen) i = Math.max(0, i - 1);
  return i > 0 ? '/' + splits[0].slice(0, i).join('/') : '';
}

function sortChildren(nodes: RenderingTreeNode[]): void {
  nodes.sort((a, b) => {
    // Sitecore Content Editor sort: __Sortorder ascending, then name. Default
    // sortorder when the field is absent is 100. Folders and leaves sort
    // together (no folder-first override) so authored ordering is respected.
    const sa = a.sortOrder ?? 100;
    const sb = b.sortOrder ?? 100;
    if (sa !== sb) return sa - sb;
    const an = a.rendering?.displayName ?? a.segment;
    const bn = b.rendering?.displayName ?? b.segment;
    return an.localeCompare(bn);
  });
  for (const n of nodes) {
    if (n.children.length > 0) sortChildren(n.children);
  }
}
