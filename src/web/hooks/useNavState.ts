import { useSyncExternalStore, useCallback } from 'react';
import {
  parseUrl,
  serializeUrl,
  DEFAULT_NAV_STATE,
  type NavState,
  type DialogName,
} from '@/lib/url-state';

// Client-only Vite SPA: no SSR guards needed; window/history are always present.

// Module-level event channel. Programmatic history.pushState / replaceState do
// not fire popstate, so navigate() dispatches a 'navchange' event here that all
// subscribers also listen for. popstate (real browser back/forward) is still
// the source of truth from the browser side.
const navChannel = new EventTarget();

let cachedHref: string | null = null;
let cachedState: NavState = DEFAULT_NAV_STATE;

function readSnapshot(): NavState {
  const href = window.location.href;
  if (href === cachedHref) return cachedState;
  cachedHref = href;
  try {
    cachedState = parseUrl(new URL(href));
  } catch {
    cachedState = DEFAULT_NAV_STATE;
  }
  return cachedState;
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('popstate', onChange);
  navChannel.addEventListener('navchange', onChange);
  return () => {
    window.removeEventListener('popstate', onChange);
    navChannel.removeEventListener('navchange', onChange);
  };
}

function dispatchNavChange(): void {
  navChannel.dispatchEvent(new Event('navchange'));
}

const NAV_SOURCE_MARKER = 'nav' as const;

export interface UseNavStateResult {
  state: NavState;
  navigate: (partial: Partial<NavState>, opts?: { replace?: boolean }) => void;
  goBack: () => void;
}

export function useNavState(): UseNavStateResult {
  const state = useSyncExternalStore(subscribe, readSnapshot, () => DEFAULT_NAV_STATE);

  const navigate = useCallback((partial: Partial<NavState>, opts?: { replace?: boolean }) => {
    const next: NavState = { ...readSnapshot(), ...partial };
    const nextHref = serializeUrl(next);
    const currentRel = window.location.pathname + window.location.search;
    if (nextHref === currentRel) return;
    // Tag entries we pushed with source='nav' so useDialogRoute.close can tell
    // an entry we own from one the user pasted in (where goBack would leave
    // the app entirely).
    const stateMarker = { source: NAV_SOURCE_MARKER };
    try {
      if (opts?.replace) {
        window.history.replaceState(stateMarker, '', nextHref);
      } else {
        window.history.pushState(stateMarker, '', nextHref);
      }
    } catch (err) {
      // QuotaExceededError on overflowing history -> degrade to replaceState.
      // Anything else: log and fall through (UI will still re-render with stale URL).
      // eslint-disable-next-line no-console
      console.warn('[useNavState] history mutation failed, falling back to replaceState', err);
      try {
        window.history.replaceState(stateMarker, '', nextHref);
      } catch (fallbackErr) {
        // eslint-disable-next-line no-console
        console.warn('[useNavState] replaceState fallback also failed; URL not updated', fallbackErr);
        return;
      }
    }
    // Invalidate snapshot cache so next read returns the new state.
    cachedHref = null;
    dispatchNavChange();
  }, []);

  const goBack = useCallback(() => {
    window.history.back();
  }, []);

  return { state, navigate, goBack };
}

export interface UseDialogRouteResult {
  isOpen: boolean;
  open: (opts?: { replace?: boolean }) => void;
  close: () => void;
}

export function useDialogRoute(name: DialogName): UseDialogRouteResult {
  const { state, navigate, goBack } = useNavState();
  const isOpen = state.dialog === name;

  const open = useCallback((opts?: { replace?: boolean }) => {
    navigate({ dialog: name }, opts);
  }, [navigate, name]);

  const close = useCallback(() => {
    // Read the live snapshot rather than closing over `state.dialog` from
    // render: keeps this callback's identity stable across nav events, so
    // consumers binding it in useEffect deps don't churn.
    if (readSnapshot().dialog !== name) {
      // Defensive: dialog flag isn't ours; clear it without pushing a new entry.
      navigate({ dialog: null }, { replace: true });
      return;
    }
    // Only goBack if we own this entry (we tagged it with source=NAV_SOURCE_MARKER
    // in navigate()). On a deep-linked URL the user opened directly, the entry
    // wasn't pushed by us; goBack would leave the app entirely. Replace
    // instead so the dialog closes without navigation away.
    const histState = window.history.state as { source?: string } | null;
    if (histState?.source === NAV_SOURCE_MARKER) {
      goBack();
    } else {
      navigate({ dialog: null }, { replace: true });
    }
  }, [name, navigate, goBack]);

  return { isOpen, open, close };
}
