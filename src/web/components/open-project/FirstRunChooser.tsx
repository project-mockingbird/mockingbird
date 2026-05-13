import { useState } from 'react';
import { Icon } from '@/lib/icon';
import { mdiArrowLeft, mdiClose, mdiFolderOpen, mdiPlusBox } from '@mdi/js';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useProjectsStore, type SavedProject } from '@/state/projectsStore';

interface FirstRunChooserProps {
  open: boolean;
  onClose: () => void;
  onCreateNew: () => void;
  onOpenExisting: (project: SavedProject) => void;
  /**
   * When provided, this project is filtered out of the "Open existing" list
   * (the chooser is launched from inside an active project and you cannot
   * "switch" to the one already open).
   */
  currentProjectHash?: string | null;
}

interface ChoiceTileProps {
  iconPath: string;
  title: string;
  description: string;
  onClick: () => void;
  disabled?: boolean;
}

function ChoiceTile({ iconPath, title, description, onClick, disabled }: ChoiceTileProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-center gap-2 rounded-lg border bg-card p-6 text-center transition-colors hover:bg-accent hover:border-primary disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-card disabled:hover:border-border"
    >
      <Icon path={iconPath} className="size-10 text-foreground" />
      <span className="text-sm font-medium">{title}</span>
      <span className="text-xs text-muted-foreground">{description}</span>
    </button>
  );
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const deltaMs = Date.now() - then;
  const mins = Math.floor(deltaMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

export function FirstRunChooser({
  open,
  onClose,
  onCreateNew,
  onOpenExisting,
  currentProjectHash = null,
}: FirstRunChooserProps) {
  const projectsMap = useProjectsStore((s) => s.projects);
  const remove = useProjectsStore((s) => s.remove);
  const [view, setView] = useState<'choose' | 'list'>('choose');

  const projects = Object.values(projectsMap)
    .filter((p) => p.hash !== currentProjectHash)
    .sort((a, b) => (b.lastOpenedAt > a.lastOpenedAt ? 1 : -1));
  const hasSaved = projects.length > 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setView('choose');
          onClose();
        }
      }}
    >
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>
            {view === 'choose' ? 'Get started' : 'Open existing project'}
          </DialogTitle>
        </DialogHeader>
        {view === 'choose' ? (
          <div className="grid grid-cols-2 gap-4">
            <ChoiceTile
              iconPath={mdiFolderOpen}
              title="Open existing project"
              description={
                hasSaved
                  ? `Choose from ${projects.length} saved project${projects.length === 1 ? '' : 's'}.`
                  : 'No saved projects yet.'
              }
              onClick={() => setView('list')}
              disabled={!hasSaved}
            />
            <ChoiceTile
              iconPath={mdiPlusBox}
              title="Create new project"
              description="Point Mockingbird at a folder with sitecore.json files."
              onClick={() => {
                setView('choose');
                onCreateNew();
              }}
            />
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <ul className="divide-y border rounded">
              {projects.map((p) => (
                <li
                  key={p.hash}
                  className="group flex items-center gap-2 p-2 text-sm"
                >
                  <div className="flex gap-0.5 shrink-0">
                    {p.layers.slice(0, 4).map((l, i) => (
                      <span
                        key={i}
                        className="inline-block size-2 rounded-full"
                        style={{ background: l.color }}
                        aria-hidden
                      />
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setView('choose');
                      onOpenExisting(p);
                    }}
                    className="flex-1 flex items-center gap-2 text-left hover:bg-accent rounded px-1"
                  >
                    <span className="font-medium">{p.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {p.layers.length} layer{p.layers.length === 1 ? '' : 's'}
                    </span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {formatRelative(p.lastOpenedAt)}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(p.hash)}
                    aria-label={`Remove ${p.name}`}
                    className="opacity-0 group-hover:opacity-100 hover:bg-accent rounded p-1"
                  >
                    <Icon path={mdiClose} className="size-3" />
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => setView('choose')}
              className="self-start flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <Icon path={mdiArrowLeft} className="size-3" />
              Back
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
