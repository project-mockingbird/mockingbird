import { useCallback, useState } from 'react';
import { workspaceStore } from '@/state/workspaceStore';
import { captureAndCloseTab } from '@/state/captureAndCloseTab';

export interface UseConfirmCloseTabResult {
  confirmTabId: string | null;
  confirmTabName: string | null;
  requestClose: (tabId: string, displayName: string | null) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

// Close-gate hook. Callers (TabItem in Task 12) invoke requestClose with the
// tab's id and a user-facing name. If the tab has no editedFields, it closes
// immediately. Otherwise the hook arms the dialog state, expecting the caller
// to render <ConfirmCloseDialog> bound to the returned values.
export function useConfirmCloseTab(): UseConfirmCloseTabResult {
  const [confirmTabId, setConfirmTabId] = useState<string | null>(null);
  const [confirmTabName, setConfirmTabName] = useState<string | null>(null);

  const requestClose = useCallback((tabId: string, displayName: string | null) => {
    const tab = workspaceStore.getState().tabs[tabId];
    if (!tab) return;
    const dirty = Object.keys(tab.editedFields).length > 0;
    if (!dirty) {
      captureAndCloseTab(tabId);
      return;
    }
    setConfirmTabId(tabId);
    setConfirmTabName(displayName);
  }, []);

  const onConfirm = useCallback(() => {
    if (confirmTabId) captureAndCloseTab(confirmTabId);
    setConfirmTabId(null);
    setConfirmTabName(null);
  }, [confirmTabId]);

  const onCancel = useCallback(() => {
    setConfirmTabId(null);
    setConfirmTabName(null);
  }, []);

  return { confirmTabId, confirmTabName, requestClose, onConfirm, onCancel };
}
