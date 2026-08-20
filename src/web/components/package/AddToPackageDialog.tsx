// src/web/components/package/AddToPackageDialog.tsx
//
// Modal that adds a tree item to the package cart, OR (in download mode)
// builds and downloads a one-off package directly without touching the cart.
// The same dialog handles both flows because they share the same form shape:
// pick a source name + a scope. The four scope options match Sitecore's
// Quick Download Tree as Package dropdown.
//
// Mode controls the submit behavior and labels:
//   - 'cart' (default): submit appends a CartSource to packageCartStore.
//   - 'download':       submit calls downloadPackage with one source and the
//                       Source Name doubles as the package metadata.name.
//   - 'deploy':         submit calls onDeploy with a single DeploySource-
//                       shaped object instead of touching the cart or
//                       triggering a download; the caller (ContentTree) opens
//                       DeployDialog with it via deployStore.

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { packageCartStore, type CartSourceScope } from '@/state/packageCartStore';
import { downloadPackage } from '@/lib/downloadPackage';

const SCOPE_OPTIONS: ReadonlyArray<{ value: CartSourceScope; label: string }> = [
  { value: 'itemAndDescendants', label: 'Root and descendants' },
  { value: 'itemAndChildren',    label: 'Root and children' },
  { value: 'descendantsOnly',    label: 'Descendants only' },
  { value: 'childrenOnly',       label: 'Children only' },
];

export type AddToPackageMode = 'cart' | 'download' | 'deploy';

export interface AddToPackageDialogProps {
  item: { id: string; path: string; name: string };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode?: AddToPackageMode;
  onDownloadSuccess?: (filename: string) => void;
  onDownloadError?: (message: string) => void;
  onDeploy?: (source: {
    id: string; rootItemId: string; rootItemPath: string; rootItemName: string;
    scope: CartSourceScope; database: 'master';
  }) => void;
}

export function AddToPackageDialog({
  item,
  open,
  onOpenChange,
  mode = 'cart',
  onDownloadSuccess,
  onDownloadError,
  onDeploy,
}: AddToPackageDialogProps) {
  const [sourceName, setSourceName] = useState(item.name);
  const [scope, setScope] = useState<CartSourceScope>('itemAndDescendants');
  const [submitting, setSubmitting] = useState(false);

  // Reset form each time the dialog opens so a prior selection / typed name
  // doesn't bleed into the next use.
  useEffect(() => {
    if (open) {
      setSourceName(item.name);
      setScope('itemAndDescendants');
      setSubmitting(false);
    }
  }, [open, item.name]);

  const isCart = mode === 'cart';
  const title = mode === 'deploy' ? `Deploy "${item.name}"` : isCart ? `Add "${item.name}" to Package` : `Download "${item.name}"`;
  const submitLabel = mode === 'deploy' ? 'Continue' : isCart ? 'Add to Package' : 'Download';

  const onSubmit = async () => {
    const trimmed = sourceName.trim() || item.name;

    if (mode === 'deploy') {
      onDeploy?.({ id: 'deploy', rootItemId: item.id, rootItemPath: item.path, rootItemName: trimmed, scope, database: 'master' });
      onOpenChange(false);
      return;
    }

    if (isCart) {
      packageCartStore.addSource({
        rootItemId: item.id,
        rootItemPath: item.path,
        rootItemName: trimmed,
        scope,
      });
      onOpenChange(false);
      return;
    }

    // Download mode: build and download a one-off package directly.
    setSubmitting(true);
    try {
      const result = await downloadPackage({
        sources: [{
          id: 'quick',
          rootItemId: item.id,
          rootItemPath: item.path,
          rootItemName: trimmed,
          scope,
          database: 'master',
        }],
        metadata: { name: trimmed },
      });
      onDownloadSuccess?.(result.filename);
      onOpenChange(false);
    } catch (err) {
      onDownloadError?.(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!submitting) onOpenChange(o); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="text-sm">
            <span className="text-muted-foreground">Path: </span>
            <span>{item.path}</span>
          </div>
          <div>
            <Label htmlFor="pkg-source-name" className="mb-2 block">Source Name</Label>
            <Input
              id="pkg-source-name"
              value={sourceName}
              onChange={(e) => setSourceName(e.target.value)}
              placeholder={item.name}
              disabled={submitting}
            />
          </div>
          <div>
            <Label className="mb-2 block">Scope:</Label>
            <RadioGroup
              value={scope}
              onValueChange={(v) => setScope(v as CartSourceScope)}
              disabled={submitting}
            >
              {SCOPE_OPTIONS.map((opt) => (
                <div key={opt.value} className="flex items-center space-x-2">
                  <RadioGroupItem value={opt.value} id={`scope-${opt.value}`} />
                  <Label htmlFor={`scope-${opt.value}`}>{opt.label}</Label>
                </div>
              ))}
            </RadioGroup>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button size="sm" onClick={onSubmit} disabled={submitting}>
            {submitting ? 'Downloading...' : submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
