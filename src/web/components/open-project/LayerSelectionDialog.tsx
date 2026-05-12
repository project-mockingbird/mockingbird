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
import { LAYER_COLOR_PALETTE, assignLayerColor } from './layer-colors';
import { detectOverlaps } from './duplicate-detect';

interface LayerSelectionDialogProps {
  open: boolean;
  /** Workspace-relative root path the candidates were discovered under. Used to display short relative paths. */
  rootPath: string;
  candidates: ReadonlyArray<ScsConfigCandidate>;
  onClose: () => void;
  onConfirm: (layers: OpenProjectLayer[]) => void;
  /** When provided, an "Add another layer" footer button appears that re-opens the FolderBrowser. */
  onAddAnother?: () => void;
  isPending?: boolean;
  serverError?: string | null;
}

interface LayerRowState {
  candidate: ScsConfigCandidate;
  checked: boolean;
  color: string;
  /** Human-readable layer name derived from the parent folder of the sitecore.json. */
  name: string;
}

function deriveName(sitecoreJsonPath: string): string {
  const trimmed = sitecoreJsonPath.replace(/\/[^/]+$/, '');
  const slash = trimmed.lastIndexOf('/');
  if (slash < 0) return 'layer';
  const parent = trimmed.slice(slash + 1);
  return parent.length > 0 ? parent : 'layer';
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
  isPending = false,
  serverError = null,
}: LayerSelectionDialogProps) {
  const overlaps = useMemo(() => detectOverlaps(candidates), [candidates]);
  const [rows, setRows] = useState<LayerRowState[]>(() =>
    candidates.map((c, i) => ({
      candidate: c,
      checked: true,
      color: assignLayerColor(i),
      name: deriveName(c.sitecoreJsonPath),
    })),
  );

  const toggle = (idx: number) => {
    setRows((prev) => {
      const next = prev.slice();
      next[idx] = { ...next[idx], checked: !next[idx].checked };
      return next;
    });
  };

  const move = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= rows.length) return;
    setRows((prev) => {
      const next = prev.slice();
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  const cycleColor = (idx: number) => {
    setRows((prev) => {
      const next = prev.slice();
      const currentIdx = LAYER_COLOR_PALETTE.indexOf(
        next[idx].color as (typeof LAYER_COLOR_PALETTE)[number],
      );
      const nextIdx = (currentIdx + 1) % LAYER_COLOR_PALETTE.length;
      next[idx] = { ...next[idx], color: LAYER_COLOR_PALETTE[nextIdx] };
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
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>Select layers</DialogTitle>
        </DialogHeader>
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
                  <button
                    type="button"
                    onClick={() => cycleColor(idx)}
                    className="mt-0.5 size-4 rounded border shrink-0"
                    style={{ backgroundColor: row.color }}
                    aria-label={`Layer color for ${row.name}`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-xs truncate">
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
          <Button variant="outline" size="sm" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          {onAddAnother && (
            <Button
              variant="outline"
              size="sm"
              onClick={onAddAnother}
              disabled={isPending}
            >
              Add another layer
            </Button>
          )}
          <Button size="sm" onClick={handleConfirm} disabled={!canSubmit}>
            {isPending && <Icon path={mdiLoading} className="size-3 mr-1 animate-spin" />}
            {isPending ? 'Opening...' : 'Open project'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
