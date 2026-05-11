/**
 * Shared lookup primitives used by both actions.ts and tenant-templates.ts.
 * Extracted to avoid duplicating constants + resolveLookupKey across files.
 */
import type { Engine } from '../index.js';

/** __Base template field on a Sitecore Template item. */
export const BASE_TEMPLATE_FIELD_ID = '12c33f3f-86c5-43a5-aeb4-5598cec45116';

/** Name of the Standard Values child under a Template item. */
export const STANDARD_VALUES_NAME = '__Standard Values';

/**
 * Resolve a prototype id to its template-type GUID. Tree-first, registry
 * fallback (prototypes live in the registry on a fresh install). Mirrors the
 * SPE cmdlet's `$baseTemplate.InnerItem.Template.InnerItem.ID`.
 *
 * Returns the item's template id lowercased, or undefined if not found.
 */
export function resolveLookupKey(engine: Engine, prototypeId: string): string | undefined {
  if (!prototypeId) return undefined;
  const node = engine.getItemById(prototypeId);
  if (node) return node.item.template.toLowerCase();
  const reg = engine.getRegistryItem(prototypeId);
  if (reg) return reg.template.toLowerCase();
  return undefined;
}
