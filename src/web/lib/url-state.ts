export const KNOWN_DIALOGS = [
  'add-rendering',
  'edit-rendering',
] as const;

export type DialogName = typeof KNOWN_DIALOGS[number];

export const KNOWN_TABS = ['builder', 'content', 'standard', 'layout', 'yaml'] as const;
export type TabName = typeof KNOWN_TABS[number];

/**
 * Resolve which detail tab is active for an item. The Builder tab exists only
 * for template items and Yaml only when the item is editable, so a persisted
 * tab that isn't valid for the current item must fall back rather than leave the
 * Tabs control pointing at a non-existent panel. Templates default to Builder;
 * everything else uses the configured default tab.
 */
export function resolveDetailTab(opts: {
  persisted: TabName | null;
  isTemplate: boolean;
  readOnly: boolean;
  settingDefault: TabName;
}): TabName {
  const valid: TabName[] = [
    ...(opts.isTemplate ? (['builder'] as TabName[]) : []),
    'content',
    'standard',
    'layout',
    ...(opts.readOnly ? [] : (['yaml'] as TabName[])),
  ];
  if (opts.persisted && valid.includes(opts.persisted)) return opts.persisted;
  return opts.isTemplate ? 'builder' : opts.settingDefault;
}

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
