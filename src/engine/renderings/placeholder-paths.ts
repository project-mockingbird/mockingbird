/**
 * getPlaceholderPaths - per-page placeholder-path discovery.
 *
 * Combines three sources:
 *   1. In-XML: placeholder paths that are literally present as `s:ph` values
 *      on renderings inside the page's `__Final Renderings` field.
 *   2. Discovered: for each rendering, the declared child placeholder keys
 *      (via `getAllowedPlaceholders`) composed with the rendering's own
 *      placeholder path. Dynamic tokens in the key are substituted first
 *      (via `substituteDynamicPlaceholder`).
 *   3. Token-form: discovered paths where substitution left a token intact
 *      because `DynamicPlaceholderId` was absent. Marked `isTokenForm: true`.
 *
 * Path composition: `parent_s:ph + '/' + resolvedChildKey`
 *   (mirrors Sitecore's `FileUtil.MakePath` + `StringUtil.EnsurePrefix`
 *   from `DynamicPlaceholdersResolver.GetPlaceholderDefinitions`).
 *
 * Known limitation: SXA Accordion and other renderings that use custom
 * placeholder generators (e.g. `accordion-0-0-2`) are not produced by this
 * mechanism. Those paths only appear via the in-xml source.
 *
 * Ordering: in-xml (document order), then discovered sorted by value, then
 * token-form sorted by value.
 */

import type { Engine } from '../index.js';
import type { PlaceholderPath } from './types.js';
import type { RenderingEntry } from '../layout/types.js';
import { FINAL_RENDERINGS_FIELD_ID } from '../constants.js';
import { parseRenderingXml } from '../layout/rendering-xml.js';
import { getAllowedPlaceholders } from './allowed-placeholders.js';
import { substituteDynamicPlaceholder } from './dynamic-placeholders.js';
import { readVersionedField } from '../layout/item-fields.js';

/** Token detection: any remaining `{...}` in a resolved string means it is still a template. */
const HAS_TOKEN_RE = /[{}]/;

/**
 * Compose a parent placeholder path and a child key the same way Sitecore does
 * in `DynamicPlaceholdersResolver.GetPlaceholderDefinitions`:
 *   `EnsurePrefix('/', FileUtil.MakePath(parent, key, '/'))`
 *
 * - Strip trailing `/` from parent.
 * - Strip leading `/` from child.
 * - Ensure the result starts with `/` (EnsurePrefix).
 *
 * Note: in-xml `s:ph` paths are returned verbatim per Sitecore behavior.
 * This function is only applied to discovered paths.
 */
function joinPlaceholderPath(parent: string, child: string): string {
  const p = parent.endsWith('/') ? parent.slice(0, -1) : parent;
  const c = child.startsWith('/') ? child.slice(1) : child;
  const joined = p + '/' + c;
  return joined.startsWith('/') ? joined : '/' + joined;
}

/**
 * Return placeholder paths for a given page item.
 *
 * @param engine   - the engine instance with the loaded item tree
 * @param itemId   - the ID of the page item to inspect
 * @param language - the language version to read (default: 'en')
 * @returns PlaceholderPath[] in canonical order:
 *   in-xml (document order) then discovered (sorted) then token-form (sorted)
 *
 * Scope: this function reads only the page's OWN `__Final Renderings` field
 * (the versioned field on the item itself). It does NOT merge Page Design or
 * Partial Design renderings - that is the contract of `getCombinedRenderingEntries`
 * in `page-design.ts`. This is intentional: per the renderings-editor spec
 * ("Parked: Partial-design merge view"), v1 only shows and edits the page's own
 * renderings; partial-design renderings are not surfaced. A future cycle may
 * add a separate `getMergedPlaceholderPaths` if the spec extends to merged view.
 */
export function getPlaceholderPaths(
  engine: Engine,
  itemId: string,
  language: string = 'en',
): PlaceholderPath[] {
  // Step 1: look up the page item.
  const node = engine.getItemById(itemId);
  if (!node) return [];

  // Step 2: read __Final Renderings versioned field (highest version for language).
  const xml = readVersionedField(node.item, FINAL_RENDERINGS_FIELD_ID, language);
  if (!xml) return [];

  // Step 3: parse XML into RenderingEntry[] and discover paths over them.
  return discoverPlaceholderPaths(engine, parseRenderingXml(xml));
}

/**
 * Discover placeholder paths from an explicit RenderingEntry list (in-xml +
 * declared-child + token-form), independent of where the entries came from.
 * `getPlaceholderPaths` supplies the page's own `__Final Renderings` entries;
 * the composed-layout source supplies page + partial-design entries so the
 * editor can surface placeholders contributed by Page Designs.
 */
export function discoverPlaceholderPaths(
  engine: Engine,
  entries: RenderingEntry[],
): PlaceholderPath[] {
  if (entries.length === 0) return [];

  // In-xml paths - collect distinct placeholders in document order.
  const inXmlSet = new Set<string>();
  const inXmlPaths: PlaceholderPath[] = [];
  for (const entry of entries) {
    const ph = entry.placeholder;
    if (ph && !inXmlSet.has(ph)) {
      inXmlSet.add(ph);
      inXmlPaths.push({ value: ph, source: 'in-xml' });
    }
  }

  // Step 4b: discovered paths - for each rendering, resolve its declared child keys.
  const discoveredNormal: PlaceholderPath[] = [];
  const discoveredToken: PlaceholderPath[] = [];

  for (const entry of entries) {
    const parentPath = entry.placeholder;
    if (!parentPath) continue;

    const declaredKeys = getAllowedPlaceholders(engine, entry.renderingId);
    for (const template of declaredKeys) {
      const resolved = substituteDynamicPlaceholder(template, entry);
      const fullPath = joinPlaceholderPath(parentPath, resolved);

      // Skip if already present as an in-xml path.
      if (inXmlSet.has(fullPath)) continue;

      if (HAS_TOKEN_RE.test(resolved)) {
        discoveredToken.push({ value: fullPath, source: 'discovered', isTokenForm: true, ownerUid: entry.uid });
      } else {
        discoveredNormal.push({ value: fullPath, source: 'discovered', ownerUid: entry.uid });
      }
    }
  }

  // Deduplicate within discovered groups (same fullPath may arise from multiple
  // renderings at the same parent path with the same declared key). The first
  // contributor's ownerUid wins - this only matters in rare cases where two
  // renderings at the same parent path declare the same DPI-substituted key,
  // and the UI has no way to attribute the placeholder uniquely either way.
  const dedupedNormal = deduplicateByValue(discoveredNormal);
  const dedupedToken = deduplicateByValue(discoveredToken);

  // Step 5: order - in-xml (document), discovered (sorted), token-form (sorted).
  dedupedNormal.sort((a, b) => a.value.localeCompare(b.value, 'en'));
  dedupedToken.sort((a, b) => a.value.localeCompare(b.value, 'en'));

  return [...inXmlPaths, ...dedupedNormal, ...dedupedToken];
}

function deduplicateByValue(paths: PlaceholderPath[]): PlaceholderPath[] {
  const seen = new Set<string>();
  return paths.filter(p => {
    if (seen.has(p.value)) return false;
    seen.add(p.value);
    return true;
  });
}
