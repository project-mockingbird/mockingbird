// src/web/components/detail/field-editors/InsertLinkTreePane.tsx
import { useMemo, useState } from 'react';
import { Icon } from '@/lib/icon';
import { mdiChevronDown, mdiChevronRight, mdiFile, mdiFolder, mdiFolderOpen } from '@mdi/js';
import type { TreeNode } from '@/lib/types';
import { useChildren, useTree } from '@/hooks/useItems';

export interface InsertLinkTreePaneProps {
  /** When set, tree starts at this item id's children. Otherwise uses useTree() root level. */
  rootId: string | null;
  /**
   * Multi-root mode. When provided, ignores `rootId` and `useTree()`; these
   * items become the tree's roots, each independently expandable. Mirrors
   * Sitecore's `Sitecore.XA.Foundation.Multisite.Controls.CrossSiteLinksMultiRootTreeview`
   * behaviour, used when the field's Source resolves to items spanning
   * multiple parents (e.g. `query:$linkableHomes`).
   */
  rootItems?: TreeNode[];
  /** Currently-selected leaf item id, or null. */
  selectedId: string | null;
  /** Called whenever any item is clicked (for selection). */
  onSelect: (item: TreeNode) => void;
  /** Set of node ids to pre-expand (e.g., ancestors of an existing selection). */
  initialExpanded?: ReadonlySet<string>;
}

interface NodeProps {
  node: TreeNode;
  depth: number;
  selectedId: string | null;
  onSelect: (item: TreeNode) => void;
  expanded: Set<string>;
  toggle: (id: string) => void;
}

function TreeRow({ node, depth, selectedId, onSelect, expanded, toggle }: NodeProps) {
  const isExpanded = expanded.has(node.id);
  const isSelected = node.id === selectedId;
  const { data: children } = useChildren(isExpanded ? node.id : null);

  return (
    <div>
      <div
        className={
          'flex items-center gap-1 rounded px-1 py-0.5 cursor-pointer ' +
          (isSelected ? 'bg-primary/15 text-primary' : 'hover:bg-muted')
        }
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
        onClick={() => onSelect(node)}
      >
        {node.hasChildren ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); toggle(node.id); }}
            className="size-3 inline-flex items-center justify-center"
            aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${node.name}`}
          >
            <Icon path={isExpanded ? mdiChevronDown : mdiChevronRight} className="size-3" />
          </button>
        ) : (
          <span className="size-3 inline-block" />
        )}
        <Icon
          path={node.hasChildren ? (isExpanded ? mdiFolderOpen : mdiFolder) : mdiFile}
          className="size-3 text-muted-foreground"
        />
        <span className="text-xs">{node.displayName ?? node.name}</span>
      </div>
      {isExpanded && children && children.map(child => (
        <TreeRow
          key={child.id}
          node={child}
          depth={depth + 1}
          selectedId={selectedId}
          onSelect={onSelect}
          expanded={expanded}
          toggle={toggle}
        />
      ))}
    </div>
  );
}

export function InsertLinkTreePane({ rootId, rootItems, selectedId, onSelect, initialExpanded }: InsertLinkTreePaneProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(initialExpanded ?? []));
  const rootQuery = useTree();
  const childRootQuery = useChildren(rootId);

  const roots: TreeNode[] = useMemo(() => {
    if (rootItems !== undefined) return rootItems;
    if (rootId !== null) return childRootQuery.data ?? [];
    return rootQuery.data ?? [];
  }, [rootItems, rootId, rootQuery.data, childRootQuery.data]);

  // Multi-root: items are already loaded by the dialog; no spinner needed.
  const isLoading = rootItems !== undefined
    ? false
    : rootId === null ? rootQuery.isLoading : childRootQuery.isLoading;

  const toggle = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div className="border border-border rounded-md bg-muted/30 h-full overflow-auto p-1">
      {isLoading && <span className="text-muted-foreground italic px-1 text-xs">Loading...</span>}
      {!isLoading && roots.length === 0 && (
        <span className="text-muted-foreground italic px-1 text-xs">No items</span>
      )}
      {roots.map(root => (
        <TreeRow
          key={root.id}
          node={root}
          depth={0}
          selectedId={selectedId}
          onSelect={onSelect}
          expanded={expanded}
          toggle={toggle}
        />
      ))}
    </div>
  );
}
