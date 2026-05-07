export const KNOWN_DIALOGS = [
  'add-rendering',
  'edit-rendering',
] as const;

export type DialogName = typeof KNOWN_DIALOGS[number];

export const KNOWN_TABS = ['content', 'standard', 'layout', 'yaml'] as const;
export type TabName = typeof KNOWN_TABS[number];

export type NavState = {
  selectedId: string | null;
  dialog: DialogName | null;
};

export const DEFAULT_NAV_STATE: NavState = {
  selectedId: null,
  dialog: null,
};

const TREE_PATH_RE = /^\/tree\/([^/]+)$/;

function isDialogName(value: string): value is DialogName {
  return (KNOWN_DIALOGS as readonly string[]).includes(value);
}

/**
 * Extract the selected item id from a pathname like `/tree/{itemId}`. Returns
 * `null` for `/`, `/tree`, or any pathname that doesn't match the contract.
 * Shared by url-state's parseUrl and useWorkspaceUrlSync's URL <-> store sync.
 */
export function parseItemIdFromPathname(pathname: string): string | null {
  const match = TREE_PATH_RE.exec(pathname);
  return match ? match[1] : null;
}

/**
 * Precondition: caller must pass a validly-constructed URL object. The URL
 * constructor itself can throw on malformed strings - that catch lives in
 * useNavState's readSnapshot, which is the only place that builds the URL
 * from window.location.href.
 */
export function parseUrl(url: URL): NavState {
  const selectedId = parseItemIdFromPathname(url.pathname);
  const rawDialog = url.searchParams.get('dialog');
  const dialog: DialogName | null =
    rawDialog && isDialogName(rawDialog) ? rawDialog : null;
  return { selectedId, dialog };
}

export function serializeUrl(state: NavState): string {
  // null selectedId stays on the tree page at /tree (NOT /, which would land
  // on LaunchPage). The Routes component branches on pathname === '/' to
  // pick LaunchPage vs ContentTreePage.
  const path = state.selectedId ? `/tree/${state.selectedId}` : '/tree';
  const parts: string[] = [];
  if (state.dialog !== null) {
    // No encodeURIComponent needed - all KNOWN_DIALOGS values are ASCII-safe
    // identifiers (hyphen-separated). If a future dialog name contains special
    // characters, encode here.
    parts.push(`dialog=${state.dialog}`);
  }
  return parts.length === 0 ? path : `${path}?${parts.join('&')}`;
}
