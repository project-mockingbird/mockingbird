// src/web/components/tree/insert-from-template/TemplateTreePicker.tsx

import { useMemo, useState } from 'react';
import { Icon } from '@/lib/icon';
import {
  mdiChevronDown,
  mdiChevronRight,
  mdiFolder,
  mdiFolderOpen,
  mdiCubeOutline,
} from '@mdi/js';
import type { TemplateMeta } from '@/lib/types';
import { buildTemplateTree, type TemplateTreeNode } from './template-tree';

interface TemplateTreePickerProps {
  templates: TemplateMeta[];
  selectedId: string;
  onSelect: (id: string) => void;
  /** Free-text filter; empty string = no filter. */
  filter: string;
  isLoading?: boolean;
  /** Shown when templates is empty and not loading. */
  emptyMessage?: string;
}

interface NodeProps {
  node: TemplateTreeNode;
  depth: number;
  selectedId: string;
  onSelect: (id: string) => void;
  expanded: Set<string>;
  toggle: (path: string) => void;
  /** When defined, only render this node + its descendants if the node's path is in the set. */
  visiblePaths: Set<string> | null;
  /** Force-expand ancestors of filter matches. */
  forceExpanded: Set<string>;
}

function TreeNode({ node, depth, selectedId, onSelect, expanded, toggle, visiblePaths, forceExpanded }: NodeProps) {
  if (visiblePaths && !visiblePaths.has(node.fullPath)) return null;
  const isExpanded = expanded.has(node.fullPath) || forceExpanded.has(node.fullPath);
  const isSelected = node.isLeaf && node.template?.templateId === selectedId;

  return (
    <div>
      <div
        className={
          'flex items-center gap-1 rounded px-1 py-0.5 ' +
          (isSelected ? 'bg-primary/15 text-primary' : 'hover:bg-muted')
        }
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
      >
        {node.isLeaf ? (
          <span className="size-3 inline-block" />
        ) : (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); toggle(node.fullPath); }}
            className="size-3 inline-flex items-center justify-center"
            aria-label={isExpanded ? 'Collapse' : 'Expand'}
          >
            <Icon path={isExpanded ? mdiChevronDown : mdiChevronRight} className="size-3" />
          </button>
        )}
        {node.isLeaf ? (
          <button
            type="button"
            onClick={() => node.template && onSelect(node.template.templateId)}
            className="flex flex-1 items-center gap-2 text-left text-xs"
          >
            <Icon path={mdiCubeOutline} className="size-3 text-muted-foreground shrink-0" />
            <span>
              {node.template?.displayName ?? node.segment}
              {node.template?.isBranch && (
                <span className="text-muted-foreground"> [branch]</span>
              )}
            </span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => toggle(node.fullPath)}
            className="flex flex-1 items-center gap-2 text-left text-xs text-muted-foreground"
          >
            <Icon path={isExpanded ? mdiFolderOpen : mdiFolder} className="size-3 text-muted-foreground shrink-0" />
            <span className="font-medium">{node.segment}</span>
          </button>
        )}
      </div>
      {!node.isLeaf && isExpanded && node.children.map(child => (
        <TreeNode
          key={child.fullPath}
          node={child}
          depth={depth + 1}
          selectedId={selectedId}
          onSelect={onSelect}
          expanded={expanded}
          toggle={toggle}
          visiblePaths={visiblePaths}
          forceExpanded={forceExpanded}
        />
      ))}
    </div>
  );
}

/**
 * Build a Set of every node's fullPath whose subtree contains a leaf where
 * displayName OR path substring-matches the filter (case-insensitive).
 * Returns null for an empty filter (no filtering).
 */
function computeVisibleAndForceExpanded(
  tree: TemplateTreeNode[],
  filter: string,
): { visible: Set<string> | null; forceExpanded: Set<string> } {
  if (filter.trim() === '') return { visible: null, forceExpanded: new Set() };
  const needle = filter.toLowerCase();
  const visible = new Set<string>();
  const forceExpanded = new Set<string>();

  function walk(node: TemplateTreeNode, ancestors: string[]): boolean {
    let anyChildMatches = false;
    for (const child of node.children) {
      if (walk(child, [...ancestors, node.fullPath])) anyChildMatches = true;
    }
    const selfMatches = node.isLeaf && (
      (node.template?.displayName ?? '').toLowerCase().includes(needle) ||
      node.fullPath.toLowerCase().includes(needle)
    );
    if (selfMatches || anyChildMatches) {
      visible.add(node.fullPath);
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

export function TemplateTreePicker({
  templates,
  selectedId,
  onSelect,
  filter,
  isLoading = false,
  emptyMessage = 'No templates found.',
}: TemplateTreePickerProps) {
  const tree = useMemo(() => buildTemplateTree(templates), [templates]);
  const { visible: visiblePaths, forceExpanded } = useMemo(
    () => computeVisibleAndForceExpanded(tree, filter),
    [tree, filter],
  );
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (path: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  return (
    <div className="border border-border rounded-md bg-muted/30 h-[200px] overflow-auto p-1 text-xs">
      {isLoading && <span className="text-muted-foreground italic px-1">Loading...</span>}
      {!isLoading && tree.length === 0 && (
        <span className="text-muted-foreground italic px-1">{emptyMessage}</span>
      )}
      {!isLoading && tree.map(node => (
        <TreeNode
          key={node.fullPath}
          node={node}
          depth={0}
          selectedId={selectedId}
          onSelect={onSelect}
          expanded={expanded}
          toggle={toggle}
          visiblePaths={visiblePaths}
          forceExpanded={forceExpanded}
        />
      ))}
    </div>
  );
}
