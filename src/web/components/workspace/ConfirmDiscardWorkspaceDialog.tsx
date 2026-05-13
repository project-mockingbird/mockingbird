import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export type DiscardWorkspaceAction = 'close' | 'switch';

export interface ConfirmDiscardWorkspaceDialogProps {
  action: DiscardWorkspaceAction | null;
  dirtyCount: number;
  onConfirm: () => void;
  onCancel: () => void;
}

// Workspace-level dirty-discard prompt. Distinct from ConfirmCloseDialog (which
// gates a single tab close). Used by Close project and Open another project to
// warn before tearing down a workspace that has unsaved tab edits.
export function ConfirmDiscardWorkspaceDialog({
  action,
  dirtyCount,
  onConfirm,
  onCancel,
}: ConfirmDiscardWorkspaceDialogProps) {
  const open = action !== null;
  const verbPast = action === 'switch' ? 'Switching projects' : 'Closing the project';
  const confirmLabel = action === 'switch' ? 'Discard and switch' : 'Discard and close';
  const tabSuffix = dirtyCount === 1 ? '1 tab' : `${dirtyCount} tabs`;
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Discard changes?</DialogTitle>
          <DialogDescription>
            {verbPast} will discard unsaved changes in {tabSuffix}. Continue?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
          <Button colorScheme="danger" size="sm" onClick={onConfirm}>{confirmLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
