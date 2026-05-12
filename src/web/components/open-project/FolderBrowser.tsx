import { useState } from 'react';
import { Icon } from '@/lib/icon';
import { mdiFolder, mdiFileCode, mdiCheckCircle, mdiChevronLeft } from '@mdi/js';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useFsList, type FsConfigFileEntry } from '@/hooks/useFsList';

interface FolderBrowserProps {
  open: boolean;
  onClose: () => void;
  /** Called with the picked file path, its module count, and its push-ops summary. */
  onFilePick: (filePath: string, moduleCount: number, pushOpsSummary: string) => void;
}

function parentPathOf(path: string): string | null {
  if (path === '/' || path === '') return null;
  const trimmed = path.replace(/\/+$/, '');
  const slash = trimmed.lastIndexOf('/');
  if (slash <= 0) return '/';
  return trimmed.slice(0, slash);
}

/**
 * Folder + file picker. Walks the workspace mount via /api/fs/list?includeFiles=true.
 * Directories are clickable to navigate; config-file rows (JSON files matching the
 * SCS root-config shape) are clickable to pick. A "Use sitecore.json from this folder"
 * shortcut activates when the current folder itself contains a sitecore.json file.
 */
export function FolderBrowser({ open, onClose, onFilePick }: FolderBrowserProps) {
  const [currentPath, setCurrentPath] = useState('/');
  const { data, isLoading, error } = useFsList(open ? currentPath : null, {
    includeFiles: true,
  });
  const parent = parentPathOf(currentPath);

  const sitecoreJsonAtRoot = data?.entries.find(
    (e): e is FsConfigFileEntry => e.kind === 'config-file' && e.name === 'sitecore.json',
  );

  const goUp = () => {
    if (parent !== null) setCurrentPath(parent);
  };

  const handleConfigFileClick = (entry: FsConfigFileEntry) => {
    onFilePick(entry.path, entry.moduleCount, entry.pushOpsSummary);
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
          <DialogTitle>Select a configuration file</DialogTitle>
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
              Nothing here.
            </div>
          )}
          {!isLoading && !error && data && data.entries.length > 0 && (
            <ul>
              {data.entries.map((entry) => {
                if (entry.kind === 'directory') {
                  return (
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
                  );
                }
                return (
                  <li key={entry.path}>
                    <button
                      type="button"
                      onClick={() => handleConfigFileClick(entry)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-accent"
                    >
                      <Icon path={mdiFileCode} className="size-4 text-foreground" />
                      <span className="flex-1 truncate font-mono">{entry.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {entry.moduleCount} module
                        {entry.moduleCount === 1 ? '' : 's'}
                        {entry.pushOpsSummary && (
                          <>
                            {' '}&middot; {entry.pushOpsSummary}
                          </>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          {sitecoreJsonAtRoot && (
            <Button
              size="sm"
              onClick={() => handleConfigFileClick(sitecoreJsonAtRoot)}
            >
              <Icon path={mdiFileCode} className="size-3 mr-1" />
              Use sitecore.json from this folder
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
