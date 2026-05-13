// src/web/state/useBeforeUnloadDirtyGuard.ts
import { useEffect } from 'react';
import { anyTabDirty } from './dirtyTabs';

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
