import { useEffect, useRef } from 'react';
import { workspaceStore } from './workspaceStore';
import { parseItemIdFromPathname } from '@/lib/url-state';

function urlForItemId(itemId: string | null): string {
  // null selection stays on /tree (the tree page with no item selected).
  // Routes branches on pathname === '/' to pick LaunchPage vs ContentTreePage,
  // so we must NOT rewrite to '/' on null - that would bounce to LaunchPage.
  return itemId ? `/tree/${itemId}` : '/tree';
}

function readUrlItemId(): string | null {
  return parseItemIdFromPathname(window.location.pathname);
}

// Sync only operates while the user is on the tree route. If pathname is `/`
// (LaunchPage) - including transient states during route transitions - this
// hook is a no-op so a stored selection in localStorage doesn't auto-bounce
// the user back to /tree.
function isOnTreeRoute(): boolean {
  return window.location.pathname.startsWith('/tree');
}

function focusedActiveItemId(): string | null {
  const s = workspaceStore.getState();
  const pane = s.panes[s.focusedPaneIndex];
  if (!pane) return null;
  return s.tabs[pane.activeTabId]?.selectedItemId ?? null;
}

export function useWorkspaceUrlSync(): void {
  // Track the URL we last pushed so the store subscriber doesn't re-push on
  // popstate-driven store changes (which would loop). Initialize to the
  // current window location so the initial-push check in the subscribe effect
  // correctly detects store-vs-URL mismatches on mount.
  const lastPushedRef = useRef<string>(window.location.pathname);
  // Track whether we're currently inside a popstate handler so the store
  // subscription's resulting notification doesn't try to push.
  const inPopstateRef = useRef<boolean>(false);

  useEffect(() => {
    const handlePopstate = () => {
      // Off-route popstate (e.g. user just navigated back to /): leave store
      // alone. The user's intent was to leave the tree page, not to clear
      // the focused tab's selection.
      if (!isOnTreeRoute()) return;
      const urlItemId = readUrlItemId();
      const s = workspaceStore.getState();
      // Match on selectedItemId equality regardless of whether urlItemId is
      // null. A null URL itemId should focus an existing empty tab if one
      // exists, rather than clobbering the focused tab's selection. Without
      // this, browser-forward to /tree from /tree/foo wipes whichever tab
      // currently holds focus.
      // Multi-match preference: when more than one tab matches the URL itemId,
      // prefer the tab in the currently focused pane (so back/forward stays
      // rooted on the user's working pane). Within the focused pane, fall back
      // to the first match. Across panes, fall back to the first match found
      // in the other pane.
      const focusedPane = s.panes[s.focusedPaneIndex];
      const matching =
        (focusedPane && focusedPane.tabIds
          .map((id) => s.tabs[id])
          .find((t) => t && t.selectedItemId === urlItemId))
        ?? Object.values(s.tabs).find((t) => t.selectedItemId === urlItemId);
      inPopstateRef.current = true;
      try {
        if (matching) {
          // Bare /tree: also reset the to-be-focused tab's expansion to
          // default. Selection alone isn't enough - a deep persisted expansion
          // path leaks just as visibly as a persisted selection (#32 follow-up).
          if (urlItemId === null) {
            workspaceStore.patchTab(matching.id, { expandedNodes: new Map() });
          }
          workspaceStore.focusTab(matching.id);
        } else {
          const pane = s.panes[s.focusedPaneIndex];
          if (pane) {
            const patch: { selectedItemId: string | null; expandedNodes?: Map<string, boolean> } =
              { selectedItemId: urlItemId };
            if (urlItemId === null) patch.expandedNodes = new Map();
            workspaceStore.patchTab(pane.activeTabId, patch);
          }
        }
      } finally {
        inPopstateRef.current = false;
        lastPushedRef.current = window.location.pathname;
      }
    };
    // Bootstrap: on mount, align the store to the URL. The URL is the source
    // of truth on cold load, so:
    //   - URL has an itemId   -> focus a matching tab or patch focused tab.
    //   - URL has no itemId   -> focus an existing empty-selection tab if one
    //                            exists, otherwise clear the focused tab's
    //                            selection. This is what makes a bare /tree
    //                            URL show NO selection even when localStorage
    //                            persisted one (#32).
    // handlePopstate already implements both branches (gated on isOnTreeRoute),
    // so we just run it unconditionally on mount.
    handlePopstate();
    window.addEventListener('popstate', handlePopstate);
    return () => window.removeEventListener('popstate', handlePopstate);
  }, []);

  useEffect(() => {
    // Mount-time alignment: if the store has a selection but the URL doesn't
    // reflect it (e.g. store seeded from localStorage), update the URL to
    // match. Use replaceState (not pushState) so we don't pollute browser
    // history with a phantom entry on every cold load. Subscriber pushes
    // below correctly use pushState because they reflect user-driven nav.
    // The lastPushedRef dedupe check skips this when the popstate effect
    // above already bootstrapped store-from-URL (it sets lastPushedRef in
    // its finally block).
    if (isOnTreeRoute()) {
      const itemId = focusedActiveItemId();
      const next = urlForItemId(itemId);
      if (next !== lastPushedRef.current) {
        const search = window.location.search;
        try {
          window.history.replaceState(window.history.state, '', `${next}${search}`);
          lastPushedRef.current = next;
        } catch {
          // Quota exceeded - degrade silently
        }
      }
    }

    const unsubscribe = workspaceStore.subscribe(() => {
      if (inPopstateRef.current) return;
      // Off-route push guard: if the user is on /, the URL must stay there.
      if (!isOnTreeRoute()) return;
      const itemId = focusedActiveItemId();
      const next = urlForItemId(itemId);
      if (next === lastPushedRef.current) return;
      // Preserve any existing query (e.g. ?dialog=add-rendering) on push
      const search = window.location.search;
      try {
        window.history.pushState(window.history.state, '', `${next}${search}`);
        lastPushedRef.current = next;
      } catch {
        // Quota exceeded - degrade silently
      }
    });
    return unsubscribe;
  }, []);
}
