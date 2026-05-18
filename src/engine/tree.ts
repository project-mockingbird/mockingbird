import type { ItemNode, ScsItem } from './types.js';
import { normalizeGuid } from './guid.js';

/** Sitecore's all-zero guid used as the "no parent" sentinel on tree roots. */
const NULL_GUID = '00000000-0000-0000-0000-000000000000';

/** `true` for an unset / all-zero parent reference - treat as a tree root. */
function isNullParent(raw: string): boolean {
  if (!raw) return true;
  return normalizeGuid(raw) === NULL_GUID;
}

/**
 * URL-safe normalization of a Sitecore item path: lowercase + per-segment
 * space→dash. Mirrors what real Sitecore's URL pipeline (ItemResolver)
 * does when translating an incoming URL to an item lookup, so a sitemap
 * URL like `/.../faq-item-01` resolves to an item whose on-disk name is
 * `Faq Item 01`. The leading `/` and `/`-separated segment structure are
 * preserved verbatim.
 */
export function urlSafePath(path: string): string {
  return path.toLowerCase().replace(/ /g, '-');
}

export class ItemTree {
  private byId = new Map<string, ItemNode>();
  private byPath = new Map<string, ItemNode>();
  /**
   * Secondary index keyed by the URL-safe form of every item's path -
   * looked up only when {@link byPath} misses on the raw lowercase form.
   * On a key collision (two siblings whose names differ only by case or
   * space-vs-dash) the first item added wins, matching Sitecore's real
   * URL resolver behavior.
   */
  private byUrlSafePath = new Map<string, ItemNode>();
  private orphans: ItemNode[] = [];
  private _generation = 0;

  /**
   * Monotonic counter that increments on every mutation that could change
   * what a tree-walking computation observes (addItem, successful removeItem,
   * relinkItem). Cheap signal for memoizing engine-wide reads such as
   * `discoverSiteDefinitions` - the cache compares the cached generation to
   * `tree.generation` and rebuilds when they differ.
   */
  get generation(): number {
    return this._generation;
  }

  addItem(item: ScsItem, filePath: string, module?: string): ItemNode {
    // Idempotent re-add: if the same id is already in byId, update the
    // existing node in place instead of creating a fresh one. Two paths
    // hit this branch:
    //   (1) The file watcher firing on a YAML that an in-process write
    //       (copySubtree, insertItem, applyPlan, etc.) already added to
    //       the tree. Recreating the node here would replace the parent's
    //       children-Map entry with a fresh empty-children copy, severing
    //       any descendants the in-process write linked first.
    //   (2) A 'change' event on an existing item. The item content
    //       changed; identity (children, parentNode) should not.
    // Preserves: children Map, parentNode, _generation continuity for
    // descendants. Updates: item content, filePath, module, parent link
    // if the new parent differs.
    const existing = this.byId.get(item.id);
    if (existing) {
      const oldPathKey = existing.item.path.toLowerCase();
      existing.item = item;
      existing.filePath = filePath;
      if (module !== undefined) existing.module = module;
      if (oldPathKey !== item.path.toLowerCase()) {
        this.byPath.delete(oldPathKey);
        this.byPath.set(item.path.toLowerCase(), existing);
      }
      this.indexUrlSafe(existing);

      const newParentRaw = item.parent;
      if (newParentRaw && !isNullParent(newParentRaw)) {
        const canonicalParent = normalizeGuid(newParentRaw);
        if (existing.parentNode?.item.id !== canonicalParent) {
          const newParentNode = this.byId.get(canonicalParent) ?? this.byId.get(newParentRaw);
          if (newParentNode && newParentNode !== existing) {
            if (existing.parentNode) {
              existing.parentNode.children.delete(item.id);
            } else {
              this.orphans = this.orphans.filter(o => o !== existing);
            }
            newParentNode.children.set(item.id, existing);
            existing.parentNode = newParentNode;
          }
        }
      }
      this._generation++;
      return existing;
    }

    const node: ItemNode = {
      item,
      children: new Map(),
      parentNode: null,
      filePath,
      module,
    };

    this.byId.set(item.id, node);
    this.byPath.set(item.path.toLowerCase(), node);
    this.indexUrlSafe(node);
    this._generation++;

    // Link to parent if it exists. Parent references are canonicalised
    // at lookup time so items whose `item.parent` was stored in a non-
    // canonical form (brace-wrapped, uppercased) still resolve against
    // the canonical `byId` key set instead of being dumped into orphans.
    // The all-zero guid is Sitecore's "no parent" sentinel and is treated
    // as a tree root, not an orphan.
    if (item.parent && !isNullParent(item.parent)) {
      const canonicalParent = normalizeGuid(item.parent);
      const parentNode = this.byId.get(canonicalParent) ?? this.byId.get(item.parent);
      if (parentNode) {
        parentNode.children.set(item.id, node);
        node.parentNode = parentNode;
      } else {
        this.orphans.push(node);
      }
    }

    // Check if any existing orphans are children of this new item - also
    // comparing by canonical form so mixed-encoding parent references
    // still pair up.
    const stillOrphaned: ItemNode[] = [];
    for (const orphan of this.orphans) {
      if (normalizeGuid(orphan.item.parent) === item.id) {
        node.children.set(orphan.item.id, orphan);
        orphan.parentNode = node;
      } else {
        stillOrphaned.push(orphan);
      }
    }
    this.orphans = stillOrphaned;

    return node;
  }

  getById(id: string): ItemNode | undefined {
    return this.byId.get(normalizeGuid(id));
  }

  /**
   * Return serialized items whose `parent` field matches the given parent ID
   * but which never linked to a tree node because the parent itself is not
   * serialized (typically a registry-only ancestor, e.g. /sitecore/layout/
   * Renderings/Foo is registry but Foo/Bar is serialized). Used by the
   * merged-children walker to surface these items when traversing from
   * a registry parent.
   */
  getOrphansByParent(parentId: string): ItemNode[] {
    const canonical = normalizeGuid(parentId);
    return this.orphans.filter(o => normalizeGuid(o.item.parent) === canonical);
  }

  getByPath(path: string): ItemNode | undefined {
    const exact = this.byPath.get(path.toLowerCase());
    if (exact) return exact;
    return this.byUrlSafePath.get(urlSafePath(path));
  }

  /**
   * Index the node under its URL-safe path key, first-wins on collision.
   * Logs a warning the first time a collision is observed so authoring
   * data with sibling items that differ only by case or space-vs-dash
   * surfaces in container logs (rare in SXA - the editor prevents it).
   */
  private indexUrlSafe(node: ItemNode): void {
    const key = urlSafePath(node.item.path);
    const existing = this.byUrlSafePath.get(key);
    if (existing && existing.item.id !== node.item.id) {
      console.warn(
        `  [tree] URL-safe path collision: "${node.item.path}" normalizes to "${key}" ` +
        `which is already claimed by "${existing.item.path}" - keeping first-added item.`,
      );
      return;
    }
    this.byUrlSafePath.set(key, node);
  }

  getByTemplate(templateId: string): ItemNode[] {
    const results: ItemNode[] = [];
    for (const node of this.byId.values()) {
      if (node.item.template === templateId) {
        results.push(node);
      }
    }
    return results;
  }

  /**
   * Relink a node (and its subtree) to a new parent, updating all paths.
   * Does NOT call removeItem - children are preserved.
   * Does NOT delete old files - callers are responsible for file cleanup.
   */
  relinkItem(id: string, newParentId: string, newPath: string): void {
    const node = this.byId.get(id);
    if (!node) return;

    // Unlink from old parent
    if (node.parentNode) {
      node.parentNode.children.delete(id);
    }

    // Update byPath for this node and all descendants (paths are prefix-replaced)
    const oldPathPrefix = node.item.path;
    this.updatePathsRecursive(node, oldPathPrefix, newPath);
    // updatePathsRecursive already updated node.item.path; now update parent ref
    node.item.parent = newParentId;

    // Link to new parent
    const newParentNode = this.byId.get(newParentId);
    if (newParentNode) {
      newParentNode.children.set(id, node);
      node.parentNode = newParentNode;
    } else {
      node.parentNode = null;
    }

    this._generation++;
  }

  private updatePathsRecursive(node: ItemNode, oldPrefix: string, newPrefix: string): void {
    this.byPath.delete(node.item.path.toLowerCase());
    // Only clear the URL-safe alias if it currently points at this node -
    // a colliding sibling may legitimately own the slot.
    const oldUrlKey = urlSafePath(node.item.path);
    if (this.byUrlSafePath.get(oldUrlKey) === node) {
      this.byUrlSafePath.delete(oldUrlKey);
    }
    const updatedPath = newPrefix + node.item.path.slice(oldPrefix.length);
    node.item.path = updatedPath;
    this.byPath.set(updatedPath.toLowerCase(), node);
    this.indexUrlSafe(node);
    for (const child of node.children.values()) {
      this.updatePathsRecursive(child, oldPrefix, newPrefix);
    }
  }

  removeItem(id: string): void {
    const node = this.byId.get(id);
    if (!node) return;
    for (const [childId] of node.children) {
      this.removeItem(childId);
    }
    if (node.parentNode) {
      node.parentNode.children.delete(id);
    }
    this.byId.delete(id);
    this.byPath.delete(node.item.path.toLowerCase());
    const urlKey = urlSafePath(node.item.path);
    if (this.byUrlSafePath.get(urlKey) === node) {
      this.byUrlSafePath.delete(urlKey);
    }
    this._generation++;
  }

  getAllNodes(): ItemNode[] {
    return Array.from(this.byId.values());
  }

  /**
   * Rebuild the children-of relationship from scratch using every node's
   * `item.parent` pointer as the single source of truth. Intended to be
   * called at the tail of a full index phase (fresh scan, cache load, or
   * additional-root scan) so the tree is guaranteed self-consistent
   * regardless of the order in which items were added - a defense against
   * mixed-SCS-serializer encoding of parent references (brace-wrapped /
   * uppercased variants) and against stale orphan state from prior
   * partial builds.
   *
   * Parent pointers are canonicalised at compare time via the same
   * brace-stripping + lowercase transform the parser applies to item
   * IDs, so a legacy serialized tree whose parent references were stored
   * in a non-canonical form still resolves.
   *
   * Returns the number of nodes still lacking a parent after the rebuild
   * - excluding true tree roots (items with no parent pointer at all).
   * Callers can use this as a startup consistency signal.
   */
  rebuildChildrenIndex(): number {
    for (const node of this.byId.values()) {
      node.children.clear();
      node.parentNode = null;
    }
    this.orphans = [];
    let unresolvedParented = 0;
    for (const node of this.byId.values()) {
      const rawParent = node.item.parent;
      if (!rawParent || isNullParent(rawParent)) continue;
      const canonical = normalizeGuid(rawParent);
      const parentNode = this.byId.get(canonical) ?? this.byId.get(rawParent);
      if (parentNode) {
        parentNode.children.set(node.item.id, node);
        node.parentNode = parentNode;
      } else {
        this.orphans.push(node);
        unresolvedParented++;
      }
    }
    return unresolvedParented;
  }

  resolveOrphans(): void {
    const stillOrphaned: ItemNode[] = [];
    for (const orphan of this.orphans) {
      if (isNullParent(orphan.item.parent)) continue;
      const canonical = normalizeGuid(orphan.item.parent);
      const parentNode = this.byId.get(canonical) ?? this.byId.get(orphan.item.parent);
      if (parentNode) {
        parentNode.children.set(orphan.item.id, orphan);
        orphan.parentNode = parentNode;
      } else {
        stillOrphaned.push(orphan);
      }
    }
    this.orphans = stillOrphaned;
  }

  getOrphans(): ItemNode[] {
    return [...this.orphans];
  }

  clear(): void {
    this.byId.clear();
    this.byPath.clear();
    this.byUrlSafePath.clear();
    this.orphans = [];
  }

  /**
   * Capture a structural snapshot of the index state for a planning cycle.
   * Used by the plan/apply path so a planner can run a real `createXxx`
   * call (which mutates the tree to record intermediate state) and then
   * roll back to the pre-planning shape without touching disk.
   *
   * The snapshot stores:
   *   - shallow copies of the byId / byPath / byUrlSafePath indices
   *     (entries are themselves shared references to the same ItemNode
   *     instances - safe because planning only ADDs nodes, never mutates
   *     existing ones in-place beyond what restore handles)
   *   - the orphans array (shallow copy)
   *   - the generation counter
   *   - per-existing-node clone of the children Map, since `addItem`
   *     mutates the parent's children Map directly
   */
  snapshot(): TreeSnapshot {
    const childrenByNodeId = new Map<string, Map<string, ItemNode>>();
    for (const [id, node] of this.byId) {
      childrenByNodeId.set(id, new Map(node.children));
    }
    // Capture each orphan's parentNode so a planning cycle that wires up
    // an orphan to a freshly-added parent (resolveOrphans during plan apply)
    // can be rolled back. Without this, a snapshot+restore would leave the
    // orphan's parentNode pointing at a node the restored byId no longer
    // references.
    const orphanParentNodes = new Map<string, ItemNode | null>();
    for (const orphan of this.orphans) {
      orphanParentNodes.set(orphan.item.id, orphan.parentNode);
    }
    return {
      byId: new Map(this.byId),
      byPath: new Map(this.byPath),
      byUrlSafePath: new Map(this.byUrlSafePath),
      orphans: [...this.orphans],
      generation: this._generation,
      childrenByNodeId,
      orphanParentNodes,
    };
  }

  restore(snap: TreeSnapshot): void {
    this.byId = new Map(snap.byId);
    this.byPath = new Map(snap.byPath);
    this.byUrlSafePath = new Map(snap.byUrlSafePath);
    this.orphans = [...snap.orphans];
    this._generation = snap.generation;
    // Restore each existing node's children Map. Nodes that were ADDED
    // during planning (and thus aren't in the snapshot's byId) get
    // dropped here naturally because they're no longer referenced from
    // any restored index.
    for (const [id, childrenMap] of snap.childrenByNodeId) {
      const node = this.byId.get(id);
      if (node) {
        node.children = new Map(childrenMap);
      }
    }
    // Restore each orphan's parentNode field captured at snapshot time.
    for (const orphan of this.orphans) {
      const saved = snap.orphanParentNodes.get(orphan.item.id);
      if (saved !== undefined) orphan.parentNode = saved;
    }
  }
}

export interface TreeSnapshot {
  byId: Map<string, ItemNode>;
  byPath: Map<string, ItemNode>;
  byUrlSafePath: Map<string, ItemNode>;
  orphans: ItemNode[];
  generation: number;
  childrenByNodeId: Map<string, Map<string, ItemNode>>;
  /** Snapshot of each orphan's parentNode at capture time, keyed by orphan
   *  item id. resolveOrphans during a plan cycle can wire an orphan to a
   *  newly-added parent; restore() needs to undo that. */
  orphanParentNodes: Map<string, ItemNode | null>;
}
