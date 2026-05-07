// src/web/components/package/CartPane.tsx
//
// Slide-out drawer that lists the package cart's sources and triggers the
// Generate ZIP checkout dialog (which lands in Phase 10; for now this
// component fires onCheckout). Persists open/closed state in localStorage
// (key: mockingbird.packageCartPane.open) so the pane doesn't disappear
// after every Add. Empty state nudges the user toward the tree's right-click
// context menu (which lands in Phase 11).

import { useEffect, useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
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
import { Button } from '@/components/ui/button';
import { CartSourceRow } from './CartSourceRow';
import { usePackageCart } from '@/state/usePackageCart';

const PANE_OPEN_STORAGE_KEY = 'mockingbird.packageCartPane.open';

export interface CartPaneProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCheckout: () => void;
}

export function CartPane({ open, onOpenChange, onCheckout }: CartPaneProps) {
  const { sources, clearAll } = usePackageCart();
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);

  // Persist open/closed state. Persistence is one-way from prop->storage to
  // mirror the design: the parent owns the open state (CartIcon toggles it),
  // and on next mount the parent can read the persisted value to seed its
  // initial state. Persisting here keeps the persistence concern colocated
  // with the component that has a strong opinion about it.
  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(PANE_OPEN_STORAGE_KEY, JSON.stringify(open));
    } catch {
      // Ignore quota / disabled storage; pane state is ephemeral fallback.
    }
  }, [open]);

  const onClearClicked = () => {
    if (sources.length === 0) return;
    setClearConfirmOpen(true);
  };
  const onClearConfirmed = () => {
    clearAll();
    setClearConfirmOpen(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-[420px] p-0 flex flex-col">
        <SheetHeader className="border-b">
          <div className="flex items-center justify-between gap-2 pr-8">
            <SheetTitle>Package</SheetTitle>
            {sources.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={onClearClicked}
                aria-label="Clear package"
              >
                Clear
              </Button>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            {sources.length === 0
              ? '0 sources'
              : `${sources.length} ${sources.length === 1 ? 'source' : 'sources'}`}
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-auto px-4 py-3 space-y-2">
          {sources.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">
              Your package is empty. Right-click an item in the tree and choose Add to Package.
            </div>
          ) : (
            sources.map((s) => <CartSourceRow key={s.id} source={s} />)
          )}
        </div>

        <div className="border-t p-4">
          <Button
            className="w-full"
            disabled={sources.length === 0}
            onClick={onCheckout}
          >
            Download ZIP
          </Button>
        </div>
      </SheetContent>

      <AlertDialog open={clearConfirmOpen} onOpenChange={setClearConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear package?</AlertDialogTitle>
            <AlertDialogDescription>
              All sources will be removed from the package. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onClearConfirmed}>Clear</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
}

// Exported for parent components that want to seed their useState initializer
// from persisted state at mount time.
export function readPersistedCartPaneOpen(defaultValue = false): boolean {
  if (typeof localStorage === 'undefined') return defaultValue;
  try {
    const raw = localStorage.getItem(PANE_OPEN_STORAGE_KEY);
    if (raw === null) return defaultValue;
    const parsed = JSON.parse(raw) as unknown;
    return typeof parsed === 'boolean' ? parsed : defaultValue;
  } catch {
    return defaultValue;
  }
}
