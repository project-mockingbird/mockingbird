// src/web/components/tree/CopyMoveDestinationDialog.tsx
//
// Shared destination picker for Copy to... and Move to... actions. The mode
// prop drives titles, button label, the disabled-id set, and the visibility
// of the move-only collision hint. Wraps Phase 6's <ItemTreePicker> for the
// actual tree UI.
//
// Move mode greys out: the source itself, all of its descendants (would
// create a cycle), and the source's current parent (no-op move). Copy mode
// only greys out the source itself (copying into its own parent is a valid
// duplicate-style copy and Sitecore allows it).

import { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { ItemTreePicker } from '@/components/tree-picker/ItemTreePicker';
import { useAncestors } from '@/hooks/useItems';
import type { TreeNode } from '@/lib/types';

export type CopyMoveMode = 'copy' | 'move';

export interface CopyMoveDestinationDialogProps {
  open: boolean;
  mode: CopyMoveMode;
  sourceId: string;
  sourceName: string;
  sourcePath: string;
  /** All descendant ids of the source (excluding source itself). Used in move
   *  mode to grey out invalid destinations. */
  sourceDescendantIds: ReadonlySet<string>;
  sourceParentId: string;
  sourceParentPath: string;
  database: string;
  onConfirm: (destinationParentId: string) => void;
  onClose: () => void;
  isPending?: boolean;
  serverError?: string | null;
}

export function CopyMoveDestinationDialog({
  open,
  mode,
  sourceId,
  sourceName,
  sourcePath,
  sourceDescendantIds,
  sourceParentId,
  sourceParentPath: _sourceParentPath,
  database,
  onConfirm,
  onClose,
  isPending = false,
  serverError = null,
}: CopyMoveDestinationDialogProps) {
  const [pickedId, setPickedId] = useState<string | null>(null);

  // Ancestor pre-expand: walk up from source's parent so the picker opens
  // with the current location visible. useAncestors returns the chain for
  // the given id; include the parent id itself so the parent's row is
  // expanded too.
  const { data: ancestors } = useAncestors(sourceParentId);
  const autoExpandIds = useMemo(
    () => new Set([sourceParentId, ...(ancestors ?? [])]),
    [ancestors, sourceParentId],
  );

  // Disabled set differs by mode.
  const disabledIds = useMemo<Set<string>>(() => {
    const set = new Set<string>([sourceId]);
    if (mode === 'move') {
      for (const d of sourceDescendantIds) set.add(d);
      set.add(sourceParentId);
    }
    return set;
  }, [mode, sourceId, sourceDescendantIds, sourceParentId]);

  const canSubmit = pickedId !== null && !isPending;
  const titleAction = mode === 'copy' ? 'Copy' : 'Move';
  const isCollisionError =
    mode === 'move' && !!serverError && /already exists at/i.test(serverError);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setPickedId(null);
          onClose();
        }
      }}
    >
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>
            {titleAction} "{sourceName}" to...
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          Currently at <code>{sourcePath}</code>
        </p>
        <div className="h-72 overflow-auto border border-border rounded-md bg-muted/30 p-1">
          <ItemTreePicker
            database={database}
            selectedId={pickedId}
            onSelect={(node: TreeNode) => setPickedId(node.id)}
            disabledIds={disabledIds}
            autoExpandIds={autoExpandIds}
            className="h-full overflow-auto"
          />
        </div>
        {serverError && (
          <p className="text-xs text-destructive">{serverError}</p>
        )}
        {isCollisionError && (
          <p className="text-xs text-muted-foreground">
            To move with a different name, use Duplicate first then delete the original.
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!canSubmit}
            onClick={() => { if (canSubmit && pickedId) onConfirm(pickedId); }}
          >
            {isPending && <Spinner className="size-3 mr-1" variant="primary" />}
            {isPending
              ? (mode === 'copy' ? 'Copying...' : 'Moving...')
              : titleAction}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
