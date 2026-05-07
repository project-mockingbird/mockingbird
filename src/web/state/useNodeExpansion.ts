// src/web/state/useNodeExpansion.ts
import { useCallback, useSyncExternalStore } from 'react';
import { useTabId } from './tabContext';
import { workspaceStore } from './workspaceStore';

export interface UseNodeExpansionResult {
  isExpanded: boolean;
  setExpanded: (next: boolean) => void;
}

export function useNodeExpansion(nodeId: string, autoExpand: boolean): UseNodeExpansionResult {
  const tabId = useTabId();

  const getSnapshot = useCallback(() => {
    const map = workspaceStore.getState().tabs[tabId]?.expandedNodes;
    if (!map) return autoExpand;
    const explicit = map.get(nodeId);
    return explicit === undefined ? autoExpand : explicit;
  }, [tabId, nodeId, autoExpand]);

  const isExpanded = useSyncExternalStore(
    workspaceStore.subscribe,
    getSnapshot,
    getSnapshot,
  );

  const setExpanded = useCallback((next: boolean) => {
    const current = workspaceStore.getState().tabs[tabId]?.expandedNodes;
    if (!current) return;
    const updated = new Map(current);
    updated.set(nodeId, next);
    workspaceStore.patchTab(tabId, { expandedNodes: updated });
  }, [tabId, nodeId]);

  return { isExpanded, setExpanded };
}
