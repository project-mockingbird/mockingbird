import type { Engine } from '../index.js';
import { TEMPLATE_SECTION_TEMPLATE_ID, TEMPLATE_FIELD_TEMPLATE_ID } from '../constants.js';
import { walkBaseTemplates } from './template-walk.js';
import {
  getChildren,
  getTemplate,
  getId,
  getName,
  lookupUnifiedItem,
} from './unified-item.js';

/**
 * Per-engine hint→fieldId resolution cache. Keyed by engine (WeakMap) so
 * tests that build fresh engines get fresh caches automatically.
 * Inner map key: `${templateId.toLowerCase()}|${hintLower}`.
 * Value: resolved field ID (lowercase) or `null` for a cached miss.
 */
const hintResolutionCache = new WeakMap<Engine, Map<string, string | null>>();

function getHintCache(engine: Engine): Map<string, string | null> {
  let cache = hintResolutionCache.get(engine);
  if (!cache) {
    cache = new Map();
    hintResolutionCache.set(engine, cache);
  }
  return cache;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve a field definition's ID by its human-readable hint (name) on a
 * template, walking the template's section → field children. Mirrors
 * Sitecore's `Item.Fields["HintName"]` contract: the template's own field
 * definitions (not the item's serialized sharedFields) are the source of
 * truth for name→ID mapping.
 *
 * BFS over the template's base-template chain (most-derived first) via
 * {@link walkBaseTemplates}. Returns the first matching field's ID as a
 * lowercase GUID, or `undefined` when no field by that name exists.
 *
 * Results are cached per-engine (WeakMap) so repeated calls for the same
 * template + hint are O(1) after the first resolution.
 */
export function resolveFieldIdByHintOnTemplate(
  engine: Engine,
  templateId: string,
  hint: string,
): string | undefined {
  if (!templateId || !hint) return undefined;
  const hintLower = hint.toLowerCase();
  const cacheKey = `${templateId.toLowerCase()}|${hintLower}`;
  const cache = getHintCache(engine);

  if (cache.has(cacheKey)) {
    const v = cache.get(cacheKey);
    return v === null ? undefined : v;
  }

  let found: string | undefined;

  walkBaseTemplates(engine, templateId, (currentTemplateId) => {
    const tplNode = lookupUnifiedItem(currentTemplateId.toLowerCase(), engine);
    if (!tplNode) return;

    // Walk sections (children of the template filtered by TEMPLATE_SECTION_TEMPLATE_ID).
    for (const sectionUnified of getChildren(tplNode, engine)) {
      const sectionTpl = getTemplate(sectionUnified).toLowerCase();
      if (sectionTpl !== TEMPLATE_SECTION_TEMPLATE_ID) continue;

      // Walk fields (children of the section filtered by TEMPLATE_FIELD_TEMPLATE_ID).
      for (const fieldUnified of getChildren(sectionUnified, engine)) {
        const fieldTpl = getTemplate(fieldUnified).toLowerCase();
        if (fieldTpl !== TEMPLATE_FIELD_TEMPLATE_ID) continue;

        const fieldName = getName(fieldUnified);
        if (fieldName.toLowerCase() === hintLower) {
          found = getId(fieldUnified).toLowerCase();
          return true; // terminate walkBaseTemplates
        }
      }
    }
  });

  cache.set(cacheKey, found ?? null);
  return found;
}
