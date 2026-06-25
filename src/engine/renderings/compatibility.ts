/**
 * getCompatibleRenderings - ports Sitecore's GetAllowedRenderings processor.
 *
 * Reference: Sitecore.Kernel.decompiled.cs:271214-271299 (GetAllowedRenderings).
 *
 * Algorithm (faithful to the decompile, per Task 1 research):
 *   1. Extract the last segment of placeholderPath as the placeholder key.
 *   2. Walk all items under /sitecore/layout/placeholder settings to find one
 *      whose Placeholder Key field matches the key (literal match first).
 *   3. If found and Allowed Controls is non-empty: parse the multilist,
 *      resolve each GUID to a rendering item, return as RenderingMeta[].
 *   4. If Allowed Controls is empty (or no placeholder-settings item matches):
 *      enumerate all items under /sitecore/layout/renderings, return them.
 *   5. Sort by displayName ascending.
 */

import type { Engine } from '../index.js';
import { parseBraceGuids, PLACEHOLDER_KEY_FIELD_ID, FIELD_IDS } from '../constants.js';
import { formatGuidBraced } from '../guid.js';
import { readSharedField } from '../layout/item-fields.js';
import {
  getId,
  getName,
  getMergedChildren,
  lookupUnifiedItem,
  lookupUnifiedItemByPath,
  type UnifiedItem,
} from '../layout/unified-item.js';
import { declaresDynamicPlaceholders } from './allowed-placeholders.js';
import type { RenderingMeta } from './types.js';

/** Sitecore path root for all placeholder-settings items. */
const PLACEHOLDER_SETTINGS_ROOT = '/sitecore/layout/placeholder settings';

/** Sitecore path root for all rendering items. */
const RENDERINGS_ROOT = '/sitecore/layout/renderings';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Extract the last path segment from a Sitecore item path or placeholder path.
 * For `/headless-main/sxa-full-width-body/container-1` returns `container-1`.
 */
function lastSegment(path: string): string {
  const trimmed = path.replace(/\/$/, '');
  const idx = trimmed.lastIndexOf('/');
  return idx >= 0 ? trimmed.slice(idx + 1) : trimmed;
}

/**
 * Convert a UnifiedItem (serialized OR registry) to a RenderingMeta. Reads
 * fields via the registry-aware `readSharedField` so registry-only renderings
 * still surface their `__Display Name` / `__Icon`.
 *
 * Real Sitecore corpora have `/sitecore/layout/renderings` as registry-only
 * (~2400 items), so this is the path actually exercised in production.
 */
function toRenderingMetaFromUnified(u: UnifiedItem, engine: Engine): RenderingMeta {
  const id = getId(u);
  const name = getName(u);
  const path = u.kind === 'node' ? u.value.item.path : u.value.path;
  const template = u.kind === 'node' ? u.value.item.template : u.value.template;
  const storedDisplay = readSharedField(engine, id, FIELD_IDS.displayName);
  const displayName = storedDisplay && storedDisplay.trim() !== '' ? storedDisplay : name;
  const icon = readSharedField(engine, id, FIELD_IDS.icon);
  const sortorderRaw = readSharedField(engine, id, FIELD_IDS.sortorder);
  const meta: RenderingMeta = {
    id: formatGuidBraced(id),
    name,
    displayName,
    path,
    template: template.toLowerCase(),
    declaresDynamicPlaceholders: declaresDynamicPlaceholders(engine, id),
  };
  if (icon && icon.trim() !== '') meta.icon = icon;
  if (sortorderRaw && sortorderRaw.trim() !== '') {
    const n = Number(sortorderRaw);
    if (Number.isFinite(n)) meta.sortOrder = n;
  }
  return meta;
}

/**
 * Find a Placeholder Settings item whose Placeholder Key field matches
 * the given key (case-insensitive). Walks the merged tree+registry view -
 * Sitecore's runtime sees one unified tree; the registry/serialized split
 * is an implementation detail this layer abstracts over. Returns the first
 * match or undefined.
 *
 * Cycle-safe via a seen-set on lowercased ids; bounded by a generous step
 * budget (mirrors getAllRenderingItems below).
 */
function findPlaceholderSettingsItem(engine: Engine, key: string): UnifiedItem | undefined {
  const root = lookupUnifiedItemByPath(engine, PLACEHOLDER_SETTINGS_ROOT);
  if (!root) return undefined;

  const normalizedKey = key.toLowerCase();
  const seen = new Set<string>([getId(root).toLowerCase()]);
  const stack: UnifiedItem[] = [root];
  let budget = 100_000;
  while (stack.length > 0 && budget-- > 0) {
    const node = stack.pop()!;
    if (node !== root) {
      const fieldValue = readSharedField(engine, getId(node), PLACEHOLDER_KEY_FIELD_ID);
      if (fieldValue !== undefined && fieldValue.toLowerCase() === normalizedKey) {
        return node;
      }
    }
    for (const child of getMergedChildren(node, engine)) {
      const id = getId(child).toLowerCase();
      if (seen.has(id)) continue;
      seen.add(id);
      stack.push(child);
    }
  }
  return undefined;
}

/**
 * Enumerate every rendering item under /sitecore/layout/renderings via a
 * merged tree-and-registry walk. Used by the all-renderings fallback when
 * Allowed Controls is empty (or no placeholder-settings item matches).
 *
 * The walk uses {@link getMergedChildren} - the same pattern that
 * `lookup-sources.ts` exercises in production - so registry-only items
 * are visible. Sitecore's runtime sees one unified tree; mockingbird's
 * registry/serialized split is an implementation detail that this layer
 * abstracts over.
 *
 * The root container itself is excluded; only its descendants are returned.
 * Cycle-safe via a seen-set keyed on lowercased id; bounded by a generous
 * step budget to defend against pathological cycles.
 */
/**
 * Return every rendering item under `/sitecore/layout/Renderings` regardless
 * of placeholder compatibility. Equivalent to what `getCompatibleRenderings`
 * falls through to in Step 4 (no Placeholder Settings, or empty Allowed
 * Controls), exposed as a stand-alone helper so callers can opt out of the
 * Allowed Controls filter explicitly when they want the unfiltered set.
 */
export function getAllRenderings(engine: Engine): RenderingMeta[] {
  const seenIds = new Set<string>();
  const out: RenderingMeta[] = [];
  for (const u of getAllRenderingItems(engine)) {
    const id = getId(u).toLowerCase();
    if (seenIds.has(id)) continue;
    seenIds.add(id);
    out.push(toRenderingMetaFromUnified(u, engine));
  }
  return sortByDisplayName(out);
}

function getAllRenderingItems(engine: Engine): UnifiedItem[] {
  const root = lookupUnifiedItemByPath(engine, RENDERINGS_ROOT);
  if (!root) return [];

  const out: UnifiedItem[] = [];
  const seen = new Set<string>([getId(root).toLowerCase()]);
  const stack: UnifiedItem[] = [root];
  let budget = 100_000;
  while (stack.length > 0 && budget-- > 0) {
    const node = stack.pop()!;
    if (node !== root) out.push(node);
    for (const child of getMergedChildren(node, engine)) {
      const id = getId(child).toLowerCase();
      if (seen.has(id)) continue;
      seen.add(id);
      stack.push(child);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Sort helper
// ---------------------------------------------------------------------------

const COLLATOR = new Intl.Collator('en', { sensitivity: 'base' });

function sortByDisplayName(items: RenderingMeta[]): RenderingMeta[] {
  return [...items].sort((a, b) => COLLATOR.compare(a.displayName, b.displayName));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Return the set of renderings allowed in a given placeholder.
 *
 * Ports `GetAllowedRenderings` (Sitecore.Kernel.decompiled.cs:271214-271299).
 *
 * @param engine - the engine instance with the loaded item tree
 * @param placeholderPath - full placeholder path (e.g. `/headless-main/sxa-full-width-body/container-1`)
 * @param _pageItemId - page item ID (reserved for future use; not needed by the
 *   decompiled algorithm which uses only the placeholder key + the database tree)
 * @returns RenderingMeta[] sorted by displayName ascending
 */
export function getCompatibleRenderings(
  engine: Engine,
  placeholderPath: string,
  _pageItemId: string,
): RenderingMeta[] {
  // Step 1: extract the placeholder key (last segment of the path).
  const key = lastSegment(placeholderPath);

  // Step 2: find the Placeholder Settings item for this key.
  const settingsNode = findPlaceholderSettingsItem(engine, key);

  // Step 3: if found, read Allowed Controls.
  if (settingsNode) {
    const rawAllowedControls = readSharedField(engine, getId(settingsNode), FIELD_IDS.allowedControls);
    if (rawAllowedControls !== undefined && rawAllowedControls.trim() !== '') {
      // Parse the multilist - a block-scalar of brace-wrapped GUIDs.
      // Return whatever resolves (possibly empty). A non-empty Allowed Controls
      // field is an explicit constraint - returning all renderings when GUIDs
      // are dangling would mask data errors. Matches Sitecore's behavior:
      // GetAllowedRenderings returns only resolved items from the list.
      // Lookup is registry-aware via {@link lookupUnifiedItem} so Allowed
      // Controls entries pointing at registry-only renderings (the canonical
      // production shape) resolve correctly.
      const guids = parseBraceGuids(rawAllowedControls);
      const resolved: RenderingMeta[] = [];
      const seenIds = new Set<string>();
      for (const guid of guids) {
        const id = guid.toLowerCase();
        if (seenIds.has(id)) continue;
        seenIds.add(id);
        const unified = lookupUnifiedItem(id, engine);
        if (unified) {
          resolved.push(toRenderingMetaFromUnified(unified, engine));
        }
      }
      return sortByDisplayName(resolved);
    }
  }

  // Step 4: Allowed Controls is empty (or no settings item found) -
  // return all rendering items under the renderings root, walking BOTH
  // serialized and registry stores. Real Sitecore corpora have the
  // renderings subtree as registry-only (~2400 items, zero serialized),
  // so a serialized-only walk would return [].
  const seenIds = new Set<string>();
  const all: RenderingMeta[] = [];
  for (const u of getAllRenderingItems(engine)) {
    const id = getId(u).toLowerCase();
    if (seenIds.has(id)) continue;
    seenIds.add(id);
    all.push(toRenderingMetaFromUnified(u, engine));
  }
  return sortByDisplayName(all);
}
