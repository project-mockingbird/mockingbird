import type { Engine } from '../index.js';

/**
 * Sections defined by SXA SiteMetadata base templates (Sitemap settings,
 * robots, etc.) are not emitted by Edge — they're site-level configuration,
 * not per-item content. Identify them by the source template's path.
 *
 * Shared between `formatItemFields` (utils.ts) and `formatReferenceItem`
 * (field-formatter.ts) so both schema-walk loops apply the same filter.
 */
export function isSiteMetadataSection(sourceTemplateId: string, engine: Engine): boolean {
  const node = engine.getItemById(sourceTemplateId);
  const path = node ? node.item.path : engine.getRegistryItem(sourceTemplateId)?.path;
  if (!path) return false;
  return path.includes('/Foundation/Experience Accelerator/SiteMetadata/');
}
