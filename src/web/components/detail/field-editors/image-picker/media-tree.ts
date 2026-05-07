import type { DescendantItem } from '@/lib/types';

export interface MediaTreeNode {
  id: string;
  name: string;
  displayName?: string;
  path: string;
  template: string;
  hasChildren: boolean;
  children: MediaTreeNode[];
}

function sortKey(n: MediaTreeNode): string {
  return (n.displayName ?? n.name).toLowerCase();
}

export function buildMediaTree(items: DescendantItem[], rootPath: string): MediaTreeNode[] {
  if (items.length === 0) return [];
  const byPath = new Map<string, MediaTreeNode>();
  for (const it of items) {
    byPath.set(it.path.toLowerCase(), {
      id: it.id,
      name: it.name,
      displayName: it.displayName,
      path: it.path,
      template: it.template,
      hasChildren: it.hasChildren,
      children: [],
    });
  }
  const roots: MediaTreeNode[] = [];
  const lowerRoot = rootPath.toLowerCase();
  for (const node of byPath.values()) {
    const parentPath = node.path.slice(0, node.path.lastIndexOf('/'));
    const lowerParent = parentPath.toLowerCase();
    if (lowerParent === lowerRoot) {
      roots.push(node);
    } else {
      const parent = byPath.get(lowerParent);
      if (parent) parent.children.push(node);
      // If we don't find a parent, the node is orphaned vs. rootPath - drop it.
    }
  }
  // Sort siblings alphabetically.
  const visit = (nodes: MediaTreeNode[]) => {
    nodes.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
    for (const n of nodes) visit(n.children);
  };
  visit(roots);
  return roots;
}
