import type { Engine } from '../index.js';
import type { ItemNode, ScsItem } from '../types.js';
import { readSharedFieldOnItem, readVersionedField } from './item-fields.js';
import { templateInheritsFrom, templateDescendsFromOrEquals, getDirectBaseTemplateIds } from './template-walk.js';
import { parseGuidList } from '../guid.js';
import {
  BASE_TENANT_TEMPLATE_ID,
  BASE_SETTINGS_TEMPLATE_ID,
  BASE_SITE_ROOT_TEMPLATE_ID,
  BASE_SXA_STANDARD_VALUES_FOLDER_TEMPLATE_ID,
  PER_SITE_STANDARD_VALUES_TEMPLATE_ID,
  SHARED_SITES_FIELD_ID,
} from '../constants.js';

/**
 * Per-engine SCT resolution cache. Keyed by engine (WeakMap) so tests that
 * build fresh engines automatically get fresh caches. Inner map keyed by
 * `${templateId}|${siteRootPath}` stores the resolved SCT (or `null` for a
 * cached miss). Mirrors Sitecore's (database, siteID, templateID)
 * `DictionaryCache` — language dimension omitted because mockingbird's
 * field-read helpers thread language at read time, not at resolution time.
 */
const sctResolutionCache = new WeakMap<Engine, Map<string, ScsItem | null>>();
const tenantChainCache = new WeakMap<Engine, Map<string, string[]>>();

function getSctCache(engine: Engine): Map<string, ScsItem | null> {
  let cache = sctResolutionCache.get(engine);
  if (!cache) {
    cache = new Map();
    sctResolutionCache.set(engine, cache);
  }
  return cache;
}

function getTenantChainCache(engine: Engine): Map<string, string[]> {
  let cache = tenantChainCache.get(engine);
  if (!cache) {
    cache = new Map();
    tenantChainCache.set(engine, cache);
  }
  return cache;
}

/**
 * Test-only: marker export so tests can import it and signal intent to
 * use a fresh cache state. WeakMap entries are not iterable, so actual
 * cache invalidation relies on tests building fresh Engine instances
 * (each `buildSctFixture()` call creates one). This is a no-op; its
 * only purpose is test-readability.
 */
export function __resetSctCachesForTest(): void {
  // No-op. Tests build fresh engines via `buildSctFixture()`, which
  // creates new WeakMap entries. Old entries are GC'd when their engines
  // go out of scope.
}

/**
 * Walk the tree upward from `descendantPath` looking for the first ancestor
 * whose template transitively inherits from (or equals) `ancestorTemplateId`.
 * Returns the ancestor's `ScsItem` or `undefined` if no such ancestor exists.
 *
 * Mirrors Sitecore's `item.GetParentOfTemplate(templateID)` used throughout
 * `MultisiteContext` (`GetSiteItem`, `GetTenantItem`).
 */
export function findAncestorOfTemplate(
  engine: Engine,
  descendantPath: string,
  ancestorTemplateId: string,
): ScsItem | undefined {
  if (!descendantPath || !ancestorTemplateId) return undefined;
  const start = engine.getItemByPath(descendantPath);
  if (!start) return undefined;
  // Walk up from the start's parent. Sitecore's GetParentOfTemplate does
  // not return the item itself — only ancestors.
  let node: ItemNode | null = start.parentNode;
  const targetLower = ancestorTemplateId.toLowerCase();
  while (node) {
    if (node.item.template.toLowerCase() === targetLower) return node.item;
    if (templateInheritsFrom(engine, node.item.template, ancestorTemplateId)) {
      return node.item;
    }
    node = node.parentNode;
  }
  return undefined;
}

/**
 * Resolve the tenant for a given site root path, read its `SharedSites`
 * multilist, and return the paths of sibling site roots — excluding the
 * current site. Mirrors Sitecore's
 * `SharedSitesContext.GetSharedSitesWithoutCurrent`.
 *
 * Returns empty array when the tenant is not locatable, the SharedSites
 * field is absent, or no referenced sites resolve.
 */
export function getTenantSharedSiteRoots(engine: Engine, siteRootPath: string): string[] {
  if (!siteRootPath) return [];
  const cache = getTenantChainCache(engine);
  const cacheKey = siteRootPath.toLowerCase();
  if (cache.has(cacheKey)) return cache.get(cacheKey)!;

  const tenant = findAncestorOfTemplate(engine, siteRootPath, BASE_TENANT_TEMPLATE_ID);
  if (!tenant) {
    cache.set(cacheKey, []);
    return [];
  }
  const raw = readSharedFieldOnItem(tenant, SHARED_SITES_FIELD_ID);
  if (!raw) {
    cache.set(cacheKey, []);
    return [];
  }
  const currentLower = siteRootPath.toLowerCase();
  const paths: string[] = [];
  for (const id of parseGuidList(raw)) {
    const node = engine.getItemById(id);
    if (!node) continue;
    if (node.item.path.toLowerCase() === currentLower) continue;
    paths.push(node.item.path);
  }
  cache.set(cacheKey, paths);
  return paths;
}

/**
 * Locate a site's SCT folder via template-inheritance lookup. Mirrors
 * Sitecore's `MultisiteContext.GetSettingsItem(siteItem).FirstChildInheritingFrom(_BaseSXAStandardValuesFolder)`.
 *
 * Returns the SCT folder's ItemNode, or `undefined` if either the Settings
 * folder or its SCT-folder child is missing. Path-agnostic — `common` site
 * may use differently-named folders; inheritance lookup handles that.
 */
export function locateSctFolder(engine: Engine, siteRootPath: string): ItemNode | undefined {
  if (!siteRootPath) return undefined;
  const start = engine.getItemByPath(siteRootPath);
  if (!start) return undefined;
  // The input `siteRootPath` may point at the true SXA site root (e.g.
  // `/sitecore/content/tenant/site`) OR at the JSS start item nested below it
  // (e.g. `/sitecore/content/tenant/site/Home`) — JSS apps often set
  // `SITE_ROOT_PATH` to the start item so URL-prefix-stripping works against
  // route paths like `/about/...`. Settings always lives as a direct child of
  // the SXA site root, so walk up first to find the real `_BaseSiteRoot`
  // ancestor. Mirrors Sitecore's `MultisiteContext.GetSiteItem(item)`.
  const site = resolveRealSiteRoot(engine, start);
  if (!site) return undefined;
  const settings = firstChildInheritingFrom(engine, site, BASE_SETTINGS_TEMPLATE_ID);
  if (!settings) return undefined;
  return firstChildInheritingFrom(engine, settings, BASE_SXA_STANDARD_VALUES_FOLDER_TEMPLATE_ID);
}

/**
 * Walk from `start` upward (and inclusively) to find the first item whose
 * own template transitively inherits from (or equals) `_BaseSiteRoot`.
 * Returns `undefined` if no such ancestor exists — caller treats that as an
 * SCT-miss and falls through to the classic cascade.
 */
function resolveRealSiteRoot(engine: Engine, start: ItemNode): ItemNode | undefined {
  let node: ItemNode | null = start;
  while (node) {
    if (node.item.template.toLowerCase() === BASE_SITE_ROOT_TEMPLATE_ID.toLowerCase()) return node;
    if (templateInheritsFrom(engine, node.item.template, BASE_SITE_ROOT_TEMPLATE_ID)) return node;
    node = node.parentNode;
  }
  return undefined;
}

/**
 * First child of `parent` whose template transitively inherits from (or
 * equals) `ancestorTemplateId`. Mirrors Sitecore's
 * `Item.FirstChildInheritingFrom(templateID)` extension.
 */
function firstChildInheritingFrom(
  engine: Engine,
  parent: ItemNode,
  ancestorTemplateId: string,
): ItemNode | undefined {
  const targetLower = ancestorTemplateId.toLowerCase();
  for (const child of parent.children.values()) {
    if (child.item.template.toLowerCase() === targetLower) return child;
    if (templateInheritsFrom(engine, child.item.template, ancestorTemplateId)) return child;
  }
  return undefined;
}

/**
 * Resolve the SCT item for `subjectTemplateId` within a single site.
 * Mirrors Sitecore's `StandardValuesService.Resolve(siteItem, TemplateID)`.
 *
 * Steps:
 *  1. Locate SCT folder via template-inheritance.
 *  2. Walk descendants, filter by `_PerSiteStandardValues` inheritance AND
 *     `subjectTemplate.DescendsFromOrEquals(sct.template)`. Exact matches
 *     short-circuit.
 *  3. On no exact match: return undefined if subject template has its own
 *     classic `__Standard Values` (tree or registry). Otherwise walk
 *     subject's direct base-template IDs in declaration order; first
 *     matching SCT in the candidate map wins.
 *
 * Returns `undefined` for no match. Post-Resolve URI gate (self-reference
 * skip) is applied by the caller, not here.
 */
export function resolveSctForTemplateInSite(
  engine: Engine,
  siteRootPath: string,
  subjectTemplateId: string,
): ScsItem | undefined {
  const cache = getSctCache(engine);
  const cacheKey = `${subjectTemplateId.toLowerCase()}|${siteRootPath.toLowerCase()}`;
  if (cache.has(cacheKey)) {
    const cached = cache.get(cacheKey);
    return cached === null ? undefined : cached!;
  }

  const folder = locateSctFolder(engine, siteRootPath);
  if (!folder) {
    cache.set(cacheKey, null);
    return undefined;
  }

  const subjectLower = subjectTemplateId.toLowerCase();
  const candidates = new Map<string, ScsItem>();
  let exact: ScsItem | undefined;

  walkDescendants(folder, (node) => {
    const sctTplId = node.item.template.toLowerCase();
    if (!templateInheritsFrom(engine, sctTplId, PER_SITE_STANDARD_VALUES_TEMPLATE_ID)) return;
    if (!templateDescendsFromOrEquals(engine, subjectTemplateId, sctTplId)) return;
    if (sctTplId === subjectLower) {
      exact = node.item;
      return true; // terminate walk — exact match wins
    }
    candidates.set(sctTplId, node.item);
  });

  if (exact) {
    cache.set(cacheKey, exact);
    return exact;
  }
  if (candidates.size === 0) {
    cache.set(cacheKey, null);
    return undefined;
  }

  // Classic-SV suppression — matches Sitecore's StandardValueHolderId check.
  if (subjectTemplateHasClassicSV(engine, subjectTemplateId)) {
    cache.set(cacheKey, null);
    return undefined;
  }

  for (const baseId of getDirectBaseTemplateIds(engine, subjectTemplateId)) {
    const hit = candidates.get(baseId.toLowerCase());
    if (hit) {
      cache.set(cacheKey, hit);
      return hit;
    }
  }
  cache.set(cacheKey, null);
  return undefined;
}

/**
 * DFS walker across a folder's descendants. Visitor returning `true`
 * terminates the walk (for short-circuit on exact SCT match).
 */
function walkDescendants(
  root: ItemNode,
  visit: (node: ItemNode) => boolean | void,
): void {
  const stack: ItemNode[] = [...root.children.values()];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (visit(node) === true) return;
    for (const child of node.children.values()) stack.push(child);
  }
}

/**
 * True if the subject template has its own classic `__Standard Values`
 * (either a serialized child item named `__Standard Values` or a registry
 * entry of the same form). Mirrors Sitecore's
 * `template.StandardValueHolderId != null && database.GetItem(that) != null`.
 */
function subjectTemplateHasClassicSV(engine: Engine, templateId: string): boolean {
  const tplLower = templateId.toLowerCase();
  const treeNode = engine.getItemById(tplLower);
  if (treeNode) {
    for (const child of treeNode.children.values()) {
      const name = child.item.path.split('/').pop();
      if (name === '__Standard Values') return true;
    }
  }
  const regChildren = engine.getRegistryChildren(tplLower);
  for (const reg of regChildren) {
    if (reg.name === '__Standard Values') return true;
  }
  return false;
}

/**
 * Main entry. Resolve an SCT-provided field value for `subjectItem`.
 * Mirrors Sitecore's `GetStandardValue.Process` + `StandardValuesService.GetStandardValuesItem`:
 *
 *   1. Subject-template opt-in gate (`_PerSiteStandardValues` inheritance).
 *   2. Site chain: current site first, then shared sites (tenant's SharedSites field).
 *   3. Per-site `resolveSctForTemplateInSite` — exact match, then base-template
 *      fallback with classic-SV suppression.
 *   4. Post-Resolve self-reference gate: if resolved SCT IS the subject item, skip.
 *   5. Read SCT field value (shared then versioned en/v1-or-latest).
 *   6. Empty/whitespace → miss; try next site; ultimately `undefined` (caller
 *      falls through to classic SV cascade).
 *
 * SCT values are NOT passed through `expandItemTokens` — Sitecore stores
 * expanded literals at SCT-item creation time via `ExpandInitialFieldValue`.
 */
export function readFieldViaSctOverride(
  engine: Engine,
  subjectItem: ScsItem,
  fieldId: string,
  language: string,
  siteRootPath: string,
): string | undefined {
  if (!siteRootPath) return undefined;
  if (!subjectItem.template) return undefined;
  // Step 1: subject-template opt-in gate.
  if (!templateInheritsFrom(engine, subjectItem.template, PER_SITE_STANDARD_VALUES_TEMPLATE_ID)) {
    return undefined;
  }

  // Step 2: build site chain — current first, shared sites after.
  const sharedSites = getTenantSharedSiteRoots(engine, siteRootPath);
  const chain = [siteRootPath, ...sharedSites];

  // Step 3–5: iterate chain, return first non-empty hit.
  for (const thisSiteRoot of chain) {
    const sct = resolveSctForTemplateInSite(engine, thisSiteRoot, subjectItem.template);
    if (!sct) continue;
    // Self-reference gate — post-Resolve per Sitecore contract.
    if (sct.id.toLowerCase() === subjectItem.id.toLowerCase()) continue;
    // Read field value (shared → versioned).
    const shared = readSharedFieldOnItem(sct, fieldId);
    if (shared !== undefined && shared.trim() !== '') return shared;
    const versioned = readVersionedField(sct, fieldId, language);
    if (versioned !== undefined && versioned.trim() !== '') return versioned;
    // SCT hit but value empty/whitespace — Sitecore semantic: do NOT abort
    // pipeline. Continue to next site (or classic cascade if chain exhausts).
  }
  return undefined;
}
