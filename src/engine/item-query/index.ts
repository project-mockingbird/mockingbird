import type { Engine } from '../index.js';
import type { ScsItem, ItemNode } from '../types.js';
import { getLatestVersion, readSharedFieldOnItem } from '../layout/item-fields.js';
import { normalizeGuid } from '../search/index.js';
import { compareSitecoreSiblings } from '../layout/sibling-compare.js';

/**
 * A resolved field value shaped to match what the consuming Content SDK 2.x
 * app expects from Experience Edge's generic field accessor: each of `value`,
 * `jsonValue`, and `boolValue` is nullable so the app can select whichever
 * form it needs for a given field type.
 */
export interface ItemFieldValue {
  value: string | null;
  jsonValue: unknown;
  boolValue: boolean | null;
}

/**
 * Convert a template name (or any human-readable label) into the PascalCase
 * identifier Sitecore Experience Edge uses as a GraphQL `__typename`. Spaces
 * and non-alphanumeric characters become word boundaries; each word is then
 * upper-cased and concatenated. Empty/whitespace input returns `ContentItem`
 * - the catch-all fallback type name we always declare.
 */
export function pascalizeTemplateName(name: string): string {
  if (!name || !name.trim()) return 'ContentItem';
  const words = name.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  if (words.length === 0) return 'ContentItem';
  return words
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
}

/**
 * Look up an item by its Sitecore path. Thin wrapper around
 * `Engine.getItemByPath` that returns the plain `ScsItem` - resolver code
 * doesn't care about the tree node wrapper.
 */
export function resolveItemByPath(engine: Engine, path: string): ScsItem | null {
  if (!path) return null;
  // Real Sitecore Edge accepts both content paths and item IDs for this
  // argument; consuming apps pass rendering datasource GUIDs in almost every
  // component query. Detect a GUID shape via the shared `normalizeGuid` and do
  // an id lookup when it matches, falling back to the path lookup otherwise.
  const canonical = normalizeGuid(path);
  if (canonical) {
    const dashed = `${canonical.slice(0, 8)}-${canonical.slice(8, 12)}-${canonical.slice(12, 16)}-${canonical.slice(16, 20)}-${canonical.slice(20)}`;
    const node = engine.getItemById(dashed);
    return node ? node.item : null;
  }
  const node = engine.getItemByPath(path);
  return node ? node.item : null;
}

/**
 * Read a field value off an item by its human-readable `hint` (case-
 * insensitive). Searches shared fields, then language-level unversioned
 * fields, then the latest-version field list for the requested language
 * (defaulting to `en`).
 *
 * Returns an `ItemFieldValue` triple - `value` is always the raw string,
 * `jsonValue` tries to `JSON.parse` that string (falls back to the string),
 * `boolValue` is `true` when the string is `"1"` and `false` when `"0"`.
 * Callers select whichever form matches the GraphQL selection set.
 */
export function readItemFieldByHint(
  item: ScsItem,
  hint: string,
  language: string = 'en',
): ItemFieldValue | null {
  if (!hint) return null;
  const target = hint.toLowerCase();

  for (const f of item.sharedFields) {
    if (f.hint && f.hint.toLowerCase() === target) return toFieldValue(f.value);
  }

  const lang = item.languages.find(l => l.language === language);
  if (lang) {
    for (const f of lang.fields) {
      if (f.hint && f.hint.toLowerCase() === target) return toFieldValue(f.value);
    }
  }

  const latest = getLatestVersion(item, language);
  if (latest) {
    for (const f of latest.fields) {
      if (f.hint && f.hint.toLowerCase() === target) return toFieldValue(f.value);
    }
  }

  return null;
}

function toFieldValue(raw: string): ItemFieldValue {
  let jsonValue: unknown = raw;
  try { jsonValue = JSON.parse(raw); } catch { jsonValue = raw; }
  const boolValue = raw === '1' ? true : raw === '0' ? false : null;
  return { value: raw, jsonValue, boolValue };
}

/**
 * Return an item's direct children, optionally filtered to those whose
 * template ID matches one of `includeTemplateIDs` (case-insensitive, accepts
 * braced or dashed forms). Results are sorted to match the real Sitecore
 * child-ordering contract: primary key `__Sortorder` numeric ascending
 * (empty/missing → 100), tie-break by item name ascending, case-insensitive.
 * Uses the shared `compareSitecoreSiblings` comparator (0.4.0.11).
 *
 * Order of operations: filter by template → sort. Callers that apply a
 * `first:` slice MUST do so after this function returns, so the slice
 * sees the real Sitecore order.
 */
export function resolveItemChildren(
  engine: Engine,
  node: ItemNode,
  includeTemplateIDs?: string[] | null,
): ItemNode[] {
  const all = Array.from(node.children.values());
  let filtered: ItemNode[];
  if (!includeTemplateIDs || includeTemplateIDs.length === 0) {
    filtered = all;
  } else {
    const normalized = new Set(includeTemplateIDs.map(id => id.replace(/[{}]/g, '').toLowerCase()));
    filtered = all.filter(c => normalized.has(c.item.template.toLowerCase()));
  }

  // Sort by Sitecore's native sibling ordering via the shared comparator
  // (0.4.0.11: `compareSitecoreSiblings` replaces the local decorator,
  // and Array.sort stability in Node ≥12 preserves insertion order on
  // identical sort keys - dropping the explicit `a.i - b.i` final
  // tiebreak is safe).
  return filtered.sort((a, b) => compareSitecoreSiblings(engine, a.item, b.item));
}

/**
 * Hardcoded starter set of pascalized type names + field hints covering the
 * components a typical Content SDK app queries against out of the box.
 * Merged into {@link collectSchemaCatalog} so that a mockingbird started
 * against an empty content mount still produces a schema the app can
 * validate its queries against.
 */
const STARTER_TYPE_NAMES = [
  'ContentItem',
  'RootMenuItem',
  'MenuColumn',
  'MenuLinkList',
  'MenuLink',
  'FaqList',
  'FaqItem',
  'AccordionItem',
  'TabItem',
  'DynamicForm',
  'SitemapEntry',
];

const STARTER_FIELD_HINTS = [
  // Base Sitecore fields most Content SDK components query by name
  'Title',
  'Text',
  'Body',
  'Content',
  'Image',
  'Link',
  'MenuItemText',
  'MenuItemLink',
  'Caption',
  'Summary',
  'Description',
  'Question',
  'Answer',
  'Tag',
  'Tags',
  'Name',
];

export interface SchemaCatalog {
  typeNames: string[];
  fieldHints: string[];
}

/**
 * Walk the engine tree and return the set of pascalized template names + the
 * set of human-readable field hints present across every item. Merged with
 * the hardcoded starter sets so the returned catalog is usable even for an
 * empty tree - mockingbird still accepts and validates Content SDK queries
 * during cold startup before indexing completes.
 *
 * This is a static snapshot: callers that need to pick up template/field
 * changes after startup must restart the process. The user opted for the
 * static approach to keep the GraphQL schema stable across a session.
 */
export function collectSchemaCatalog(engine: Engine): SchemaCatalog {
  const typeNameSet = new Set<string>(STARTER_TYPE_NAMES);
  const fieldHintSet = new Set<string>(STARTER_FIELD_HINTS);

  const tree = (engine as unknown as { tree: { getAllNodes?: () => ItemNode[] } }).tree;
  const nodes = typeof tree?.getAllNodes === 'function' ? tree.getAllNodes() : iterateTree(engine);

  // Map template id → template name (resolved via the tree itself).
  const templateNameById = new Map<string, string>();
  for (const node of nodes) {
    const { item } = node;
    // Try to identify the item's template by name.
    if (!templateNameById.has(item.template)) {
      const tmplNode = engine.getItemById(item.template);
      if (tmplNode) {
        const name = tmplNode.item.path.split('/').pop() ?? '';
        templateNameById.set(item.template, name);
      }
    }

    // Collect non-internal field hints.
    for (const f of item.sharedFields) {
      if (f.hint && !f.hint.startsWith('__')) fieldHintSet.add(f.hint);
    }
    for (const lang of item.languages) {
      for (const f of lang.fields) {
        if (f.hint && !f.hint.startsWith('__')) fieldHintSet.add(f.hint);
      }
      for (const v of lang.versions) {
        for (const f of v.fields) {
          if (f.hint && !f.hint.startsWith('__')) fieldHintSet.add(f.hint);
        }
      }
    }
  }

  for (const name of templateNameById.values()) {
    const pascal = pascalizeTemplateName(name);
    if (pascal) typeNameSet.add(pascal);
  }

  return {
    typeNames: Array.from(typeNameSet).sort(),
    fieldHints: Array.from(fieldHintSet).sort(),
  };
}

/**
 * Fallback walk for engines whose underlying tree doesn't expose a
 * `getAllNodes` convenience method (older engine instances, or the test
 * harness that builds a stripped-down tree via `Object.create`).
 */
function iterateTree(engine: Engine): ItemNode[] {
  const tree = (engine as unknown as { tree: { getById?: (id: string) => ItemNode | undefined } }).tree;
  if (!tree) return [];
  const byId = (tree as unknown as { byId?: Map<string, ItemNode> }).byId;
  if (byId) return Array.from(byId.values());
  return [];
}
