// src/web/components/workspace/WorkspaceShell.tsx
import { useSyncExternalStore } from 'react';
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';
import { workspaceStore } from '@/state/workspaceStore';
import { Pane } from './Pane';
import type { WorkspaceProps } from './Workspace';
import type { TabstripItem } from './Tabstrip';

export type WorkspaceShellProps = WorkspaceProps;

interface PaneSnapshot {
  tabs: TabstripItem[];
  activeTabId: string;
}

interface ShellSnapshot {
  pane0: PaneSnapshot;
  pane1: PaneSnapshot | null;
  focusedPaneIndex: 0 | 1;
}

function buildPaneSnapshot(paneIndex: 0 | 1): PaneSnapshot | null {
  const s = workspaceStore.getState();
  const pane = s.panes[paneIndex];
  if (!pane) return null;
  const tabs: TabstripItem[] = pane.tabIds.map((id) => ({
    tabId: id,
    selectedItemId: s.tabs[id]?.selectedItemId ?? null,
    isActive: id === pane.activeTabId,
  }));
  return { tabs, activeTabId: pane.activeTabId };
}

function selectShellSnapshot(): ShellSnapshot {
  const s = workspaceStore.getState();
  return {
    pane0: buildPaneSnapshot(0)!,
    pane1: buildPaneSnapshot(1),
    focusedPaneIndex: s.focusedPaneIndex,
  };
}

// Cache the last computed snapshot so useSyncExternalStore's Object.is bail-out
// holds when nothing relevant changed. Single-instance assumption: WorkspaceShell
// is mounted at most once; if a future iteration mounts multiple, move the cache
// to useRef per instance.
let lastSnapshot: ShellSnapshot | null = null;

function paneSnapshotEqual(a: PaneSnapshot | null, b: PaneSnapshot | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.activeTabId !== b.activeTabId) return false;
  if (a.tabs.length !== b.tabs.length) return false;
  return a.tabs.every((t, i) => {
    const o = b.tabs[i];
    return t.tabId === o.tabId && t.selectedItemId === o.selectedItemId && t.isActive === o.isActive;
  });
}

function cachedSelectShellSnapshot(): ShellSnapshot {
  const next = selectShellSnapshot();
  if (
    lastSnapshot
    && lastSnapshot.focusedPaneIndex === next.focusedPaneIndex
    && paneSnapshotEqual(lastSnapshot.pane0, next.pane0)
    && paneSnapshotEqual(lastSnapshot.pane1, next.pane1)
  ) {
    return lastSnapshot;
  }
  lastSnapshot = next;
  return next;
}

export function WorkspaceShell(props: WorkspaceShellProps) {
  const snapshot = useSyncExternalStore(
    workspaceStore.subscribe,
    cachedSelectShellSnapshot,
    cachedSelectShellSnapshot,
  );

  if (snapshot.pane1 === null) {
    return (
      <PanelGroup direction="horizontal" className="flex-1">
        <Panel className="overflow-hidden">
          <Pane
            paneIndex={0}
            tabs={snapshot.pane0.tabs}
            activeTabId={snapshot.pane0.activeTabId}
            {...props}
          />
        </Panel>
      </PanelGroup>
    );
  }

  return (
    <PanelGroup direction="horizontal" className="flex-1">
      <Panel defaultSize={50} className="overflow-hidden">
        <Pane
          paneIndex={0}
          tabs={snapshot.pane0.tabs}
          activeTabId={snapshot.pane0.activeTabId}
          {...props}
        />
      </Panel>
      <PanelResizeHandle className="w-px bg-border hover:bg-primary/50 transition-colors" />
      <Panel defaultSize={50} className="overflow-hidden">
        <Pane
          paneIndex={1}
          tabs={snapshot.pane1.tabs}
          activeTabId={snapshot.pane1.activeTabId}
          {...props}
        />
      </Panel>
    </PanelGroup>
  );
}
