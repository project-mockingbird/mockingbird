import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getDefaultTabState, createWorkspaceStore, DEFAULT_TAB_ID } from './workspaceStore';
import { STORAGE_KEY } from './workspacePersistence';

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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('getDefaultTabState', () => {
  it('returns a tab with empty expansion and edits', () => {
    const tab = getDefaultTabState('test-id');
    expect(tab.id).toBe('test-id');
    expect(tab.selectedItemId).toBeNull();
    expect(tab.database).toBe('master');
    expect(tab.language).toBe('en');
    expect(tab.detailTab).toBeNull();
    expect(tab.expandedNodes).toBeInstanceOf(Map);
    expect(tab.expandedNodes.size).toBe(0);
    expect(tab.editedFields).toEqual({});
  });
});

describe('workspaceStore', () => {
  it('creates a store with one default tab', () => {
    const store = createWorkspaceStore();
    const state = store.getState();
    expect(Object.keys(state.tabs)).toEqual(['default']);
    expect(state.tabs.default.id).toBe('default');
  });

  it('patchTab merges partial state into the named tab', () => {
    const store = createWorkspaceStore();
    store.patchTab('default', { database: 'web', language: 'fr' });
    const tab = store.getState().tabs.default;
    expect(tab.database).toBe('web');
    expect(tab.language).toBe('fr');
    expect(tab.selectedItemId).toBeNull(); // untouched
  });

  it('patchTab notifies subscribers', () => {
    const store = createWorkspaceStore();
    let notifyCount = 0;
    const unsubscribe = store.subscribe(() => { notifyCount += 1; });
    store.patchTab('default', { database: 'web' });
    expect(notifyCount).toBe(1);
    unsubscribe();
    store.patchTab('default', { database: 'master' });
    expect(notifyCount).toBe(1); // no further notification after unsubscribe
  });

  it('patchTab is a no-op for unknown tab id', () => {
    const store = createWorkspaceStore();
    store.patchTab('does-not-exist', { database: 'web' });
    expect(store.getState().tabs.default.database).toBe('master');
  });

  it('patchTab on expandedNodes replaces the Map instance for change detection', () => {
    const store = createWorkspaceStore();
    const before = store.getState().tabs.default.expandedNodes;
    store.patchTab('default', { expandedNodes: new Map([['a', true], ['b', true]]) });
    const after = store.getState().tabs.default.expandedNodes;
    expect(after).not.toBe(before);
    expect(after.size).toBe(2);
    expect(after.get('a')).toBe(true);
  });
});

describe('createWorkspaceStore - panes shape', () => {
  it('starts with one pane containing the default tab and focused index 0', () => {
    const store = createWorkspaceStore();
    const state = store.getState();
    expect(state.panes).toHaveLength(1);
    expect(state.panes[0].tabIds).toEqual([DEFAULT_TAB_ID]);
    expect(state.panes[0].activeTabId).toBe(DEFAULT_TAB_ID);
    expect(state.focusedPaneIndex).toBe(0);
  });

  it('keys the default tab in tabs map by DEFAULT_TAB_ID with matching id field', () => {
    const store = createWorkspaceStore();
    const tab = store.getState().tabs[DEFAULT_TAB_ID];
    expect(tab).toBeDefined();
    expect(tab.id).toBe(DEFAULT_TAB_ID);
  });
});

describe('workspaceStore - addTab', () => {
  it('appends a tab to the pane and returns its id', () => {
    const store = createWorkspaceStore();
    const id = store.addTab(0);
    expect(typeof id).toBe('string');
    expect(id).not.toBe(DEFAULT_TAB_ID);
    expect(store.getState().panes[0].tabIds).toEqual([DEFAULT_TAB_ID, id]);
    expect(store.getState().tabs[id]).toBeDefined();
  });

  it('inherits database and language from the pane active tab when init does not override', () => {
    const store = createWorkspaceStore();
    store.patchTab(DEFAULT_TAB_ID, { database: 'web', language: 'fr' });
    const id = store.addTab(0);
    const tab = store.getState().tabs[id];
    expect(tab.database).toBe('web');
    expect(tab.language).toBe('fr');
  });

  it('inherits from the pane active tab, not the default tab', () => {
    const store = createWorkspaceStore();
    const b = store.addTab(0, { database: 'web', language: 'fr' }); // b is now active
    const c = store.addTab(0); // should inherit from b
    const tab = store.getState().tabs[c];
    expect(tab.database).toBe('web');
    expect(tab.language).toBe('fr');
  });

  it('init overrides inherited fields', () => {
    const store = createWorkspaceStore();
    store.patchTab(DEFAULT_TAB_ID, { database: 'web', language: 'fr' });
    const id = store.addTab(0, { selectedItemId: 'item-x', database: 'master' });
    const tab = store.getState().tabs[id];
    expect(tab.selectedItemId).toBe('item-x');
    expect(tab.database).toBe('master');
    expect(tab.language).toBe('fr'); // inherited
  });

  it('sets the new tab as activeTabId by default and focuses the pane', () => {
    const store = createWorkspaceStore();
    const id = store.addTab(0);
    expect(store.getState().panes[0].activeTabId).toBe(id);
    expect(store.getState().focusedPaneIndex).toBe(0);
  });

  it('opts.focus=false leaves activeTabId unchanged', () => {
    const store = createWorkspaceStore();
    const id = store.addTab(0, undefined, { focus: false });
    expect(store.getState().panes[0].activeTabId).toBe(DEFAULT_TAB_ID);
    expect(store.getState().panes[0].tabIds).toEqual([DEFAULT_TAB_ID, id]);
  });

  it('notifies subscribers exactly once per addTab call', () => {
    const store = createWorkspaceStore();
    let n = 0;
    store.subscribe(() => { n += 1; });
    store.addTab(0);
    expect(n).toBe(1);
  });

  it('is a no-op for an out-of-range pane index', () => {
    const store = createWorkspaceStore();
    const before = store.getState();
    const id = store.addTab(1); // Phase 3 only ever has 1 pane
    expect(id).toBe(''); // sentinel for "did nothing"
    expect(store.getState()).toBe(before); // referentially equal => no notify
  });
});

describe('workspaceStore - closeTab', () => {
  it('removes a non-active tab from the pane and the tabs map', () => {
    const store = createWorkspaceStore();
    const id = store.addTab(0, undefined, { focus: false });
    store.closeTab(id);
    expect(store.getState().panes[0].tabIds).toEqual([DEFAULT_TAB_ID]);
    expect(store.getState().tabs[id]).toBeUndefined();
    expect(store.getState().panes[0].activeTabId).toBe(DEFAULT_TAB_ID);
  });

  it('closing the only tab in a single-pane workspace replaces it with an empty default tab', () => {
    const store = createWorkspaceStore();
    store.closeTab(DEFAULT_TAB_ID);
    const state = store.getState();
    expect(state.panes[0].tabIds).toHaveLength(1);
    const newId = state.panes[0].tabIds[0];
    expect(newId).not.toBe(DEFAULT_TAB_ID);
    expect(state.panes[0].activeTabId).toBe(newId);
    expect(state.tabs[newId]).toBeDefined();
    expect(state.tabs[newId].selectedItemId).toBeNull();
    expect(state.tabs[DEFAULT_TAB_ID]).toBeUndefined();
  });

  it('is a no-op for an unknown tab id', () => {
    const store = createWorkspaceStore();
    let n = 0;
    store.subscribe(() => { n += 1; });
    store.closeTab('nonexistent');
    expect(n).toBe(0);
    expect(store.getState().panes[0].tabIds).toEqual([DEFAULT_TAB_ID]);
  });

  it('notifies exactly once per close', () => {
    const store = createWorkspaceStore();
    const id = store.addTab(0, undefined, { focus: false });
    let n = 0;
    store.subscribe(() => { n += 1; });
    store.closeTab(id);
    expect(n).toBe(1);
  });
});

describe('workspaceStore - focusTab', () => {
  it('sets activeTabId on the tab\'s pane and updates focusedPaneIndex', () => {
    const store = createWorkspaceStore();
    const id = store.addTab(0, undefined, { focus: false });
    expect(store.getState().panes[0].activeTabId).toBe(DEFAULT_TAB_ID);
    store.focusTab(id);
    expect(store.getState().panes[0].activeTabId).toBe(id);
    expect(store.getState().focusedPaneIndex).toBe(0);
  });

  it('is a no-op when the tab is already active in the focused pane', () => {
    const store = createWorkspaceStore();
    let n = 0;
    store.subscribe(() => { n += 1; });
    store.focusTab(DEFAULT_TAB_ID); // already active in focused pane
    expect(n).toBe(0);
  });

  it('is a no-op for an unknown tab id', () => {
    const store = createWorkspaceStore();
    let n = 0;
    store.subscribe(() => { n += 1; });
    store.focusTab('nonexistent');
    expect(n).toBe(0);
  });
});

describe('workspaceStore - reorderTab', () => {
  it('moves a tab forward within the pane', () => {
    const store = createWorkspaceStore();
    const a = store.addTab(0, undefined, { focus: false }); // [default, a]
    const b = store.addTab(0, undefined, { focus: false }); // [default, a, b]
    store.reorderTab(DEFAULT_TAB_ID, 2);
    expect(store.getState().panes[0].tabIds).toEqual([a, b, DEFAULT_TAB_ID]);
  });

  it('moves a tab backward within the pane', () => {
    const store = createWorkspaceStore();
    const a = store.addTab(0, undefined, { focus: false });
    const b = store.addTab(0, undefined, { focus: false });
    store.reorderTab(b, 0);
    expect(store.getState().panes[0].tabIds).toEqual([b, DEFAULT_TAB_ID, a]);
  });

  it('clamps newIndex to valid bounds', () => {
    const store = createWorkspaceStore();
    const a = store.addTab(0, undefined, { focus: false }); // [default, a]
    store.reorderTab(a, -1);
    expect(store.getState().panes[0].tabIds).toEqual([a, DEFAULT_TAB_ID]);
    store.reorderTab(a, 999);
    expect(store.getState().panes[0].tabIds).toEqual([DEFAULT_TAB_ID, a]);
  });

  it('is a no-op for an unknown tab id', () => {
    const store = createWorkspaceStore();
    let n = 0;
    store.subscribe(() => { n += 1; });
    store.reorderTab('nonexistent', 0);
    expect(n).toBe(0);
  });

  it('is a no-op when newIndex equals the current position', () => {
    const store = createWorkspaceStore();
    store.addTab(0); // adds a tab; default is at index 0
    let n = 0;
    store.subscribe(() => { n += 1; });
    store.reorderTab(DEFAULT_TAB_ID, 0); // already at 0
    expect(n).toBe(0);
  });

  it('does not change activeTabId on a genuine reorder', () => {
    const store = createWorkspaceStore();
    const a = store.addTab(0); // active = a; tabIds = [default, a]
    store.reorderTab(DEFAULT_TAB_ID, 1); // moves default past a; tabIds = [a, default]
    expect(store.getState().panes[0].activeTabId).toBe(a);
    expect(store.getState().panes[0].tabIds).toEqual([a, DEFAULT_TAB_ID]);
  });
});

// closeTab tests deferred from Task 3 - depend on focusTab for setup
describe('workspaceStore - closeTab focus follow-through', () => {
  it('when closing the active tab, focuses the previous sibling if no right neighbor', () => {
    const store = createWorkspaceStore();
    const a = store.addTab(0); // [default, a], active = a
    const b = store.addTab(0); // [default, a, b], active = b
    store.closeTab(b);          // close active b -> previous (a) wins (no right neighbor)
    expect(store.getState().panes[0].activeTabId).toBe(a);
    expect(store.getState().panes[0].tabIds).toEqual([DEFAULT_TAB_ID, a]);
    store.closeTab(a);
    expect(store.getState().panes[0].activeTabId).toBe(DEFAULT_TAB_ID);
  });

  it('when closing the active middle tab, the right neighbor becomes active', () => {
    const store = createWorkspaceStore();
    const a = store.addTab(0); // [default, a]
    const b = store.addTab(0); // [default, a, b]
    store.focusTab(a);          // active = a (middle)
    store.closeTab(a);
    expect(store.getState().panes[0].activeTabId).toBe(b);
    expect(store.getState().panes[0].tabIds).toEqual([DEFAULT_TAB_ID, b]);
  });
});

describe('workspaceStore - persistence wiring', () => {
  it('seeds initial state from localStorage when present', () => {
    // Pre-seed storage with a 1-pane state having one tab `tab-a`
    const seeded = {
      version: 1,
      tabs: {
        'tab-a': {
          id: 'tab-a',
          selectedItemId: 'item-x',
          database: 'web',
          language: 'fr',
          detailTab: null,
          expandedNodes: [['/sitecore/content', true]],
          editedFields: {},
        },
      },
      panes: [{ tabIds: ['tab-a'], activeTabId: 'tab-a' }],
      focusedPaneIndex: 0,
    };
    mem[STORAGE_KEY] = JSON.stringify(seeded);

    const store = createWorkspaceStore();
    const state = store.getState();
    expect(state.panes[0].tabIds).toEqual(['tab-a']);
    expect(state.tabs['tab-a'].database).toBe('web');
    expect(state.tabs['tab-a'].expandedNodes.get('/sitecore/content')).toBe(true);
  });

  it('falls back to default when storage is missing', () => {
    const store = createWorkspaceStore();
    expect(store.getState().panes[0].tabIds).toEqual([DEFAULT_TAB_ID]);
  });

  it('persists to localStorage after each notify-emitting action', () => {
    const store = createWorkspaceStore();
    store.addTab(0);
    const afterAdd = JSON.parse(mem[STORAGE_KEY]!);
    expect(afterAdd.panes[0].tabIds).toHaveLength(2);

    // A second action via a different mutation path also persists.
    store.patchTab(DEFAULT_TAB_ID, { database: 'web' });
    const afterPatch = JSON.parse(mem[STORAGE_KEY]!);
    expect(afterPatch.tabs[DEFAULT_TAB_ID].database).toBe('web');
  });
});
