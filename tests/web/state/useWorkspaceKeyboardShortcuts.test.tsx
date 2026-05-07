// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWorkspaceKeyboardShortcuts } from '@/state/useWorkspaceKeyboardShortcuts';
import { workspaceStore, DEFAULT_TAB_ID } from '@/state/workspaceStore';
import { closedTabsStore } from '@/state/closedTabsStore';

function ctrl(key: string, opts: KeyboardEventInit = {}) {
  return new KeyboardEvent('keydown', { key, ctrlKey: true, ...opts });
}

describe('useWorkspaceKeyboardShortcuts', () => {
  beforeEach(() => {
    const s = workspaceStore.getState();
    if (s.panes.length === 2) act(() => workspaceStore.collapseSplit());
    for (const id of Object.keys(workspaceStore.getState().tabs)) {
      if (id !== DEFAULT_TAB_ID) act(() => workspaceStore.closeTab(id));
    }
    while (closedTabsStore.pop()) { /* drain */ }
  });

  it('Ctrl+T adds a tab in the focused pane', () => {
    renderHook(() => useWorkspaceKeyboardShortcuts());
    const before = workspaceStore.getState().panes[0].tabIds.length;
    act(() => { window.dispatchEvent(ctrl('t')); });
    expect(workspaceStore.getState().panes[0].tabIds.length).toBe(before + 1);
  });

  it('Ctrl+W closes the focused-active tab', () => {
    renderHook(() => useWorkspaceKeyboardShortcuts());
    const t = workspaceStore.addTab(0, { selectedItemId: 'A' });
    act(() => { window.dispatchEvent(ctrl('w')); });
    expect(workspaceStore.getState().tabs[t]).toBeUndefined();
  });

  it('Ctrl+Tab cycles to next tab', () => {
    renderHook(() => useWorkspaceKeyboardShortcuts());
    const tA = workspaceStore.addTab(0, { selectedItemId: 'A' });
    const tB = workspaceStore.addTab(0, { selectedItemId: 'B' });
    // active is tB after focus:true addTab
    act(() => { window.dispatchEvent(ctrl('Tab')); });
    expect(workspaceStore.getState().panes[0].activeTabId).toBe(DEFAULT_TAB_ID); // wraps
  });

  it('Ctrl+Shift+T reopens last closed', () => {
    renderHook(() => useWorkspaceKeyboardShortcuts());
    const t = workspaceStore.addTab(0, { selectedItemId: 'A' });
    // Close via captureAndClose path: simulate by pushing snapshot and closing
    const snap = workspaceStore.getState().tabs[t];
    closedTabsStore.push({ tab: snap, paneIndex: 0 });
    workspaceStore.closeTab(t);
    act(() => { window.dispatchEvent(ctrl('T', { shiftKey: true })); });
    const s = workspaceStore.getState();
    const reopenedTabs = Object.values(s.tabs).filter((tab) => tab.selectedItemId === 'A');
    expect(reopenedTabs.length).toBe(1);
  });

  it('does not fire when keydown originates from an input', () => {
    renderHook(() => useWorkspaceKeyboardShortcuts());
    const before = workspaceStore.getState().panes[0].tabIds.length;
    const input = document.createElement('input');
    document.body.appendChild(input);
    const ev = ctrl('t');
    Object.defineProperty(ev, 'target', { value: input });
    act(() => { window.dispatchEvent(ev); });
    expect(workspaceStore.getState().panes[0].tabIds.length).toBe(before);
    document.body.removeChild(input);
  });
});
