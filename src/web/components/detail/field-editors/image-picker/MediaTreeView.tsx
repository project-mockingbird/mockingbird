import { useCallback, useEffect, useMemo, useState } from 'react';
import { Icon } from '@/lib/icon';
import {
  mdiChevronDown,
  mdiChevronRight,
  mdiFile,
  mdiFolder,
  mdiFolderOpen,
} from '@mdi/js';
import type { MediaTreeNode } from './media-tree';

export interface MediaTreeViewProps {
  tree: MediaTreeNode[];
  filter: string;
  selectedId: string | null;
  onSelect: (node: MediaTreeNode) => void;
  /**
   * Node ids whose ancestor chain should be auto-expanded. Callers must
   * stabilize this Set's reference (e.g. via useMemo) - the component
   * runs a useEffect that depends on Set identity, so a fresh Set per
   * render would loop unnecessary work.
   */
  autoExpandIds: Set<string>;
  className?: string;
}

interface RowProps {
  node: MediaTreeNode;
  depth: number;
  selectedId: string | null;
  onSelect: (node: MediaTreeNode) => void;
  expanded: Set<string>;
  toggle: (id: string) => void;
  visible: Set<string> | null;
  forceExpanded: Set<string>;
}

function TreeRow({ node, depth, selectedId, onSelect, expanded, toggle, visible, forceExpanded }: RowProps) {
  if (visible && !visible.has(node.path.toLowerCase())) return null;
  // expanded is keyed by node id; forceExpanded is keyed by lowercased path
  const isExpanded = expanded.has(node.id) || forceExpanded.has(node.path.toLowerCase());
  const isSelected = node.id === selectedId;

  return (
    <div>
      <div
        role="treeitem"
        aria-selected={isSelected}
        aria-expanded={node.hasChildren ? isExpanded : undefined}
        className={
          'flex items-center gap-1 rounded px-1 py-0.5 cursor-pointer ' +
          (isSelected ? 'bg-primary/15 text-primary' : 'hover:bg-muted')
        }
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
        onClick={() => onSelect(node)}
      >
        {/* Chevron renders based on hasChildren. Children should already be in
            node.children when this component receives the tree (Task 5's
            buildMediaTree always populates children for the entire pre-fetched
            subtree). If a future caller passes a tree where hasChildren=true but
            children=[], the row will appear expandable but render nothing -
            surface the load semantics in the caller, don't silently spinner here. */}
        {node.hasChildren ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); toggle(node.id); }}
            className="size-3 inline-flex items-center justify-center"
            aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${node.displayName ?? node.name}`}
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
      {isExpanded && node.children.map(child => (
        <TreeRow
          key={child.id}
          node={child}
          depth={depth + 1}
          selectedId={selectedId}
          onSelect={onSelect}
          expanded={expanded}
          toggle={toggle}
          visible={visible}
          forceExpanded={forceExpanded}
        />
      ))}
    </div>
  );
}

/**
 * Build sets of (lowercase) node paths that should be visible plus their
 * ancestors that should be force-expanded. Returns visible=null when filter
 * is empty (no filtering).
 */
function computeVisibility(
  tree: MediaTreeNode[],
  filter: string,
): { visible: Set<string> | null; forceExpanded: Set<string> } {
  if (filter.trim() === '') return { visible: null, forceExpanded: new Set() };
  const needle = filter.toLowerCase();
  const visible = new Set<string>();
  const forceExpanded = new Set<string>();

  function walk(node: MediaTreeNode, ancestors: string[]): boolean {
    let anyChildMatches = false;
    for (const child of node.children) {
      if (walk(child, [...ancestors, node.path.toLowerCase()])) anyChildMatches = true;
    }
    const selfMatches = (node.displayName ?? node.name).toLowerCase().includes(needle);
    if (selfMatches || anyChildMatches) {
      visible.add(node.path.toLowerCase());
      for (const a of ancestors) {
        visible.add(a);
        forceExpanded.add(a);
      }
      return true;
    }
    return false;
  }

  for (const root of tree) walk(root, []);
  return { visible, forceExpanded };
}

export function MediaTreeView({
  tree,
  filter,
  selectedId,
  onSelect,
  autoExpandIds,
  className,
}: MediaTreeViewProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(autoExpandIds));

  // When autoExpandIds resolves later (async ancestors), merge in the new
  // ids without losing user-toggled state.
  useEffect(() => {
    setExpanded(prev => {
      let changed = false;
      const next = new Set(prev);
      for (const id of autoExpandIds) {
        if (!next.has(id)) { next.add(id); changed = true; }
      }
      return changed ? next : prev;
    });
  }, [autoExpandIds]);

  const { visible, forceExpanded } = useMemo(
    () => computeVisibility(tree, filter),
    [tree, filter],
  );

  const toggle = useCallback((id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  return (
    <div
      role="tree"
      className={className ?? 'border border-border rounded-md bg-muted/30 h-full overflow-auto p-1'}
    >
      {tree.length === 0 && (
        <span className="text-muted-foreground italic px-1 text-xs">No items</span>
      )}
      {tree.map(root => (
        <TreeRow
          key={root.id}
          node={root}
          depth={0}
          selectedId={selectedId}
          onSelect={onSelect}
          expanded={expanded}
          toggle={toggle}
          visible={visible}
          forceExpanded={forceExpanded}
        />
      ))}
    </div>
  );
}
