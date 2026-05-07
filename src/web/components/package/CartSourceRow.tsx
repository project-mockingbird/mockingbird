// src/web/components/package/CartSourceRow.tsx
//
// One row of the package cart pane. Shows the source's name captured at
// add-time, lets the user flip its scope without re-adding, and removes the
// source from the cart. The item-count label is fetched per (id, scope) via
// /api/package/source-size and cached by react-query so toggling scope reuses
// prior probes.

import { useState } from 'react';
import { Icon } from '@/lib/icon';
import { mdiClose } from '@mdi/js';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { packageCartStore, type CartSource, type CartSourceScope } from '@/state/packageCartStore';
import { usePackageSourceSize } from '@/hooks/usePackageSourceSize';

const SCOPE_LABELS: Record<CartSourceScope, string> = {
  itemAndDescendants: 'Root and descendants',
  itemAndChildren: 'Root and children',
  descendantsOnly: 'Descendants only',
  childrenOnly: 'Children only',
};

const SCOPE_ORDER: CartSourceScope[] = [
  'itemAndDescendants',
  'itemAndChildren',
  'descendantsOnly',
  'childrenOnly',
];

export interface CartSourceRowProps {
  source: CartSource;
}

export function CartSourceRow({ source }: CartSourceRowProps) {
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const { data, isLoading, isError } = usePackageSourceSize(source.rootItemId, source.scope);
  const countLabel = isError
    ? 'count unavailable'
    : isLoading || !data
      ? '...'
      : `${data.count} ${data.count === 1 ? 'item' : 'items'}`;

  return (
    <div className="rounded-md border bg-card p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold truncate" title={source.rootItemName}>
            {source.rootItemName}
          </div>
          <div className="text-xs text-muted-foreground truncate" title={source.rootItemPath}>
            {source.rootItemPath}
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Remove ${source.rootItemName} from cart`}
          onClick={() => setRemoveConfirmOpen(true)}
        >
          <Icon path={mdiClose} size={0.9} />
        </Button>
      </div>
      <div className="flex items-center justify-between gap-2">
        <Select
          value={source.scope}
          onValueChange={(v) => packageCartStore.setScope(source.id, v as CartSourceScope)}
        >
          <SelectTrigger
            size="sm"
            aria-label={`Scope for ${source.rootItemName}`}
            className="w-auto"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SCOPE_ORDER.map((s) => (
              <SelectItem key={s} value={s}>
                {SCOPE_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground tabular-nums" aria-label={`Item count: ${countLabel}`}>
          {countLabel}
        </span>
      </div>

      <AlertDialog open={removeConfirmOpen} onOpenChange={setRemoveConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove source?</AlertDialogTitle>
            <AlertDialogDescription>
              The source "{source.rootItemName}" will be removed from the package. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { packageCartStore.removeSource(source.id); setRemoveConfirmOpen(false); }}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
