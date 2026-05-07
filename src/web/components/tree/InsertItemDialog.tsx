import { useEffect, useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { getItemNameError } from '@/lib/name-validation';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { DialogParentPath } from './DialogParentPath';

// Insert Options name dialog. Pre-fills with the template display name to
// match Sitecore Content Editor behaviour, runs live client-side validation
// via the shared `getItemNameError` mirror (see lib/name-validation.ts), and
// surfaces server-side 400 errors via `serverError`. The OK button is gated
// on (validation == null) AND (!isPending). Closest precedent in this
// codebase is `CreateDialog` in components/tree/ContentTree.tsx.
interface InsertItemDialogProps {
  open: boolean;
  templateName: string;
  parentPath: string;
  onConfirm: (name: string) => void;
  onClose: () => void;
  isPending?: boolean;
  serverError?: string | null;
}

export function InsertItemDialog({
  open,
  templateName,
  parentPath,
  onConfirm,
  onClose,
  isPending = false,
  serverError = null,
}: InsertItemDialogProps) {
  const [value, setValue] = useState(templateName);

  // Reset name to template default when dialog opens or the template changes
  // (e.g. user closes, re-opens with a different Insert Option).
  useEffect(() => {
    if (open) setValue(templateName);
  }, [open, templateName]);

  const validationError = useMemo(() => getItemNameError(value), [value]);
  const canSubmit = !validationError && !isPending;

  const handleConfirm = () => {
    if (!canSubmit) return;
    onConfirm(value);
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
          <DialogTitle>Enter name for new {templateName} item</DialogTitle>
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
            {isPending ? 'Creating...' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
