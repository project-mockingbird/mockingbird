import type { Engine } from './index.js';
import type { ScsItem } from './types.js';
import { FIELD_IDS } from './constants.js';
import {
  readFieldWithSvFallback,
  synthesizeItemFromRegistry,
} from './layout/item-fields.js';

/**
 * Resolve the icon to display for an item, mirroring Sitecore's
 * `ItemAppearance.Icon` (`Sitecore.Data.Items.ItemAppearance`):
 *
 *   1. The item's own `__Icon` field (with its `__Standard Values` cascade).
 *   2. If empty, the item's TEMPLATE icon (`TemplateItem.Icon` ->
 *      `template.InnerItem.Appearance.Icon`) - i.e. the template-definition
 *      item's own `__Icon` (with the template's SV cascade). This is where the
 *      icon assigned to a template lives, and why every content item based on
 *      that template inherits it in the CE tree.
 *
 * Returns `undefined` when neither carries an icon (the caller falls back to a
 * generic default). The template lookup is a single level: no recursion up the
 * template's own template chain, which is sufficient for the authored case
 * (icon set directly on the template) and avoids walking to the Template
 * system template's default icon.
 */
export function resolveDisplayIcon(
  engine: Engine,
  item: ScsItem,
  language: string,
): string | undefined {
  const own = readFieldWithSvFallback(engine, item, FIELD_IDS.icon, language);
  if (own !== undefined && own !== '') return own;

  const templateId = item.template;
  // Guard the degenerate self-reference (an item that is its own template).
  if (!templateId || templateId.toLowerCase() === item.id.toLowerCase()) return undefined;
  return readTemplateIcon(engine, templateId, language);
}

/**
 * Read a template-definition item's own `__Icon` (with SV cascade), resolving
 * the template from the serialized tree first and the OOTB registry second.
 * Exported so the tree route can reuse it for registry-backed nodes without
 * re-synthesizing the item twice.
 */
export function readTemplateIcon(
  engine: Engine,
  templateId: string,
  language: string,
): string | undefined {
  const node = engine.getItemById(templateId);
  if (node) {
    return readFieldWithSvFallback(engine, node.item, FIELD_IDS.icon, language);
  }
  const reg = engine.getRegistryItem(templateId);
  if (!reg) return undefined;
  return readFieldWithSvFallback(engine, synthesizeItemFromRegistry(reg), FIELD_IDS.icon, language);
}
