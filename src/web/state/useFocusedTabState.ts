// src/web/state/useFocusedTabState.ts
import { useCallback, useSyncExternalStore } from 'react';
import { workspaceStore, type TabState } from './workspaceStore';

export interface UseFocusedTabStateResult {
  state: TabState;
  navigate: (patch: Partial<TabState>) => void;
}

// Store invariants relied on here:
// 1. panes[focusedPaneIndex] always exists (focusedPaneIndex is 0|1 and panes has 1 or 2 entries).
// 2. pane.activeTabId is always a key in tabs (closeTab removes both atomically).
function getFocusedTabState(): TabState {
  const s = workspaceStore.getState();
  const pane = s.panes[s.focusedPaneIndex]!;
  return s.tabs[pane.activeTabId];
}

export function useFocusedTabState(): UseFocusedTabStateResult {
  const state = useSyncExternalStore(
    workspaceStore.subscribe,
    getFocusedTabState,
    getFocusedTabState,
  );

  const navigate = useCallback((patch: Partial<TabState>) => {
    const s = workspaceStore.getState();
    const pane = s.panes[s.focusedPaneIndex]!;
    workspaceStore.patchTab(pane.activeTabId, patch);
  }, []);

  return { state, navigate };
}
