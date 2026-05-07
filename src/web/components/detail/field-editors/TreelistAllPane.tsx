// src/web/components/detail/field-editors/TreelistAllPane.tsx
import { useState } from 'react';
import type { LookupSourceItem } from '@/lib/types';
import { Icon } from '@/lib/icon';
import { mdiTagOutline, mdiChevronRight, mdiChevronDown } from '@mdi/js';
import { useChildren } from '@/hooks/useItems';

interface TreelistAllPaneProps {
  items: LookupSourceItem[];
  excludeIds: Set<string>;                  // normalized (unbraced lower) ids already in Selected
  flat?: boolean;                           // when true, suppress chevrons regardless of hasChildren (Multilist semantics)
  highlightedId: string | null;
  onHighlight: (id: string) => void;
  onActivate?: (id: string) => void;        // double-click = act on this item (e.g. add)
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
}

interface TreelistAllNodeProps {
  item: LookupSourceItem;
  depth: number;
  excludeIds: Set<string>;
  flat: boolean;
  highlightedId: string | null;
  onHighlight: (id: string) => void;
  onActivate?: (id: string) => void;
}

function normKey(id: string): string {
  return id.replace(/[{}]/g, '').toLowerCase();
}

function TreelistAllNode({ item, depth, excludeIds, flat, highlightedId, onHighlight, onActivate }: TreelistAllNodeProps) {
  const [expanded, setExpanded] = useState(false);
  const { data: children } = useChildren(!flat && expanded ? item.id : null);

  const showChevron = !flat && item.hasChildren;
  const visibleChildren = !flat && expanded && children
    ? children.filter(c => !excludeIds.has(normKey(c.id)))
    : [];

  return (
    <div>
      <div
        className={
          'flex items-center gap-1 rounded px-1 py-0.5 ' +
          (highlightedId === item.id ? 'bg-primary/15 text-primary' : 'hover:bg-muted')
        }
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
      >
        {showChevron ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(v => !v);
            }}
            className="size-3 inline-flex items-center justify-center"
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            <Icon path={expanded ? mdiChevronDown : mdiChevronRight} className="size-3" />
          </button>
        ) : (
          <span className="size-3 inline-block" />
        )}
        <button
          type="button"
          onClick={() => onHighlight(item.id)}
          onDoubleClick={() => onActivate?.(item.id)}
          className="flex flex-1 items-center gap-2 text-left text-xs"
        >
          <Icon path={mdiTagOutline} className="size-3 text-muted-foreground" />
          <span>{item.displayName || item.name}</span>
        </button>
      </div>
      {visibleChildren.length > 0 && (
        <div>
          {visibleChildren.map(c => (
            <TreelistAllNode
              key={c.id}
              item={{ id: c.id, name: c.name, displayName: c.name, path: c.path, templateId: '', hasChildren: c.hasChildren }}
              depth={depth + 1}
              excludeIds={excludeIds}
              flat={flat}
              highlightedId={highlightedId}
              onHighlight={onHighlight}
              onActivate={onActivate}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function TreelistAllPane({ items, excludeIds, flat = false, highlightedId, onHighlight, onActivate, isLoading, isError, errorMessage }: TreelistAllPaneProps) {
  const visibleItems = items.filter(it => !excludeIds.has(normKey(it.id)));
  return (
    <div>
      <div className="text-[10px] text-muted-foreground px-1 mb-1">All</div>
      <div className="border border-border rounded-md bg-muted/30 h-[200px] overflow-auto p-1 text-xs">
        {isLoading && <span className="text-muted-foreground italic px-1">Loading...</span>}
        {isError && <span className="text-destructive italic px-1">{errorMessage ?? 'Failed to load source'}</span>}
        {!isLoading && !isError && visibleItems.length === 0 && (
          <span className="text-muted-foreground italic px-1">No items</span>
        )}
        {visibleItems.map(item => (
          <TreelistAllNode
            key={item.id}
            item={item}
            depth={0}
            excludeIds={excludeIds}
            flat={flat}
            highlightedId={highlightedId}
            onHighlight={onHighlight}
            onActivate={onActivate}
          />
        ))}
      </div>
    </div>
  );
}
