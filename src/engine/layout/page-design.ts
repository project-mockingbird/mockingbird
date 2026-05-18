import type { Engine } from '../index.js';
import type { ScsItem, ItemNode, RegistryItem } from '../types.js';
import type { RenderingEntry } from './types.js';
import { parseGuidList } from '../guid.js';
import { parseRenderingXml } from './rendering-xml.js';
import { applyDefaultRulePersonalization } from './personalization.js';
import {
  readSharedField,
  readVersionedField,
  buildItemValueIndex,
  resolveFieldValue,
} from './item-fields.js';
import { FINAL_RENDERINGS_FIELD_ID } from '../constants.js';

export { readVersionedField };

/** Field ID of the per-item `Page Design` override (shared). */
export const PAGE_DESIGN_OVERRIDE_FIELD_ID = '24171bf1-c0e1-480e-be76-4c0a1876f916';

/** Field ID of `TemplatesMapping` on the Page Designs root node (shared). */
export const TEMPLATES_MAPPING_FIELD_ID = 'ba1f60d6-3deb-40cc-bb61-eec772279ee1';

/** Field ID of `PartialDesigns` on a Page Design item (shared). */
export const PARTIAL_DESIGNS_FIELD_ID = '0966b999-0d0e-4278-acc9-9da69d461fe6';

export { FINAL_RENDERINGS_FIELD_ID } from '../constants.js';

/** Field ID of `Signature` on a partial design item (shared). */
export const SIGNATURE_FIELD_ID = '55faae90-3bba-4f7f-96fe-13c3f40055ff';

/**
 * Field ID of `Base Partial Design` on a partial design item (shared).
 * SXA lets a partial inherit another partial's renderings: the derived
 * partial's `__Final Renderings` typically has NO top-level entries of
 * its own and instead targets placeholders inside the base partial's
 * `sxa-<signature>` wrapper directly (e.g. `Tutorial Body`'s entries
 * target `/headless-main/sxa-_tutorial-header/container-2`). Without
 * following this field the base partial's renderings - including its
 * wrapper - never land in the combined tree and derived entries get
 * orphaned under a placeholder nobody ever creates.
 */
export const BASE_PARTIAL_DESIGN_FIELD_ID = '76a92454-c8be-479b-b260-26aebced5a1a';

/** Rendering item ID of SXA/JSS `PartialDesign Dynamic Placeholder`. */
export const PARTIAL_DESIGN_DYNAMIC_PLACEHOLDER_RENDERING_ID =
  '57573af2-9d3c-4078-aab7-35e580e4823b';

/**
 * Decode a SXA `TemplatesMapping` field value into a Map from template ID
 * to page design ID. The value is double-URL-encoded in the form:
 *   %7b{tid1}%7d%3d%257B{did1}%257D%26%7b{tid2}%7d%3d%257B{did2}%257D...
 *
 * Fully decoded it becomes `{tid1}={did1}&{tid2}={did2}&...`.
 */
export function decodeTemplatesMapping(raw: string | undefined): Map<string, string> {
  const result = new Map<string, string>();
  if (!raw) return result;

  let decoded = raw;
  // The field is double-URL-encoded; decode twice, but tolerate single-encoded input.
  for (let i = 0; i < 2; i++) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      break;
    }
  }

  for (const pair of decoded.split('&')) {
    if (!pair) continue;
    const eqIdx = pair.indexOf('=');
    if (eqIdx === -1) continue;
    const rawKey = pair.slice(0, eqIdx).trim();
    const rawVal = pair.slice(eqIdx + 1).trim();
    const key = rawKey.replace(/^\{|\}$/g, '').toLowerCase();
    const val = rawVal.replace(/^\{|\}$/g, '').toLowerCase();
    if (key && val) result.set(key, val);
  }
  return result;
}

/**
 * Find the Page Designs node for a site given the site root path.
 *
 * Convention: the Presentation folder is a sibling of the site root (typically
 * `Home`), so the Page Designs node lives at:
 *   <parent-of-siteRoot>/Presentation/Page Designs
 */
export function findPageDesignsNode(
  siteRootPath: string,
  engine: Engine,
): ItemNode | undefined {
  if (!siteRootPath) return undefined;
  const lastSlash = siteRootPath.lastIndexOf('/');
  if (lastSlash < 0) return undefined;
  // lastSlash === 0 means siteRootPath is a top-level path like `/site`;
  // siteParent is the tree root so the Page Designs node lives at
  // `/Presentation/Page Designs` (no extra leading slash needed).
  const siteParent = lastSlash === 0 ? '' : siteRootPath.slice(0, lastSlash);
  return engine.getItemByPath(`${siteParent}/Presentation/Page Designs`);
}

/**
 * Resolve the Page Design that applies to an item. Port of XA's
 * `IPresentationContext.GetDesignItem(item)` as used by
 * `FlattenedPlaceholdersResolver.ExtractPlaceholders`
 * (`Sitecore.XA.Feature.LayoutServices.Integration.decompiled.cs:1082-1120`).
 *
 * Precedence (0.4.0.18):
 *   1. The item's OWN `Page Design` override shared field.
 *   2. Direct-template match on the Page Designs root `TemplatesMapping`
 *      field - item's concrete template only, no base-template walk.
 *   3. Content-tree ancestor walk for a `Page Design` override on any
 *      ancestor (first hit wins). Walk stops at `siteRootPath` - never
 *      crosses into `/sitecore/content/<tenant>` or above.
 *   4. Otherwise `undefined`.
 *
 * The ancestor-override step sits AFTER direct-template match. This matches
 * the observed Sitecore behavior: Event Page leaf items (template
 * `f9176b0e…`) are direct-mapped to the Education Event design; even though
 * their `/about/events` ancestor carries its own override pointing at the
 * Upcoming Events design, prod emits the Education design. The only route
 * to that outcome is direct-template match short-circuiting the ancestor
 * walk for descendants whose template is mapped.
 *
 * 0.4.0.17 had the opposite order (ancestor walk first) - which correctly
 * closed a class of container-template over-emissions (no direct mapping
 * + no ancestor override -> undefined) but regressed event-leaf pages by
 * silently inheriting an ancestor's override when the leaf's own direct-
 * template mapping should have won.
 *
 * The ancestor walk is still needed for folder items that have no direct
 * mapping but carry an override on an ancestor (e.g. Event Folder items
 * inheriting from an Event List Page that itself carries a Page Design
 * override).
 *
 * 0.4.0.16 and earlier walked the item's full `__Base template` chain for
 * the TemplatesMapping lookup, which over-matched: container-template
 * pages would inherit from a base that IS mapped to a default design.
 * 0.4.0.17 dropped the base walk; 0.4.0.18 retains that fix and just
 * reorders steps 2 and 3.
 */
export function resolvePageDesignId(
  item: ScsItem,
  engine: Engine,
  siteRootPath: string,
): string | undefined {
  // 1. Item's OWN Page Design override.
  const ownOverride = readPageDesignOverride(item);
  if (ownOverride) return ownOverride;

  // 2. Direct-template match on TemplatesMapping.
  const pageDesigns = findPageDesignsNode(siteRootPath, engine);
  const mappingRaw = pageDesigns?.item.sharedFields.find(
    f => f.id.toLowerCase() === TEMPLATES_MAPPING_FIELD_ID,
  )?.value;
  const mapping = decodeTemplatesMapping(mappingRaw);
  const directMatch = mapping.size > 0 ? mapping.get(item.template.toLowerCase()) : undefined;
  if (directMatch) return directMatch;

  // 3. Ancestor-chain Page Design override (parents only - own already checked).
  const visited = new Set<string>([item.id]);
  let cursor: ScsItem = item;
  while (cursor.path !== siteRootPath && cursor.parent) {
    const parentLookup: ItemNode | undefined = engine.getItemById(cursor.parent);
    if (!parentLookup) break;
    cursor = parentLookup.item;
    if (visited.has(cursor.id)) break;
    visited.add(cursor.id);

    const override = readPageDesignOverride(cursor);
    if (override) return override;

    if (cursor.path === siteRootPath) break;
  }

  return undefined;
}

/** Extract the Page Design override GUID from an item's shared fields. */
function readPageDesignOverride(item: ScsItem): string | undefined {
  const override = item.sharedFields.find(
    f => f.id.toLowerCase() === PAGE_DESIGN_OVERRIDE_FIELD_ID,
  );
  if (!override?.value) return undefined;
  const match = override.value.match(/\{([^}]+)\}/);
  return match ? match[1].toLowerCase() : undefined;
}

/** Cycle-guard depth for the Base Partial Design chain walker. */
const MAX_BASE_PARTIAL_DEPTH = 10;

/**
 * Read the `Base Partial Design` field value off a partial item. SXA stores
 * this as either a shared field OR a versioned field depending on how the
 * partial was authored - `_Tutorial Header` descendants (Tutorial Body,
 * Tutorial List Body) in the reference content set store it under the English
 * version 1 fields, not in `sharedFields`. Check both locations so the
 * base-chain walker doesn't silently produce an empty result.
 */
function readBasePartialDesign(
  partialId: string,
  engine: Engine,
  language: string,
): string | undefined {
  const shared = readSharedField(engine, partialId, BASE_PARTIAL_DESIGN_FIELD_ID);
  if (shared) return shared;
  const node = engine.getItemById(partialId);
  if (!node) return undefined;
  return readVersionedField(node.item, BASE_PARTIAL_DESIGN_FIELD_ID, language);
}

/**
 * Expand a list of partial design IDs into an effective, base-first order
 * by walking each partial's `Base Partial Design` chain depth-first and
 * emitting the deepest base before any derived partial. Each partial is
 * emitted at most once (first-hit wins) so cycles and repeated bases
 * don't duplicate entries. IDs are canonicalised to lowercase.
 */
function expandPartialsWithBaseChain(
  partialIds: string[],
  engine: Engine,
  language: string,
): string[] {
  const visited = new Set<string>();
  const result: string[] = [];
  const walk = (rawId: string, depth: number): void => {
    if (depth > MAX_BASE_PARTIAL_DEPTH) return;
    const id = rawId.toLowerCase();
    if (!id || visited.has(id)) return;
    visited.add(id);
    const baseValue = readBasePartialDesign(id, engine, language);
    for (const baseId of parseGuidList(baseValue)) {
      walk(baseId, depth + 1);
    }
    result.push(id);
  };
  for (const id of partialIds) walk(id, 0);
  return result;
}

/**
 * Given a Page Design item ID, read its `PartialDesigns` field and return
 * each partial's parsed rendering entries in order. Each partial's
 * `Base Partial Design` chain is expanded first so base-partial renderings
 * (including their `sxa-<signature>` wrappers) are emitted before any
 * derived partial that targets placeholders inside them. Missing or empty
 * partials contribute no entries.
 */
export function getPartialRenderingEntries(
  pageDesignId: string,
  engine: Engine,
  language: string,
): RenderingEntry[] {
  const pageDesign = engine.getItemById(pageDesignId);
  if (!pageDesign) return [];
  const partialsRaw = pageDesign.item.sharedFields.find(
    f => f.id.toLowerCase() === PARTIAL_DESIGNS_FIELD_ID,
  )?.value;
  const rawPartialIds = parseGuidList(partialsRaw);
  if (rawPartialIds.length === 0) return [];

  const partialIds = expandPartialsWithBaseChain(rawPartialIds, engine, language);

  const entries: RenderingEntry[] = [];
  for (const partialId of partialIds) {
    const partial = engine.getItemById(partialId);
    if (!partial) continue;
    const xml = readVersionedField(partial.item, FINAL_RENDERINGS_FIELD_ID, language);
    if (!xml) continue;

    // 0.4.0.9: apply default-rule personalization immediately after parse.
    // Sitecore's `InsertRenderings.Personalization` processor mutates
    // `RenderingReference.DataSource` in place - we mirror that.
    const rawParsed = parseRenderingXml(xml);
    applyDefaultRulePersonalization(rawParsed);
    const parsed = rawParsed.map(e => ({
      ...e,
      ownerItemPath: partial.item.path,
    }));
    if (parsed.length === 0) continue;

    const signature = readSharedField(engine, partialId, SIGNATURE_FIELD_ID);
    if (!signature) {
      entries.push(...parsed);
      continue;
    }

    entries.push(...wrapPartialWithSignature(partial.item.id, partial.item.path, signature, parsed));
  }
  return entries;
}

/**
 * Extract the normalized top-level placeholder name from an `s:ph` value, or
 * `null` if the value is nested (has further path segments beyond the first
 * segment). SXA has two conventions for top-level entries:
 *   • bare            - `"headless-main"`       (majority of partials)
 *   • leading-slash   - `"/headless-main"`      (Faq List Body, Legacy List Body)
 * Sitecore's runtime treats both equivalently. Both normalise to the same bare
 * name here so the wrapper-injection logic can recognise either convention.
 * Nested paths like `"/headless-main/container-1"` return `null`.
 */
function topLevelPlaceholderName(ph: string | undefined): string | null {
  if (!ph) return null;
  if (!ph.startsWith('/')) return ph;
  const rest = ph.slice(1);
  if (!rest || rest.includes('/')) return null;
  return rest;
}

/**
 * Inject a synthetic `PartialDesignDynamicPlaceholder` wrapper at the partial's
 * top-level placeholder and re-root every entry inside the wrapper's
 * `sxa-<signature>` placeholder.
 *
 * The top-level placeholder is taken from the first entry whose `placeholder`
 * is a top-level form - either bare (`"headless-main"`) or leading-slash with
 * no further path (`"/headless-main"`). Both are normalised to the same bare
 * name. If no such entry exists, the original entries are returned unchanged.
 */
function wrapPartialWithSignature(
  partialId: string,
  partialPath: string,
  signature: string,
  entries: RenderingEntry[],
): RenderingEntry[] {
  let topPh: string | null = null;
  for (const e of entries) {
    const name = topLevelPlaceholderName(e.placeholder);
    if (name) { topPh = name; break; }
  }
  if (!topPh) return entries;

  const sig = `sxa-${signature}`;
  const lowerId = partialId.toLowerCase();
  const bracedId = `{${partialId.toUpperCase()}}`;
  const nestedPrefix = `/${topPh}/`;
  const wrappedPrefix = `/${topPh}/${sig}/`;

  const wrapper: RenderingEntry = {
    uid: lowerId,
    renderingId: PARTIAL_DESIGN_DYNAMIC_PLACEHOLDER_RENDERING_ID,
    placeholder: topPh,
    dataSource: '',
    // `sid` remains in Edge's braced-uppercase form - it's a raw reference, not a uid.
    params: { sid: bracedId, ph: topPh, sig },
    ownerItemPath: partialPath,
  };

  const rewritten = entries.map(e => {
    if (topLevelPlaceholderName(e.placeholder) === topPh) {
      return { ...e, placeholder: `/${topPh}/${sig}` };
    }
    if (e.placeholder.startsWith(nestedPrefix)) {
      return { ...e, placeholder: wrappedPrefix + e.placeholder.slice(nestedPrefix.length) };
    }
    return e;
  });

  return [wrapper, ...rewritten];
}

/**
 * Get the combined rendering entries for an item, with SXA Page Design
 * composition applied: partial design renderings first, then the item's own
 * `__Final Renderings`.
 *
 * If a partial design at a given top-level placeholder was wrapped in a
 * `PartialDesignDynamicPlaceholder`, the page's own renderings targeting that
 * same top-level placeholder are rewritten to flow through the wrapper -
 * otherwise the page entries would reference `/headless-main/container-1/...`
 * directly and be orphaned since the `headless-main` slot is now occupied by
 * the synthetic wrapper.
 */
export function getCombinedRenderingEntries(
  item: ScsItem,
  engine: Engine,
  siteRootPath: string,
  language: string,
): RenderingEntry[] {
  // Sitecore's FlattenedPlaceholdersResolver.ExtractPlaceholders at
  // `Sitecore.XA.Feature.LayoutServices.Integration.decompiled.cs:1082-1120`
  // reads the route item's Layout XML via `new LayoutField(item).Value` -
  // the standard field accessor, which walks `__Standard Values` and base
  // templates transparently. There is NO "has own __Final Renderings" gate:
  // the resolver always parses the effective value and always calls
  // `LayoutXmlService.MergePartialDesignsRenderings` on top. A content page
  // whose own `__Final Renderings` is unset still gets a non-empty effective
  // Layout XML (via SV inheritance) plus partial-design overlay.
  //
  // 0.4.0.14 shipped a "skip when own XML missing" gate that turned out to
  // be a fundamental misread of the decompile - it wiped the rendering tree
  // on every content page whose layout came via Page Design + SV
  // inheritance (~80% of the reference content tree). 0.4.0.15 restores the literal
  // Sitecore contract: cascade-read, always merge partials.
  const index = buildItemValueIndex(item, language);
  const ownXml = resolveFieldValue(
    index,
    FINAL_RENDERINGS_FIELD_ID,
    '__Final Renderings',
    item,
    language,
    engine,
    siteRootPath,
  );

  const entries: RenderingEntry[] = [];

  const pageDesignId = resolvePageDesignId(item, engine, siteRootPath);
  if (pageDesignId) {
    entries.push(...getPartialRenderingEntries(pageDesignId, engine, language));
  }

  // Map of top-level placeholder → set of `sxa-<sig>` values for every
  // wrapper produced by the partial design stage. Real Page Designs (e.g.
  // Release) attach multiple wrappers to the same top-level slot, so we
  // need a Set per ph - last-wins on a single-string map silently orphaned
  // every page-own rendering whose `s:ph` already nested through a
  // non-final wrapper sig.
  const wrapperSigsByPh = new Map<string, Set<string>>();
  for (const e of entries) {
    if (e.renderingId === PARTIAL_DESIGN_DYNAMIC_PLACEHOLDER_RENDERING_ID) {
      const sig = e.params.sig;
      const ph = e.params.ph;
      if (!sig || !ph) continue;
      let bucket = wrapperSigsByPh.get(ph);
      if (!bucket) { bucket = new Set(); wrapperSigsByPh.set(ph, bucket); }
      bucket.add(sig);
    }
  }

  // When ownXml is undefined (neither own nor cascaded) or empty, there are
  // simply no own entries to merge - partials alone drive the route (matches
  // Sitecore's behavior when LayoutField.Value returns an empty default).
  if (ownXml) {
    const ownEntries = parseRenderingXml(ownXml);
    applyDefaultRulePersonalization(ownEntries);
    for (const entry of ownEntries) {
      const rewritten = rewriteThroughWrapper(entry, wrapperSigsByPh);
      entries.push({ ...rewritten, ownerItemPath: item.path });
    }
  }

  return entries;
}

/**
 * If `entry.placeholder` targets a top-level placeholder (or subpath) that is
 * owned by one or more wrappers, splice the appropriate `sxa-<sig>` segment
 * in after the top-level placeholder. When the path already nests through
 * any registered wrapper sig at that top level, leave it alone. When no
 * wrapper applies, return the entry unchanged. When multiple wrappers exist
 * and the path doesn't already select one, fall back to the first registered
 * sig (preserves single-wrapper behaviour for the common case).
 */
function rewriteThroughWrapper(
  entry: RenderingEntry,
  wrapperSigsByPh: Map<string, Set<string>>,
): RenderingEntry {
  const ph = entry.placeholder;
  if (!ph) return entry;

  if (!ph.startsWith('/')) {
    // Top-level entry - if a wrapper sits here, nest inside the first one.
    const sigs = wrapperSigsByPh.get(ph);
    if (!sigs || sigs.size === 0) return entry;
    const firstSig = sigs.values().next().value as string;
    return { ...entry, placeholder: `/${ph}/${firstSig}` };
  }

  // Nested entry - inspect the first segment.
  const slash2 = ph.indexOf('/', 1);
  const topSeg = slash2 === -1 ? ph.slice(1) : ph.slice(1, slash2);
  const sigs = wrapperSigsByPh.get(topSeg);
  if (!sigs || sigs.size === 0) return entry;
  const rest = slash2 === -1 ? '' : ph.slice(slash2);
  // If the author-time path already nests through ANY of the wrappers at
  // this top-level placeholder (e.g. SXA Edge emits `sxa-<sig>` as the
  // second segment for the wrapper the entry actually targets), leave it
  // alone - the path is already correct. Multi-wrapper Page Designs (e.g.
  // Release with 3 wrappers in `headless-main`) rely on this to stop a
  // page rendering whose path explicitly selects the middle wrapper from
  // being rerouted through the last-registered sig.
  for (const sig of sigs) {
    if (rest === `/${sig}` || rest.startsWith(`/${sig}/`)) return entry;
  }
  // Otherwise nest through the first wrapper (preserves the single-wrapper
  // behaviour the existing tests cover).
  const firstSig = sigs.values().next().value as string;
  return { ...entry, placeholder: `/${topSeg}/${firstSig}${rest}` };
}
