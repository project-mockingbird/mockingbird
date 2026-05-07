import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  STORAGE_KEY,
  loadFromStorage,
  saveToStorage,
} from './workspacePersistence';
import { type WorkspaceState, DEFAULT_TAB_ID, getDefaultTabState } from './workspaceStore';

// Stub localStorage at module scope so the module under test sees it from init.
// This pattern mirrors tests/web/settings/store.test.ts which runs in node
// environment with a hand-rolled localStorage stub.
let mem: Record<string, string>;

beforeEach(() => {
  mem = {};
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem[k] ?? null,
    setItem: (k: string, v: string) => { mem[k] = v; },
    removeItem: (k: string) => { delete mem[k]; },
    clear: () => { mem = {}; },
  });
});

afterEach(() => {
  // Restore any vi.spyOn / vi.stubGlobal installed during the test so the next
  // beforeEach starts from a clean slate.
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function makeState(overrides: Partial<WorkspaceState> = {}): WorkspaceState {
  return {
    tabs: { [DEFAULT_TAB_ID]: getDefaultTabState(DEFAULT_TAB_ID) },
    panes: [{ tabIds: [DEFAULT_TAB_ID], activeTabId: DEFAULT_TAB_ID }],
    focusedPaneIndex: 0,
    ...overrides,
  };
}

describe('workspacePersistence', () => {
  it('round-trips an empty default state', () => {
    saveToStorage(makeState());
    const loaded = loadFromStorage();
    expect(loaded).not.toBeNull();
    expect(loaded!.panes[0].tabIds).toEqual([DEFAULT_TAB_ID]);
    expect(loaded!.focusedPaneIndex).toBe(0);
  });

  it('round-trips expandedNodes as Map', () => {
    const state = makeState();
    state.tabs[DEFAULT_TAB_ID].expandedNodes = new Map([['/sitecore/content', true], ['/sitecore/system', false]]);
    saveToStorage(state);
    const loaded = loadFromStorage();
    expect(loaded!.tabs[DEFAULT_TAB_ID].expandedNodes).toBeInstanceOf(Map);
    expect(loaded!.tabs[DEFAULT_TAB_ID].expandedNodes.get('/sitecore/content')).toBe(true);
    expect(loaded!.tabs[DEFAULT_TAB_ID].expandedNodes.get('/sitecore/system')).toBe(false);
  });

  it('returns null on missing storage', () => {
    expect(loadFromStorage()).toBeNull();
  });

  it('returns null on corrupt JSON', () => {
    mem[STORAGE_KEY] = '{not-json';
    expect(loadFromStorage()).toBeNull();
  });

  it('returns null on schema version mismatch', () => {
    mem[STORAGE_KEY] = JSON.stringify({ version: 999, tabs: {}, panes: [], focusedPaneIndex: 0 });
    expect(loadFromStorage()).toBeNull();
  });

  it('returns null when a pane has empty tabIds (tampered storage)', () => {
    mem[STORAGE_KEY] = JSON.stringify({
      version: 1,
      tabs: {},
      panes: [{ tabIds: [], activeTabId: 'orphan' }],
      focusedPaneIndex: 0,
    });
    expect(loadFromStorage()).toBeNull();
  });

  it('returns null when activeTabId is not in the pane tabIds', () => {
    mem[STORAGE_KEY] = JSON.stringify({
      version: 1,
      tabs: { 'tab-a': { id: 'tab-a', selectedItemId: null, database: 'master', language: 'en', detailTab: null, expandedNodes: [], editedFields: {} } },
      panes: [{ tabIds: ['tab-a'], activeTabId: 'orphan' }],
      focusedPaneIndex: 0,
    });
    expect(loadFromStorage()).toBeNull();
  });

  it('returns null when a pane references a tabId not present in tabs map', () => {
    mem[STORAGE_KEY] = JSON.stringify({
      version: 1,
      tabs: { 'tab-a': { id: 'tab-a', selectedItemId: null, database: 'master', language: 'en', detailTab: null, expandedNodes: [], editedFields: {} } },
      panes: [{ tabIds: ['tab-a', 'missing-tab'], activeTabId: 'tab-a' }],
      focusedPaneIndex: 0,
    });
    expect(loadFromStorage()).toBeNull();
  });

  it('save handles localStorage.setItem throwing (quota exceeded) without raising', () => {
    const setItem = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('quota exceeded', 'QuotaExceededError');
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => saveToStorage(makeState())).not.toThrow();
    expect(setItem).toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });

  it('persists multiple tabs and panes correctly', () => {
    const state = makeState();
    state.tabs['t-2'] = { ...getDefaultTabState('t-2'), database: 'web' };
    state.panes = [{ tabIds: [DEFAULT_TAB_ID, 't-2'], activeTabId: 't-2' }];
    saveToStorage(state);
    const loaded = loadFromStorage();
    expect(loaded!.panes[0].tabIds).toEqual([DEFAULT_TAB_ID, 't-2']);
    expect(loaded!.panes[0].activeTabId).toBe('t-2');
    expect(loaded!.tabs['t-2'].database).toBe('web');
  });
});
