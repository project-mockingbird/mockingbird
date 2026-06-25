// src/web/components/detail/field-editors/renderings/RenderingCard.tsx

import { useMemo } from 'react';
import { Icon } from '@/lib/icon';
import { mdiArrowUp, mdiArrowDown, mdiDelete, mdiViewModule } from '@mdi/js';
import { useRenderingMeta } from './hooks';
import { useItem, useItemByPath } from '@/hooks/useItems';
import type { RenderingEntry } from './types';

const INDENT_PX_PER_DEPTH = 22;

interface RenderingCardProps {
  entry: RenderingEntry;
  isFirst: boolean;
  isLast: boolean;
  editing: boolean;
  depth: number;
  onEdit: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  /** Navigate to an item by id (used to open a read-only partial design). */
  onNavigate?: (id: string) => void;
}

function summarizeDatasource(ds: string, resolvedDisplayPath?: string): string {
  if (!ds) return '(none)';
  if (ds.startsWith('local:')) return ds;
  if (ds.startsWith('{') && ds.endsWith('}')) {
    return resolvedDisplayPath ?? `[unresolved: ${ds}]`;
  }
  return ds;
}

export function RenderingCard({
  entry, isFirst, isLast, editing, depth, onEdit, onMoveUp, onMoveDown, onRemove, onNavigate,
}: RenderingCardProps) {
  const { data: meta } = useRenderingMeta(entry.renderingId);

  const dsGuid = useMemo(() => {
    if (entry.dataSource.startsWith('{') && entry.dataSource.endsWith('}')) {
      return entry.dataSource.slice(1, -1);
    }
    return undefined;
  }, [entry.dataSource]);
  const { data: dsItem } = useItem(dsGuid ?? null);

  // Partial-design renderings are read-only: no edit/move/remove, and clicking
  // the card navigates to the owning partial design instead of editing here.
  const readOnly = entry.owner === 'partial';
  const { data: ownerItem } = useItemByPath(readOnly ? (entry.ownerItemPath ?? null) : null);

  const displayName = meta?.displayName ?? meta?.name ?? `[Unresolved ${entry.renderingId}]`;
  const isOrphan = !meta;
  const personalized = !!entry.rlsRaw;

  const stop = (e: React.MouseEvent) => e.stopPropagation();
  const handleCardClick = readOnly
    ? () => { if (ownerItem) onNavigate?.(ownerItem.id); }
    : onEdit;

  return (
    <div
      role="group"
      className="relative group my-1"
      style={{ marginLeft: `${depth * INDENT_PX_PER_DEPTH}px` }}
    >
      <button
        type="button"
        onClick={handleCardClick}
        aria-label={readOnly ? `Go to partial design: ${displayName}` : `Edit rendering: ${displayName}`}
        className="w-full text-left bg-background border border-border rounded-md p-3 hover:bg-muted/40 focus:outline-none focus:ring-2 focus:ring-ring"
      >
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-5 h-5 text-muted-foreground" aria-hidden>
            <Icon path={mdiViewModule} size={0.7} />
          </span>
          <span className={`font-semibold text-sm flex-1 truncate ${isOrphan ? 'italic text-destructive' : ''}`}>
            {displayName}
          </span>
          {readOnly && (
            <span className="text-[10px] text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/40 px-1.5 py-0.5 rounded whitespace-nowrap">
              Partial Design: {entry.ownerDisplayName ?? 'partial'}
            </span>
          )}
          {personalized && (
            <span className="text-[10px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded">
              personalized
            </span>
          )}
          {isOrphan && (
            <span className="text-[10px] text-destructive">[Rendering not found]</span>
          )}
        </div>
        <div className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px]">
          <span className="text-muted-foreground">Datasource</span>
          <span className="font-mono truncate" title={entry.dataSource}>
            {summarizeDatasource(entry.dataSource, dsItem?.path)}
          </span>
          <span className="text-muted-foreground">Placeholder</span>
          <span className="font-mono truncate" title={entry.placeholder}>{entry.placeholder}</span>
          {entry.params?.DynamicPlaceholderId && (
            <>
              <span className="text-muted-foreground">Dynamic Placeholder ID</span>
              <span className="font-mono truncate">{entry.params.DynamicPlaceholderId}</span>
            </>
          )}
        </div>
      </button>

      {editing && !readOnly && (
        <div
          onClick={stop}
          className="absolute top-1 right-1 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-within:opacity-100 transition-opacity bg-background border border-border rounded p-0.5 shadow-sm"
        >
          <button
            type="button" onClick={onMoveUp} disabled={isFirst}
            className="inline-flex items-center justify-center w-6 h-6 hover:text-primary disabled:opacity-30"
            aria-label="Move up"
          >
            <Icon path={mdiArrowUp} size={0.6} />
          </button>
          <button
            type="button" onClick={onMoveDown} disabled={isLast}
            className="inline-flex items-center justify-center w-6 h-6 hover:text-primary disabled:opacity-30"
            aria-label="Move down"
          >
            <Icon path={mdiArrowDown} size={0.6} />
          </button>
          <button
            type="button" onClick={onRemove}
            className="inline-flex items-center justify-center w-6 h-6 hover:text-destructive"
            aria-label="Remove"
          >
            <Icon path={mdiDelete} size={0.6} />
          </button>
        </div>
      )}
    </div>
  );
}
