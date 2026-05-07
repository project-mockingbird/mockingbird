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

// Mirrors Sitecore Content Editor's Duplicate dialog: pre-fill with
// `<source name> (1)` and auto-increment when collisions exist (e.g. if
// "Foo" + "Foo (1)" both exist, default to "Foo (2)"). Live validation
// via the shared useNameValidation hook (sibling-uniqueness +
// character-format check). Closest precedent: InsertItemDialog.
interface DuplicateItemDialogProps {
  open: boolean;
  sourceName: string;
  parentPath: string;
  siblings: string[];
  onConfirm: (name: string) => void;
  onClose: () => void;
  isPending?: boolean;
  serverError?: string | null;
}

export function DuplicateItemDialog({
  open,
  sourceName,
  parentPath,
  siblings,
  onConfirm,
  onClose,
  isPending = false,
  serverError = null,
}: DuplicateItemDialogProps) {
  const [value, setValue] = useState(() => suggestDefault(sourceName, siblings));

  // Reset when the dialog opens (or sourceName changes between opens).
  useEffect(() => {
    if (open) setValue(suggestDefault(sourceName, siblings));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sourceName]);

  const validationError = useNameValidation(value, siblings);
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
          <DialogTitle>Duplicate "{sourceName}"</DialogTitle>
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

/**
 * Suggest a default name: `<sourceName> (n)` for the smallest n >= 1 not
 * already among siblings (case-insensitive).
 */
function suggestDefault(sourceName: string, siblings: string[]): string {
  const lowerSet = new Set(siblings.map((s) => s.toLowerCase()));
  for (let n = 1; n < 1000; n++) {
    const candidate = `${sourceName} (${n})`;
    if (!lowerSet.has(candidate.toLowerCase())) return candidate;
  }
  // Fall back to (1) - the user can edit if 1000 collisions somehow exist.
  return `${sourceName} (1)`;
}
