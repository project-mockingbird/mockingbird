// src/web/state/useBeforeUnloadDirtyGuard.ts
import { useEffect } from 'react';
import { workspaceStore } from './workspaceStore';

function anyTabDirty(): boolean {
  const s = workspaceStore.getState();
  for (const id of Object.keys(s.tabs)) {
    if (Object.keys(s.tabs[id].editedFields).length > 0) return true;
  }
  return false;
}

export function useBeforeUnloadDirtyGuard(): void {
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!anyTabDirty()) return;
      e.preventDefault();
      // Most browsers ignore the string but require returnValue to be set.
      e.returnValue = 'You have unsaved changes.';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);
}
