// src/web/components/detail/field-editors/renderings/PlaceholderTreeRow.tsx

import { Icon } from '@/lib/icon';
import { mdiPlus, mdiChevronRight, mdiChevronDown } from '@mdi/js';
import type { TreePlaceholderNode } from './types';

interface PlaceholderTreeRowProps {
  node: TreePlaceholderNode;
  depth: number;
  collapsed: boolean;
  hasChildren: boolean;
  isEmpty: boolean;
  editing: boolean;
  onToggle: () => void;
  onAdd: () => void;
}

const INDENT_PX_PER_DEPTH = 22;

export function PlaceholderTreeRow({
  node, depth, collapsed, hasChildren, isEmpty, editing, onToggle, onAdd,
}: PlaceholderTreeRowProps) {
  const handleRowClick = () => {
    if (hasChildren) onToggle();
  };
  return (
    <div
      className={`group flex items-center gap-2 py-1 pr-2 rounded text-xs ${
        hasChildren ? 'cursor-pointer hover:bg-muted/50' : ''
      }`}
      style={{ paddingLeft: `${depth * INDENT_PX_PER_DEPTH + 4}px` }}
      onClick={handleRowClick}
      role={hasChildren ? 'button' : undefined}
      aria-expanded={hasChildren ? !collapsed : undefined}
      aria-label={hasChildren ? `${node.path} (${collapsed ? 'collapsed' : 'expanded'})` : node.path}
    >
      <span className="text-muted-foreground inline-flex items-center justify-center w-4 shrink-0">
        {hasChildren ? (
          <Icon path={collapsed ? mdiChevronRight : mdiChevronDown} size={0.7} />
        ) : null}
      </span>
      <span
        aria-hidden
        className="inline-block w-3.5 h-3.5 border border-dashed border-muted-foreground rounded-[2px] shrink-0"
      />
      <span className="font-mono truncate" title={node.path}>{node.segment}</span>
      {isEmpty && (
        <span className="text-muted-foreground italic ml-1 text-[11px]">(empty)</span>
      )}
      <div className="flex-1" />
      {editing && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onAdd(); }}
          className="opacity-0 group-hover:opacity-100 focus:opacity-100 inline-flex items-center justify-center w-6 h-6 shrink-0 text-primary hover:text-primary/80"
          aria-label={`Add rendering to ${node.path}`}
          title="Add rendering"
        >
          <Icon path={mdiPlus} size={0.6} />
        </button>
      )}
    </div>
  );
}
