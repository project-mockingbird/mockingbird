import {
  type WorkspaceState,
  type TabState,
  type Pane,
  type TabId,
} from './workspaceStore';
import type { TabName } from '@/lib/url-state';

export const STORAGE_KEY = 'mockingbird.workspace.v1';
const SCHEMA_VERSION = 1;

type PersistedTab = {
  id: TabId;
  selectedItemId: string | null;
  database: string;
  language: string;
  detailTab: TabName | null;
  expandedNodes: Array<[string, boolean]>;
  editedFields: Record<string, string>;
};

type Persisted = {
  version: typeof SCHEMA_VERSION;
  tabs: Record<TabId, PersistedTab>;
  panes: Array<{ tabIds: TabId[]; activeTabId: TabId }>;
  focusedPaneIndex: 0 | 1;
};

function tabToPersisted(tab: TabState): PersistedTab {
  return {
    id: tab.id,
    selectedItemId: tab.selectedItemId,
    database: tab.database,
    language: tab.language,
    detailTab: tab.detailTab,
    expandedNodes: Array.from(tab.expandedNodes.entries()),
    editedFields: tab.editedFields,
  };
}

function tabFromPersisted(p: PersistedTab): TabState {
  return {
    id: p.id,
    selectedItemId: p.selectedItemId,
    database: p.database,
    language: p.language,
    detailTab: p.detailTab,
    expandedNodes: new Map(p.expandedNodes),
    editedFields: p.editedFields,
  };
}

export function loadFromStorage(): WorkspaceState | null {
  if (typeof localStorage === 'undefined') return null;
  let raw: string | null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  let parsed: Persisted;
  try {
    parsed = JSON.parse(raw) as Persisted;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[workspacePersistence] corrupt JSON in storage; falling back to fresh state', err);
    return null;
  }
  if (parsed.version !== SCHEMA_VERSION) {
    // eslint-disable-next-line no-console
    console.warn(`[workspacePersistence] schema version ${parsed.version} != ${SCHEMA_VERSION}; falling back`);
    return null;
  }
  if (!parsed.panes || parsed.panes.length === 0 || parsed.panes.length > 2) return null;
  // Validate the non-empty-tabIds invariant on each pane before casting to the
  // tuple type. Tampered or corrupted storage with empty tabIds would otherwise
  // produce a structurally invalid WorkspaceState that downstream actions
  // (closeTab, focusTab, etc.) would treat as a runtime guarantee.
  if (!parsed.panes.every((p) => Array.isArray(p.tabIds) && p.tabIds.length > 0)) {
    // eslint-disable-next-line no-console
    console.warn('[workspacePersistence] pane has empty tabIds; falling back to fresh state');
    return null;
  }
  // Cross-validate: every tabId in every pane must exist as a key in tabs, and
  // each pane's activeTabId must be one of its tabIds. Without this, a tampered
  // store could produce a state where pane.activeTabId points at a missing tab,
  // crashing the focused-tab read paths (useFocusedTabState, WorkspaceShell).
  if (!parsed.panes.every((p) =>
    p.tabIds.every((id) => id in parsed.tabs) && p.tabIds.includes(p.activeTabId)
  )) {
    // eslint-disable-next-line no-console
    console.warn('[workspacePersistence] pane references unknown tab id or orphan activeTabId; falling back');
    return null;
  }
  // Coerce panes tuple shape
  const panes: WorkspaceState['panes'] = parsed.panes.length === 1
    ? [{ tabIds: parsed.panes[0].tabIds as [TabId, ...TabId[]], activeTabId: parsed.panes[0].activeTabId }]
    : [
        { tabIds: parsed.panes[0].tabIds as [TabId, ...TabId[]], activeTabId: parsed.panes[0].activeTabId },
        { tabIds: parsed.panes[1].tabIds as [TabId, ...TabId[]], activeTabId: parsed.panes[1].activeTabId },
      ] as [Pane, Pane];
  const tabs: Record<TabId, TabState> = {};
  for (const [id, persisted] of Object.entries(parsed.tabs)) {
    tabs[id] = tabFromPersisted(persisted);
  }
  return {
    tabs,
    panes,
    focusedPaneIndex: parsed.focusedPaneIndex === 1 ? 1 : 0,
  };
}

export function saveToStorage(state: WorkspaceState): void {
  if (typeof localStorage === 'undefined') return;
  const persisted: Persisted = {
    version: SCHEMA_VERSION,
    tabs: Object.fromEntries(
      Object.entries(state.tabs).map(([id, tab]) => [id, tabToPersisted(tab)]),
    ),
    panes: state.panes.map((p) => ({ tabIds: [...p.tabIds], activeTabId: p.activeTabId })),
    focusedPaneIndex: state.focusedPaneIndex,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[workspacePersistence] save failed; in-memory state intact', err);
  }
}
