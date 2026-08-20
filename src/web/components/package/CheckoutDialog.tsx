// src/web/components/package/CheckoutDialog.tsx
//
// Modal that collects per-build metadata (name, author, version, comment)
// and triggers the actual server build via downloadPackage. Fired from the
// Cart pane's Generate ZIP button. Single screen, no wizard, only the name
// field is required - matches the design's "Checkout dialog (Generate ZIP)"
// section.
//
// "Clear cart after successful download" is sticky in localStorage under
// `mockingbird.packageClearCartOnSuccess` so a user who flips it once
// doesn't need to re-toggle it on every checkout.

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { usePackageCart } from '@/state/usePackageCart';
import { downloadPackage } from '@/lib/downloadPackage';

const CLEAR_ON_SUCCESS_KEY = 'mockingbird.packageClearCartOnSuccess';

function readClearOnSuccess(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(CLEAR_ON_SUCCESS_KEY) === '1';
  } catch {
    return false;
  }
}

function writeClearOnSuccess(value: boolean): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(CLEAR_ON_SUCCESS_KEY, value ? '1' : '0');
  } catch {
    // Ignore quota / disabled-storage; preference reverts to default next time.
  }
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface CheckoutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the downloaded filename + item count on success. */
  onSuccess?: (result: { filename: string; itemCount: number; warnings: number }) => void;
  /** Called with the error message on a failed build. */
  onError?: (message: string) => void;
}

export function CheckoutDialog({ open, onOpenChange, onSuccess, onError }: CheckoutDialogProps) {
  const { sources, clearAll } = usePackageCart();

  const [name, setName] = useState(`mockingbird-package-${todayIso()}`);
  const [author, setAuthor] = useState('');
  const [version, setVersion] = useState('1.0');
  const [comment, setComment] = useState('');
  const [clearOnSuccess, setClearOnSuccess] = useState<boolean>(readClearOnSuccess);
  const [generating, setGenerating] = useState(false);

  // Reset name (with today's date) and the clear-on-success preference each
  // time the dialog opens. Other fields keep their last value so a user who
  // generates two packages in a session doesn't have to re-type the author.
  useEffect(() => {
    if (!open) return;
    setName(`mockingbird-package-${todayIso()}`);
    setClearOnSuccess(readClearOnSuccess());
    setGenerating(false);
  }, [open]);

  const trimmedName = name.trim();
  const canSubmit = !generating && trimmedName.length > 0 && sources.length > 0;

  const onGenerate = async () => {
    if (!canSubmit) return;
    setGenerating(true);
    try {
      const result = await downloadPackage({
        sources,
        metadata: {
          name: trimmedName,
          author: author.trim() || undefined,
          version: version.trim() || undefined,
          comment: comment.trim() || undefined,
        },
      });
      // Persist the sticky preference whether or not it changed; cheap and
      // covers the case where a user toggles + generates in one shot.
      writeClearOnSuccess(clearOnSuccess);
      if (clearOnSuccess) clearAll();
      onSuccess?.({
        filename: result.filename,
        itemCount: result.itemCount,
        warnings: result.warnings.length,
      });
      onOpenChange(false);
    } catch (e) {
      onError?.(e instanceof Error ? e.message : 'Build failed');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (generating) return;  // Don't let the user close mid-build.
        onOpenChange(o);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generate Package</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label htmlFor="pkg-name">Package name *</Label>
            <Input
              id="pkg-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
              disabled={generating}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="pkg-author">Author</Label>
            <Input
              id="pkg-author"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              disabled={generating}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="pkg-version">Version</Label>
            <Input
              id="pkg-version"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              disabled={generating}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="pkg-comment">Comment</Label>
            <Input
              id="pkg-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              disabled={generating}
            />
          </div>
          <div className="flex items-center space-x-2 pt-1">
            <input
              id="pkg-clear"
              type="checkbox"
              className="h-4 w-4 rounded border-input"
              checked={clearOnSuccess}
              onChange={(e) => setClearOnSuccess(e.target.checked)}
              disabled={generating}
            />
            <Label htmlFor="pkg-clear" className="cursor-pointer">
              Clear cart after successful download
            </Label>
          </div>
          {sources.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Cart is empty. Add at least one source before generating.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={generating}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={onGenerate}
            disabled={!canSubmit}
          >
            {generating && <Spinner className="size-3 mr-1" variant="primary" />}
            {generating ? 'Generating...' : 'Generate'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
