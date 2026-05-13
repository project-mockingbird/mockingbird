import { useCallback, useRef, useState } from 'react';
import { anyTabDirty, dirtyTabCount } from '@/state/dirtyTabs';
import type { DiscardWorkspaceAction } from './ConfirmDiscardWorkspaceDialog';

export interface UseConfirmDiscardWorkspaceResult {
  /** The pending action kind, or null when the dialog is hidden. */
  pendingAction: DiscardWorkspaceAction | null;
  /** Dirty tab count snapshotted when the request was raised. */
  pendingDirtyCount: number;
  /**
   * Gate the destructive `proceed` callback. If any tab has unsaved edits,
   * arms the dialog and stashes the callback for onConfirm. Otherwise runs
   * the callback immediately.
   */
  request: (action: DiscardWorkspaceAction, proceed: () => void) => void;
  /** Run the stashed callback and close the dialog. */
  onConfirm: () => void;
  /** Drop the stashed callback and close the dialog. */
  onCancel: () => void;
}

// Workspace-level dirty gate. Mirrors useConfirmCloseTab's request/confirm/cancel
// shape but checks the WHOLE workspace (any tab dirty) and supports two action
// kinds (close vs switch) so callers can render different copy.
export function useConfirmDiscardWorkspace(): UseConfirmDiscardWorkspaceResult {
  const [pendingAction, setPendingAction] = useState<DiscardWorkspaceAction | null>(null);
  const [pendingDirtyCount, setPendingDirtyCount] = useState(0);
  const proceedRef = useRef<(() => void) | null>(null);

  const request = useCallback((action: DiscardWorkspaceAction, proceed: () => void) => {
    if (!anyTabDirty()) {
      proceed();
      return;
    }
    proceedRef.current = proceed;
    setPendingAction(action);
    setPendingDirtyCount(dirtyTabCount());
  }, []);

  const onConfirm = useCallback(() => {
    const proceed = proceedRef.current;
    proceedRef.current = null;
    setPendingAction(null);
    setPendingDirtyCount(0);
    if (proceed) proceed();
  }, []);

  const onCancel = useCallback(() => {
    proceedRef.current = null;
    setPendingAction(null);
    setPendingDirtyCount(0);
  }, []);

  return { pendingAction, pendingDirtyCount, request, onConfirm, onCancel };
}
