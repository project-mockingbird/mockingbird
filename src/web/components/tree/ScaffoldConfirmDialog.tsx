import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

export type CoverageGap = { path: string; label: string };

export interface ScaffoldConfirmDialogProps {
  open: boolean;
  /** "tenant" or "site" - drives the title copy. */
  kind: 'tenant' | 'site';
  /** Absolute file path the module config will be written to. */
  filePath: string;
  /** JSON contents of the proposed module config. */
  contents: object;
  /**
   * Paths the scaffold would create that have no covering serialization
   * include today. When non-empty, the proposal is REQUIRED for the
   * scaffold to proceed. When empty (e.g. a site under a tenant whose
   * include already covers it), the proposal is for per-X granularity.
   */
  coverageGaps: CoverageGap[];
  onAccept: () => void;
  onCancel: () => void;
  isPending?: boolean;
  serverError?: string | null;
}

export function ScaffoldConfirmDialog({
  open,
  kind,
  filePath,
  contents,
  coverageGaps,
  onAccept,
  onCancel,
  isPending = false,
  serverError = null,
}: ScaffoldConfirmDialogProps) {
  const required = coverageGaps.length > 0;
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !isPending) onCancel(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirm new {kind} module</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 mt-2 text-xs">
          <p>
            Mockingbird will create a new serialization module file{' '}
            {required
              ? 'so the scaffold target paths are covered by an include.'
              : 'so this ' + kind + ' has its own push/pull granularity.'}
          </p>
          <div>
            <div className="font-medium">File:</div>
            <code className="block bg-muted px-2 py-1 rounded mt-1 break-all">{filePath}</code>
          </div>
          {required && (
            <div>
              <div className="font-medium">
                Currently uncovered Sitecore paths ({coverageGaps.length}):
              </div>
              <ul className="mt-1 ml-3 list-disc">
                {coverageGaps.map(g => (
                  <li key={g.path}>
                    <span className="font-medium">{g.label}:</span>{' '}
                    <code className="text-muted-foreground">{g.path}</code>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <div className="font-medium">Contents:</div>
            <pre className="bg-muted p-2 rounded mt-1 max-h-64 overflow-auto text-[10px] leading-tight">
              {JSON.stringify(contents, null, 2)}
            </pre>
          </div>
          {serverError && <p className="text-destructive">{serverError}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onCancel} disabled={isPending}>Cancel</Button>
          <Button size="sm" onClick={onAccept} disabled={isPending}>
            {isPending && <Spinner className="size-3 mr-1" variant="primary" />}
            {isPending ? 'Creating...' : 'Accept and create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
