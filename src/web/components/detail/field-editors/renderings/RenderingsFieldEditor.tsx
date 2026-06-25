// src/web/components/detail/field-editors/renderings/RenderingsFieldEditor.tsx

import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Textarea } from '@/components/ui/textarea';
import { FieldShell } from '../FieldShell';
import { RenderingsList } from './RenderingsList';
import { AddRenderingDialog } from './AddRenderingDialog';
import { EditRenderingDialog } from './EditRenderingDialog';
import { ConfirmRemoveRenderingDialog } from './ConfirmRemoveRenderingDialog';
import { findDescendants } from './find-descendants';
import { usePlaceholderPaths, useComposedLayout } from './hooks';
import { nextDynamicPlaceholderId } from './add-rendering';
import { parseLayoutXml, serializeLayoutXml } from './serialize';
import { useDialogRoute } from '@/hooks/useNavState';
import type { RenderingEntry } from './types';
import type { RenderingMeta } from '@/lib/types';

interface RenderingsFieldEditorProps {
  fieldId: string;
  label: string;
  value: string;
  contextItemId: string;
  editing: boolean;
  viewMode?: 'normal' | 'raw';
  onChange: (newValue: string) => void;
  onNavigate?: (id: string) => void;
}

type DialogState =
  | { kind: 'none' }
  | { kind: 'add'; placeholder: string }
  | { kind: 'edit'; uid: string };

export function RenderingsFieldEditor({
  fieldId, label, value, contextItemId, editing, viewMode = 'normal', onChange, onNavigate,
}: RenderingsFieldEditorProps) {
  const parsed = useMemo(() => parseLayoutXml(value), [value]);
  const [entries, setEntries] = useState<RenderingEntry[]>(parsed.entries);
  const [dialog, setDialog] = useState<DialogState>({ kind: 'none' });
  const [pendingRemoval, setPendingRemoval] = useState<RenderingEntry | null>(null);

  const addRoute = useDialogRoute('add-rendering');
  const editRoute = useDialogRoute('edit-rendering');
  const queryClient = useQueryClient();
  const { data: placeholderPathsResp } = usePlaceholderPaths(contextItemId);
  const { data: composed } = useComposedLayout(contextItemId);

  // Next DynamicPlaceholderId for an added dynamic rendering: unique across the
  // live page entries (incl. unsaved adds) and the composed partial entries.
  const nextDpi = useMemo(
    () => nextDynamicPlaceholderId([...entries, ...(composed?.entries ?? [])]),
    [entries, composed],
  );

  useEffect(() => { setEntries(parsed.entries); }, [parsed]);

  // Sync dialog state to 'none' when both routes are closed (e.g. browser back).
  useEffect(() => {
    if (!addRoute.isOpen && !editRoute.isOpen) {
      setDialog(prev => prev.kind === 'none' ? prev : { kind: 'none' });
    }
  }, [addRoute.isOpen, editRoute.isOpen]);

  const persist = (next: RenderingEntry[]) => {
    setEntries(next);
    onChange(serializeLayoutXml(parsed, next));
  };

  if (viewMode === 'raw') {
    return (
      <FieldShell fieldId={fieldId} label={label} onNavigate={onNavigate}>
        <Textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          className="min-h-32 font-mono text-xs"
          readOnly={!editing}
        />
      </FieldShell>
    );
  }

  const handleAddOpen = (placeholder: string) => {
    setDialog({ kind: 'add', placeholder });
    addRoute.open();
  };

  const handleEditOpen = (uid: string) => {
    setDialog({ kind: 'edit', uid });
    editRoute.open();
  };

  const handleClose = () => {
    if (addRoute.isOpen) addRoute.close();
    else if (editRoute.isOpen) editRoute.close();
  };

  const handleAddSave = (entry: RenderingEntry) => {
    persist([...entries, entry]);
    setDialog({ kind: 'edit', uid: entry.uid });
    // Replace the add-rendering history entry with edit-rendering atomically;
    // back+push would race because goBack is async (popstate fires after push),
    // leaving the URL stuck on dialog=add-rendering.
    editRoute.open({ replace: true });
  };

  const handleEditSave = (next: RenderingEntry) => {
    persist(entries.map(e => e.uid === next.uid ? next : e));
    handleClose();
  };

  const handleRemove = (uid: string) => {
    const entry = entries.find(e => e.uid === uid);
    if (!entry) return;
    setPendingRemoval(entry);
  };

  // Collect all child renderings that would be orphaned if this rendering is
  // removed. Uses the engine's authoritative ownerUid attribution from
  // /api/items/:id/placeholder-paths: each discovered path carries the UID of
  // the rendering that exposes it. We collect all paths owned by pendingRemoval
  // and union the descendants under each.
  const pendingDescendants = useMemo(() => {
    if (!pendingRemoval) return [];
    const ownedPaths = (placeholderPathsResp?.paths ?? [])
      .filter(p => p.source === 'discovered' && p.ownerUid === pendingRemoval.uid)
      .map(p => p.value);
    if (ownedPaths.length === 0) return [];
    const seen = new Set<string>();
    const result: RenderingEntry[] = [];
    for (const path of ownedPaths) {
      for (const d of findDescendants(pendingRemoval, entries, path)) {
        if (!seen.has(d.uid)) {
          seen.add(d.uid);
          result.push(d);
        }
      }
    }
    return result;
  }, [pendingRemoval, entries, placeholderPathsResp]);

  // Read component display names from the React Query cache (already populated
  // by RenderingCard's useRenderingMeta calls). Falls back to the raw renderingId
  // when the entry has not yet been rendered or is unresolved.
  const resolveComponentName = (renderingId: string): string => {
    const meta = queryClient.getQueryData<RenderingMeta>(['rendering-meta', renderingId]);
    return meta?.displayName ?? meta?.name ?? renderingId;
  };

  const confirmRemove = () => {
    if (!pendingRemoval) return;
    const toRemoveUids = new Set([pendingRemoval.uid, ...pendingDescendants.map(d => d.uid)]);
    persist(entries.filter(e => !toRemoveUids.has(e.uid)));
    setPendingRemoval(null);
  };

  const cancelRemove = () => setPendingRemoval(null);

  const moveWithinPlaceholder = (uid: string, dir: -1 | 1) => {
    const target = entries.find(e => e.uid === uid);
    if (!target) return;
    const sameGroup = entries.filter(e => e.placeholder === target.placeholder);
    const idx = sameGroup.findIndex(e => e.uid === uid);
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= sameGroup.length) return;
    const swapPartner = sameGroup[newIdx];
    const next = [...entries];
    const a = next.findIndex(e => e.uid === uid);
    const b = next.findIndex(e => e.uid === swapPartner.uid);
    [next[a], next[b]] = [next[b], next[a]];
    persist(next);
  };

  const editingEntry = useMemo(() => {
    if (dialog.kind === 'edit') return entries.find(e => e.uid === dialog.uid) ?? null;
    return null;
  }, [dialog, entries]);

  return (
    <FieldShell fieldId={fieldId} label={label} onNavigate={onNavigate}>
      <RenderingsList
        entries={entries}
        pageItemId={contextItemId}
        editing={editing}
        onAdd={handleAddOpen}
        onEdit={handleEditOpen}
        onMoveUp={(uid) => moveWithinPlaceholder(uid, -1)}
        onMoveDown={(uid) => moveWithinPlaceholder(uid, +1)}
        onRemove={handleRemove}
        onNavigate={onNavigate}
      />

      <AddRenderingDialog
        open={addRoute.isOpen}
        pageItemId={contextItemId}
        initialPlaceholder={dialog.kind === 'add' ? dialog.placeholder : undefined}
        nextDynamicPlaceholderId={nextDpi}
        onCancel={handleClose}
        onSave={handleAddSave}
      />

      <EditRenderingDialog
        open={editRoute.isOpen}
        entry={editingEntry}
        contextItemId={contextItemId}
        editing={editing}
        onCancel={handleClose}
        onSave={handleEditSave}
        onNavigate={onNavigate}
      />

      <ConfirmRemoveRenderingDialog
        open={pendingRemoval !== null}
        entry={pendingRemoval}
        descendants={pendingDescendants}
        resolveComponentName={resolveComponentName}
        onConfirm={confirmRemove}
        onCancel={cancelRemove}
      />
    </FieldShell>
  );
}
