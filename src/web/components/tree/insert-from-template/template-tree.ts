// src/web/components/tree/insert-from-template/template-tree.ts

import type { TemplateMeta } from '@/lib/types';
import { isFolderTemplate } from '@/lib/folder-templates';

const TEMPLATE_TEMPLATE_ID = 'ab86861a-6030-46c5-b394-e8f99e8b87db';
const BRANCH_TEMPLATE_ID = '35e75c72-4985-4e09-88c3-0eac6cd1e64f';

/** Pickable iff the template is a Template or Branch (not a folder). */
function isPickable(t: TemplateMeta): boolean {
  const tpl = t.template.toLowerCase();
  return tpl === TEMPLATE_TEMPLATE_ID || tpl === BRANCH_TEMPLATE_ID;
}

export interface TemplateTreeLeaf {
  /** The display name from TemplateMeta. */
  displayName: string;
  templateId: string;
  isBranch: boolean;
  meta: TemplateMeta;
}

export interface TemplateTreeNode {
  segment: string;
  fullPath: string;
  isLeaf: boolean;
  /** Present iff isLeaf. */
  template?: TemplateTreeLeaf;
  /**
   * `__Sortorder` of the underlying TemplateMeta. Captured for both leaves
   * and folder-templated nodes; undefined for purely structural intermediate
   * folders that don't correspond to any input meta. Used by sortChildren.
   */
  sortOrder?: number;
  children: TemplateTreeNode[];
}

export function buildTemplateTree(templates: TemplateMeta[]): TemplateTreeNode[] {
  if (templates.length === 0) return [];
  const commonPrefix = findCommonPathPrefix(templates.map(t => t.path));
  const roots: TemplateTreeNode[] = [];

  for (const t of templates) {
    const relPath = commonPrefix ? t.path.slice(commonPrefix.length) : t.path;
    const segments = relPath.split('/').filter(Boolean);
    if (segments.length === 0) continue;
    const treatAsFolder = isFolderTemplate(t.template) || !isPickable(t);
    let level = roots;
    let walked = commonPrefix;

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const isLast = i === segments.length - 1;
      walked = walked + '/' + seg;
      let node = level.find(n => n.segment === seg);

      if (!node) {
        // Create new node. Folder-templated items become folders directly,
        // even if isLast (they are containers, not pickable templates).
        const asFolder = treatAsFolder && isLast;
        node = {
          segment: seg,
          fullPath: walked,
          isLeaf: isLast && !asFolder,
          template: isLast && !asFolder ? toLeaf(t) : undefined,
          sortOrder: isLast ? t.sortOrder : undefined,
          children: [],
        };
        level.push(node);
      } else if (isLast) {
        // The arriving item collides with an existing node at this path.
        // If our item is a folder template, mark the existing node as a
        // folder. Otherwise the existing node stays as-is.
        if (treatAsFolder && node.isLeaf) {
          node.isLeaf = false;
          node.template = undefined;
        }
        // Carry the meta's sortOrder onto the folder node so it sorts
        // alongside its sibling leaves the way Content Editor does.
        if (node.sortOrder === undefined && t.sortOrder !== undefined) {
          node.sortOrder = t.sortOrder;
        }
      } else if (node.isLeaf) {
        // Path needs to descend through what was previously a leaf.
        // Promote to folder; drop the original meta (almost always a
        // folder-template container that arrived before its descendants).
        node.isLeaf = false;
        node.template = undefined;
      }
      level = node.children;
    }
  }

  sortChildren(roots);
  return roots;
}

function toLeaf(t: TemplateMeta): TemplateTreeLeaf {
  return {
    displayName: t.displayName,
    templateId: t.id,
    isBranch: t.template.toLowerCase() === BRANCH_TEMPLATE_ID,
    meta: t,
  };
}

/**
 * Longest path-prefix shared by all input paths. Splits on "/" so the prefix
 * only includes complete segments. Returns "" if paths are heterogeneous from
 * the root. Mirrors rendering-tree.ts findCommonPathPrefix exactly.
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
  // a root). Mirrors rendering-tree.ts findCommonPathPrefix.
  if (i === minLen) i = Math.max(0, i - 1);
  return i > 0 ? '/' + splits[0].slice(0, i).join('/') : '';
}

function sortChildren(nodes: TemplateTreeNode[]): void {
  nodes.sort((a, b) => {
    // Sitecore Content Editor sort: __Sortorder ascending, then name. Default
    // sortorder when the field is absent is 100. Folders and leaves are sorted
    // together (no folder-first override) so authored ordering is respected.
    const sa = a.sortOrder ?? 100;
    const sb = b.sortOrder ?? 100;
    if (sa !== sb) return sa - sb;
    const an = a.template?.displayName ?? a.segment;
    const bn = b.template?.displayName ?? b.segment;
    return an.localeCompare(bn);
  });
  for (const n of nodes) {
    if (n.children.length > 0) sortChildren(n.children);
  }
}
