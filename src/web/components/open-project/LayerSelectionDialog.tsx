import { useMemo, useState } from 'react';
import { Icon } from '@/lib/icon';
import { mdiAlert, mdiArrowDown, mdiArrowUp, mdiLoading } from '@mdi/js';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { ScsConfigCandidate } from '@/hooks/useDiscoverLayers';
import type { OpenProjectLayer } from '@/hooks/useOpenProject';
import { assignLayerColor } from './layer-colors';
import { deriveName } from './layer-name';
import { detectOverlaps } from './duplicate-detect';
import { EditableLayerName } from '@/components/sidebar/EditableLayerName';
import { ColorSwatch } from '@/components/sidebar/ColorSwatch';

interface LayerSelectionDialogProps {
  open: boolean;
  /** Workspace-relative root path the candidates were discovered under. Used to display short relative paths. */
  rootPath: string;
  candidates: ReadonlyArray<ScsConfigCandidate>;
  onClose: () => void;
  onConfirm: (layers: OpenProjectLayer[]) => void;
  /** When provided, an "Add Layer" footer button appears that re-opens the FolderBrowser. */
  onAddAnother?: () => void;
  /**
   * Seed the row state on first mount. When omitted, state is derived from
   * `candidates`. Pass this from a parent that owns row state to preserve
   * user edits across Add-another-layer round-trips.
   */
  initialRows?: LayerRowState[];
  /**
   * Called whenever the internal row state changes. Use this to sync edits
   * back up to a parent that owns the row state.
   */
  onRowsChange?: (rows: LayerRowState[]) => void;
  /** Project name shown in the editable input above the layers list. */
  projectName?: string;
  /** Called whenever the project name input changes. */
  onProjectNameChange?: (name: string) => void;
  isPending?: boolean;
  serverError?: string | null;
}

export interface LayerRowState {
  candidate: ScsConfigCandidate;
  checked: boolean;
  color: string;
  /** Human-readable layer name derived from the parent folder of the sitecore.json. */
  name: string;
}

function relativeTo(rootPath: string, sitecoreJsonPath: string): string {
  const normalizedRoot = rootPath.endsWith('/') ? rootPath : rootPath + '/';
  if (sitecoreJsonPath.startsWith(normalizedRoot)) {
    return sitecoreJsonPath.slice(normalizedRoot.length);
  }
  return sitecoreJsonPath;
}

export function LayerSelectionDialog({
  open,
  rootPath,
  candidates,
  onClose,
  onConfirm,
  onAddAnother,
  initialRows,
  onRowsChange,
  projectName,
  onProjectNameChange,
  isPending = false,
  serverError = null,
}: LayerSelectionDialogProps) {
  const overlaps = useMemo(() => detectOverlaps(candidates), [candidates]);
  const [rows, setRows] = useState<LayerRowState[]>(() => {
    if (initialRows && initialRows.length > 0) return initialRows;
    return candidates.map((c, i) => ({
      candidate: c,
      checked: true,
      color: assignLayerColor(i),
      name: deriveName(c.sitecoreJsonPath),
    }));
  });

  const updateRows = (updater: (prev: LayerRowState[]) => LayerRowState[]) => {
    setRows((prev) => {
      const next = updater(prev);
      onRowsChange?.(next);
      return next;
    });
  };

  const toggle = (idx: number) => {
    updateRows((prev) => {
      const next = prev.slice();
      next[idx] = { ...next[idx], checked: !next[idx].checked };
      return next;
    });
  };

  const move = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= rows.length) return;
    updateRows((prev) => {
      const next = prev.slice();
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  const checkedCount = rows.filter((r) => r.checked).length;
  const canSubmit = checkedCount > 0 && !isPending;

  const handleConfirm = () => {
    if (!canSubmit) return;
    const payload: OpenProjectLayer[] = rows
      .filter((r) => r.checked)
      .map((r) => ({
        sitecoreJsonPath: r.candidate.sitecoreJsonPath,
        name: r.name,
        color: r.color,
      }));
    onConfirm(payload);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Select Content Layers</DialogTitle>
        </DialogHeader>
        {onProjectNameChange !== undefined && (
          <div className="flex flex-col gap-1">
            <label htmlFor="project-name-input" className="text-xs font-medium">
              Project name
            </label>
            <input
              id="project-name-input"
              type="text"
              value={projectName ?? ''}
              onChange={(e) => onProjectNameChange(e.target.value)}
              className="rounded border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="project"
            />
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Discovered {candidates.length} sitecore.json file
          {candidates.length === 1 ? '' : 's'} under{' '}
          <span className="font-mono">{rootPath}</span>. Reorder with the up/down
          arrows; the top layer has the weakest push-ops precedence.
        </p>
        <div className="max-h-[24rem] overflow-y-auto border rounded">
          <ul className="divide-y">
            {rows.map((row, idx) => {
              const overlapsWith = overlaps.get(row.candidate.sitecoreJsonPath);
              return (
                <li
                  key={row.candidate.sitecoreJsonPath}
                  className="flex items-start gap-3 p-3 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={row.checked}
                    onChange={() => toggle(idx)}
                    aria-label={`Include layer ${row.name}`}
                    className="mt-1"
                  />
                  <ColorSwatch
                    value={row.color}
                    onChange={(c) => updateRows((prev) => {
                      const next = prev.slice();
                      next[idx] = { ...next[idx], color: c };
                      return next;
                    })}
                    ariaLabel={`Layer color for ${row.name}`}
                    className="mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <EditableLayerName
                      value={row.name}
                      onChange={(n) => updateRows((prev) => {
                        const next = prev.slice();
                        next[idx] = { ...next[idx], name: n };
                        return next;
                      })}
                    />
                    <div className="font-mono text-xs truncate text-muted-foreground">
                      {relativeTo(rootPath, row.candidate.sitecoreJsonPath)}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {row.candidate.moduleCount} module
                      {row.candidate.moduleCount === 1 ? '' : 's'}
                      {row.candidate.pushOpsSummary && (
                        <>
                          {' '}
                          &middot; <span>{row.candidate.pushOpsSummary}</span>
                        </>
                      )}
                    </div>
                    {overlapsWith && (
                      <div className="mt-1 flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                        <Icon path={mdiAlert} className="size-3" />
                        Path overlaps another candidate (
                        {overlapsWith.map((p) => relativeTo(rootPath, p)).join(', ')}
                        )
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-0.5 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={idx === 0}
                      onClick={() => move(idx, -1)}
                      aria-label="Move layer up"
                    >
                      <Icon path={mdiArrowUp} className="size-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={idx === rows.length - 1}
                      onClick={() => move(idx, 1)}
                      aria-label="Move layer down"
                    >
                      <Icon path={mdiArrowDown} className="size-3" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
        {serverError && (
          <p className="text-xs text-destructive">{serverError}</p>
        )}
        <DialogFooter>
          {onAddAnother && (
            <Button
              variant="outline"
              size="sm"
              onClick={onAddAnother}
              disabled={isPending}
            >
              Add Layer
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleConfirm} disabled={!canSubmit}>
            {isPending && <Icon path={mdiLoading} className="size-3 mr-1 animate-spin" />}
            {isPending ? 'Opening...' : 'Open project'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
