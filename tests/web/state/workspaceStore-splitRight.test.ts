import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createWorkspaceStore, DEFAULT_TAB_ID } from '@/state/workspaceStore';

describe('workspaceStore.splitRight', () => {
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

  it('moves the tab into a new pane[1] and focuses it', () => {
    const store = createWorkspaceStore();
    const t2 = store.addTab(0, { selectedItemId: 'item-A' });
    store.splitRight(t2);
    const s = store.getState();
    expect(s.panes.length).toBe(2);
    expect(s.panes[0].tabIds).toEqual([DEFAULT_TAB_ID]);
    expect(s.panes[0].activeTabId).toBe(DEFAULT_TAB_ID);
    expect(s.panes[1].tabIds).toEqual([t2]);
    expect(s.panes[1].activeTabId).toBe(t2);
    expect(s.focusedPaneIndex).toBe(1);
  });

  it('replaces source pane with fresh empty default tab when last tab splits right', () => {
    const store = createWorkspaceStore();
    store.splitRight(DEFAULT_TAB_ID);
    const s = store.getState();
    expect(s.panes.length).toBe(2);
    expect(s.panes[0].tabIds.length).toBe(1);
    expect(s.panes[0].tabIds[0]).not.toBe(DEFAULT_TAB_ID);
    const newSourceTab = s.tabs[s.panes[0].activeTabId];
    expect(newSourceTab.selectedItemId).toBe(null);
    expect(s.panes[1].tabIds).toEqual([DEFAULT_TAB_ID]);
    expect(s.focusedPaneIndex).toBe(1);
  });

  it('is a no-op when already 2-pane', () => {
    const store = createWorkspaceStore();
    const t2 = store.addTab(0, { selectedItemId: 'item-A' });
    store.splitRight(t2);
    const before = JSON.stringify(store.getState().panes);
    store.splitRight(DEFAULT_TAB_ID);
    expect(JSON.stringify(store.getState().panes)).toBe(before);
  });

  it('is a no-op for unknown tab id', () => {
    const store = createWorkspaceStore();
    const before = JSON.stringify(store.getState());
    store.splitRight('does-not-exist');
    expect(JSON.stringify(store.getState())).toBe(before);
  });

  it('picks right-neighbor active when active tab splits and others remain', () => {
    const store = createWorkspaceStore();
    const t2 = store.addTab(0, { selectedItemId: 'A' });
    const t3 = store.addTab(0, { selectedItemId: 'B' });
    store.splitRight(t2);
    let s = store.getState();
    expect(s.panes[0].tabIds).toEqual([DEFAULT_TAB_ID, t3]);
    expect(s.panes[0].activeTabId).toBe(t3);
    // Clear persisted state so store2 starts fresh; the verbatim spec test
    // creates a second store in the same test, which would otherwise rehydrate
    // the prior store's panes from the stubbed localStorage closure.
    localStorage.clear();
    const store2 = createWorkspaceStore();
    const u2 = store2.addTab(0, { selectedItemId: 'A' });
    const u3 = store2.addTab(0, { selectedItemId: 'B' });
    store2.splitRight(u3);
    s = store2.getState();
    expect(s.panes[0].tabIds).toEqual([DEFAULT_TAB_ID, u2]);
    expect(s.panes[0].activeTabId).toBe(u2);
  });
});
