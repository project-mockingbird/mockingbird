import { useSyncExternalStore } from 'react';
import { mdiClose } from '@mdi/js';
import { Icon } from '@/lib/icon';
import { workspaceStore } from '@/state/workspaceStore';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { TabLabel } from './TabLabel';
import { ConfirmCloseDialog } from './ConfirmCloseDialog';
import { useConfirmCloseTab } from './useConfirmCloseTab';

export interface TabItemProps {
  tabId: string;
  paneIndex: 0 | 1;
  isActive: boolean;
  selectedItemId: string | null;
  siblingCount: number;
  tabIndex?: 0 | -1;
}

function getPanesLength(): 1 | 2 {
  return workspaceStore.getState().panes.length as 1 | 2;
}

export function TabItem({ tabId, paneIndex, isActive, selectedItemId, siblingCount, tabIndex }: TabItemProps) {
  const panesLength = useSyncExternalStore(workspaceStore.subscribe, getPanesLength, getPanesLength);
  const otherPaneIndex: 0 | 1 = paneIndex === 0 ? 1 : 0;
  const { confirmTabId, confirmTabName, requestClose, onConfirm, onCancel } = useConfirmCloseTab();

  const handleClick = () => workspaceStore.focusTab(tabId);

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    requestClose(tabId, null);
  };

  const handleMoveLeft = () => {
    const pane = workspaceStore.getState().panes[paneIndex];
    if (!pane) return;
    const idx = pane.tabIds.indexOf(tabId);
    if (idx > 0) workspaceStore.reorderTab(tabId, idx - 1);
  };

  const handleMoveRight = () => {
    const pane = workspaceStore.getState().panes[paneIndex];
    if (!pane) return;
    const idx = pane.tabIds.indexOf(tabId);
    if (idx < pane.tabIds.length - 1) workspaceStore.reorderTab(tabId, idx + 1);
  };

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            role="tab"
            tabIndex={tabIndex ?? (isActive ? 0 : -1)}
            aria-selected={isActive}
            onClick={handleClick}
            className={[
              'flex items-center gap-2 cursor-pointer truncate px-4 py-2 max-w-[240px] border-r border-border',
              isActive ? 'bg-background shadow-[inset_0_-2px_0_var(--primary,#3b82f6)]' : 'opacity-70 hover:opacity-100',
            ].join(' ')}
          >
            <span className="truncate"><TabLabel selectedItemId={selectedItemId} /></span>
            {(siblingCount > 1 || panesLength === 2) && (
              <button
                type="button"
                aria-label="Close tab"
                onClick={handleClose}
                className="ml-1 rounded-sm p-1 hover:bg-muted shrink-0"
              >
                <Icon path={mdiClose} className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onSelect={() => requestClose(tabId, null)}>Close</ContextMenuItem>
          <ContextMenuSeparator />
          {panesLength === 1 && (
            <ContextMenuItem onSelect={() => workspaceStore.splitRight(tabId)}>Split right</ContextMenuItem>
          )}
          {panesLength === 2 && (
            <ContextMenuItem onSelect={() => workspaceStore.moveTabToPane(tabId, otherPaneIndex)}>Move to other pane</ContextMenuItem>
          )}
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={handleMoveLeft}>Move Tab Left</ContextMenuItem>
          <ContextMenuItem onSelect={handleMoveRight}>Move Tab Right</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      <ConfirmCloseDialog
        confirmTabId={confirmTabId}
        confirmTabName={confirmTabName}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    </>
  );
}
