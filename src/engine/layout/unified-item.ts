/**
 * Shared helpers that abstract over ItemNode (serialized content tree) vs
 * RegistryItem (Sitecore template registry).  Extracted from template-schema.ts
 * and template-fields.ts so the two consumers don't diverge.
 */

import type { Engine } from '../index.js';
import type { ItemNode, RegistryItem } from '../types.js';

// ---------------------------------------------------------------------------
// Core type
// ---------------------------------------------------------------------------

export type UnifiedItem =
  | { kind: 'node'; value: ItemNode }
  | { kind: 'registry'; value: RegistryItem };

// ---------------------------------------------------------------------------
// Field accessors
// ---------------------------------------------------------------------------

export function getId(u: UnifiedItem): string {
  return u.kind === 'node' ? u.value.item.id : u.value.id;
}

export function getName(u: UnifiedItem): string {
  if (u.kind === 'node') {
    return u.value.item.path.split('/').pop() ?? '';
  }
  return u.value.name;
}

export function getTemplate(u: UnifiedItem): string {
  return u.kind === 'node' ? u.value.item.template : u.value.template;
}

export function getSharedField(u: UnifiedItem, fieldId: string): string | undefined {
  if (u.kind === 'node') {
    const f = u.value.item.sharedFields.find(sf => sf.id === fieldId);
    return f?.value;
  }
  return u.value.sharedFields[fieldId];
}

/**
 * Read an unversioned field value for the given language. Falls through to
 * undefined when the field is absent or has no value for that language.
 * For registry items the data comes from `unversionedFields[lang][fieldId]`
 * (registry v5.0+); for tree-resolved items it comes from
 * `languages[].fields[]` keyed by id.
 */
export function getUnversionedField(u: UnifiedItem, fieldId: string, language: string): string | undefined {
  if (u.kind === 'node') {
    const lang = u.value.item.languages.find(l => l.language === language);
    return lang?.fields.find(f => f.id === fieldId)?.value;
  }
  return u.value.unversionedFields?.[language]?.[fieldId];
}

export function getChildren(u: UnifiedItem, engine: Engine): UnifiedItem[] {
  if (u.kind === 'node') {
    return Array.from(u.value.children.values()).map(child => ({ kind: 'node' as const, value: child }));
  }
  return engine.getRegistryChildren(u.value.id).map(child => ({ kind: 'registry' as const, value: child }));
}

/**
 * Strict-aware variant: returns the merged set of serialized + registry
 * children, which is what the user-facing tree shows. A serialized parent
 * can have registry-only descendants (registry items whose parent points
 * at a serialized id - e.g. OOTB media items registered under a custom
 * Data folder), and vice versa. The standard `getChildren` walks ONLY the
 * matching kind to keep template-traversal code free of cross-store noise.
 * Resolver paths (lookup-sources) need the merged view, since users expect
 * `query:$site/Data/...` to see everything Data shows in the tree.
 *
 * Dedupes by id; serialized entries win when both sources have the same id.
 */
export function getMergedChildren(u: UnifiedItem, engine: Engine): UnifiedItem[] {
  const parentId = u.kind === 'node' ? u.value.item.id : u.value.id;

  // Serialized children attached via the tree's parent-link walking.
  const treeChildren: UnifiedItem[] =
    u.kind === 'node'
      ? Array.from(u.value.children.values()).map(child => ({ kind: 'node' as const, value: child }))
      : [];

  // Serialized "orphan" items whose parent field equals this item's id but
  // whose parent is not itself serialized. These appear when a registry-only
  // ancestor sits between two serialized branches (e.g. a serialized child's
  // parent is a registry-only Feature folder under /sitecore/layout/Renderings).
  const orphanChildren: UnifiedItem[] = engine
    .getOrphansByParent(parentId)
    .map(node => ({ kind: 'node' as const, value: node }));

  const serialized = [...treeChildren, ...orphanChildren];
  const seen = new Set<string>();
  for (const child of serialized) {
    seen.add(getId(child).toLowerCase());
  }
  const registry: UnifiedItem[] = engine
    .getRegistryChildren(parentId)
    .filter(child => !seen.has(child.id.toLowerCase()))
    .map(child => ({ kind: 'registry' as const, value: child }));
  return [...serialized, ...registry];
}

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

/**
 * Look up any item - tree first, then registry - by its ID. Both stores
 * normalise their input (strip braces, lowercase), so callers may pass any
 * case + braced/bare form (e.g. the raw `s:id` GUID from a `__Final
 * Renderings` XML, which Sitecore writes as `{UPPERCASE-GUID}`).
 */
export function lookupUnifiedItem(itemId: string, engine: Engine): UnifiedItem | undefined {
  const node = engine.getItemById(itemId);
  if (node) return { kind: 'node', value: node };
  const reg = engine.getRegistryItem(itemId);
  if (reg) return { kind: 'registry', value: reg };
  return undefined;
}

/**
 * Look up any item - tree first, then registry - by its Sitecore path.
 *
 * The merged lookup is required because subtrees in real Sitecore corpora
 * can be registry-only (e.g. `/sitecore/layout/renderings`, ~2400 items
 * with zero serialized counterparts). A serialized-only `getItemByPath`
 * fallback returns nothing for those paths.
 */
export function lookupUnifiedItemByPath(engine: Engine, path: string): UnifiedItem | undefined {
  const node = engine.getItemByPath(path);
  if (node) return { kind: 'node', value: node };
  const reg = engine.getRegistryItemByPath(path);
  if (reg) return { kind: 'registry', value: reg };
  return undefined;
}
