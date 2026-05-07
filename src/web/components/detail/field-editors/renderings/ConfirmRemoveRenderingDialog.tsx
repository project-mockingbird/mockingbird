// src/web/components/detail/field-editors/renderings/ConfirmRemoveRenderingDialog.tsx

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
import type { RenderingEntry } from './types';

interface Props {
  open: boolean;
  entry: RenderingEntry | null;
  descendants: RenderingEntry[];
  resolveComponentName: (renderingId: string) => string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmRemoveRenderingDialog({
  open, entry, descendants, resolveComponentName, onConfirm, onCancel,
}: Props) {
  if (!entry) return null;
  const componentName = resolveComponentName(entry.renderingId);
  const hasChildren = descendants.length > 0;

  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {componentName} from {entry.placeholder}?</AlertDialogTitle>
          <AlertDialogDescription>
            Remove this rendering and any nested renderings from the layout. The change is staged until you click Save.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {hasChildren && (
          <div className="space-y-2">
            <div className="max-h-[200px] overflow-auto rounded border bg-muted/30 p-2 text-xs">
              <ul className="space-y-1">
                {descendants.map(d => (
                  <li key={d.uid} className="flex items-baseline gap-2">
                    <span className="font-medium">{resolveComponentName(d.renderingId)}</span>
                    <span className="text-muted-foreground">{d.placeholder}</span>
                  </li>
                ))}
              </ul>
            </div>
            <p className="text-xs text-muted-foreground">
              {descendants.length} rendering{descendants.length === 1 ? '' : 's'} will also be removed.
            </p>
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Remove</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
