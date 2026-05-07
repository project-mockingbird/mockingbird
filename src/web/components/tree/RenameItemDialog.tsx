import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useNameValidation } from '@/hooks/useNameValidation';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { DialogParentPath } from './DialogParentPath';

/**
 * Simple rename dialog: pre-fills with the current name, validates against
 * the parent's existing siblings (excluding the source itself), and submits
 * on Enter. Mirrors `DuplicateItemDialog`'s shape minus the auto-suggest.
 */
interface RenameItemDialogProps {
  open: boolean;
  currentName: string;
  parentPath: string;
  /** Sibling names of the item being renamed, EXCLUDING its own current name. */
  siblings: string[];
  onConfirm: (newName: string) => void;
  onClose: () => void;
  isPending?: boolean;
  serverError?: string | null;
}

export function RenameItemDialog({
  open,
  currentName,
  parentPath,
  siblings,
  onConfirm,
  onClose,
  isPending = false,
  serverError = null,
}: RenameItemDialogProps) {
  const [value, setValue] = useState(currentName);

  useEffect(() => {
    if (open) setValue(currentName);
  }, [open, currentName]);

  const validationError = useNameValidation(value, siblings);
  const trimmed = value.trim();
  const noChange = trimmed === currentName;
  // Allow no-change input to STAY in the field but disable the submit button -
  // hint that nothing would happen, without blocking edits.
  const canSubmit = !validationError && !isPending && !noChange && trimmed.length > 0;

  const handleConfirm = () => {
    if (!canSubmit) return;
    onConfirm(trimmed);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename "{currentName}"</DialogTitle>
        </DialogHeader>
        <DialogParentPath parentPath={parentPath} />
        <input
          autoFocus
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && canSubmit) handleConfirm();
            if (e.key === 'Escape') onClose();
          }}
          className="w-full rounded border bg-background px-2 py-1.5 text-sm"
          disabled={isPending}
        />
        {validationError && (
          <p className="text-xs text-destructive mt-1">{validationError}</p>
        )}
        {serverError && (
          <p className="text-xs text-destructive mt-1">{serverError}</p>
        )}
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleConfirm} disabled={!canSubmit}>
            {isPending && <Spinner className="size-3 mr-1" variant="primary" />}
            {isPending ? 'Renaming...' : 'Rename'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
