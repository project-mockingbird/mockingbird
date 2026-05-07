import type { TabName } from '@/lib/url-state';
import { loadFromStorage, saveToStorage } from './workspacePersistence';

export type TabId = string;

function makeTabId(): TabId {
  // crypto.randomUUID is available in modern browsers + jsdom 22+.
  // Fallback path for environments lacking it: timestamp+random suffix.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export type TabState = {
  id: TabId;
  selectedItemId: string | null;
  database: string;
  language: string;
  detailTab: TabName | null;
  // Map key = node id; value = explicit user choice (true = expanded, false = collapsed).
  // Absent means "use the node's autoExpand default."
  expandedNodes: Map<string, boolean>;
  editedFields: Record<string, string>;
};

export const DEFAULT_TAB_ID: TabId = 'default';

export function getDefaultTabState(id: TabId): TabState {
  return {
    id,
    selectedItemId: null,
    database: 'master',
    language: 'en',
    detailTab: null,
    expandedNodes: new Map(),
    editedFields: {},
  };
}

export type Pane = {
  tabIds: [TabId, ...TabId[]];
  activeTabId: TabId;
};

export type WorkspaceState = {
  tabs: Record<TabId, TabState>;
  panes: [Pane] | [Pane, Pane];
  focusedPaneIndex: 0 | 1;
};

export type WorkspaceStore = {
  getState: () => WorkspaceState;
  subscribe: (listener: () => void) => () => void;
  patchTab: (tabId: TabId, patch: Partial<TabState>) => void;
  /**
   * Appends a new tab to the given pane. Returns the new TabId, or '' if
   * paneIndex is out of range (no-op).
   */
  addTab: (paneIndex: 0 | 1, init?: Partial<TabState>, opts?: { focus?: boolean }) => TabId;
  /**
   * Removes a tab. If it was the only tab in a single-pane workspace,
   * replaces it with a fresh empty default tab. No-op for unknown tab ids.
   */
  closeTab: (tabId: TabId) => void;
  /**
   * Sets the given tab as the active tab in its pane, and sets focusedPaneIndex
   * to that pane. No-op when the tab is already active in the focused pane, or
   * when the tab id is unknown.
   */
  focusTab: (tabId: TabId) => void;
  /**
   * Moves the tab to a new position within its pane. newIndex is clamped to
   * [0, tabIds.length - 1]. No-op for unknown tab ids or when the position
   * doesn't change.
   */
  reorderTab: (tabId: TabId, newIndex: number) => void;
  /**
   * Splits the given tab into a new pane to the right. Pre: panes.length === 1.
   * Removes tabId from panes[0]; if that empties pane[0], replaces it with a
   * fresh default tab. Creates panes[1] = { tabIds: [tabId], activeTabId: tabId }.
   * Sets focusedPaneIndex = 1.
   * No-op when already 2-pane or when tabId is unknown.
   */
  splitRight: (tabId: TabId) => void;
  /**
   * Merges panes[1].tabIds onto panes[0].tabIds and collapses to single-pane.
   * The merged pane's activeTabId is the focused pane's active tab so focus
   * survives the collapse. focusedPaneIndex resets to 0. No-op when single-pane.
   */
  collapseSplit: () => void;
  /**
   * Moves a tab to the target pane and focuses it. Requires panes.length === 2.
   * If the source pane becomes empty, collapses to single-pane and the target
   * tab lands in panes[0]. No-op for unknown tabId, identical source/target,
   * or when single-pane and target is 1.
   */
  moveTabToPane: (tabId: TabId, targetPaneIndex: 0 | 1) => void;
  /**
   * Pops the most recent closed-tab record off the given store and re-creates
   * the tab in its original pane (or pane 0 if that pane no longer exists).
   * Returns the new tab id, or empty string when the stack was empty.
   * Takes the closedTabsStore as a dependency so tests can inject one.
   */
  reopenLastClosed: (cts: { pop: () => { tab: TabState; paneIndex: 0 | 1 } | null }) => TabId;
};

export function findPaneIndex(panes: WorkspaceState['panes'], tabId: TabId): 0 | 1 | -1 {
  return panes.findIndex((p) => p.tabIds.includes(tabId)) as 0 | 1 | -1;
}

export function createWorkspaceStore(): WorkspaceStore {
  let state: WorkspaceState = loadFromStorage() ?? {
    tabs: { [DEFAULT_TAB_ID]: getDefaultTabState(DEFAULT_TAB_ID) },
    panes: [{ tabIds: [DEFAULT_TAB_ID], activeTabId: DEFAULT_TAB_ID }],
    focusedPaneIndex: 0,
  };
  const listeners = new Set<() => void>();

  const notify = () => {
    // Persist before notifying so subscribers observe an already-saved snapshot.
    // Every action flows through notify(), so this is the single seam where
    // store mutations meet localStorage.
    saveToStorage(state);
    for (const listener of listeners) listener();
  };

  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    patchTab: (tabId, patch) => {
      const current = state.tabs[tabId];
      if (!current) return;
      const next: TabState = { ...current, ...patch };
      state = { ...state, tabs: { ...state.tabs, [tabId]: next } };
      notify();
    },
    addTab: (paneIndex, init, opts) => {
      const pane = state.panes[paneIndex];
      if (!pane) return ''; // out-of-range; no-op
      const focus = opts?.focus ?? true;
      const inheritFrom = state.tabs[pane.activeTabId];
      const id = makeTabId();
      const baseDefault = getDefaultTabState(id);
      const next: TabState = {
        ...baseDefault,
        database: inheritFrom?.database ?? baseDefault.database,
        language: inheritFrom?.language ?? baseDefault.language,
        ...init,
        id,
      };
      const nextPane: Pane = {
        // Safe: pane.tabIds is non-empty by invariant; appending id keeps it non-empty.
        tabIds: [...pane.tabIds, id] as [TabId, ...TabId[]],
        activeTabId: focus ? id : pane.activeTabId,
      };
      const nextPanes: WorkspaceState['panes'] = paneIndex === 0
        ? (state.panes.length === 2 ? [nextPane, state.panes[1]] : [nextPane])
        : [state.panes[0], nextPane];
      state = {
        ...state,
        tabs: { ...state.tabs, [id]: next },
        panes: nextPanes,
        focusedPaneIndex: focus ? paneIndex : state.focusedPaneIndex,
      };
      notify();
      return id;
    },
    closeTab: (tabId) => {
      if (!state.tabs[tabId]) return;
      // Find the pane this tab lives in
      const paneIndex = findPaneIndex(state.panes, tabId);
      if (paneIndex === -1) return;
      const pane = state.panes[paneIndex]!;
      const oldIndex = pane.tabIds.indexOf(tabId);
      const remainingTabIds = pane.tabIds.filter((id) => id !== tabId);
      const remainingTabs = { ...state.tabs };
      delete remainingTabs[tabId];

      // Single-pane last-tab: replace with fresh default. Phase 3 behavior, unchanged.
      if (state.panes.length === 1 && remainingTabIds.length === 0) {
        const newId = makeTabId();
        const fresh = getDefaultTabState(newId);
        state = {
          ...state,
          tabs: { ...remainingTabs, [newId]: fresh },
          panes: [{ tabIds: [newId], activeTabId: newId }],
          focusedPaneIndex: 0,
        };
        notify();
        return;
      }

      // 2-pane last-tab in pane: remove the empty pane; surviving pane is panes[0].
      if (state.panes.length === 2 && remainingTabIds.length === 0) {
        const survivor = state.panes[paneIndex === 0 ? 1 : 0];
        state = {
          ...state,
          tabs: remainingTabs,
          panes: [survivor],
          focusedPaneIndex: 0,
        };
        notify();
        return;
      }

      // Otherwise, remove the tab. If it was active, pick the next active:
      //   - the tab that slid into oldIndex (i.e. the right neighbor pre-removal)
      //   - failing that, the previous tab (oldIndex - 1)
      // The third `?? remainingTabIds[0]` arm is a type-safety fallback only -
      // unreachable at runtime since the empty-case branches above already
      // returned, but TypeScript with noUncheckedIndexedAccess sees both prior
      // indexed accesses as possibly-undefined.
      let nextActive = pane.activeTabId;
      if (pane.activeTabId === tabId) {
        nextActive = remainingTabIds[oldIndex] ?? remainingTabIds[oldIndex - 1] ?? remainingTabIds[0];
      }
      const nextPane: Pane = {
        // Safe: branches above handle the empty case; here remainingTabIds is non-empty by construction.
        tabIds: remainingTabIds as [TabId, ...TabId[]],
        activeTabId: nextActive,
      };
      const nextPanes: WorkspaceState['panes'] = paneIndex === 0
        ? (state.panes.length === 2 ? [nextPane, state.panes[1]] : [nextPane])
        : [state.panes[0], nextPane];
      state = {
        ...state,
        tabs: remainingTabs,
        panes: nextPanes,
      };
      notify();
    },
    focusTab: (tabId) => {
      if (!state.tabs[tabId]) return;
      const paneIndex = findPaneIndex(state.panes, tabId);
      if (paneIndex === -1) return;
      const pane = state.panes[paneIndex]!;
      if (pane.activeTabId === tabId && state.focusedPaneIndex === paneIndex) return;
      const nextPane: Pane = { ...pane, activeTabId: tabId };
      const nextPanes: WorkspaceState['panes'] = paneIndex === 0
        ? (state.panes.length === 2 ? [nextPane, state.panes[1]] : [nextPane])
        : [state.panes[0], nextPane];
      state = { ...state, panes: nextPanes, focusedPaneIndex: paneIndex };
      notify();
    },
    reorderTab: (tabId, newIndex) => {
      const paneIndex = findPaneIndex(state.panes, tabId);
      if (paneIndex === -1) return;
      const pane = state.panes[paneIndex]!;
      const oldIndex = pane.tabIds.indexOf(tabId);
      const clamped = Math.max(0, Math.min(newIndex, pane.tabIds.length - 1));
      if (clamped === oldIndex) return;
      const without = pane.tabIds.filter((id) => id !== tabId);
      const inserted = [...without.slice(0, clamped), tabId, ...without.slice(clamped)];
      const nextPane: Pane = {
        // Safe: pane.tabIds was non-empty by invariant; reordering preserves the same elements.
        ...pane,
        tabIds: inserted as [TabId, ...TabId[]],
      };
      const nextPanes: WorkspaceState['panes'] = paneIndex === 0
        ? (state.panes.length === 2 ? [nextPane, state.panes[1]] : [nextPane])
        : [state.panes[0], nextPane];
      state = { ...state, panes: nextPanes };
      notify();
    },
    splitRight: (tabId) => {
      if (state.panes.length === 2) return;
      if (!state.tabs[tabId]) return;
      const sourcePane = state.panes[0];
      const oldIndex = sourcePane.tabIds.indexOf(tabId);
      if (oldIndex === -1) return;
      const remainingTabIds = sourcePane.tabIds.filter((id) => id !== tabId);

      let nextSourcePane: Pane;
      let nextTabs = { ...state.tabs };

      if (remainingTabIds.length === 0) {
        const newId = makeTabId();
        const fresh = getDefaultTabState(newId);
        nextTabs = { ...nextTabs, [newId]: fresh };
        nextSourcePane = { tabIds: [newId], activeTabId: newId };
      } else {
        let nextActive = sourcePane.activeTabId;
        if (sourcePane.activeTabId === tabId) {
          nextActive = remainingTabIds[oldIndex] ?? remainingTabIds[oldIndex - 1] ?? remainingTabIds[0];
        }
        nextSourcePane = {
          tabIds: remainingTabIds as [TabId, ...TabId[]],
          activeTabId: nextActive,
        };
      }

      const newRightPane: Pane = { tabIds: [tabId], activeTabId: tabId };
      state = {
        ...state,
        tabs: nextTabs,
        panes: [nextSourcePane, newRightPane],
        focusedPaneIndex: 1,
      };
      notify();
    },
    collapseSplit: () => {
      if (state.panes.length === 1) return;
      const focusedActive = state.panes[state.focusedPaneIndex].activeTabId;
      const merged: Pane = {
        // Safe: both source tabIds are non-empty by invariant, so the spread is non-empty.
        tabIds: [...state.panes[0].tabIds, ...state.panes[1].tabIds] as [TabId, ...TabId[]],
        activeTabId: focusedActive,
      };
      state = { ...state, panes: [merged], focusedPaneIndex: 0 };
      notify();
    },
    moveTabToPane: (tabId, targetPaneIndex) => {
      if (!state.tabs[tabId]) return;
      const sourcePaneIndex = findPaneIndex(state.panes, tabId);
      if (sourcePaneIndex === -1) return;
      if (sourcePaneIndex === targetPaneIndex) return;
      if (state.panes.length === 1) return; // need splitRight to create pane[1]
      const sourcePane = state.panes[sourcePaneIndex]!;
      const targetPane = state.panes[targetPaneIndex]!;
      const oldIndex = sourcePane.tabIds.indexOf(tabId);
      const remainingSource = sourcePane.tabIds.filter((id) => id !== tabId);

      // Source becomes empty: collapse. Target becomes panes[0].
      if (remainingSource.length === 0) {
        const merged: Pane = {
          tabIds: [...targetPane.tabIds, tabId] as [TabId, ...TabId[]],
          activeTabId: tabId,
        };
        state = { ...state, panes: [merged], focusedPaneIndex: 0 };
        notify();
        return;
      }

      // Source survives: pick neighbor for source active if we removed the active.
      let nextSourceActive = sourcePane.activeTabId;
      if (sourcePane.activeTabId === tabId) {
        nextSourceActive = remainingSource[oldIndex] ?? remainingSource[oldIndex - 1] ?? remainingSource[0];
      }
      const nextSourcePane: Pane = {
        tabIds: remainingSource as [TabId, ...TabId[]],
        activeTabId: nextSourceActive,
      };
      const nextTargetPane: Pane = {
        tabIds: [...targetPane.tabIds, tabId] as [TabId, ...TabId[]],
        activeTabId: tabId,
      };
      const nextPanes: WorkspaceState['panes'] = sourcePaneIndex === 0
        ? [nextSourcePane, nextTargetPane]
        : [nextTargetPane, nextSourcePane];
      state = { ...state, panes: nextPanes, focusedPaneIndex: targetPaneIndex };
      notify();
    },
    reopenLastClosed: (cts) => {
      const record = cts.pop();
      if (!record) return '';
      const targetPaneIndex: 0 | 1 = (record.paneIndex < state.panes.length ? record.paneIndex : 0) as 0 | 1;
      const newId = makeTabId();
      const restored: TabState = { ...record.tab, id: newId };
      const targetPane = state.panes[targetPaneIndex]!;
      const nextTargetPane: Pane = {
        tabIds: [...targetPane.tabIds, newId] as [TabId, ...TabId[]],
        activeTabId: newId,
      };
      const nextPanes: WorkspaceState['panes'] = state.panes.length === 2
        ? (targetPaneIndex === 0 ? [nextTargetPane, state.panes[1]] : [state.panes[0], nextTargetPane])
        : [nextTargetPane];
      state = {
        ...state,
        tabs: { ...state.tabs, [newId]: restored },
        panes: nextPanes,
        focusedPaneIndex: targetPaneIndex,
      };
      notify();
      return newId;
    },
  };
}

/**
 * Module-singleton for the app. Initialized at module-load time, BEFORE any
 * test's beforeEach runs - meaning a vi.stubGlobal('localStorage', ...) won't
 * be in effect when the singleton calls loadFromStorage(). Tests that need a
 * store seeded from a stubbed localStorage must construct their own instance
 * via createWorkspaceStore() (which DOES see the stub, since createWorkspaceStore
 * is called from inside the test).
 */
export const workspaceStore: WorkspaceStore = createWorkspaceStore();
