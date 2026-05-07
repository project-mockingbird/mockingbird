// src/web/components/detail/field-editors/TreelistSelectedPane.tsx
import type { LookupSourceItem } from '@/lib/types';

interface TreelistSelectedPaneProps {
  ids: string[];                                  // ordered braced GUIDs
  resolvedItems: Map<string, LookupSourceItem>;   // key: normalised (unbraced lower) id
  highlightedIds: string[];
  onHighlight: (id: string, multi: boolean) => void;
  onActivate?: (id: string) => void;              // double-click = act on this item (e.g. remove)
}

function normKey(id: string): string {
  return id.replace(/[{}]/g, '').toLowerCase();
}

/**
 * "Selected" pane of the Treelist editor. Renders the ordered list of
 * stored GUIDs with display names from the resolved-items map. Stored
 * GUIDs not present in the map render as "[guid] [Item not found]"
 * per Sitecore's TreeList control.
 */
export function TreelistSelectedPane({ ids, resolvedItems, highlightedIds, onHighlight, onActivate }: TreelistSelectedPaneProps) {
  return (
    <div>
      <div className="text-[10px] text-muted-foreground px-1 mb-1">Selected</div>
      <div className="border border-border rounded-md bg-muted/30 h-[200px] overflow-auto p-1 text-xs">
        {ids.length === 0 && <span className="text-muted-foreground italic px-1">(none)</span>}
        {ids.map(id => {
          const item = resolvedItems.get(normKey(id));
          const isHighlighted = highlightedIds.includes(id);
          const isOrphan = !item;
          return (
            <button
              key={id}
              type="button"
              onClick={(e) => onHighlight(id, e.shiftKey || e.ctrlKey || e.metaKey)}
              onDoubleClick={() => onActivate?.(id)}
              className={
                'flex w-full items-center gap-2 rounded px-1 py-0.5 text-left ' +
                (isHighlighted ? 'bg-primary/15 text-primary' : 'hover:bg-muted') +
                (isOrphan ? ' italic text-muted-foreground' : '')
              }
            >
              <span>{item ? (item.displayName || item.name) : `[${id}] [Item not found]`}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
