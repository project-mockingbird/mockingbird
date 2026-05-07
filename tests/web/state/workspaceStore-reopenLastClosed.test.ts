import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createWorkspaceStore, DEFAULT_TAB_ID } from '@/state/workspaceStore';
import { createClosedTabsStore } from '@/state/closedTabsStore';

describe('workspaceStore.reopenLastClosed', () => {
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

  it('restores last closed tab into recorded pane with same field state', () => {
    const ws = createWorkspaceStore();
    const cts = createClosedTabsStore();
    const t = ws.addTab(0, { selectedItemId: 'A' });
    const snapshot = ws.getState().tabs[t];
    cts.push({ tab: snapshot, paneIndex: 0 });
    ws.closeTab(t);
    const reopenedId = ws.reopenLastClosed(cts);
    expect(reopenedId).not.toBe('');
    const s = ws.getState();
    expect(s.tabs[reopenedId!].selectedItemId).toBe('A');
    expect(s.panes[0].tabIds).toContain(reopenedId);
    expect(s.panes[0].activeTabId).toBe(reopenedId);
  });

  it('returns empty string when stack is empty', () => {
    const ws = createWorkspaceStore();
    const cts = createClosedTabsStore();
    expect(ws.reopenLastClosed(cts)).toBe('');
  });

  it('reopens into pane 0 when original pane no longer exists', () => {
    const ws = createWorkspaceStore();
    const cts = createClosedTabsStore();
    const t = ws.addTab(0, { selectedItemId: 'A' });
    ws.splitRight(t);
    const snapshot = ws.getState().tabs[t];
    cts.push({ tab: snapshot, paneIndex: 1 });
    ws.closeTab(t); // collapses pane[1] into pane[0]
    expect(ws.getState().panes.length).toBe(1);
    const reopenedId = ws.reopenLastClosed(cts);
    expect(reopenedId).not.toBe('');
    const s = ws.getState();
    expect(s.panes[0].tabIds).toContain(reopenedId);
  });
});
