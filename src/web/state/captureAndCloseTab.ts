// src/web/state/captureAndCloseTab.ts
import { workspaceStore, findPaneIndex } from './workspaceStore';
import { closedTabsStore } from './closedTabsStore';

/**
 * Snapshot the tab and its pane into closedTabsStore (so Ctrl+Shift+T can
 * reopen it) and then close the tab. Used by every TabItem close path,
 * keyboard Ctrl+W, and useConfirmCloseTab. Pushes nothing if the tab id is
 * unknown or the tab isn't in a tracked pane.
 */
export function captureAndCloseTab(tabId: string): void {
  const s = workspaceStore.getState();
  const tab = s.tabs[tabId];
  if (!tab) return;
  const idx = findPaneIndex(s.panes, tabId);
  if (idx === 0 || idx === 1) {
    closedTabsStore.push({ tab, paneIndex: idx });
  }
  workspaceStore.closeTab(tabId);
}
