import type { Engine } from '../index.js';
import type { ScsItem, ItemNode } from '../types.js';
import { templateDescendsFromOrEquals } from './template-walk.js';
import { resolveDatasourceItem } from './component-resolver.js';
import { parseRenderingXml } from './rendering-xml.js';
import { BASE_DATA_FOLDER_TEMPLATE_ID, PAGE_DATA_TEMPLATE_ID, FINAL_RENDERINGS_FIELD_ID } from '../constants.js';

/**
 * True when `item`'s template inherits from `_Base Data Folder`
 * ({66FB7845-...}) OR is/inherits from SXA's concrete `Page Data`
 * template ({1C82E550-...}). The second anchor is needed because some
 * corpora have Page Data inherit only from Standard template, missing
 * the `_Base Data Folder` link. A folder literally named "Data" without
 * one of these template anchors does NOT qualify.
 */
export function isPageDataFolder(item: ScsItem, engine: Engine): boolean {
  return templateDescendsFromOrEquals(engine, item.template, BASE_DATA_FOLDER_TEMPLATE_ID)
      || templateDescendsFromOrEquals(engine, item.template, PAGE_DATA_TEMPLATE_ID);
}

export interface UnusedItem {
  id: string;
  name: string;
  path: string;
  templateName: string;
}

export interface UnusedDatasourcesResult {
  count: number;
  items: UnusedItem[];
}

/**
 * Find items under `itemId`'s Page Data subfolder(s) that no rendering on
 * `itemId` references. Two gates: (1) at least one child is a Page Data
 * folder; (2) at least one rendering element exists across any
 * language/version. Failing either returns an empty result.
 *
 * Datasource resolution reuses `resolveDatasourceItem` from the layout
 * pipeline. Transitive containment: referencing a parent under /Data
 * keeps all descendants.
 */
export function findUnusedDatasources(itemId: string, engine: Engine): UnusedDatasourcesResult {
  const node = engine.getItemById(itemId);
  if (!node) return { count: 0, items: [] };

  const dataFolders: ItemNode[] = [];
  for (const child of node.children.values()) {
    if (isPageDataFolder(child.item, engine)) dataFolders.push(child);
  }
  if (dataFolders.length === 0) return { count: 0, items: [] };

  let hasAnyRendering = false;
  const usedIds = new Set<string>();
  for (const lang of node.item.languages) {
    for (const ver of lang.versions) {
      const xml = ver.fields.find(f => f.id === FINAL_RENDERINGS_FIELD_ID)?.value ?? '';
      if (!xml) continue;
      const renderings = parseRenderingXml(xml);
      if (renderings.length > 0) hasAnyRendering = true;
      for (const r of renderings) {
        if (!r.dataSource) continue;
        const resolved = resolveDatasourceItem(r.dataSource, engine, node.item.path);
        if (resolved) usedIds.add(resolved.id);
      }
    }
  }
  if (!hasAnyRendering) return { count: 0, items: [] };

  // Build kept set: resolved ids + their ancestors STRICTLY inside any
  // Data subtree. The Data folder itself is the boundary - if it ended
  // up in keptIds, every descendant would inherit "kept" via the
  // hasKeptAncestor check, making cleanup never delete anything.
  const dataFolderSet = new Set(dataFolders);
  const keptIds = new Set<string>();
  for (const usedId of usedIds) {
    let cursor: ItemNode | null | undefined = engine.getItemById(usedId);
    while (cursor) {
      if (dataFolderSet.has(cursor)) break;
      keptIds.add(cursor.item.id);
      cursor = cursor.parentNode;
    }
  }

  // An item survives if it's in keptIds (directly used OR ancestor-of-used)
  // OR if any of its ancestors (within the Data subtree) is directly used.
  // The second clause captures descendants-of-used: ref CarouselSet keeps
  // all its children even though those children aren't in keptIds.
  const unused: UnusedItem[] = [];
  for (const folder of dataFolders) {
    walkSubtree(folder, (n) => {
      if (n === folder) return;
      if (keptIds.has(n.item.id)) return;
      if (hasUsedAncestor(n, usedIds, folder)) return;
      const tmplNode = engine.getItemById(n.item.template);
      const tmplRegistry = tmplNode ? undefined : engine.getRegistryItem(n.item.template);
      const templateName = tmplNode
        ? itemName(tmplNode.item)
        : tmplRegistry?.name ?? '';
      unused.push({ id: n.item.id, name: itemName(n.item), path: n.item.path, templateName });
    });
  }

  unused.sort((a, b) => a.path.localeCompare(b.path));
  return { count: unused.length, items: unused };
}

function walkSubtree(root: ItemNode, visit: (n: ItemNode) => void): void {
  visit(root);
  for (const child of root.children.values()) walkSubtree(child, visit);
}

function hasUsedAncestor(node: ItemNode, usedIds: Set<string>, stopAt: ItemNode): boolean {
  let cursor: ItemNode | null = node.parentNode;
  while (cursor && cursor !== stopAt.parentNode) {
    if (usedIds.has(cursor.item.id)) return true;
    cursor = cursor.parentNode;
  }
  return false;
}

function itemName(item: ScsItem): string {
  const slash = item.path.lastIndexOf('/');
  return slash >= 0 ? item.path.slice(slash + 1) : item.path;
}
