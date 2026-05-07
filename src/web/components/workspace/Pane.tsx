// src/web/components/workspace/Pane.tsx
import { TabContextProvider } from '@/state/tabContext';
import { Tabstrip, type TabstripItem } from './Tabstrip';
import { Workspace, type WorkspaceProps } from './Workspace';
import { workspaceStore } from '@/state/workspaceStore';

export interface PaneProps extends WorkspaceProps {
  paneIndex: 0 | 1;
  tabs: TabstripItem[];
  activeTabId: string;
}

export function Pane({ paneIndex, tabs, activeTabId, ...workspaceProps }: PaneProps) {
  const handleAdd = () => {
    workspaceStore.addTab(paneIndex);
  };
  // mousedown (not click) so focus moves before any nested click handlers
  // read focusedPaneIndex - e.g. addTab uses focused pane to decide where to
  // append. capture phase so the listener wins over any child stopPropagation.
  const handleMouseDownCapture = () => {
    if (workspaceStore.getState().focusedPaneIndex !== paneIndex) {
      workspaceStore.focusTab(activeTabId);
    }
  };
  return (
    <div
      className="flex flex-col h-full min-w-0"
      onMouseDownCapture={handleMouseDownCapture}
    >
      <Tabstrip tabs={tabs} paneIndex={paneIndex} onAdd={handleAdd} />
      <TabContextProvider tabId={activeTabId}>
        <Workspace {...workspaceProps} />
      </TabContextProvider>
    </div>
  );
}
