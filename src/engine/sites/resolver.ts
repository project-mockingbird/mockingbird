import type { Engine } from '../index.js';
import type { ItemNode, ScsItem } from '../types.js';
import { BASE_SITE_ROOT_TEMPLATE_ID, SITE_FIELD_IDS } from '../constants.js';
import { readFieldWithSvFallback } from '../layout/item-fields.js';
import { templateDescendsFromOrEquals } from '../layout/template-walk.js';
import { toCanonicalGuid } from '../guid.js';
import type { SiteDefinition } from './types.js';

/**
 * Hardcoded language used for Site Grouping field reads. Every OOTB SXA Site
 * Grouping field is a SHARED field; `readFieldWithSvFallback` checks shared
 * before consulting the language argument, so this value is never actually
 * used by the read path. We pass a stable default so a future versioned-field
 * subclass still resolves through SV cascade in a deterministic language.
 */
export const SITE_GROUPING_READ_LANGUAGE = 'en';

/**
 * Walk up from `node` (inclusive) to the first ancestor whose template
 * inherits from (or equals) `_BaseSiteRoot`. Mirrors Sitecore's
 * `MultisiteContext.GetSiteItem` which calls
 * `item.GetParentOfTemplate(Templates._BaseSiteRoot.ID)`
 * (`MultisiteContext.cs:64-73`).
 *
 * Returns null when no such ancestor exists, or when a parent reference
 * points at a missing item (treated as "walk reaches the root with no match").
 */
export function walkToSiteRoot(engine: Engine, node: ItemNode): ItemNode | null {
  let current: ItemNode | undefined = node;
  while (current) {
    if (templateDescendsFromOrEquals(engine, current.item.template, BASE_SITE_ROOT_TEMPLATE_ID)) {
      return current;
    }
    if (!current.item.parent) return null;
    current = engine.getItemById(current.item.parent);
  }
  return null;
}

/**
 * Environment filter - mirrors `EnvironmentSitesResolver.cs:25-36`. Returns
 * true when the Site Grouping item's `Environment` field is empty, set to
 * `*`, or matches the runtime-active environment string case-insensitively.
 *
 * `activeEnv` is sourced from `process.env.MOCKINGBIRD_ENVIRONMENT` at
 * resolver call time. Default-empty configuration (no env var set) means
 * only `Environment = ""` or `Environment = "*"` items match - the safe
 * default for the typical SXA content tree.
 */
export function environmentMatches(engine: Engine, item: ScsItem, activeEnv: string): boolean {
  const env = readFieldWithSvFallback(engine, item, SITE_FIELD_IDS.environment, SITE_GROUPING_READ_LANGUAGE) ?? '';
  if (env === '' || env === '*') return true;
  return env.toLowerCase() === activeEnv.toLowerCase();
}

/**
 * Per-item shaping. Resolves the StartItem reference, walks up to the
 * `_BaseSiteRoot` ancestor to compute `rootPath`, computes the relative
 * `startItem` path, and reads `name`/`hostname`/`language` off the Site
 * Grouping item. Returns null on any validation failure (empty SiteName,
 * missing or invalid StartItem GUID, deleted StartItem target, no
 * `_BaseSiteRoot` ancestor) with a `console.warn` describing the reason.
 *
 * Mirrors `SxaSiteProvider.ParseSiteItem` (lines 190-335). Hostname
 * whitespace is stripped via `replace(/\s+/g, '')` to match Sitecore's
 * `Replace(" ", "")`. Pipe-delimited multi-host strings pass through.
 */
export function parseSiteItem(engine: Engine, node: ItemNode): SiteDefinition | null {
  const item = node.item;
  const itemPath = item.path;

  const rawName = readFieldWithSvFallback(engine, item, SITE_FIELD_IDS.siteName, SITE_GROUPING_READ_LANGUAGE) ?? '';
  const name = rawName.trim();
  if (name === '') {
    console.warn(`[sites] skip ${itemPath}: empty SiteName`);
    return null;
  }

  const startItemRef = readFieldWithSvFallback(engine, item, SITE_FIELD_IDS.startItem, SITE_GROUPING_READ_LANGUAGE) ?? '';
  const startItemId = toCanonicalGuid(startItemRef);
  if (!startItemId) {
    console.warn(`[sites] skip ${itemPath}: missing or invalid StartItem`);
    return null;
  }

  const startItem = engine.getItemById(startItemId);
  if (!startItem) {
    console.warn(`[sites] skip ${itemPath}: StartItem ${startItemRef} not found`);
    return null;
  }

  const siteRoot = walkToSiteRoot(engine, startItem);
  if (!siteRoot) {
    console.warn(`[sites] skip ${itemPath}: no _BaseSiteRoot ancestor of ${startItem.item.path}`);
    return null;
  }

  const hostnameRaw = readFieldWithSvFallback(engine, item, SITE_FIELD_IDS.hostName, SITE_GROUPING_READ_LANGUAGE) ?? '';
  const hostname = hostnameRaw.replace(/\s+/g, '');
  const language = readFieldWithSvFallback(engine, item, SITE_FIELD_IDS.language, SITE_GROUPING_READ_LANGUAGE) ?? '';
  // SXA `sxaLinkable` checkbox - powers `query:$linkableHomes`. Sitecore's
  // CheckboxField stores "1" when checked; `SiteDefinitionParser.ParseFlag`
  // emits "true"/"false" for the eventual site-properties dictionary. We
  // accept either to stay tolerant of however the field is materialised in
  // the content tree (raw checkbox value vs already-flattened string).
  const sxaLinkableRaw = readFieldWithSvFallback(engine, item, SITE_FIELD_IDS.sxaLinkable, SITE_GROUPING_READ_LANGUAGE) ?? '';
  const linkable = sxaLinkableRaw.trim() === '1' || sxaLinkableRaw.trim().toLowerCase() === 'true';
  const rootPath = siteRoot.item.path;

  // walkToSiteRoot returns an ancestor of startItem, so structurally
  // startItem.path is rootPath or has rootPath as a prefix. The else branch
  // would mean a content tree inconsistency between the tree walk and the path
  // string; guard rather than emit a misleading empty startItem.
  let startItemRel: string;
  if (startItem.item.path === rootPath) {
    startItemRel = '';
  } else if (startItem.item.path.startsWith(rootPath + '/')) {
    startItemRel = startItem.item.path.slice(rootPath.length + 1);
  } else {
    console.warn(`[sites] skip ${itemPath}: StartItem path ${startItem.item.path} is not under rootPath ${rootPath}`);
    return null;
  }

  return { name, hostname, language, rootPath, startItem: startItemRel, linkable };
}

/**
 * Compose the absolute path used as the route base for layout queries (and
 * the `siteRootPath` argument to `referenceUrl`, `resolveRedirects`,
 * `rewriteRichText`, and `buildJsonValue`).
 *
 * The codebase convention is that `siteRootPath` always points at the start
 * item (the site's Home) so that a `routePath` like `/products` resolves to
 * `<startItem>/products`. `parseSiteItem` produces a Sitecore-faithful
 * `SiteDefinition` whose `rootPath` is the SXA `_BaseSiteRoot` (the parent
 * of Home) and whose `startItem` is the relative segment. This helper joins
 * them so consumers receive the start-item path. `synthesizeFromEnv` already
 * collapses `startItem` to `''` and stores the start-item path in `rootPath`,
 * so the helper passes that through unchanged.
 *
 * Note: this is NOT the right input for `resolveSxaContext`, which derives
 * tenant/common roots from the SXA site root - SXA REST routes should keep
 * reading `site.rootPath` directly.
 */
export function routeBaseForSite(site: SiteDefinition): string {
  if (!site.startItem) return site.rootPath;
  return `${site.rootPath}/${site.startItem}`;
}
