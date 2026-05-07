// src/web/state/useTabState.ts
import { useCallback, useSyncExternalStore } from 'react';
import { useTabId } from './tabContext';
import { workspaceStore, getDefaultTabState, type TabState } from './workspaceStore';

export interface UseTabStateResult {
  state: TabState;
  navigate: (patch: Partial<TabState>) => void;
}

export function useTabState(): UseTabStateResult {
  const tabId = useTabId();

  const subscribe = workspaceStore.subscribe;
  const getSnapshot = useCallback(
    () => workspaceStore.getState().tabs[tabId],
    [tabId],
  );
  const tabSlice = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const state: TabState = tabSlice ?? getDefaultTabState(tabId);

  const navigate = useCallback((patch: Partial<TabState>) => {
    workspaceStore.patchTab(tabId, patch);
  }, [tabId]);

  return { state, navigate };
}
