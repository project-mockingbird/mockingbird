import { useState } from 'react';
import { Power, RotateCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

/**
 * Floating power button (bottom-right, always visible) that re-indexes the
 * engine in place - the in-app equivalent of recreating the container to force
 * a refresh, without a real process/container restart.
 *
 * - Restart: re-reads the workspace (warm; uses the index cache).
 * - Clear Cache and Restart: wipes the index cache first for a full cold
 *   rebuild (confirmed, since it can take a minute).
 *
 * Both POST /api/admin/reindex, which flips engine readiness back to
 * 'initializing'; reloading then lands on the starting splash and returns to
 * the app once the rebuild finishes.
 */
export function RestartButton() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmClearCache, setConfirmClearCache] = useState(false);

  async function restart(clearCache: boolean) {
    setOpen(false);
    if (busy) return;
    // A cold rebuild wipes the cache and can take a minute, so gate it behind an
    // in-app confirm dialog (replaces the native window.confirm()).
    if (clearCache) {
      setConfirmClearCache(true);
      return;
    }
    await doReindex(false);
  }

  async function doReindex(clearCache: boolean) {
    if (busy) return;
    setBusy(true);
    try {
      await api.reindex(clearCache);
      // The engine is now re-indexing (readiness reset to 'initializing').
      // Reload so the browser lands on the starting splash, which returns to
      // the app when the rebuild completes.
      window.location.reload();
    } catch (err) {
      setBusy(false);
      setConfirmClearCache(false);
      toast.error(`Restart failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            aria-hidden
            onClick={() => setOpen(false)}
          />
          <div
            role="menu"
            className="absolute bottom-12 right-0 z-50 w-56 overflow-hidden rounded-md border border-border bg-popover py-1 text-popover-foreground shadow-lg"
          >
            <button
              role="menuitem"
              type="button"
              onClick={() => restart(false)}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
            >
              <RotateCw className="h-4 w-4" />
              Restart
            </button>
            <button
              role="menuitem"
              type="button"
              onClick={() => restart(true)}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-500 hover:bg-accent"
            >
              <Trash2 className="h-4 w-4" />
              Clear Cache and Restart
            </button>
          </div>
        </>
      )}
      <button
        type="button"
        aria-label="Restart Mockingbird"
        title="Restart Mockingbird"
        disabled={busy}
        onClick={() => setOpen((o) => !o)}
        className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background/80 text-muted-foreground shadow-md backdrop-blur transition hover:bg-accent hover:text-foreground disabled:opacity-50"
      >
        <Power className="h-5 w-5" />
      </button>

      <Dialog
        open={confirmClearCache}
        onOpenChange={(o) => {
          if (!o && !busy) setConfirmClearCache(false);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear cache and rebuild?</DialogTitle>
          </DialogHeader>
          <p className="text-sm">
            This clears the index cache and rebuilds from scratch. It runs a full
            cold re-index and can take a minute.
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmClearCache(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              colorScheme="danger"
              size="sm"
              onClick={() => doReindex(true)}
              disabled={busy}
            >
              {busy && <Spinner className="size-3 mr-1" variant="primary" />}
              {busy ? 'Rebuilding...' : 'Clear Cache and Restart'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
