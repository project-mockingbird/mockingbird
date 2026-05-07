import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

// Confirms discard of unsaved edits when a dirty tab is being closed.
// Hidden when confirmTabId is null. Closing via X / backdrop / Esc routes
// through onOpenChange and triggers onCancel. Mirrors the destructive-action
// idiom used by DeleteConfirmDialog: outline Cancel + danger Discard. This
// codebase's Button does not expose a "destructive" variant - danger styling
// is applied via colorScheme="danger".
export interface ConfirmCloseDialogProps {
  confirmTabId: string | null;
  confirmTabName: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmCloseDialog({
  confirmTabId,
  confirmTabName,
  onConfirm,
  onCancel,
}: ConfirmCloseDialogProps) {
  const open = confirmTabId !== null;
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Discard changes?</DialogTitle>
          <DialogDescription>
            {confirmTabName
              ? <>Discard unsaved changes to <strong>{confirmTabName}</strong>?</>
              : 'Discard unsaved changes?'}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
          <Button colorScheme="danger" size="sm" onClick={onConfirm}>Discard</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
