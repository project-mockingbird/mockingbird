import type { Engine } from '../index.js';
import type { ScsItem } from '../types.js';
import { compareSitecoreSiblings } from './sibling-compare.js';

/**
 * A compiled query — given a base item, returns the items that the
 * Sitecore Query expression would yield. Sorting-in-natural-order is the
 * caller's responsibility of the specific query implementation (mirrors
 * Sitecore's tree-natural ordering by `__Sortorder`).
 */
export type RcrQuery = (base: ScsItem, engine: Engine) => ScsItem[];

/**
 * Normalize an ItemSelectorQuery string for table lookup:
 * strip leading/trailing whitespace and collapse whitespace around `=` / `!=`.
 * Template-id casing and brace style must match exactly — the normalization
 * only smooths authoring whitespace, not semantic variations.
 */
function normalizeQuery(raw: string): string {
  return raw
    .trim()
    .replace(/\s*(!?=)\s*/g, '$1');
}

/**
 * Implements `"../*[@@templateid!='{GUID}']"` — siblings of `base` (children
 * of base's parent, including base itself), minus any whose template id
 * matches `excludeTemplateId`. Results sorted by `__Sortorder` ascending.
 */
export function siblingsExcludingTemplate(excludeTemplateId: string): RcrQuery {
  const exclude = excludeTemplateId.toLowerCase();
  return (base, engine) => {
    const baseNode = engine.getItemById(base.id);
    const parentNode = baseNode?.parentNode;
    if (!parentNode) return [];

    const siblings: ScsItem[] = [];
    for (const child of parentNode.children.values()) {
      if (child.item.template.toLowerCase() !== exclude) {
        siblings.push(child.item);
      }
    }
    siblings.sort((a, b) => compareSitecoreSiblings(engine, a, b));
    return siblings;
  };
}

/**
 * Implements `"../*[@@templateid='{GUID}']"` — siblings of `base` (children
 * of base's parent, including base itself) whose template id matches
 * `matchTemplateId`. Results sorted by `__Sortorder` ascending.
 */
export function siblingsMatchingTemplate(matchTemplateId: string): RcrQuery {
  const match = matchTemplateId.toLowerCase();
  return (base, engine) => {
    const baseNode = engine.getItemById(base.id);
    const parentNode = baseNode?.parentNode;
    if (!parentNode) return [];

    const siblings: ScsItem[] = [];
    for (const child of parentNode.children.values()) {
      if (child.item.template.toLowerCase() === match) {
        siblings.push(child.item);
      }
    }
    siblings.sort((a, b) => compareSitecoreSiblings(engine, a, b));
    return siblings;
  };
}

/**
 * Implements `"../*[@@templateid='{GUID}']/*"` — grandchildren of `base`'s
 * parent via any intermediate sibling whose template id matches
 * `matchTemplateId`. Flattened across all matching intermediates and sorted
 * by `__Sortorder` ascending.
 */
export function childrenOfSiblingOfTemplate(matchTemplateId: string): RcrQuery {
  const match = matchTemplateId.toLowerCase();
  return (base, engine) => {
    const baseNode = engine.getItemById(base.id);
    const parentNode = baseNode?.parentNode;
    if (!parentNode) return [];

    const grandchildren: ScsItem[] = [];
    for (const sibling of parentNode.children.values()) {
      if (sibling.item.template.toLowerCase() !== match) continue;
      for (const grandchild of sibling.children.values()) {
        grandchildren.push(grandchild.item);
      }
    }
    grandchildren.sort((a, b) => compareSitecoreSiblings(engine, a, b));
    return grandchildren;
  };
}

/**
 * Keys are registered in normalized form — strict equality lookup.
 * `lookupRcrQuery` normalizes caller input before indexing in.
 */
export const RCR_QUERIES: Record<string, RcrQuery> = {
  [normalizeQuery("../*[@@templateid!='{DC341F6B-784E-45E5-97D1-FAA87EFA6F06}']")]:
    siblingsExcludingTemplate('dc341f6b-784e-45e5-97d1-faa87efa6f06'),

  [normalizeQuery("../*[@@templateid='{353C1A17-77EE-4432-948E-2395A1FF0197}']/*")]:
    childrenOfSiblingOfTemplate('353c1a17-77ee-4432-948e-2395a1ff0197'),

  [normalizeQuery("../*[@@templateid='{DC341F6B-784E-45E5-97D1-FAA87EFA6F06}']/*")]:
    childrenOfSiblingOfTemplate('dc341f6b-784e-45e5-97d1-faa87efa6f06'),

  [normalizeQuery("../*[@@templateid='{1B75D33C-1E5F-4128-B623-58387020E17E}']/*")]:
    childrenOfSiblingOfTemplate('1b75d33c-1e5f-4128-b623-58387020e17e'),

  [normalizeQuery("../*[@@templateid='{1B75D33C-1E5F-4128-B623-58387020E17E}']")]:
    siblingsMatchingTemplate('1b75d33c-1e5f-4128-b623-58387020e17e'),
};

/** Look up an RCR query by its raw ItemSelectorQuery string. */
export function lookupRcrQuery(rawQuery: string): RcrQuery | undefined {
  return RCR_QUERIES[normalizeQuery(rawQuery)];
}
