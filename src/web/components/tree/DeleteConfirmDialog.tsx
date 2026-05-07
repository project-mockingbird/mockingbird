import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

// Replaces the native window.confirm() previously used by both right-click
// Delete and the trash hover-icon. Shows item name + path so the user has
// spatial context, and surfaces a descendant warning when applicable. Both
// surfaces (right-click and hover-icon) share this dialog.
interface DeleteConfirmDialogProps {
  open: boolean;
  itemName: string;
  itemPath: string;
  hasChildren: boolean;
  onConfirm: () => void;
  onClose: () => void;
  isPending?: boolean;
}

export function DeleteConfirmDialog({
  open,
  itemName,
  itemPath,
  hasChildren,
  onConfirm,
  onClose,
  isPending = false,
}: DeleteConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete "{itemName}"?</DialogTitle>
        </DialogHeader>
        <div className="text-sm">
          <span className="block mb-1 text-muted-foreground">Path</span>
          <div className="rounded border bg-muted/50 px-2 py-1.5 text-xs font-mono text-muted-foreground break-all">
            {itemPath}
          </div>
        </div>
        <p className="text-sm mt-3">
          {hasChildren
            ? 'This item and all of its descendants will be removed from disk. The action cannot be undone.'
            : 'This item will be removed from disk. The action cannot be undone.'}
        </p>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button colorScheme="danger" size="sm" onClick={onConfirm} disabled={isPending}>
            {isPending && <Spinner className="size-3 mr-1" variant="primary" />}
            {isPending ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
