import type { FastifyInstance } from 'fastify';
import type { Engine } from '../../engine/index.js';
import { classifyItem, FIELD_IDS } from '../../engine/constants.js';
import type { ItemNode } from '../../engine/types.js';
import type { RegistryItem } from '../../engine/types.js';
import {
  readFieldWithSvFallback,
  readFieldViaStandardValuesCascade,
} from '../../engine/layout/item-fields.js';
import { resolveDisplayIcon, readTemplateIcon } from '../../engine/item-appearance.js';
import { resolveComparer, parseSitecoreDate } from '../../engine/sorting/index.js';
import type { ItemSortKey } from '../../engine/sorting/types.js';
import { toHostPath } from '../host-path.js';
import { applyFieldEditsWithRollback, type FieldEditSpec } from '../../engine/mutate-fields.js';
import { planReorderSiblings } from '../../engine/reorder-siblings.js';
import { notifyItemChange } from '../notify.js';

const SORTORDER_FIELD_ID = FIELD_IDS.sortorder;

// Standard master-tree roots that should always render under /sitecore in
// master view, regardless of whether anything has been authored yet. In
// real Sitecore these exist in BOTH core (admin tree) and master (content
// tree), but mockingbird's OOTB registry only tags them `core` - the
// master-twin entries are not in the baked registry. Without this
// allow-list, an empty repo hides /sitecore/content via the "hide core-only
// nodes without serialized descendants" filter below, and the user cannot
// create their first tenant because the parent path doesn't appear in the
// tree.
const ALWAYS_VISIBLE_MASTER_ROOTS = new Set([
  '/sitecore/content',
  '/sitecore/templates',
  '/sitecore/layout',
  '/sitecore/media library',
  '/sitecore/system',
]);

// Mirrors Sitecore's `Settings.DefaultSortOrder` setting. When an item has no
// `__Sortorder` of its own and no Standard Values cascade hit, Sitecore falls
// back to this configured default (production convention is 100; the inner
// hardcoded fallback in the decompile is 0). Override with the env var when a
// project's Sitecore config diverges from the 100 convention.
const DEFAULT_SORT_ORDER = Number.parseInt(
  process.env.MOCKINGBIRD_DEFAULT_SORT_ORDER ?? '100',
  10,
);

interface TreeNodeResponse {
  id: string;
  name: string;
  path: string;
  template: string;
  type: string;
  source: 'serialized' | 'registry';
  insertable: boolean;
  hasChildren: boolean;
  sortOrder?: number;
  /** `__Display Name` value, falling back to name. Used by display-name sort. */
  displayName?: string;
  /** `__Icon` value (theme-relative sprite path or media ref). Present only when set. */
  icon?: string;
  /** `__Created` parsed to epoch ms; absent when missing/malformed. */
  createdAt?: number;
  /** `__Updated` parsed to epoch ms; absent when missing/malformed. */
  updatedAt?: number;
  /** Host-translated path to the YAML on disk; only present for serialized items. */
  filePath?: string;
  autoExpand?: boolean;
  provenance?: { winnerLayer: string; contributingLayers: string[] };
  children?: TreeNodeResponse[];
}

export function registerTreeRoutes(app: FastifyInstance, engine: Engine): void {
  // GET /api/tree - returns top-level nodes (merged registry roots + serialized orphans)
  app.get('/api/tree', async (request, reply) => {
    const { root, depth, db } = request.query as { root?: string; depth?: string; db?: string };
    const maxDepth = Math.min(Number(depth ?? 1), 10);
    const database = db ?? 'master';

    if (root) {
      const serializedNode = engine.getItemByPath(root);
      if (serializedNode) {
        return buildSerializedSubtree(serializedNode, engine, maxDepth, 0, database);
      }
      const registryItem = engine.getRegistryItem(root) ??
        findRegistryByPath(engine, root);
      if (registryItem) {
        return buildRegistryNode(registryItem, engine, maxDepth, 0, database);
      }
      return reply.status(404).send({ error: `Item not found: ${root}`, statusCode: 404 });
    }

    const nodes: TreeNodeResponse[] = [];

    if (engine.isRegistryLoaded()) {
      const registryRoots = engine.getRegistryRootItems(database);
      registryRoots.sort((a, b) => a.name.localeCompare(b.name));
      for (const item of registryRoots) {
        nodes.push(buildRegistryNode(item, engine, maxDepth, 0, database));
      }
    } else {
      const allNodes = engine.getAllItems();
      const rootNodes = allNodes.filter(n => !engine.getItemById(n.item.parent));
      rootNodes.sort((a, b) => a.item.path.localeCompare(b.item.path));
      for (const node of rootNodes) {
        nodes.push(buildSerializedSubtree(node, engine, maxDepth, 0, database));
      }
    }

    return nodes;
  });

  // GET /api/tree/ancestors/:id - return parent chain from root down to
  // (but not including) the target item, as a list of IDs. Used by the UI
  // to auto-expand the tree when navigation happens outside the tree itself
  // (e.g. clicking the Template field in QuickInfo).
  app.get('/api/tree/ancestors/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const ancestors: string[] = [];
    const seen = new Set<string>();
    let currentId: string | undefined = id;
    // Walk parent chain. Each step checks both the serialized tree (which
    // carries `parent` directly) and the registry (for OOTB items). Cycle-
    // safe via the seen set; depth bounded by the tree itself.
    for (let i = 0; i < 100; i++) {
      const node = engine.getItemById(currentId!);
      const parentId: string | undefined = node?.item.parent
        ?? engine.getRegistryItem(currentId!)?.parent;
      if (!parentId || seen.has(parentId)) break;
      seen.add(parentId);
      ancestors.unshift(parentId);
      currentId = parentId;
    }
    if (ancestors.length === 0 && !engine.getItemById(id) && !engine.getRegistryItem(id)) {
      return reply.status(404).send({ error: `Item not found: ${id}`, statusCode: 404 });
    }
    return ancestors;
  });

  // GET /api/tree/children/:id - lazy-load children of a node
  app.get('/api/tree/children/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { depth, db } = request.query as { depth?: string; db?: string };
    const maxDepth = Math.min(Number(depth ?? 1), 10);
    const database = db ?? 'master';

    const children = getMergedChildren(id, engine, maxDepth, 0, database);
    return children;
  });

  // POST /api/tree/reorder - reassign spaced __Sortorder to a parent's children
  // in the requested order. Same-parent only; all children must be serialized.
  app.post('/api/tree/reorder', async (request, reply) => {
    const { parentId, orderedChildIds, db } = request.body as {
      parentId?: string; orderedChildIds?: string[]; db?: string;
    };
    const database = db ?? 'master';
    if (!parentId || typeof parentId !== 'string' ||
        !Array.isArray(orderedChildIds) || orderedChildIds.length === 0 ||
        !orderedChildIds.every(x => typeof x === 'string')) {
      return reply.status(400).send({ error: 'parentId (string) and non-empty orderedChildIds (string[]) are required', statusCode: 400 });
    }

    const parentExists =
      engine.getItemById(parentId) || engine.getRegistryItem(parentId) || findRegistryByPath(engine, parentId);
    if (!parentExists) {
      return reply.status(404).send({ error: `Item not found: ${parentId}`, statusCode: 404 });
    }

    const current = getMergedChildren(parentId, engine, 0, 0, database);

    // Same-parent permutation: exactly the current child-id set, no dupes.
    const currentIds = current.map(c => c.id.toLowerCase());
    const requested = orderedChildIds.map(x => x.toLowerCase());
    const uniqueRequested = new Set(requested);
    const sameSet =
      requested.length === currentIds.length &&
      uniqueRequested.size === requested.length &&
      currentIds.every(id => uniqueRequested.has(id));
    if (!sameSet) {
      return reply.status(409).send({
        error: 'orderedChildIds must be a permutation of the current children',
        statusCode: 409,
      });
    }

    // All children must be serialized (registry/OOTB items cannot be written).
    if (current.some(c => c.source !== 'serialized')) {
      return reply.status(400).send({
        error: 'group contains OOTB items that cannot be reordered',
        statusCode: 400,
      });
    }

    const { plan, changedIds } = await planReorderSiblings(engine, orderedChildIds);
    if (plan.files.length === 0) {
      return getMergedChildren(parentId, engine, 0, 0, database); // no-op
    }

    // Capture previous live sortorder values, replay on the live tree, apply
    // the plan, and roll back in-memory on failure - see
    // applyFieldEditsWithRollback for the shared contract (also used by the
    // PUT /api/items/:id field-update route).
    const edits: FieldEditSpec[] = changedIds.map(({ id, value }) => ({
      item: engine.getItemById(id)!.item,
      fieldId: SORTORDER_FIELD_ID,
      value,
      lang: 'en',
      version: 1,
      scope: 'shared',
      hint: '__Sortorder',
    }));
    await applyFieldEditsWithRollback(edits, plan, p => engine.applyPlan(p));

    for (const { id } of changedIds) {
      const node = engine.getItemById(id)!;
      notifyItemChange(engine, { type: 'changed', itemId: node.item.id, itemPath: node.item.path });
    }

    return getMergedChildren(parentId, engine, 0, 0, database);
  });

  // GET /api/databases - list available databases
  app.get('/api/databases', async () => {
    return engine.getRegistryDatabases();
  });
}

function buildRegistryNode(item: RegistryItem, engine: Engine, maxDepth: number, currentDepth: number, database: string): TreeNodeResponse {
  const serializedNode = engine.getItemById(item.id);
  if (serializedNode) {
    return buildSerializedSubtree(serializedNode, engine, maxDepth, currentDepth, database);
  }

  const registryChildren = engine.getRegistryChildren(item.id, database);
  const itemPathPrefix = item.path.toLowerCase() + '/';
  const serializedChildren = database === 'master'
    ? engine.getAllItems().filter(n => n.item.parent === item.id && n.item.path.toLowerCase().startsWith(itemPathPrefix))
    : [];
  const hasChildren = registryChildren.length > 0 || serializedChildren.length > 0;

  // Auto-expand only /sitecore and /sitecore/content in master view
  const lowerPath = item.path.toLowerCase();
  const autoExpand = database === 'master' &&
    (lowerPath === '/sitecore' || lowerPath === '/sitecore/content');

  // 0.4.0.28: cascade `__Sortorder` through the template's __Standard Values
  // chain when the registry item doesn't carry the field directly. Matches
  // Sitecore's `item.Fields[...].Value` contract.
  // Helper: read a registry-side field (own value, falling back to SV cascade).
  const readReg = (fieldId: string): string | undefined => {
    const own = item.sharedFields[fieldId];
    if (own !== undefined && own !== '') return own;
    return readFieldViaStandardValuesCascade(engine, item.template, fieldId, 'en');
  };

  const sortOrderValue = readReg(SORTORDER_FIELD_ID);
  const displayNameValue = readReg(FIELD_IDS.displayName);
  const createdValue = readReg(FIELD_IDS.created);
  const updatedValue = readReg(FIELD_IDS.updated);
  // Icon: item's own __Icon, falling back to the template item's __Icon
  // (Sitecore ItemAppearance.Icon -> TemplateItem.Icon).
  const iconValue = readReg(FIELD_IDS.icon) ?? readTemplateIcon(engine, item.template, 'en');

  const node: TreeNodeResponse = {
    id: item.id,
    name: item.name,
    path: item.path,
    template: item.template,
    type: classifyItem(item.template),
    source: 'registry',
    insertable: engine.coversNewChildAt(item.path),
    hasChildren,
    sortOrder: sortOrderValue ? Number(sortOrderValue) : undefined,
    displayName: displayNameValue && displayNameValue !== '' ? displayNameValue : undefined,
    createdAt: parseSitecoreDate(createdValue) || undefined,
    updatedAt: parseSitecoreDate(updatedValue) || undefined,
    icon: iconValue && iconValue !== '' ? iconValue : undefined,
    autoExpand: autoExpand || undefined,
  };

  if (currentDepth < maxDepth && hasChildren) {
    node.children = getMergedChildren(item.id, engine, maxDepth, currentDepth + 1, database);
  }

  const prov = engine.getItemProvenance(item.id);
  if (prov) node.provenance = prov;

  return node;
}

function buildSerializedSubtree(node: ItemNode, engine: Engine, maxDepth: number, currentDepth: number, database: string): TreeNodeResponse {
  const registryChildren = engine.getRegistryChildren(node.item.id, database);
  const hasChildren = node.children.size > 0 || registryChildren.length > 0;

  // 0.4.0.28: cascade __Sortorder through SV chain (see buildRegistryNode).
  const sortOrderValue = readFieldWithSvFallback(engine, node.item, SORTORDER_FIELD_ID, 'en');
  const displayNameValue = readFieldWithSvFallback(engine, node.item, FIELD_IDS.displayName, 'en');
  const createdValue = readFieldWithSvFallback(engine, node.item, FIELD_IDS.created, 'en');
  const updatedValue = readFieldWithSvFallback(engine, node.item, FIELD_IDS.updated, 'en');
  // Icon: item's own __Icon, falling back to the template item's __Icon
  // (Sitecore ItemAppearance.Icon -> TemplateItem.Icon).
  const iconValue = resolveDisplayIcon(engine, node.item, 'en');

  const result: TreeNodeResponse = {
    id: node.item.id,
    name: node.item.path.split('/').pop() ?? '',
    path: node.item.path,
    template: node.item.template,
    type: classifyItem(node.item.template),
    source: 'serialized',
    insertable: true,
    hasChildren,
    sortOrder: sortOrderValue !== undefined ? Number(sortOrderValue) : undefined,
    displayName: displayNameValue !== undefined && displayNameValue !== '' ? displayNameValue : undefined,
    createdAt: parseSitecoreDate(createdValue) || undefined,
    updatedAt: parseSitecoreDate(updatedValue) || undefined,
    icon: iconValue !== undefined && iconValue !== '' ? iconValue : undefined,
    filePath: toHostPath(node.filePath),
  };

  if (currentDepth < maxDepth && hasChildren) {
    result.children = getMergedChildren(node.item.id, engine, maxDepth, currentDepth + 1, database);
  }

  const prov = engine.getItemProvenance(node.item.id);
  if (prov) result.provenance = prov;

  return result;
}

/**
 * Project a TreeNodeResponse onto the flat ItemSortKey shape the comparers
 * operate over. Defaults match Sitecore conventions: sortorder 100, dates 0.
 */
function toSortKey(n: TreeNodeResponse): ItemSortKey {
  return {
    id: n.id,
    name: n.name,
    sortOrder: n.sortOrder ?? DEFAULT_SORT_ORDER,
    displayName: n.displayName ?? n.name,
    createdAt: n.createdAt ?? 0,
    updatedAt: n.updatedAt ?? 0,
  };
}

function getMergedChildren(parentId: string, engine: Engine, maxDepth: number, currentDepth: number = 0, database: string = 'master'): TreeNodeResponse[] {
  const children: TreeNodeResponse[] = [];
  const seenIds = new Set<string>();

  // Serialized children (only in master mode)
  if (database === 'master') {
    const serializedParent = engine.getItemById(parentId);
    if (serializedParent) {
      for (const child of serializedParent.children.values()) {
        seenIds.add(child.item.id);
        children.push(buildSerializedSubtree(child, engine, maxDepth, currentDepth, database));
      }
    }

    // Serialized items whose parent is a registry item
    const parentRegistryItem = engine.getRegistryItem(parentId);
    const parentPathPrefix = parentRegistryItem ? parentRegistryItem.path.toLowerCase() + '/' : null;
    for (const node of engine.getAllItems()) {
      if (node.item.parent === parentId && !seenIds.has(node.item.id)) {
        // Skip if parent is a registry item and the serialized item's path doesn't match
        // (e.g. branch templates whose parent ID points to /sitecore/masters but path is /sitecore/templates/Branches)
        if (parentPathPrefix && !node.item.path.toLowerCase().startsWith(parentPathPrefix)) continue;
        seenIds.add(node.item.id);
        children.push(buildSerializedSubtree(node, engine, maxDepth, currentDepth, database));
      }
    }
  }

  // Registry children - filtered by visibility (items in this DB + their ancestors)
  // Sort to prefer items tagged with the current database (for name deduplication)
  const registryChildren = engine.getRegistryChildren(parentId, database)
    .sort((a, b) => (a.database === database ? -1 : 1) - (b.database === database ? -1 : 1));
  const parentItem = engine.getRegistryItem(parentId);
  const parentPath = parentItem?.path.toLowerCase() ?? '';
  const parentIsSitecore = parentPath === '/sitecore';
  const parentIsContent = parentPath === '/sitecore/content';

  // Inject the standard master-tree roots under /sitecore if the registry's
  // visibility filter excluded them. Real Sitecore's master DB always has
  // /sitecore/content, /sitecore/templates, etc. as system-defined roots,
  // but mockingbird's OOTB registry only tags them `core`. The registry's
  // `getChildren(parentId, 'master')` filters to items in the master
  // visibility set (which excludes anything without master-tagged
  // descendants), so /sitecore/content disappears on an empty repo before
  // any post-filter could see it. This injection ensures the standard
  // structural roots always render in master view.
  if (database === 'master' && parentIsSitecore) {
    const seenChildIds = new Set(registryChildren.map(c => c.id.toLowerCase()));
    for (const path of ALWAYS_VISIBLE_MASTER_ROOTS) {
      if (path === '/sitecore') continue;
      const item = engine.getRegistryItemByPath(path);
      if (item && !seenChildIds.has(item.id.toLowerCase())) {
        registryChildren.push(item);
      }
    }
  }
  const seenNames = new Set<string>();
  for (const item of registryChildren) {
    if (seenIds.has(item.id)) continue;
    // Under /sitecore in master: hide core-only structural nodes without serialized descendants
    // (e.g. /sitecore/masters, /sitecore/client, /sitecore/unit testing).
    // ALWAYS_VISIBLE_MASTER_ROOTS exempts the standard master-tree roots so
    // an empty repo still shows /sitecore/content (the place to create the
    // first tenant) even with zero authored items.
    if (
      database === 'master' &&
      parentIsSitecore &&
      item.database !== database &&
      !engine.hasSerializedDescendants(item.id) &&
      !ALWAYS_VISIBLE_MASTER_ROOTS.has(item.path.toLowerCase())
    ) continue;
    // Under /sitecore/content in master: only show items with serialized descendants
    if (database === 'master' && parentIsContent && !engine.hasSerializedDescendants(item.id)) continue;
    // Deduplicate by name: items can exist in both core and master with different IDs.
    // Prefer the item tagged with the current database.
    const nameKey = item.name.toLowerCase();
    if (seenNames.has(nameKey)) continue;
    seenNames.add(nameKey);
    seenIds.add(item.id);
    children.push(buildRegistryNode(item, engine, maxDepth, currentDepth, database));
  }

  const comparer = resolveComparer(engine, parentId);
  children.sort((a, b) => comparer(toSortKey(a), toSortKey(b)));
  return children;
}

function findRegistryByPath(engine: Engine, path: string): RegistryItem | undefined {
  const roots = engine.getRegistryRootItems();
  for (const root of roots) {
    if (root.path.toLowerCase() === path.toLowerCase()) return root;
  }
  return undefined;
}
