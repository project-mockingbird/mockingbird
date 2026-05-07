import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createWorkspaceStore, DEFAULT_TAB_ID } from '@/state/workspaceStore';

describe('workspaceStore.collapseSplit + closeTab 2-pane semantics', () => {
  beforeEach(() => {
    const store: Record<string, string> = {};
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => { store[k] = v; },
      removeItem: (k: string) => { delete store[k]; },
      clear: () => { for (const k of Object.keys(store)) delete store[k]; },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('collapseSplit merges pane[1] tabs after pane[0] tabs and preserves focused active', () => {
    const store = createWorkspaceStore();
    const t2 = store.addTab(0, { selectedItemId: 'A' });
    store.splitRight(t2);
    // panes[0]=[DEFAULT_TAB_ID]/active=DEFAULT, panes[1]=[t2]/active=t2, focused=1
    store.collapseSplit();
    const s = store.getState();
    expect(s.panes.length).toBe(1);
    expect(s.panes[0].tabIds).toEqual([DEFAULT_TAB_ID, t2]);
    expect(s.panes[0].activeTabId).toBe(t2); // focused was 1, so its active wins
    expect(s.focusedPaneIndex).toBe(0);
  });

  it('collapseSplit is a no-op when single-pane', () => {
    const store = createWorkspaceStore();
    const before = JSON.stringify(store.getState());
    store.collapseSplit();
    expect(JSON.stringify(store.getState())).toBe(before);
  });

  it('closeTab on last tab in pane[1] collapses to single pane and keeps pane[0] tabs', () => {
    const store = createWorkspaceStore();
    const tA = store.addTab(0, { selectedItemId: 'A' });
    const tB = store.addTab(0, { selectedItemId: 'B' });
    // Split tB right; pane[0]=[DEFAULT_TAB_ID, tA] active=tA (right-neighbor of tB after split)
    store.splitRight(tB);
    // pane[1]=[tB] active=tB; focused=1
    store.closeTab(tB);
    const s = store.getState();
    expect(s.panes.length).toBe(1);
    expect(s.panes[0].tabIds).toEqual([DEFAULT_TAB_ID, tA]);
    expect(s.panes[0].activeTabId).toBe(tA);
    expect(s.focusedPaneIndex).toBe(0);
    expect(s.tabs[tB]).toBeUndefined();
  });

  it('closeTab on last tab in pane[0] collapses pane[1] into pane[0]-position', () => {
    const store = createWorkspaceStore();
    const tA = store.addTab(0, { selectedItemId: 'A' });
    // pane[0] = [DEFAULT_TAB_ID, tA]; split tA right -> pane[0]=[DEFAULT_TAB_ID], pane[1]=[tA]
    store.splitRight(tA);
    // Click pane[0] to focus it (simulate by calling focusTab on its active)
    store.focusTab(DEFAULT_TAB_ID);
    // Close DEFAULT_TAB_ID (last tab in pane[0])
    store.closeTab(DEFAULT_TAB_ID);
    const s = store.getState();
    expect(s.panes.length).toBe(1);
    expect(s.panes[0].tabIds).toEqual([tA]);
    expect(s.panes[0].activeTabId).toBe(tA);
    expect(s.focusedPaneIndex).toBe(0);
  });

  it('closeTab in 2-pane mode with multiple tabs in source pane does NOT collapse', () => {
    const store = createWorkspaceStore();
    const tA = store.addTab(0, { selectedItemId: 'A' });
    const tB = store.addTab(0, { selectedItemId: 'B' });
    store.splitRight(tB);
    // pane[0] = [DEFAULT_TAB_ID, tA] active=tA, pane[1] = [tB] active=tB
    store.closeTab(tA);
    const s = store.getState();
    expect(s.panes.length).toBe(2);
    expect(s.panes[0].tabIds).toEqual([DEFAULT_TAB_ID]);
    expect(s.panes[1].tabIds).toEqual([tB]);
  });
});
