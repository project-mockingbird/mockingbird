// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWorkspaceUrlSync } from '@/state/useWorkspaceUrlSync';
import { workspaceStore, DEFAULT_TAB_ID } from '@/state/workspaceStore';

describe('useWorkspaceUrlSync popstate prefers focused-pane match', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/tree');
    const s = workspaceStore.getState();
    if (s.panes.length === 2) act(() => workspaceStore.collapseSplit());
    for (const id of Object.keys(workspaceStore.getState().tabs)) {
      if (id !== DEFAULT_TAB_ID) act(() => workspaceStore.closeTab(id));
    }
  });
  afterEach(() => {
    window.history.replaceState(null, '', '/tree');
  });

  it('focuses the matching tab in the currently focused pane when both panes have a match', () => {
    // Two tabs both pointing at item-X, one in each pane.
    const tA = workspaceStore.addTab(0, { selectedItemId: 'item-X' });
    act(() => workspaceStore.splitRight(tA));
    // pane[0] = [DEFAULT], pane[1] = [tA]; focused = 1
    // Add another tab in pane[1] also pointing at item-X
    const tB = workspaceStore.addTab(1, { selectedItemId: 'item-Y' });
    // Now patch tB to also point at item-X
    workspaceStore.patchTab(tB, { selectedItemId: 'item-X' });
    // Focus pane[0] explicitly so popstate's "focused pane" is 0 (and pane[0]'s active is DEFAULT, NOT a match)
    // We want the multi-match preference, so put a matching tab in pane[0]:
    workspaceStore.patchTab(DEFAULT_TAB_ID, { selectedItemId: 'item-X' });
    workspaceStore.focusTab(DEFAULT_TAB_ID);

    // Align URL to the focused tab so the mount-time bootstrap (#32) does not
    // clear selections - we are testing popstate, not bootstrap.
    window.history.replaceState(null, '', '/tree/item-X');
    renderHook(() => useWorkspaceUrlSync());

    // Simulate popstate to /tree/item-X
    window.history.pushState(null, '', '/tree/item-X');
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    const s = workspaceStore.getState();
    // Focused pane should still be 0 because pane[0] also has a matching tab.
    expect(s.focusedPaneIndex).toBe(0);
    expect(s.panes[0].activeTabId).toBe(DEFAULT_TAB_ID);
  });

  it('focuses the matching tab in pane[1] when pane[1] is focused, even though an earlier-inserted tab in pane[0] also matches', () => {
    // This case actually exposes the bug: the first tab in Object.values
    // insertion order is DEFAULT_TAB_ID (inserted at store init, lives in
    // pane[0]). With the old "first-match wins" logic, popstate would focus
    // pane[0]. The fix should keep focus in pane[1] because that's the
    // currently focused pane and it also has a matching tab.
    workspaceStore.patchTab(DEFAULT_TAB_ID, { selectedItemId: 'item-X' });
    const tA = workspaceStore.addTab(0, { selectedItemId: 'other' });
    act(() => workspaceStore.splitRight(tA));
    // pane[0] = [DEFAULT (item-X)], pane[1] = [tA (other)]; focused = 1
    workspaceStore.patchTab(tA, { selectedItemId: 'item-X' });
    // Confirm pane[1] is focused with tA active.
    expect(workspaceStore.getState().focusedPaneIndex).toBe(1);
    expect(workspaceStore.getState().panes[1].activeTabId).toBe(tA);

    // Align URL to the focused tab so the mount-time bootstrap (#32) does not
    // clear selections - we are testing popstate, not bootstrap.
    window.history.replaceState(null, '', '/tree/item-X');
    renderHook(() => useWorkspaceUrlSync());

    window.history.pushState(null, '', '/tree/item-X');
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    const s = workspaceStore.getState();
    // Focus must stay in pane[1] (the focused pane) because it has a match,
    // not bounce to pane[0] just because DEFAULT_TAB_ID was inserted first.
    expect(s.focusedPaneIndex).toBe(1);
    expect(s.panes[1].activeTabId).toBe(tA);
  });
});
