import type { Engine } from '../index.js';
import {
  lookupUnifiedItem, lookupUnifiedItemByPath, getMergedChildren, getId, getName,
} from '../layout/unified-item.js';
import { readSharedField } from '../layout/item-fields.js';
import { formatGuidBraced, parseGuidList } from '../guid.js';

const COMPATIBLE_RENDERINGS_FIELD_ID = '087c0553-9162-41f5-98d3-87eb0d80edbb';

export interface VariantOption {
  id: string;          // braced uppercase GUID
  name: string;        // raw item name
  displayName: string; // localized display name (falls back to name)
  folderName: string;  // human-readable parent folder name
  isShared: boolean;   // true if from <commonRoot>/Presentation/Headless Variants/
}

export interface VariantsResult {
  variants: VariantOption[];
}

/**
 * Walk a single `<rootPath>/Presentation/Headless Variants/` tree and collect
 * variants from folders whose Compatible Renderings includes renderingId (or
 * whose name matches renderingName as the fallback). Returns an empty array
 * when the Headless Variants folder doesn't exist under rootPath.
 */
function collectFromRoot(
  engine: Engine,
  rootPath: string,
  normalizedRenderingId: string,
  renderingName: string,
  isShared: boolean,
): VariantOption[] {
  const root = lookupUnifiedItemByPath(engine, `${rootPath}/Presentation/Headless Variants`);
  if (!root) return [];

  const variants: VariantOption[] = [];

  for (const folder of getMergedChildren(root, engine)) {
    const folderId = getId(folder);
    const compatRaw = readSharedField(engine, folderId, COMPATIBLE_RENDERINGS_FIELD_ID);
    const compatIds = compatRaw ? parseGuidList(compatRaw) : []; // already normalized lowercase no-braces
    const folderName = getName(folder);
    const isCompatible = compatIds.length > 0
      ? compatIds.includes(normalizedRenderingId)
      : folderName.toLowerCase() === renderingName;
    if (!isCompatible) continue;

    for (const variant of getMergedChildren(folder, engine)) {
      const id = getId(variant);
      const name = getName(variant);
      variants.push({
        id: formatGuidBraced(id),
        name,
        displayName: name,
        folderName,
        isShared,
      });
    }
  }

  return variants;
}

/**
 * Walk both `<commonRootPath>/Presentation/Headless Variants/` and
 * `<siteRootPath>/Presentation/Headless Variants/` and return variants from
 * any child folder whose `Compatible Renderings` multilist contains
 * `renderingId`. When Compatible Renderings is empty, fall back to a
 * folder-name match against the rendering's name (case-insensitive) per
 * standard Sitecore SXA convention.
 *
 * Variants from the common root have isShared=true; site variants have
 * isShared=false. Returns an empty list when neither Headless Variants folder
 * exists.
 */
export function resolveVariantsForRendering(
  engine: Engine,
  siteRootPath: string,
  commonRootPath: string,
  renderingId: string,
): VariantsResult {
  const normalizedRenderingId = renderingId.toLowerCase().replace(/[{}]/g, '');
  const renderingItem = lookupUnifiedItem(renderingId, engine);
  const renderingName = renderingItem ? getName(renderingItem).toLowerCase() : '';

  const variants: VariantOption[] = [
    ...collectFromRoot(engine, commonRootPath, normalizedRenderingId, renderingName, true),
    ...collectFromRoot(engine, siteRootPath, normalizedRenderingId, renderingName, false),
  ];

  return { variants };
}
