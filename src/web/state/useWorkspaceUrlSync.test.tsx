/// <reference types="vitest" />
/// <reference types="@testing-library/react" />
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import { workspaceStore, DEFAULT_TAB_ID } from './workspaceStore';
import { useWorkspaceUrlSync } from './useWorkspaceUrlSync';

function Probe() {
  useWorkspaceUrlSync();
  return null;
}

let mem: Record<string, string> = {};

describe('useWorkspaceUrlSync', () => {
  beforeEach(() => {
    mem = {};
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => mem[k] ?? null,
      setItem: (k: string, v: string) => { mem[k] = v; },
      removeItem: (k: string) => { delete mem[k]; },
      clear: () => { mem = {}; },
    });
    localStorage.clear();
    // Default to the tree route - the hook is gated on pathname starting with
    // /tree so tests that exercise sync behavior must start there. The
    // off-route behavior tests below override this explicitly.
    window.history.replaceState(null, '', '/tree');
    workspaceStore.patchTab(DEFAULT_TAB_ID, { selectedItemId: null });
    // Clean up any extra tabs from prior tests
    workspaceStore.focusTab(DEFAULT_TAB_ID);
    const extras = workspaceStore.getState().panes[0].tabIds.filter((id) => id !== DEFAULT_TAB_ID);
    for (const id of extras) workspaceStore.closeTab(id);
  });

  afterEach(() => {
    window.history.replaceState(null, '', '/');
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('pushes URL when focused-active tab selectedItemId changes', () => {
    render(<Probe />);
    act(() => { workspaceStore.patchTab(DEFAULT_TAB_ID, { selectedItemId: 'item-x' }); });
    expect(window.location.pathname).toBe('/tree/item-x');
  });

  it('does not push when an unfocused tab\'s selection changes', () => {
    render(<Probe />);
    const otherId = workspaceStore.addTab(0, undefined, { focus: false });
    const before = window.location.pathname;
    act(() => { workspaceStore.patchTab(otherId, { selectedItemId: 'item-y' }); });
    expect(window.location.pathname).toBe(before);
  });

  it('pushes URL when focusing a different tab with a different selection', () => {
    workspaceStore.patchTab(DEFAULT_TAB_ID, { selectedItemId: 'item-a' });
    const otherId = workspaceStore.addTab(0, { selectedItemId: 'item-b' }, { focus: false });
    // Mount-time bootstrap aligns the store to the URL. Set URL to /tree/item-a
    // so bootstrap doesn't clear the focused tab (#32: bare /tree implies no
    // selection).
    window.history.replaceState(null, '', '/tree/item-a');
    render(<Probe />);
    expect(window.location.pathname).toBe('/tree/item-a');
    act(() => { workspaceStore.focusTab(otherId); });
    expect(window.location.pathname).toBe('/tree/item-b');
  });

  it('on popstate with itemId matching an existing tab, focuses that tab (no patch)', () => {
    const otherId = workspaceStore.addTab(0, { selectedItemId: 'item-b' }, { focus: false });
    render(<Probe />);
    window.history.pushState(null, '', '/tree/item-b');
    act(() => { window.dispatchEvent(new PopStateEvent('popstate')); });
    expect(workspaceStore.getState().panes[0].activeTabId).toBe(otherId);
  });

  it('on popstate with itemId not matching any tab, patches focused tab\'s selectedItemId', () => {
    render(<Probe />);
    window.history.pushState(null, '', '/tree/item-x');
    act(() => { window.dispatchEvent(new PopStateEvent('popstate')); });
    expect(workspaceStore.getState().tabs[DEFAULT_TAB_ID].selectedItemId).toBe('item-x');
  });

  it('on popstate to /tree (no item), clears focused tab\'s selectedItemId when no other tab has null selection', () => {
    workspaceStore.patchTab(DEFAULT_TAB_ID, { selectedItemId: 'item-x' });
    render(<Probe />);
    window.history.pushState(null, '', '/tree');
    act(() => { window.dispatchEvent(new PopStateEvent('popstate')); });
    expect(workspaceStore.getState().tabs[DEFAULT_TAB_ID].selectedItemId).toBeNull();
  });

  it('on popstate to /tree, focuses an existing empty tab instead of clobbering the focused tab', () => {
    // default tab keeps selectedItemId: null. Add a focused tab b with item-b.
    const b = workspaceStore.addTab(0, { selectedItemId: 'item-b' });
    expect(workspaceStore.getState().panes[0].activeTabId).toBe(b);
    render(<Probe />);
    window.history.pushState(null, '', '/tree');
    act(() => { window.dispatchEvent(new PopStateEvent('popstate')); });
    // The popstate handler should focus the default tab (which already has
    // selectedItemId: null) rather than wiping b's selection.
    expect(workspaceStore.getState().panes[0].activeTabId).toBe(DEFAULT_TAB_ID);
    expect(workspaceStore.getState().tabs[b].selectedItemId).toBe('item-b');
  });

  it('on popstate to / (LaunchPage), leaves store alone (off-route guard)', () => {
    // Set URL to /tree/item-x so the mount-time bootstrap aligns the focused
    // tab to item-x (instead of clearing it; #32). Then simulate the user
    // navigating to / and confirm the off-route popstate guard preserves
    // the selection.
    workspaceStore.patchTab(DEFAULT_TAB_ID, { selectedItemId: 'item-x' });
    window.history.replaceState(null, '', '/tree/item-x');
    render(<Probe />);
    window.history.pushState(null, '', '/');
    act(() => { window.dispatchEvent(new PopStateEvent('popstate')); });
    // Store unchanged: leaving the tree route does not clear the user's selection
    expect(workspaceStore.getState().tabs[DEFAULT_TAB_ID].selectedItemId).toBe('item-x');
  });

  // Bootstrap (one-shot mount-time reconcile)
  it('on mount with URL=/tree/{itemId}, aligns the focused tab to that itemId', () => {
    window.history.replaceState(null, '', '/tree/item-z');
    render(<Probe />);
    expect(workspaceStore.getState().tabs[DEFAULT_TAB_ID].selectedItemId).toBe('item-z');
  });

  it('on mount with URL=/tree (no item), clears the focused tab selection from persisted state (URL intent wins)', () => {
    // Simulates: persisted state had a selection, but the user opened the bare
    // /tree URL. The URL's silence on item id is an explicit "no selection"
    // intent and must win over the persisted selection. (Bug #32)
    workspaceStore.patchTab(DEFAULT_TAB_ID, { selectedItemId: 'persistedId' });
    window.history.replaceState(null, '', '/tree');
    render(<Probe />);
    expect(workspaceStore.getState().tabs[DEFAULT_TAB_ID].selectedItemId).toBeNull();
  });

  it('on mount with URL=/tree/{urlId} and persisted selection differs, URL id wins', () => {
    // Positive control: URL with an explicit item id overrides any persisted
    // selection. The focused tab ends up matching the URL.
    workspaceStore.patchTab(DEFAULT_TAB_ID, { selectedItemId: 'persistedId' });
    window.history.replaceState(null, '', '/tree/urlId');
    render(<Probe />);
    expect(workspaceStore.getState().tabs[DEFAULT_TAB_ID].selectedItemId).toBe('urlId');
  });

  it('on mount with URL=/tree (no item), clears the focused tab expandedNodes from persisted state', () => {
    // Companion to the selection-clear test: bare /tree on cold load is the
    // user signaling "default tree view" - persisted expansion state must not
    // leak in any more than persisted selection does.
    workspaceStore.patchTab(DEFAULT_TAB_ID, {
      selectedItemId: 'persistedId',
      expandedNodes: new Map([['expanded-a', true], ['expanded-b', true]]),
    });
    window.history.replaceState(null, '', '/tree');
    render(<Probe />);
    expect(workspaceStore.getState().tabs[DEFAULT_TAB_ID].expandedNodes.size).toBe(0);
  });

  it('on mount with URL=/tree/{id}, leaves expandedNodes alone (regression guard)', () => {
    // Negative control for the bare-/tree expansion reset: when the URL has an
    // item id, expansion state must NOT be cleared (ancestor-expansion-on-
    // navigate behavior depends on it).
    workspaceStore.patchTab(DEFAULT_TAB_ID, {
      selectedItemId: null,
      expandedNodes: new Map([['ancestor-a', true]]),
    });
    window.history.replaceState(null, '', '/tree/some-id');
    render(<Probe />);
    expect(workspaceStore.getState().tabs[DEFAULT_TAB_ID].expandedNodes.has('ancestor-a')).toBe(true);
  });

  it('on popstate to /tree focusing an existing empty tab, resets that tab\'s expandedNodes', () => {
    // Even when bare /tree finds an existing empty-selection tab to focus
    // (rather than clobbering the focused tab), that tab\'s expansion still
    // needs to be reset to default - bare /tree always means "default tree
    // view" regardless of which tab ends up displaying it.
    workspaceStore.patchTab(DEFAULT_TAB_ID, {
      selectedItemId: null,
      expandedNodes: new Map([['stale-expansion', true]]),
    });
    workspaceStore.addTab(0, { selectedItemId: 'item-b' });
    render(<Probe />);
    window.history.pushState(null, '', '/tree');
    act(() => { window.dispatchEvent(new PopStateEvent('popstate')); });
    expect(workspaceStore.getState().panes[0].activeTabId).toBe(DEFAULT_TAB_ID);
    expect(workspaceStore.getState().tabs[DEFAULT_TAB_ID].expandedNodes.size).toBe(0);
  });

  it('on mount with URL=/tree and no persisted selection, focused tab stays null (no-op)', () => {
    // Default state: nothing in URL, nothing in store. After mount, the
    // focused tab's selection must remain null - no spurious change.
    workspaceStore.patchTab(DEFAULT_TAB_ID, { selectedItemId: null });
    window.history.replaceState(null, '', '/tree');
    render(<Probe />);
    expect(workspaceStore.getState().tabs[DEFAULT_TAB_ID].selectedItemId).toBeNull();
  });

  it('on mount with URL=/tree and persisted selection, URL stays /tree (does not grow history)', () => {
    // The mount-time URL stays /tree because the focused tab gets cleared to
    // match the URL's "no selection" intent. The push subscriber sees no
    // mismatch and does not push.
    workspaceStore.patchTab(DEFAULT_TAB_ID, { selectedItemId: 'persistedId' });
    window.history.replaceState(null, '', '/tree');
    const lengthBefore = window.history.length;
    render(<Probe />);
    expect(window.location.pathname).toBe('/tree');
    expect(window.history.length).toBe(lengthBefore);
  });

  it('on mount with URL=/ (LaunchPage), leaves URL alone (off-route guard)', () => {
    workspaceStore.patchTab(DEFAULT_TAB_ID, { selectedItemId: 'item-x' });
    window.history.replaceState(null, '', '/');
    render(<Probe />);
    // The off-route guard prevents the eager push; user stays on LaunchPage.
    expect(window.location.pathname).toBe('/');
  });
});
