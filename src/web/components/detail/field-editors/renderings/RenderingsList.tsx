// src/web/components/detail/field-editors/renderings/RenderingsList.tsx

import { useMemo } from 'react';
import { RenderingsTree } from './RenderingsTree';
import { buildTree } from './tree-builder';
import { useComposedLayout } from './hooks';
import type { RenderingEntry } from './types';

interface RenderingsListProps {
  entries: RenderingEntry[];
  pageItemId: string;
  editing: boolean;
  onAdd: (placeholder: string) => void;
  onEdit: (uid: string) => void;
  onMoveUp: (uid: string) => void;
  onMoveDown: (uid: string) => void;
  onRemove: (uid: string) => void;
  /** Navigate to an item by id (used by read-only partial-design cards). */
  onNavigate?: (id: string) => void;
}

export function RenderingsList({
  entries, pageItemId, editing, onAdd,
  onEdit, onMoveUp, onMoveDown, onRemove, onNavigate,
}: RenderingsListProps) {
  const { data: composed } = useComposedLayout(pageItemId);

  const tree = useMemo(() => {
    // Display source = the page's own entries (the persistence source, passed in
    // and tagged owner='page') unioned with the composed partial-design entries
    // (owner='partial', read-only). The page entries stay the objects the editor
    // persists; we never display the composed response's own-entry copies.
    const partialEntries: RenderingEntry[] = (composed?.entries ?? []).filter(e => e.owner === 'partial');
    const pageEntries: RenderingEntry[] = entries.map(e => ({ ...e, owner: 'page' as const }));
    const merged = [...partialEntries, ...pageEntries];
    const discoveredPaths = (composed?.placeholders ?? [])
      .filter(p => !p.isTokenForm)
      .map(p => ({ value: p.value, ownerUid: p.ownerUid }));
    return buildTree({ entries: merged, discoveredPaths });
  }, [entries, composed]);

  if (tree.length === 0) {
    return <div className="text-xs text-muted-foreground italic py-2">No placeholders.</div>;
  }

  return (
    <RenderingsTree
      nodes={tree}
      editing={editing}
      onAdd={onAdd}
      onEdit={onEdit}
      onMoveUp={onMoveUp}
      onMoveDown={onMoveDown}
      onRemove={onRemove}
      onNavigate={onNavigate}
    />
  );
}
