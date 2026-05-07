// src/web/state/useWorkspaceKeyboardShortcuts.ts
import { useEffect } from 'react';
import { workspaceStore } from './workspaceStore';
import { closedTabsStore } from './closedTabsStore';
import { captureAndCloseTab } from './captureAndCloseTab';

function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if ((target as HTMLElement).isContentEditable) return true;
  return false;
}

export function useWorkspaceKeyboardShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const key = e.key;

      // Ctrl+Shift+T - reopen last closed
      if (e.shiftKey && (key === 'T' || key === 't')) {
        e.preventDefault();
        workspaceStore.reopenLastClosed(closedTabsStore);
        return;
      }
      // Ctrl+T - new tab
      if (!e.shiftKey && (key === 'T' || key === 't')) {
        e.preventDefault();
        const s = workspaceStore.getState();
        workspaceStore.addTab(s.focusedPaneIndex);
        return;
      }
      // Ctrl+W - close focused-active tab
      if (key === 'W' || key === 'w') {
        e.preventDefault();
        const s = workspaceStore.getState();
        const pane = s.panes[s.focusedPaneIndex];
        if (pane) captureAndCloseTab(pane.activeTabId);
        return;
      }
      // Ctrl+Tab / Ctrl+Shift+Tab - cycle within focused pane
      if (key === 'Tab') {
        e.preventDefault();
        const s = workspaceStore.getState();
        const pane = s.panes[s.focusedPaneIndex];
        if (!pane || pane.tabIds.length <= 1) return;
        const idx = pane.tabIds.indexOf(pane.activeTabId);
        const len = pane.tabIds.length;
        const nextIdx = e.shiftKey ? (idx - 1 + len) % len : (idx + 1) % len;
        workspaceStore.focusTab(pane.tabIds[nextIdx]);
        return;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
