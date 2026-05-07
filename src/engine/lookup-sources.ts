/**
 * Resolve a Sitecore field `Source` string into a list of selectable items.
 *
 * Ports a useful subset of Sitecore's `getLookupSourceItems` pipeline
 * (`Sitecore.Kernel` `LookupSources.GetItems` + `ProcessDefaultSource` +
 * `ProcessQuerySource`, decompile lines 195647 / 271946 / 271981) plus the
 * SXA token expansion that lives outside the kernel and is what real
 * SXA sites use on their Page Design / Site Design fields.
 *
 * Supported forms:
 *   - empty                                                    -> []
 *   - `/sitecore/.../Path`                                     -> children of that item
 *   - `/path/A|/path/B`                                        -> union of children
 *   - `Datasource=/path&DatabaseName=master`                   -> children of the datasource path
 *   - `query:/path//*[@@templatename='Foo']`                   -> all descendants whose template name = Foo
 *   - `query:$site/*[@@name='X']/*[@@templatename='Y']/*[@@name='Z']`
 *                                                              -> children of items matched by multi-segment
 *                                                                 child-axis walk (SXA Tag Treelist convention)
 *   - any of the above with leading `$site`, `$tenant`, `$pageDesigns`, etc. tokens
 *
 * Anything else (`fast:` queries, multi-predicate XPath, exclude filters, ...)
 * falls through with `resolved: false` so the caller can downgrade gracefully
 * to a plain text input and surface the unresolved reason.
 */

import type { Engine } from './index.js';
import {
  type UnifiedItem,
  getId,
  getName,
  getTemplate,
  getMergedChildren,
  getSharedField,
  lookupUnifiedItem,
  lookupUnifiedItemByPath,
} from './layout/unified-item.js';
import { readSortOrder } from './layout/contents-resolvers.js';
import { discoverSiteDefinitions } from './sites/discovery.js';
import type { SiteDefinition } from './sites/types.js';
import { LINK_SETTINGS_FIELD_ID, SITE_MEDIA_LIBRARY_FIELD_ID } from './constants.js';
import { parseGuidList } from './guid.js';

export interface LookupSourceItem {
  id: string;
  name: string;
  displayName: string;
  path: string;
  templateId: string;
  hasChildren: boolean;
}

export interface LookupSourceResult {
  items: LookupSourceItem[];
  /** True when the source had a recognised form. False = the caller should fall back. */
  resolved: boolean;
  /** Human-readable reason when unresolved. */
  reason?: string;
}

// ---- public entry ---------------------------------------------------------

export function resolveLookupSource(
  source: string | undefined | null,
  contextItemId: string | undefined,
  engine: Engine,
): LookupSourceResult {
  const trimmed = (source ?? '').trim();
  if (trimmed === '') return { items: [], resolved: true };

  // Bare-form `query:$linkableHomes` short-circuits the normal token-expansion
  // path because it resolves to MULTIPLE root items (one per site), not a
  // single substituted path. Mirrors SXA's `CrossSiteLinkingService.GetStartItems`.
  // The content tree only ever uses the bare form (14 fields surveyed); embedded
  // variants (e.g. `query:$linkableHomes/Foo`) are intentionally NOT special-
  // cased and fall through to the standard handler (which will fail to expand
  // the token and surface `unsupported tokens`).
  if (trimmed.toLowerCase() === 'query:$linkablehomes') {
    return { items: resolveLinkableHomes(contextItemId, engine), resolved: true };
  }

  // Bare `query:$siteMedia`: the Headless Site item declares its media-library
  // roots via the SitemapMediaItems multilist field; surface those items as
  // the lookup result so the picker can root the tree on them.
  if (trimmed.toLowerCase() === 'query:$sitemedia') {
    return { items: resolveSiteMedia(contextItemId, engine), resolved: true };
  }

  if (trimmed.toLowerCase().startsWith('query:')) {
    return resolveQuery(trimmed.slice(6), contextItemId, engine);
  }

  // datasource= / databasename= URL-encoded params (case-insensitive).
  // Detected by an `=` before the first `/` or `|`.
  const eqIdx = trimmed.indexOf('=');
  const slashIdx = trimmed.indexOf('/');
  const pipeIdx = trimmed.indexOf('|');
  const looksLikeParams =
    eqIdx > 0 &&
    (slashIdx < 0 || eqIdx < slashIdx) &&
    (pipeIdx < 0 || eqIdx < pipeIdx);
  if (looksLikeParams) {
    return resolveParameterised(trimmed, contextItemId, engine);
  }

  return resolvePipePaths(trimmed, contextItemId, engine);
}

// ---- form: pipe-separated paths ------------------------------------------

function resolvePipePaths(
  s: string,
  contextItemId: string | undefined,
  engine: Engine,
): LookupSourceResult {
  const segments = s.split('|').map(p => p.trim()).filter(Boolean);
  if (segments.length === 0) return { items: [], resolved: true };

  const items: LookupSourceItem[] = [];
  const seenIds = new Set<string>();
  for (const seg of segments) {
    const expanded = expandTokens(seg, contextItemId, engine);
    if (expanded === null) {
      return {
        items: [],
        resolved: false,
        reason: `unsupported tokens in source segment: ${seg}`,
      };
    }
    const node = lookupUnifiedItemByPath(engine, expanded);
    if (!node) continue;
    for (const child of getMergedChildren(node, engine)) {
      const childId = getId(child).toLowerCase();
      if (seenIds.has(childId)) continue;
      seenIds.add(childId);
      items.push(toLookupItem(child, engine));
    }
  }
  return { items: sortLookupItems(items, engine), resolved: true };
}

// ---- form: parameter-encoded sources -------------------------------------

function resolveParameterised(
  s: string,
  contextItemId: string | undefined,
  engine: Engine,
): LookupSourceResult {
  const params = parseParams(s);
  const ds = params.datasource;
  if (!ds) {
    return {
      items: [],
      resolved: false,
      reason: 'parameterised source missing datasource= key',
    };
  }
  // Database param is informational; mockingbird's tree+registry already merge
  // master/core where appropriate. Keep the param parsed for forward-compat.

  // Datasource may itself be a `query:` expression (the SXA convention for
  // Treelist-family fields, e.g. PartialDesigns: `DataSource=query:$partialDesigns&...`).
  // Recurse into the query handler rather than treating the whole value as a
  // literal path. The IncludeTemplatesForSelection / IncludeTemplatesForDisplay
  // params are filtering hints we currently ignore - phase-1 returns whatever
  // the datasource resolves to.
  if (ds.toLowerCase().startsWith('query:')) {
    return resolveQuery(ds.slice(6), contextItemId, engine);
  }

  // Datasource may be a path or a (braced) GUID.
  const node = lookupByPathOrId(ds, contextItemId, engine);
  if (!node) {
    return { items: [], resolved: false, reason: `datasource not found: ${ds}` };
  }
  const items: LookupSourceItem[] = [];
  const seenIds = new Set<string>();
  for (const child of getMergedChildren(node, engine)) {
    const childId = getId(child).toLowerCase();
    if (seenIds.has(childId)) continue;
    seenIds.add(childId);
    items.push(toLookupItem(child, engine));
  }
  return { items: sortLookupItems(items, engine), resolved: true };
}

function parseParams(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of s.split('&')) {
    const eq = pair.indexOf('=');
    if (eq < 0) continue;
    const key = pair.slice(0, eq).trim().toLowerCase();
    const value = decodeURIComponent(pair.slice(eq + 1).trim());
    if (key) out[key] = value;
  }
  return out;
}

// ---- form: query: <basePath>//*[@@templatename='X'] ----------------------

function resolveQuery(
  q: string,
  contextItemId: string | undefined,
  engine: Engine,
): LookupSourceResult {
  const trimmed = q.trim();

  // Bare path query: `query:$partialDesigns`, `query:/sitecore/templates/Project/X`.
  // Starts with `/` or an SXA `$token`, no XPath syntax (no `//`, `*`, `[`).
  // Sitecore's `ProcessQuerySource` ultimately enumerates the path's children
  // for the picker; `resolvePipePaths` does exactly that for a single path.
  // The leading-char gate excludes `query:fast:...` and other non-path query
  // forms so they still fall through to the unsupported-syntax error below.
  const looksLikeBarePath = (trimmed.startsWith('/') || trimmed.startsWith('$'))
    && !/\/\/|\*|\[/.test(trimmed);
  if (looksLikeBarePath) {
    return resolvePipePaths(trimmed, contextItemId, engine);
  }

  // Pattern 1: <basePath>//*[@@templatename='X']  (single predicate, descendant axis)
  const m = trimmed.match(
    /^(.+?)\/\/\*?\s*\[\s*@@templatename\s*=\s*['"]([^'"]+)['"]\s*\]\s*$/i,
  );
  if (m) {
    const basePathRaw = m[1].trim();
    const wantedTemplate = m[2].toLowerCase();

    const expanded = expandTokens(basePathRaw, contextItemId, engine);
    if (expanded === null) {
      return {
        items: [],
        resolved: false,
        reason: `unsupported tokens: ${basePathRaw}`,
      };
    }
    const baseNode = lookupUnifiedItemByPath(engine, expanded);
    if (!baseNode) {
      return { items: [], resolved: false, reason: `path not found: ${expanded}` };
    }

    const items: LookupSourceItem[] = [];
    const seenIds = new Set<string>();
    walkDescendants(baseNode, engine, (node) => {
      const tplName = getTemplateName(node, engine).toLowerCase();
      if (tplName !== wantedTemplate) return;
      const id = getId(node).toLowerCase();
      if (seenIds.has(id)) return;
      seenIds.add(id);
      items.push(toLookupItem(node, engine));
    });
    return { items: sortLookupItems(items, engine), resolved: true };
  }

  // Pattern 2: <basePath>/*[@@name='X']/*[@@templatename='Y']/...
  //   (multi-segment child-axis walk; SXA Tag Treelist convention)
  const childAxisResult = resolveChildAxisQuery(trimmed, contextItemId, engine);
  if (childAxisResult.resolved || childAxisResult.reason?.startsWith('path not found') ||
      childAxisResult.reason?.startsWith('unsupported tokens')) {
    return childAxisResult;
  }

  return {
    items: [],
    resolved: false,
    reason: `unsupported query syntax: ${trimmed.slice(0, 80)}`,
  };
}

// ---- form: query: child-axis multi-segment XPath -------------------------

/**
 * One predicate step in a child-axis query.
 * Mirrors Sitecore Query child-axis semantics: `/*[@@name='X']` selects
 * children of the current node where the item name equals X (case-insensitive).
 */
export interface ChildAxisStep {
  kind: 'name' | 'templatename';
  value: string; // lower-cased
}

/**
 * Parse a child-axis query string into its base path and predicate steps.
 *
 * Accepted forms:
 *   <basePath>/*[@@name='X']/*[@@templatename='Y']/*[@@name='Z']
 *   <basePath>/*[@@name='Data']/Tags/Months                       (mixed)
 *   <basePath>/Tags/*[@@templatename='Tag Folder']/Months         (mixed)
 *
 * - basePath may contain SXA tokens ($site, etc.) and literal path segments.
 *   It ends at the first `/*[`.
 * - Each step is either:
 *     `*[@@name='X']` / `*[@@templatename='Y']`  - predicate match
 *     `<literal-name>`                            - shorthand for @@name='<literal-name>'
 * - Any unrecognised predicate key, a `//` anywhere in the string, or an
 *   empty / pre-segment `/` causes a null return (caller falls through).
 *
 * Exported for unit-testing; not part of the public API surface.
 */
export function parseChildAxisQuery(
  q: string,
): { basePath: string; steps: ChildAxisStep[] } | null {
  // Reject descendant-axis queries - let the existing handler deal with them.
  if (q.includes('//')) return null;

  const firstPredicateIdx = q.search(/\/\*?\[/);
  if (firstPredicateIdx < 0) return null;
  const basePath = q.slice(0, firstPredicateIdx).trim();
  if (!basePath) return null;

  const rest = q.slice(firstPredicateIdx);
  const predicateRegex =
    /^\*?\[\s*@@(name|templatename)\s*=\s*(?:'([^']*)'|"([^"]*)")\s*\]/i;
  const steps: ChildAxisStep[] = [];
  let pos = 0;
  while (pos < rest.length) {
    if (rest[pos] !== '/') return null;
    pos++; // consume separator
    const tail = rest.slice(pos);
    const predMatch = predicateRegex.exec(tail);
    if (predMatch) {
      const kind = predMatch[1].toLowerCase() as 'name' | 'templatename';
      const value = (predMatch[2] ?? predMatch[3] ?? '').toLowerCase();
      steps.push({ kind, value });
      pos += predMatch[0].length;
      continue;
    }
    // Literal name segment: read up to next /, treat as @@name='<segment>'.
    const nextSlash = tail.indexOf('/');
    const segment = nextSlash < 0 ? tail : tail.slice(0, nextSlash);
    if (!segment) return null;
    // Reject anything that looks like an unsupported predicate fragment.
    if (/[*[\]]/.test(segment)) return null;
    steps.push({ kind: 'name', value: segment.toLowerCase() });
    pos += segment.length;
  }
  if (steps.length === 0) return null;
  return { basePath, steps };
}

function resolveChildAxisQuery(
  q: string,
  contextItemId: string | undefined,
  engine: Engine,
): LookupSourceResult {
  const parsed = parseChildAxisQuery(q.trim());
  if (!parsed) {
    // Signal "not this handler's problem" - caller will emit unsupported error.
    return { items: [], resolved: false };
  }

  const expanded = expandTokens(parsed.basePath, contextItemId, engine);
  if (expanded === null) {
    return {
      items: [],
      resolved: false,
      reason: `unsupported tokens: ${parsed.basePath}`,
    };
  }
  const baseNode = lookupUnifiedItemByPath(engine, expanded);
  if (!baseNode) {
    return { items: [], resolved: false, reason: `path not found: ${expanded}` };
  }

  // Walk each step: filter children by predicate.
  let level: UnifiedItem[] = [baseNode];
  for (const step of parsed.steps) {
    const next: UnifiedItem[] = [];
    for (const node of level) {
      for (const child of getMergedChildren(node, engine)) {
        const matches =
          step.kind === 'name'
            ? getName(child).toLowerCase() === step.value
            : getTemplateName(child, engine).toLowerCase() === step.value;
        if (matches) next.push(child);
      }
    }
    level = next;
    if (level.length === 0) break;
  }

  // Two conventions live in the content tree and Sitecore handles both:
  //   1. Source query targets a FOLDER (e.g. SectionTags points at
  //      $site/.../Sections, which is a Tag Folder containing the actual
  //      tags). Treelist shows the folder's children.
  //   2. Source query targets the LEAVES directly (e.g. MenuItemTags ends
  //      at /*[@@templatename='Menu Link Tag'] which matches each tag
  //      item). The matched items ARE the items to show.
  // Heuristic: if any matched item has children, return children
  // (Convention 1); otherwise return the matched items themselves
  // (Convention 2). Empirically matches both observed source shapes; a
  // pure-Sitecore port would require flag-bit knowledge from the source
  // attribute that mockingbird doesn't track.
  const childItems: LookupSourceItem[] = [];
  const seenChildIds = new Set<string>();
  for (const node of level) {
    for (const child of getMergedChildren(node, engine)) {
      const childId = getId(child).toLowerCase();
      if (seenChildIds.has(childId)) continue;
      seenChildIds.add(childId);
      childItems.push(toLookupItem(child, engine));
    }
  }
  if (childItems.length > 0) {
    return { items: sortLookupItems(childItems, engine), resolved: true };
  }
  const matchedItems: LookupSourceItem[] = [];
  const seenMatchedIds = new Set<string>();
  for (const node of level) {
    const id = getId(node).toLowerCase();
    if (seenMatchedIds.has(id)) continue;
    seenMatchedIds.add(id);
    matchedItems.push(toLookupItem(node, engine));
  }
  return { items: sortLookupItems(matchedItems, engine), resolved: true };
}

// ---- token expansion -----------------------------------------------------

/**
 * Expand SXA-style tokens in a path. Returns `null` if the path contains an
 * unknown `$word` or required ancestor (Site / Tenant) wasn't found.
 *
 * SXA tokens aren't in the Sitecore.Kernel decompile (they live in
 * `Sitecore.XA.Foundation.Multisite`). The values used here mirror the
 * documented SXA conventions and the actual paths in real SXA content:
 *   - $site           = nearest ancestor whose template name ends in "Site"
 *   - $tenant         = nearest ancestor whose template name ends in "Tenant"
 *   - $pageDesigns    = $site/Presentation/Page Designs
 *   - $partialDesigns = $site/Presentation/Partial Designs
 *   - $templates      = /sitecore/templates/Project/<tenant-name>
 *                       (tenant-scoped project templates; takes the tenant
 *                       ancestor's NAME, not its path - templates are
 *                       co-located by name under /sitecore/templates/Project/)
 *   - $siteSettings, $siteMedia, $home: composed off $site
 *
 * "Headless Site" / "Headless Tenant" templates are matched by the suffix rule.
 */
function expandTokens(
  path: string,
  contextItemId: string | undefined,
  engine: Engine,
): string | null {
  if (!path.includes('$')) return path;
  if (!contextItemId) return null;

  const ctx = lookupUnifiedItem(contextItemId.toLowerCase(), engine);
  if (!ctx) return null;

  const site = findAncestorByTemplateNameSuffix(ctx, 'site', engine);
  const tenant = findAncestorByTemplateNameSuffix(ctx, 'tenant', engine);
  const sitePath = site ? getPath(site) : undefined;
  const tenantPath = tenant ? getPath(tenant) : undefined;
  const tenantName = tenant ? getName(tenant) : undefined;

  // Order matters: longer tokens first so $siteSettings doesn't match $site.
  const replacements: [string, string | undefined][] = [
    ['$siteSettings', sitePath ? `${sitePath}/Settings` : undefined],
    ['$siteMedia', sitePath ? `${sitePath}/Media` : undefined],
    ['$siteContent', sitePath],
    ['$siteRoot', sitePath],
    ['$partialDesigns', sitePath ? `${sitePath}/Presentation/Partial Designs` : undefined],
    ['$pageDesigns', sitePath ? `${sitePath}/Presentation/Page Designs` : undefined],
    ['$templates', tenantName ? `/sitecore/templates/Project/${tenantName}` : undefined],
    ['$home', sitePath ? `${sitePath}/Home` : undefined],
    ['$site', sitePath],
    ['$tenant', tenantPath],
  ];

  let result = path;
  for (const [token, value] of replacements) {
    if (!result.includes(token)) continue;
    if (!value) return null;
    result = result.split(token).join(value);
  }

  // Any leftover $word means we don't recognise it.
  if (/\$[A-Za-z]/.test(result)) return null;
  return result;
}

// ---- $linkableHomes resolution -------------------------------------------

/**
 * Resolve the SXA `$linkableHomes` token to one home item per linkable site.
 * Ports `Sitecore.XA.Foundation.Multisite.Services.CrossSiteLinkingService`
 * (`CrossSiteLinkingService.cs:21-56`):
 *
 *   1. Read `_LinkSettings.LinkSettings` enum from the per-site Settings item
 *      (`MultisiteContext.GetSettingsItem(item).Fields[LinkSettings]`).
 *      Default to `AllLinkableSites` (the most-permissive mode) when the
 *      field is missing or unparseable - this matches mockingbird's
 *      "no friction, surface everything" stance for editors and avoids
 *      empty-dialog scenarios when corpora omit the field entirely.
 *   2. Branch on the enum:
 *        ItselfOnly             -> [currentSite.home]
 *        LinkableSitesInTenant  -> sites under tenant whose linkable=true,
 *                                  PLUS the current site (Sitecore allows the
 *                                  origin even when its checkbox is off)
 *        AllLinkableSites       -> sites with linkable=true PLUS the current site
 *   3. Map each site to its home item (`<rootPath>/<startItem>`).
 *
 * Returns an empty array (not null) when contextItemId is missing, when the
 * context item can't be located, or when the context item lives outside any
 * discovered site root (Sitecore returns no candidates in those cases too).
 */
function resolveLinkableHomes(
  contextItemId: string | undefined,
  engine: Engine,
): LookupSourceItem[] {
  if (!contextItemId) return [];
  const ctx = lookupUnifiedItem(contextItemId.toLowerCase(), engine);
  if (!ctx) return [];

  const sites = discoverSiteDefinitions(engine);
  if (sites.length === 0) return [];

  // Find the current site for the context item by matching ancestor path.
  // Mirrors `MultisiteContext.GetSiteItem` -> `_BaseSiteRoot` walk; we already
  // have the discovered SiteDefinitions so we walk path-prefix instead of
  // template-chain to avoid re-doing the per-item walk for every candidate.
  const ctxPath = getPath(ctx);
  const currentSite = findSiteForPath(ctxPath, sites);
  if (!currentSite) return [];

  const mode = readLinkSettingsMode(currentSite, engine);

  let resultSites: SiteDefinition[];
  switch (mode) {
    case 'ItselfOnly':
      resultSites = [currentSite];
      break;
    case 'LinkableSitesInTenant': {
      const tenant = findAncestorByTemplateNameSuffix(ctx, 'tenant', engine);
      const tenantPath = tenant ? getPath(tenant) : undefined;
      if (!tenantPath) {
        // No tenant ancestor - degrade to current-site-only rather than
        // returning nothing. Matches Sitecore's defensive posture (a missing
        // tenant ref would NRE in the C# branch but the safest UI behaviour
        // is to keep the editor working with at least the origin site).
        resultSites = [currentSite];
        break;
      }
      const tenantPrefix = tenantPath.toLowerCase() + '/';
      const filtered = sites.filter(s =>
        s.linkable && s.rootPath.toLowerCase().startsWith(tenantPrefix)
      );
      resultSites = ensureCurrentSiteIncluded(filtered, currentSite);
      break;
    }
    case 'AllLinkableSites':
    default: {
      const filtered = sites.filter(s => s.linkable);
      resultSites = ensureCurrentSiteIncluded(filtered, currentSite);
      break;
    }
  }

  // Map sites to home items. Use the existing `routeBaseForSite`
  // composition: `<rootPath>/<startItem>`, with `startItem === ''` collapsing
  // to `rootPath` (synthetic env-fallback shape).
  const items: LookupSourceItem[] = [];
  const seenIds = new Set<string>();
  for (const site of resultSites) {
    const homePath = site.startItem ? `${site.rootPath}/${site.startItem}` : site.rootPath;
    const homeNode = lookupUnifiedItemByPath(engine, homePath);
    if (!homeNode) continue;
    const id = getId(homeNode).toLowerCase();
    if (seenIds.has(id)) continue;
    seenIds.add(id);
    items.push(toLookupItem(homeNode, engine));
  }
  // Sitecore's `SetOrder` puts the current site first; we sort everything
  // alphabetically via `sortLookupItems` for consistency with other lookup
  // sources. The dialog is responsible for any "current site first" presentation.
  return sortLookupItems(items, engine);
}

/**
 * Resolve the bare `query:$siteMedia` form for Headless sites by reading the
 * `SiteMediaLibrary` field on the site item.
 *
 * Why this differs from the SXA-classic walk: SXA's `MultisiteContext.
 * GetSiteMediaItem` (`MultisiteContext.cs:96`) returns the first child of the
 * site item whose template inherits from the Media template. Headless sites
 * declare the media-library root explicitly via the `SiteMediaLibrary` field
 * instead, so the predicate has to read the field rather than walk children.
 * The content tree shape (`/sitecore/content/<tenant>/<site>` with the field set
 * on the site item itself, pointing at `/sitecore/media library/Project/
 * <tenant>/<site>`) confirms this.
 *
 * Returns an empty array when contextItemId is missing, when the context
 * lives outside any site ancestor, or when the field is empty / its
 * referenced item can't be resolved.
 */
function resolveSiteMedia(contextItemId: string | undefined, engine: Engine): LookupSourceItem[] {
  if (!contextItemId) return [];
  const ctx = lookupUnifiedItem(contextItemId.toLowerCase(), engine);
  if (!ctx) return [];

  const site = findAncestorByTemplateNameSuffix(ctx, 'site', engine);
  if (!site) return [];

  const raw = getSharedField(site, SITE_MEDIA_LIBRARY_FIELD_ID);
  const ids = parseGuidList(raw);
  if (ids.length === 0) return [];

  const items: LookupSourceItem[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    const node = lookupUnifiedItem(id, engine);
    if (!node) continue;
    items.push(toLookupItem(node, engine));
  }
  return sortLookupItems(items, engine);
}

function findSiteForPath(itemPath: string, sites: SiteDefinition[]): SiteDefinition | undefined {
  const lower = itemPath.toLowerCase();
  // Prefer the longest matching rootPath in case nested sites exist.
  let best: SiteDefinition | undefined;
  let bestLen = -1;
  for (const site of sites) {
    const root = site.rootPath.toLowerCase();
    if (lower === root || lower.startsWith(root + '/')) {
      if (root.length > bestLen) {
        best = site;
        bestLen = root.length;
      }
    }
  }
  return best;
}

function ensureCurrentSiteIncluded(
  sites: SiteDefinition[],
  current: SiteDefinition,
): SiteDefinition[] {
  if (sites.some(s => s.rootPath.toLowerCase() === current.rootPath.toLowerCase())) {
    return sites;
  }
  return [...sites, current];
}

type LinkSettingsMode = 'ItselfOnly' | 'LinkableSitesInTenant' | 'AllLinkableSites';

/**
 * Read the per-site Settings item's LinkSettings field. The settings item
 * lives at `<site>/Settings` per SXA convention (this is the same path the
 * `$siteSettings` token resolves to). Sitecore's enum-backed field stores
 * the integer index; tolerate the symbolic name too in case a content tree uses
 * the literal token. Default to `AllLinkableSites` when the field is missing,
 * empty, or unrecognised.
 */
function readLinkSettingsMode(site: SiteDefinition, engine: Engine): LinkSettingsMode {
  const settingsPath = `${site.rootPath}/Settings`;
  const settings = lookupUnifiedItemByPath(engine, settingsPath);
  if (!settings) return 'AllLinkableSites';
  const raw = getSharedField(settings, LINK_SETTINGS_FIELD_ID);
  if (raw === undefined) return 'AllLinkableSites';
  const v = raw.trim();
  if (v === '') return 'AllLinkableSites';
  if (v === '0' || v.toLowerCase() === 'itselfonly') return 'ItselfOnly';
  if (v === '1' || v.toLowerCase() === 'linkablesitesintenant') return 'LinkableSitesInTenant';
  if (v === '2' || v.toLowerCase() === 'alllinkablesites') return 'AllLinkableSites';
  return 'AllLinkableSites';
}

// ---- helpers --------------------------------------------------------------

function lookupByPathOrId(
  pathOrId: string,
  contextItemId: string | undefined,
  engine: Engine,
): UnifiedItem | undefined {
  const trimmed = pathOrId.trim();
  // Brace GUID: {abcd-...}
  const guidMatch = trimmed.match(/^\{([0-9a-f-]{36})\}$/i);
  if (guidMatch) {
    return lookupUnifiedItem(guidMatch[1].toLowerCase(), engine);
  }
  // Bare GUID
  if (/^[0-9a-f-]{36}$/i.test(trimmed)) {
    return lookupUnifiedItem(trimmed.toLowerCase(), engine);
  }
  const expanded = expandTokens(trimmed, contextItemId, engine);
  if (expanded === null) return undefined;
  return lookupUnifiedItemByPath(engine, expanded);
}

function getPath(item: UnifiedItem): string {
  return item.kind === 'node' ? item.value.item.path : item.value.path;
}

function getParentId(item: UnifiedItem): string | undefined {
  return item.kind === 'node' ? item.value.item.parent : item.value.parent;
}

function getTemplateName(item: UnifiedItem, engine: Engine): string {
  const tplId = getTemplate(item).toLowerCase();
  if (!tplId) return '';
  const tpl = lookupUnifiedItem(tplId, engine);
  if (!tpl) return '';
  return getName(tpl);
}

function findAncestorByTemplateNameSuffix(
  start: UnifiedItem,
  suffix: string,
  engine: Engine,
): UnifiedItem | undefined {
  const wanted = suffix.toLowerCase();
  let current: UnifiedItem | undefined = start;
  const seen = new Set<string>();
  for (let depth = 0; depth < 50 && current; depth++) {
    const id = getId(current).toLowerCase();
    if (seen.has(id)) break;
    seen.add(id);
    const tplName = getTemplateName(current, engine).toLowerCase();
    if (tplName.endsWith(wanted)) return current;
    const parentId = getParentId(current);
    if (!parentId) break;
    current = lookupUnifiedItem(parentId.toLowerCase(), engine);
  }
  return undefined;
}

/**
 * Pre-order DFS through descendants, calling `visit` on each. Cycle-safe via
 * a seen set; bounded to avoid runaway walks on pathological registries.
 */
function walkDescendants(
  start: UnifiedItem,
  engine: Engine,
  visit: (node: UnifiedItem) => void,
): void {
  const stack: UnifiedItem[] = [start];
  const seen = new Set<string>([getId(start).toLowerCase()]);
  let budget = 100_000;
  while (stack.length > 0 && budget-- > 0) {
    const node = stack.pop()!;
    if (node !== start) visit(node);
    for (const child of getMergedChildren(node, engine)) {
      const id = getId(child).toLowerCase();
      if (seen.has(id)) continue;
      seen.add(id);
      stack.push(child);
    }
  }
}

/**
 * Sort a `LookupSourceItem[]` by `__Sortorder` ascending (default 100),
 * with `displayName` case-insensitive as a tiebreaker - matching Sitecore's
 * native sibling ordering for flat lists where parentage is not available.
 *
 * For node-kind items the full SV cascade is applied via `readSortOrder`.
 * For registry-kind items the shared-field value is read directly (registry
 * items carry their own defaults and have no serialized SV chain).
 */
const SORT_DISPLAY_COLLATOR = new Intl.Collator('en', { sensitivity: 'base' });

function sortLookupItems(items: LookupSourceItem[], engine: Engine): LookupSourceItem[] {
  if (items.length <= 1) return items;
  return [...items].sort((a, b) => {
    const soA = readSortOrderForLookupItem(a.id, engine);
    const soB = readSortOrderForLookupItem(b.id, engine);
    const diff = soA - soB;
    if (diff !== 0) return diff;
    return SORT_DISPLAY_COLLATOR.compare(a.displayName || a.name, b.displayName || b.name);
  });
}

function readSortOrderForLookupItem(id: string, engine: Engine): number {
  const unified = lookupUnifiedItem(id.toLowerCase(), engine);
  if (!unified) return 100;
  if (unified.kind === 'node') {
    return readSortOrder(engine, unified.value.item);
  }
  // Registry item: read shared field directly.
  const raw = unified.value.sharedFields['ba3f86a2-4a1c-4d78-b63d-91c2779c1b5e'];
  if (!raw || raw === '') return 100;
  const n = parseInt(raw, 10);
  return Number.isNaN(n) ? 100 : n;
}

function toLookupItem(item: UnifiedItem, engine: Engine): LookupSourceItem {
  const id = getId(item);
  const name = getName(item);
  return {
    id,
    name,
    displayName: name,
    path: getPath(item),
    templateId: getTemplate(item),
    hasChildren: getMergedChildren(item, engine).length > 0,
  };
}
