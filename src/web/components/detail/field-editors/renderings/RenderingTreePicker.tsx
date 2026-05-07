// src/web/components/detail/field-editors/renderings/RenderingTreePicker.tsx

import { useMemo, useState } from 'react';
import { Icon } from '@/lib/icon';
import { mdiChevronDown, mdiChevronRight, mdiFolder, mdiFolderOpen, mdiViewModule } from '@mdi/js';
import type { RenderingMeta } from '@/lib/types';
import { buildRenderingTree, type RenderingTreeNode } from './rendering-tree';

interface RenderingTreePickerProps {
  renderings: RenderingMeta[];
  selectedId: string;
  onSelect: (id: string) => void;
  isLoading?: boolean;
  disabled?: boolean;
  /** Empty-state message shown when renderings is empty and not loading. */
  emptyMessage?: string;
}

interface NodeProps {
  node: RenderingTreeNode;
  depth: number;
  selectedId: string;
  onSelect: (id: string) => void;
  expanded: Set<string>;
  toggle: (path: string) => void;
}

function TreeNode({ node, depth, selectedId, onSelect, expanded, toggle }: NodeProps) {
  const isExpanded = expanded.has(node.fullPath);
  const isSelected = node.isLeaf && node.rendering?.id === selectedId;

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
            onClick={() => node.rendering && onSelect(node.rendering.id)}
            className="flex flex-1 items-center gap-2 text-left text-xs"
          >
            <Icon path={mdiViewModule} className="size-3 text-muted-foreground shrink-0" />
            <span>{node.rendering?.displayName ?? node.segment}</span>
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
        />
      ))}
    </div>
  );
}

export function RenderingTreePicker({
  renderings, selectedId, onSelect, isLoading = false, disabled = false,
  emptyMessage = 'No compatible renderings found.',
}: RenderingTreePickerProps) {
  const tree = useMemo(() => buildRenderingTree(renderings), [renderings]);
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
    <div
      className={
        'border border-border rounded-md bg-muted/30 h-[200px] overflow-auto p-1 text-xs ' +
        (disabled ? 'opacity-50 pointer-events-none' : '')
      }
    >
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
        />
      ))}
    </div>
  );
}
