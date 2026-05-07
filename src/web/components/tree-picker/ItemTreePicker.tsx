// src/web/components/tree-picker/ItemTreePicker.tsx
//
// Presentational tree picker. Lazy-loads children via `useChildren`, supports
// pre-expanding a set of node ids (e.g., the ancestor chain of a current
// selection), and offers a multi-root mode for callers whose roots aren't the
// natural top of `useTree()` (e.g., when a Source query resolves to items
// scattered across the tree).
//
// No Link/Copy/Move/Image knowledge - extracted from InsertLinkDialog so it
// can be reused by Copy/Move destination picking and image browse modals.

import { useEffect, useMemo, useState } from 'react';
import { Icon } from '@/lib/icon';
import { mdiChevronDown, mdiChevronRight, mdiFile, mdiFolder, mdiFolderOpen } from '@mdi/js';
import type { TreeNode } from '@/lib/types';
import { useChildren, useTree } from '@/hooks/useItems';

export interface ItemTreePickerProps {
  /** Engine database to query. */
  database?: string;
  /** Currently-selected node id, or null. */
  selectedId: string | null;
  /** Called whenever any item row is clicked. Receives the full node so the
   *  caller can read name / template / etc. without a separate lookup. */
  onSelect: (node: TreeNode) => void;
  /**
   * Optional list of root item ids. When supplied, only these top-level items
   * (filtered against the `useTree` response) appear as roots. When omitted
   * AND `rootItems` is omitted, the picker shows all top-level items.
   */
  rootIds?: string[];
  /**
   * Optional pre-resolved root nodes. Takes precedence over `rootIds` /
   * `useTree`. Used when roots come from a Source query (multi-root mode)
   * and aren't necessarily at the top level of the tree. Mirrors Sitecore's
   * `CrossSiteLinksMultiRootTreeview`.
   */
  rootItems?: TreeNode[];
  /** Ids that should not be selectable (rendered greyed out, non-clickable). */
  disabledIds?: ReadonlySet<string>;
  /** Ids whose ancestor chain should be auto-expanded on mount. */
  autoExpandIds?: ReadonlySet<string>;
  /** Optional className override; defaults to a fixed-height scrollable region. */
  className?: string;
}

interface NodeProps {
  node: TreeNode;
  depth: number;
  database: string;
  selectedId: string | null;
  onSelect: (node: TreeNode) => void;
  expanded: Set<string>;
  toggle: (id: string) => void;
  disabledIds?: ReadonlySet<string>;
}

function TreeRow({
  node, depth, database, selectedId, onSelect, expanded, toggle, disabledIds,
}: NodeProps) {
  const isExpanded = expanded.has(node.id);
  const isSelected = node.id === selectedId;
  const isDisabled = disabledIds?.has(node.id) ?? false;
  // Lazy-load only when expanded; useChildren returns disabled when id is null.
  const { data: children } = useChildren(isExpanded ? node.id : null, database);

  return (
    <div>
      <div
        className={
          'flex items-center gap-1 rounded px-1 py-0.5 ' +
          (isDisabled
            ? 'cursor-not-allowed text-muted-foreground/50'
            : 'cursor-pointer ' + (isSelected ? 'bg-primary/15 text-primary' : 'hover:bg-muted'))
        }
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
        onClick={() => { if (!isDisabled) onSelect(node); }}
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
          database={database}
          selectedId={selectedId}
          onSelect={onSelect}
          expanded={expanded}
          toggle={toggle}
          disabledIds={disabledIds}
        />
      ))}
    </div>
  );
}

export function ItemTreePicker({
  database = 'master',
  selectedId,
  onSelect,
  rootIds,
  rootItems,
  disabledIds,
  autoExpandIds,
  className,
}: ItemTreePickerProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(autoExpandIds ?? []));

  // When autoExpandIds resolves later (async ancestors), merge in the new
  // ids without losing user-toggled state.
  useEffect(() => {
    if (!autoExpandIds || autoExpandIds.size === 0) return;
    setExpanded(prev => {
      let changed = false;
      const next = new Set(prev);
      for (const id of autoExpandIds) {
        if (!next.has(id)) { next.add(id); changed = true; }
      }
      return changed ? next : prev;
    });
  }, [autoExpandIds]);

  // Root resolution priority: explicit rootItems > rootIds-filtered tree > full tree.
  // useTree is only consulted when needed for the root list.
  const needsTree = rootItems === undefined;
  const rootQuery = useTree(database);

  const roots: TreeNode[] = useMemo(() => {
    if (rootItems !== undefined) return rootItems;
    const tree = rootQuery.data ?? [];
    if (rootIds && rootIds.length > 0) {
      const idSet = new Set(rootIds);
      return tree.filter(n => idSet.has(n.id));
    }
    return tree;
  }, [rootItems, rootIds, rootQuery.data]);

  const isLoading = needsTree && rootQuery.isLoading;

  const toggle = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div
      role="tree"
      className={className ?? 'border border-border rounded-md bg-muted/30 h-full overflow-auto p-1'}
    >
      {isLoading && <span className="text-muted-foreground italic px-1 text-xs">Loading...</span>}
      {!isLoading && roots.length === 0 && (
        <span className="text-muted-foreground italic px-1 text-xs">No items</span>
      )}
      {roots.map(root => (
        <TreeRow
          key={root.id}
          node={root}
          depth={0}
          database={database}
          selectedId={selectedId}
          onSelect={onSelect}
          expanded={expanded}
          toggle={toggle}
          disabledIds={disabledIds}
        />
      ))}
    </div>
  );
}
