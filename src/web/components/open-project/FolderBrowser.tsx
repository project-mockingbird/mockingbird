import { useState } from 'react';
import { Icon } from '@/lib/icon';
import { mdiFolder, mdiFolderOpen, mdiCheckCircle, mdiChevronLeft } from '@mdi/js';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useFsList } from '@/hooks/useFsList';

interface FolderBrowserProps {
  open: boolean;
  onClose: () => void;
  /** Called with the workspace-relative path the user picked. */
  onConfirm: (path: string) => void;
}

function parentPathOf(path: string): string | null {
  if (path === '/' || path === '') return null;
  const trimmed = path.replace(/\/+$/, '');
  const slash = trimmed.lastIndexOf('/');
  if (slash <= 0) return '/';
  return trimmed.slice(0, slash);
}

/**
 * Folder-picker dialog that walks the workspace mount via /api/fs/list. The
 * user navigates by clicking folder rows; the "Scan this folder for projects"
 * button submits the currently-displayed path to the caller.
 */
export function FolderBrowser({ open, onClose, onConfirm }: FolderBrowserProps) {
  const [currentPath, setCurrentPath] = useState('/');
  const { data, isLoading, error } = useFsList(open ? currentPath : null);
  const parent = parentPathOf(currentPath);

  const goUp = () => {
    if (parent !== null) setCurrentPath(parent);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setCurrentPath('/');
          onClose();
        }
      }}
    >
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Pick a folder to scan</DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-2 border rounded px-2 py-1.5 text-sm">
          <Button
            variant="ghost"
            size="sm"
            disabled={parent === null}
            onClick={goUp}
            aria-label="Go to parent folder"
          >
            <Icon path={mdiChevronLeft} className="size-4" />
          </Button>
          <span
            data-testid="folder-browser-path"
            className="font-mono text-xs text-muted-foreground truncate"
          >
            {currentPath}
          </span>
        </div>
        <div className="min-h-[16rem] max-h-[24rem] overflow-y-auto border rounded">
          {isLoading && (
            <div className="flex items-center justify-center py-12 gap-2 text-sm text-muted-foreground">
              <Spinner className="size-3" variant="primary" />
              Loading...
            </div>
          )}
          {error && (
            <div className="p-4 text-sm text-destructive">{error.message}</div>
          )}
          {!isLoading && !error && data && data.entries.length === 0 && (
            <div className="p-6 text-sm text-muted-foreground text-center">
              No subfolders here.
            </div>
          )}
          {!isLoading && !error && data && data.entries.length > 0 && (
            <ul>
              {data.entries.map((entry) => (
                <li key={entry.path}>
                  <button
                    type="button"
                    onClick={() => setCurrentPath(entry.path)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-accent"
                  >
                    <Icon path={mdiFolder} className="size-4 text-muted-foreground" />
                    <span className="flex-1 truncate">{entry.name}</span>
                    {entry.hasSitecoreJson && (
                      <span
                        data-testid={`has-sitecore-json-${entry.name}`}
                        className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400"
                      >
                        <Icon path={mdiCheckCircle} className="size-3" />
                        sitecore.json
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => onConfirm(currentPath)}>
            <Icon path={mdiFolderOpen} className="size-3 mr-1" />
            Scan this folder for projects
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
