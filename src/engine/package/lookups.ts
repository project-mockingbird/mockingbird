// src/engine/package/lookups.ts
//
// Small lookup helpers shared by the package emitter pipeline. Pulled out so
// the per-item emit loop in build-package.ts can compute `itemName` and
// `templateName` without duplicating the logic against the engine + registry
// boundary.

import type { Engine } from '../index.js';
import type { ScsItem } from '../types.js';

/**
 * Last segment of the item's sitecore path. Case-preserved.
 *
 * Used as the `<item name="..." />` attribute and as the input to
 * `xmlAttrEscape(itemName.toLowerCase())` for the `key` attribute by the
 * XML emitter.
 *
 * If the path contains no `/`, returns the path verbatim.
 */
export function resolveItemName(item: ScsItem): string {
  const slash = item.path.lastIndexOf('/');
  if (slash < 0) return item.path;
  return item.path.slice(slash + 1);
}

/**
 * Human-readable template name for the `<item template="..." />` attribute
 * on the item-version XML. Looks the template item up via the engine,
 * preferring the serialized tree (where the template would carry author-
 * intent edits) and falling back to the IAR registry for OOTB templates
 * the content tree does not redefine.
 *
 * Returns the template item's last-path-segment name. The XML emitter
 * lowercases this when writing the attribute, so case here is informational.
 *
 * Throws `Error("Template not found: {id}")` when neither the tree nor the
 * registry has the id - the build pipeline surfaces this as a per-item
 * `parse-failure` warning rather than aborting the whole package.
 */
export function resolveTemplateName(engine: Engine, templateId: string): string {
  const node = engine.getItemById(templateId);
  if (node) return resolveItemName(node.item);

  const registryItem = engine.getRegistryItem(templateId);
  if (registryItem) return registryItem.name;

  throw new Error(`Template not found: ${templateId}`);
}
