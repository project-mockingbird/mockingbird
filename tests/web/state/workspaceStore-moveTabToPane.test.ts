import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createWorkspaceStore, DEFAULT_TAB_ID } from '@/state/workspaceStore';

describe('workspaceStore.moveTabToPane', () => {
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

  it('moves a tab from pane[0] to pane[1] and focuses it', () => {
    const store = createWorkspaceStore();
    const tA = store.addTab(0, { selectedItemId: 'A' });
    const tB = store.addTab(0, { selectedItemId: 'B' });
    store.splitRight(tB); // panes[0]=[DEFAULT, tA], panes[1]=[tB]; focused=1
    store.moveTabToPane(tA, 1);
    const s = store.getState();
    expect(s.panes[0].tabIds).toEqual([DEFAULT_TAB_ID]);
    expect(s.panes[1].tabIds).toEqual([tB, tA]);
    expect(s.panes[1].activeTabId).toBe(tA);
    expect(s.focusedPaneIndex).toBe(1);
  });

  it('moves a tab from pane[1] to pane[0] and focuses pane[0]', () => {
    const store = createWorkspaceStore();
    const tA = store.addTab(0, { selectedItemId: 'A' });
    store.splitRight(tA); // panes[0]=[DEFAULT], panes[1]=[tA] active=tA
    const tC = store.addTab(1, { selectedItemId: 'C' });
    // panes[1]=[tA, tC] active=tC focused=1
    store.moveTabToPane(tC, 0);
    const s = store.getState();
    expect(s.panes[0].tabIds).toEqual([DEFAULT_TAB_ID, tC]);
    expect(s.panes[0].activeTabId).toBe(tC);
    expect(s.panes[1].tabIds).toEqual([tA]);
    expect(s.focusedPaneIndex).toBe(0);
  });

  it('collapses to single pane when moving the last tab out of source pane', () => {
    const store = createWorkspaceStore();
    const tA = store.addTab(0, { selectedItemId: 'A' });
    store.splitRight(tA); // panes[0]=[DEFAULT], panes[1]=[tA]
    store.moveTabToPane(tA, 0);
    const s = store.getState();
    expect(s.panes.length).toBe(1);
    expect(s.panes[0].tabIds).toEqual([DEFAULT_TAB_ID, tA]);
    expect(s.panes[0].activeTabId).toBe(tA);
    expect(s.focusedPaneIndex).toBe(0);
  });

  it('is a no-op when single-pane and target is 1', () => {
    const store = createWorkspaceStore();
    const before = JSON.stringify(store.getState());
    store.moveTabToPane(DEFAULT_TAB_ID, 1);
    expect(JSON.stringify(store.getState())).toBe(before);
  });

  it('is a no-op when source and target are the same pane', () => {
    const store = createWorkspaceStore();
    const tA = store.addTab(0, { selectedItemId: 'A' });
    store.splitRight(tA);
    const before = JSON.stringify(store.getState());
    store.moveTabToPane(tA, 1); // tA is in pane 1 already
    expect(JSON.stringify(store.getState())).toBe(before);
  });

  it('is a no-op for unknown tab id', () => {
    const store = createWorkspaceStore();
    const before = JSON.stringify(store.getState());
    store.moveTabToPane('does-not-exist', 1);
    expect(JSON.stringify(store.getState())).toBe(before);
  });
});
