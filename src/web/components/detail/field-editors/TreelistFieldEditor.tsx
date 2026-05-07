// src/web/components/detail/field-editors/TreelistFieldEditor.tsx
import { useMemo, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { useLookupSource } from '@/hooks/useItems';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import type { LookupSourceItem } from '@/lib/types';
import { FieldShell } from './FieldShell';
import { TreelistAllPane } from './TreelistAllPane';
import { TreelistSelectedPane } from './TreelistSelectedPane';
import { parseTreelistValue, serializeTreelistValue, bracedGuid, canonicalMultiSelectValue } from './utils';

interface TreelistFieldEditorProps {
  fieldId: string;
  label: string;
  value: string;
  fieldSource: string;
  contextItemId?: string;
  editing: boolean;
  viewMode?: 'normal' | 'raw';
  /**
   * When true, the All pane never renders chevrons even if items report
   * hasChildren=true. Used by Multilist / Checklist field types where
   * Sitecore explicitly forbids tree expansion and the user only ever sees
   * a flat list.
   */
  flat?: boolean;
  /**
   * When true, render a "Select all | Deselect all" toolbar above the
   * panes. Used by Multilist / Checklist where bulk selection is the
   * expected affordance.
   */
  showSelectAll?: boolean;
  onChange: (newValue: string) => void;
  onNavigate?: (id: string) => void;
}

function normKey(id: string): string {
  return id.replace(/[{}]/g, '').toLowerCase();
}

export function TreelistFieldEditor({ fieldId, label, value, fieldSource, contextItemId, editing, viewMode = 'normal', flat = false, showSelectAll = false, onChange, onNavigate }: TreelistFieldEditorProps) {
  const { data: rootItems, isLoading, error } = useLookupSource(fieldSource, contextItemId);
  const [allHighlight, setAllHighlight] = useState<string | null>(null);
  const [selectedHighlights, setSelectedHighlights] = useState<string[]>([]);

  const selectedIds = useMemo(() => parseTreelistValue(value), [value]);
  const selectedIdSet = useMemo(
    () => new Set(selectedIds.map(id => normKey(id))),
    [selectedIds],
  );

  const resolvedItems = useMemo(() => {
    const map = new Map<string, LookupSourceItem>();
    for (const it of rootItems ?? []) {
      map.set(normKey(it.id), it);
    }
    return map;
  }, [rootItems]);

  const orphanIds = useMemo(
    () => selectedIds.filter(id => !resolvedItems.has(normKey(id))),
    [selectedIds, resolvedItems],
  );

  const orphanQueries = useQueries({
    queries: orphanIds.map(id => ({
      queryKey: ['item', normKey(id)],
      queryFn: () => api.getItem(normKey(id)),
      enabled: orphanIds.length > 0,
      staleTime: 60_000,
    })),
  });

  const mergedItems = useMemo(() => {
    const m = new Map(resolvedItems);
    orphanQueries.forEach((q, i) => {
      if (q.data) {
        const id = orphanIds[i];
        m.set(normKey(id), {
          id: q.data.id,
          name: q.data.name,
          displayName: q.data.name,
          path: q.data.path,
          templateId: '',
          hasChildren: false,
        });
      }
    });
    return m;
  }, [resolvedItems, orphanQueries, orphanIds]);

  // Raw view: bypass the panes entirely and show the stored pipe-delimited
  // string. Editable when editing=true so users can hand-edit if they want.
  // Raw view: bypass the panes and show the canonical pipe-delimited
  // string. SCS YAML can store multi-select values in either the inline
  // form (`Value: '{guid1}|{guid2}'`) or the block-scalar form
  // (`Value: |` + indented one-GUID-per-line). The Rainbow reader
  // preserves whatever's on disk, but raw view always shows the
  // canonical pipe form. canonicalMultiSelectValue is a no-op for
  // non-GUID strings, so editing remains lossless when users hand-edit.
  if (viewMode === 'raw') {
    return (
      <FieldShell fieldId={fieldId} label={label} onNavigate={onNavigate}>
        <Textarea
          value={canonicalMultiSelectValue(value)}
          onChange={(e) => onChange(e.target.value)}
          className="min-h-16 font-mono text-xs"
          readOnly={!editing}
        />
      </FieldShell>
    );
  }

  // Fallback: source attribute is missing / blank.
  if (!fieldSource.trim()) {
    return (
      <FieldShell fieldId={fieldId} label={label} onNavigate={onNavigate}>
        <div className="text-xs text-muted-foreground">
          Treelist field has no Source - cannot show available items. Stored value: <code className="text-[10px]">{value || '(empty)'}</code>
        </div>
      </FieldShell>
    );
  }

  // Fallback: source format isn't one our resolver understands (e.g. fast: queries).
  if (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return (
      <FieldShell fieldId={fieldId} label={label} onNavigate={onNavigate}>
        <div className="text-xs text-muted-foreground">
          Treelist source not supported ({reason}). Stored value: <code className="text-[10px]">{value || '(empty)'}</code>
        </div>
      </FieldShell>
    );
  }

  const handleSelectedHighlight = (id: string, multi: boolean) => {
    setSelectedHighlights(prev => {
      if (multi) {
        return prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id];
      }
      return [id];
    });
  };

  const addById = (id: string) => {
    const braced = bracedGuid(id);
    if (!braced) return;
    if (selectedIds.includes(braced)) return;
    if (allHighlight && normKey(allHighlight) === normKey(id)) {
      setAllHighlight(null);
    }
    onChange(serializeTreelistValue([...selectedIds, braced]));
  };

  const removeById = (id: string) => {
    const next = selectedIds.filter(s => normKey(s) !== normKey(id));
    if (next.length === selectedIds.length) return;
    setSelectedHighlights(prev => prev.filter(p => normKey(p) !== normKey(id)));
    onChange(serializeTreelistValue(next));
  };

  const handleAdd = () => {
    if (!allHighlight) return;
    addById(allHighlight);
  };

  const handleRemove = () => {
    if (selectedHighlights.length === 0) return;
    const remove = new Set(selectedHighlights.map(normKey));
    const next = selectedIds.filter(id => !remove.has(normKey(id)));
    setSelectedHighlights([]);
    onChange(serializeTreelistValue(next));
  };

  const handleSelectAll = () => {
    const visibleIds = (rootItems ?? []).map(it => bracedGuid(it.id)).filter(Boolean);
    const existing = new Set(selectedIds.map(normKey));
    const additions = visibleIds.filter(id => !existing.has(normKey(id)));
    if (additions.length === 0) return;
    onChange(serializeTreelistValue([...selectedIds, ...additions]));
  };

  const handleDeselectAll = () => {
    if (selectedIds.length === 0) return;
    setSelectedHighlights([]);
    onChange(serializeTreelistValue([]));
  };

  const handleMove = (direction: 'up' | 'down') => {
    if (selectedHighlights.length !== 1) return;
    const id = selectedHighlights[0];
    const idx = selectedIds.indexOf(id);
    if (idx < 0) return;
    const target = direction === 'up' ? idx - 1 : idx + 1;
    if (target < 0 || target >= selectedIds.length) return;
    const next = [...selectedIds];
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange(serializeTreelistValue(next));
  };

  const linkClass = 'text-primary hover:underline disabled:text-muted-foreground disabled:no-underline disabled:cursor-not-allowed';
  const visibleAvailable = (rootItems ?? []).filter(it => !selectedIdSet.has(normKey(it.id))).length;

  return (
    <FieldShell fieldId={fieldId} label={label} onNavigate={onNavigate}>
      {showSelectAll && (
        <div className="flex items-center gap-2 text-[11px] mb-1">
          <button
            type="button"
            onClick={handleSelectAll}
            disabled={!editing || visibleAvailable === 0}
            className={linkClass}
          >
            Select all
          </button>
          <span className="text-muted-foreground/40">|</span>
          <button
            type="button"
            onClick={handleDeselectAll}
            disabled={!editing || selectedIds.length === 0}
            className={linkClass}
          >
            Deselect all
          </button>
        </div>
      )}
      <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-stretch">
        <TreelistAllPane
          items={rootItems ?? []}
          excludeIds={selectedIdSet}
          flat={flat}
          highlightedId={allHighlight}
          onHighlight={setAllHighlight}
          onActivate={editing ? addById : undefined}
          isLoading={isLoading}
          isError={false}
          errorMessage={undefined}
        />

        <div className="flex flex-col items-center justify-center gap-1">
          <button type="button" disabled={!editing || !allHighlight} onClick={handleAdd} className="text-xs px-1 py-0.5 border border-border rounded disabled:opacity-50" aria-label="Add">&gt;</button>
          <button type="button" disabled={!editing || selectedHighlights.length === 0} onClick={handleRemove} className="text-xs px-1 py-0.5 border border-border rounded disabled:opacity-50" aria-label="Remove">&lt;</button>
        </div>

        <div className="grid grid-cols-[1fr_auto] gap-1">
          <TreelistSelectedPane
            ids={selectedIds}
            resolvedItems={mergedItems}
            highlightedIds={selectedHighlights}
            onHighlight={handleSelectedHighlight}
            onActivate={editing ? removeById : undefined}
          />
          <div className="flex flex-col items-center justify-center gap-1">
            <button
              type="button"
              disabled={
                !editing ||
                selectedHighlights.length !== 1 ||
                selectedIds.indexOf(selectedHighlights[0]) <= 0
              }
              onClick={() => handleMove('up')}
              className="text-xs px-1 py-0.5 border border-border rounded disabled:opacity-50"
              aria-label="Move up"
            >
              ↑
            </button>
            <button
              type="button"
              disabled={
                !editing ||
                selectedHighlights.length !== 1 ||
                selectedIds.indexOf(selectedHighlights[0]) >= selectedIds.length - 1
              }
              onClick={() => handleMove('down')}
              className="text-xs px-1 py-0.5 border border-border rounded disabled:opacity-50"
              aria-label="Move down"
            >
              ↓
            </button>
          </div>
        </div>
      </div>
    </FieldShell>
  );
}
