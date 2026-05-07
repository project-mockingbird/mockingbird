import type { Engine } from '../index.js';
import type { ItemNode } from '../types.js';
import {
  REDIRECT_MAP_TEMPLATE_ID,
  REDIRECT_MAP_GROUPING_TEMPLATE_ID,
  REDIRECT_FIELD_IDS,
} from '../constants.js';
import { readSharedFieldOnItem } from '../layout/item-fields.js';

/**
 * Resolved redirect entry, shape-matched to the Experience Edge
 * `SiteInfo.redirects` response.
 */
export interface ResolvedRedirect {
  pattern: string;
  target: string;
  redirectType: string;
  isQueryStringPreserved: boolean;
  isLanguagePreserved: boolean;
  locale: string;
}

/**
 * Map Sitecore `RedirectType` enum value → Edge's string form.
 * Unknown values fall through to `REDIRECT_301` (the most common default).
 */
const REDIRECT_TYPE_MAP: Record<string, string> = {
  redirect301: 'REDIRECT_301',
  redirect302: 'REDIRECT_302',
  servertransfer: 'REDIRECT_SERVER_TRANSFER',
};

function mapRedirectType(raw: string | undefined): string {
  if (!raw) return 'REDIRECT_301';
  return REDIRECT_TYPE_MAP[raw.trim().toLowerCase()] ?? 'REDIRECT_301';
}

function parseCheckbox(raw: string | undefined): boolean {
  return raw === '1';
}

/**
 * Parse a SXA `UrlMapping` field value into pattern/target pairs.
 *
 * The field is stored as URL-encoded `pattern=target` pairs joined by `&`.
 * Both sides are individually URL-encoded (mixed case — `%2f` and `%2F`
 * both appear in real data). Empty pairs (trailing `&`, `&&`) are ignored.
 */
export function parseUrlMapping(raw: string | undefined): Array<{ pattern: string; target: string }> {
  if (!raw) return [];
  const out: Array<{ pattern: string; target: string }> = [];
  for (const pair of raw.split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    if (eq === -1) continue;
    const rawPattern = pair.slice(0, eq);
    const rawTarget = pair.slice(eq + 1);
    if (!rawPattern || !rawTarget) continue;
    try {
      out.push({ pattern: decodeURIComponent(rawPattern), target: decodeURIComponent(rawTarget) });
    } catch {
      // Malformed percent-encoding — skip this pair.
    }
  }
  return out;
}

/**
 * Find the `<siteParent>/Settings/Redirects` container for the given site.
 * The site root path passed in is assumed to point at the site's Home item
 * (mockingbird's `SITE_ROOT_PATH` convention); the Redirects container sits
 * as a sibling of Home under `Settings/Redirects`.
 */
function findRedirectsContainer(siteRootPath: string, engine: Engine): ItemNode | undefined {
  if (!siteRootPath) return undefined;
  const lastSlash = siteRootPath.lastIndexOf('/');
  if (lastSlash <= 0) return undefined;
  const siteParent = siteRootPath.slice(0, lastSlash);
  return engine.getItemByPath(`${siteParent}/Settings/Redirects`);
}

/**
 * Depth-first walk through a subtree, collecting every `Redirect Map` item
 * (`REDIRECT_MAP_TEMPLATE_ID`). `Redirect Map Grouping` folders are traversed
 * but never emitted; any other template type is skipped entirely (treated as
 * a leaf we don't care about).
 */
function collectRedirectMaps(root: ItemNode): ItemNode[] {
  const out: ItemNode[] = [];
  const stack: ItemNode[] = [root];
  while (stack.length > 0) {
    const node = stack.pop()!;
    const tmpl = node.item.template.toLowerCase();
    if (tmpl === REDIRECT_MAP_TEMPLATE_ID) {
      out.push(node);
      continue;
    }
    // Traverse into the container itself, grouping folders, and the root item.
    for (const child of node.children.values()) {
      stack.push(child);
    }
  }
  return out;
}

/**
 * Resolve every redirect registered under a site's `Settings/Redirects`
 * container. Each SXA `Redirect Map` item expands into one entry per
 * pattern/target pair in its `UrlMapping` field. Map-level flags
 * (`PreserveQueryString`, `PreserveLanguage`, `RedirectType`) apply to every
 * entry in that map; `locale` is always `""` (no SXA field models it).
 *
 * Returns `[]` when the site has no Redirects container, when the container
 * has no Redirect Map descendants, or when `siteName` doesn't match the
 * site root's immediate parent segment.
 */
export function resolveRedirects(
  engine: Engine,
  siteName: string,
  siteRootPath: string,
): ResolvedRedirect[] {
  if (!siteRootPath) return [];

  // Site filter: basename of the site root's parent (e.g. `.../site/Home` → `site`).
  const lastSlash = siteRootPath.lastIndexOf('/');
  if (lastSlash <= 0) return [];
  const siteParent = siteRootPath.slice(0, lastSlash);
  const expectedSiteName = siteParent.slice(siteParent.lastIndexOf('/') + 1);
  if (siteName.toLowerCase() !== expectedSiteName.toLowerCase()) return [];

  const container = findRedirectsContainer(siteRootPath, engine);
  if (!container) return [];

  const maps = collectRedirectMaps(container);
  const out: ResolvedRedirect[] = [];

  for (const mapNode of maps) {
    const item = mapNode.item;
    const urlMapping = readSharedFieldOnItem(item, REDIRECT_FIELD_IDS.urlMapping);
    const redirectType = mapRedirectType(readSharedFieldOnItem(item, REDIRECT_FIELD_IDS.redirectType));
    const isQueryStringPreserved = parseCheckbox(readSharedFieldOnItem(item, REDIRECT_FIELD_IDS.preserveQueryString));
    const isLanguagePreserved = parseCheckbox(readSharedFieldOnItem(item, REDIRECT_FIELD_IDS.preserveLanguage));

    for (const { pattern, target } of parseUrlMapping(urlMapping)) {
      out.push({
        pattern,
        target,
        redirectType,
        isQueryStringPreserved,
        isLanguagePreserved,
        locale: '',
      });
    }
  }

  return out;
}
