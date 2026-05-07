import type { Engine } from '../index.js';
import {
  lookupUnifiedItemByPath, getMergedChildren, getId, getName, type UnifiedItem,
} from '../layout/unified-item.js';
import { readSharedField } from '../layout/item-fields.js';
import { formatGuidBraced, parseGuidList } from '../guid.js';
import { sortOrderOf } from './_sort.js';

const VALUE_FIELD_ID = '09147fb2-ebfb-4949-8c8e-26a424409d5e';
const ALLOWED_RENDERINGS_FIELD_ID = '69bb49f3-da64-4b0e-abd6-184b832ff6ab';

export interface StyleOption {
  id: string;
  displayName: string;
  cssValue: string;
}

export interface StyleCategory {
  name: string;
  isShared: boolean;
  styles: StyleOption[];
}

export interface StyleOptionsResult {
  categories: StyleCategory[];
}

interface RawCategory {
  name: string;
  styles: StyleOption[];
  isShared: boolean;
}

function collectStylesRecursive(
  engine: Engine,
  node: UnifiedItem,
  normalizedRenderingId: string,
  acc: StyleOption[],
): void {
  const sortedChildren = [...getMergedChildren(node, engine)].sort((a, b) => {
    const sa = sortOrderOf(engine, getId(a));
    const sb = sortOrderOf(engine, getId(b));
    if (sa !== sb) return sa - sb;
    return getName(a).localeCompare(getName(b));
  });
  for (const child of sortedChildren) {
    const childId = getId(child);
    const valueRaw = readSharedField(engine, childId, VALUE_FIELD_ID);
    // SXA Style items are identified by a non-empty Value field rather than strict
    // template-ID equality (cf. Sitecore.XA.Foundation.Presentation.Styles.StylesProvider).
    // Tolerates template inheritance + naturally treats Value-less descendants as
    // recursable sub-folders.
    if (valueRaw && valueRaw.trim() !== '') {
      const allowedRaw = readSharedField(engine, childId, ALLOWED_RENDERINGS_FIELD_ID);
      const allowedIds = allowedRaw ? parseGuidList(allowedRaw) : [];
      const isPermissive = allowedIds.length === 0;
      if (!isPermissive && !allowedIds.includes(normalizedRenderingId)) continue;
      acc.push({
        id: formatGuidBraced(childId),
        displayName: getName(child),
        cssValue: valueRaw,
      });
    } else {
      collectStylesRecursive(engine, child, normalizedRenderingId, acc);
    }
  }
}

function collectFromRoot(
  engine: Engine,
  rootPath: string,
  renderingId: string,
  isShared: boolean,
): RawCategory[] {
  const stylesRoot = lookupUnifiedItemByPath(engine, `${rootPath}/Presentation/Styles`);
  if (!stylesRoot) return [];

  const normalizedRenderingId = renderingId.toLowerCase().replace(/[{}]/g, '');
  const out: RawCategory[] = [];

  const sortedCategories = [...getMergedChildren(stylesRoot, engine)].sort((a, b) => {
    const sa = sortOrderOf(engine, getId(a));
    const sb = sortOrderOf(engine, getId(b));
    if (sa !== sb) return sa - sb;
    return getName(a).localeCompare(getName(b));
  });
  for (const categoryFolder of sortedCategories) {
    const styles: StyleOption[] = [];
    collectStylesRecursive(engine, categoryFolder, normalizedRenderingId, styles);
    if (styles.length === 0) continue;
    out.push({ name: getName(categoryFolder), styles, isShared });
  }
  return out;
}

/**
 * Resolve style options merged from common + site roots. Categories with the
 * same name from both roots collapse into one entry; isShared = true if any
 * items came from common.
 */
export function resolveStyleOptions(
  engine: Engine,
  siteRootPath: string,
  commonRootPath: string,
  renderingId: string,
): StyleOptionsResult {
  const commonCategories = collectFromRoot(engine, commonRootPath, renderingId, true);
  const siteCategories = collectFromRoot(engine, siteRootPath, renderingId, false);

  const merged = new Map<string, RawCategory>();
  for (const cat of [...commonCategories, ...siteCategories]) {
    const existing = merged.get(cat.name);
    if (existing) {
      existing.styles.push(...cat.styles);
      existing.isShared = existing.isShared || cat.isShared;
    } else {
      merged.set(cat.name, { ...cat, styles: [...cat.styles] });
    }
  }

  return {
    categories: Array.from(merged.values()).map(c => ({
      name: c.name,
      isShared: c.isShared,
      styles: c.styles,
    })),
  };
}
