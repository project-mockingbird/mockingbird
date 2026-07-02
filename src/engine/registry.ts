import { readFile } from 'fs/promises';
import { gunzipSync } from 'zlib';
import { TEMPLATE_TEMPLATE_ID } from './constants.js';
import { normalizeGuid } from './guid.js';
import type { RegistryData, RegistryItem } from './types.js';

export class Registry {
  // db -> (key -> value). Partitioned so cross-database GUID/path twins coexist.
  private byId = new Map<string, Map<string, RegistryItem>>();
  private byPath = new Map<string, Map<string, RegistryItem>>();
  private byParent = new Map<string, Map<string, RegistryItem[]>>();
  private data: RegistryData | null = null;
  private databases = new Set<string>();
  private visibleByDb = new Map<string, Set<string>>();

  /** Preferred db order for db-agnostic lookups: master first (content-tool centric),
   *  then core, then any remaining dbs alphabetically. */
  private dbOrder(): string[] {
    const head = ['master', 'core'].filter(d => this.databases.has(d));
    const rest = [...this.databases].filter(d => !head.includes(d)).sort();
    return [...head, ...rest];
  }

  get size(): number {
    let n = 0;
    for (const m of this.byId.values()) n += m.size;
    return n;
  }

  get version(): string {
    return this.data?.version ?? '';
  }

  get source(): string {
    return this.data?.source ?? '';
  }

  async loadFromJson(filePath: string): Promise<void> {
    const content = await readFile(filePath, 'utf-8');
    this.index(JSON.parse(content));
  }

  async loadFromGzip(filePath: string): Promise<void> {
    const compressed = await readFile(filePath);
    const decompressed = gunzipSync(compressed).toString('utf-8');
    this.index(JSON.parse(decompressed));
  }

  private index(data: RegistryData): void {
    this.data = data;
    this.byId.clear();
    this.byPath.clear();
    this.byParent.clear();
    this.databases.clear();

    for (const item of data.items) {
      const database = item.database ?? 'master';
      const normalized: RegistryItem = {
        ...item,
        id: item.id.toLowerCase(),
        parent: item.parent.toLowerCase(),
        template: item.template.toLowerCase(),
        database,
      };
      this.databases.add(database);
      if (!this.byId.has(database)) {
        this.byId.set(database, new Map());
        this.byPath.set(database, new Map());
        this.byParent.set(database, new Map());
      }
      this.byId.get(database)!.set(normalized.id, normalized);
      this.byPath.get(database)!.set(normalized.path.toLowerCase(), normalized);
      const pmap = this.byParent.get(database)!;
      const parentId = normalized.parent;
      if (!pmap.has(parentId)) pmap.set(parentId, []);
      pmap.get(parentId)!.push(normalized);
    }

    this.buildVisibilityIndex();
  }

  /** For each database, compute the set of item IDs that should be visible:
   *  items belonging to that DB plus all their ancestors. */
  private buildVisibilityIndex(): void {
    this.visibleByDb.clear();
    for (const db of this.databases) {
      const visible = new Set<string>();
      const dbMap = this.byId.get(db)!;
      for (const item of dbMap.values()) {
        let current: RegistryItem | undefined = item;
        while (current && !visible.has(current.id)) {
          visible.add(current.id);
          current = dbMap.get(current.parent);
        }
      }
      this.visibleByDb.set(db, visible);
    }
  }

  /** Rebuild master visibility using serialized items as anchors.
   *  Master-tagged registry items are shown, but core-tagged ancestors are only
   *  included if they lead to a serialized item (not to random OOTB master items). */
  rebuildMasterVisibility(serializedParentIds: string[]): void {
    const visible = new Set<string>();
    const masterMap = this.byId.get('master');
    if (masterMap) {
      for (const item of masterMap.values()) visible.add(item.id);
      for (const parentId of serializedParentIds) {
        let current = masterMap.get(parentId.toLowerCase());
        while (current && !visible.has(current.id)) {
          visible.add(current.id);
          current = masterMap.get(current.parent);
        }
      }
    }
    this.visibleByDb.set('master', visible);
  }

  addToVisibility(database: string, ids: Set<string>): void {
    let visible = this.visibleByDb.get(database);
    if (!visible) {
      visible = new Set<string>();
      this.visibleByDb.set(database, visible);
    }
    for (const id of ids) {
      visible.add(id);
    }
  }

  isVisibleInDb(id: string, database: string): boolean {
    const visible = this.visibleByDb.get(database);
    return visible ? visible.has(normalizeGuid(id)) : false;
  }

  getById(id: string, db?: string): RegistryItem | undefined {
    const nid = normalizeGuid(id);
    if (db) return this.byId.get(db)?.get(nid);
    for (const d of this.dbOrder()) {
      const hit = this.byId.get(d)?.get(nid);
      if (hit) return hit;
    }
    return undefined;
  }

  getByPath(path: string, db?: string): RegistryItem | undefined {
    const p = path.toLowerCase();
    if (db) return this.byPath.get(db)?.get(p);
    for (const d of this.dbOrder()) {
      const hit = this.byPath.get(d)?.get(p);
      if (hit) return hit;
    }
    return undefined;
  }

  has(id: string, db?: string): boolean {
    return this.getById(id, db) !== undefined;
  }

  getChildren(parentId: string, database?: string): RegistryItem[] {
    const pid = normalizeGuid(parentId);
    if (!database) {
      // Db-agnostic: OOTB items exist in both master and core, so the SAME child
      // id can appear under this parent in multiple dbs. De-dupe by id with
      // master-first preference (mirroring getById / collectByTemplate) - without
      // it, template-schema doubles every field of any core+master template (the
      // Content Editor "Data" section rendered Command/Items/Schedule/... twice).
      // Distinct-id children across dbs (mis-located twins) are all preserved.
      const seen = new Set<string>();
      const all: RegistryItem[] = [];
      for (const db of this.dbOrder()) {
        const c = this.byParent.get(db)?.get(pid);
        if (!c) continue;
        for (const child of c) {
          if (seen.has(child.id)) continue;
          seen.add(child.id);
          all.push(child);
        }
      }
      return all;
    }
    const children = this.byParent.get(database)?.get(pid) ?? [];
    const visible = this.visibleByDb.get(database);
    if (!visible) return [];
    return children.filter(c => visible.has(c.id));
  }

  private static readonly NULL_GUID = '00000000-0000-0000-0000-000000000000';

  getRootItems(database?: string): RegistryItem[] {
    const roots: RegistryItem[] = [];
    const dbs = database ? [database] : [...this.databases];
    for (const db of dbs) {
      const m = this.byId.get(db);
      if (!m) continue;
      for (const item of m.values()) {
        if (item.parent === Registry.NULL_GUID) {
          if (!database || this.isVisibleInDb(item.id, database)) roots.push(item);
        }
      }
    }
    return roots;
  }

  getDatabases(): string[] {
    return Array.from(this.databases).sort();
  }

  sizeByDatabase(database: string): number {
    return this.byId.get(database)?.size ?? 0;
  }

  getAllTemplates(): RegistryItem[] {
    return this.collectByTemplate(TEMPLATE_TEMPLATE_ID);
  }

  getItemsByTemplate(templateId: string): RegistryItem[] {
    return this.collectByTemplate(normalizeGuid(templateId));
  }

  /** Collect items whose template matches `target`, de-duplicated by id with master
   *  preference (a colliding GUID yields its master twin, matching pre-partition behavior). */
  private collectByTemplate(target: string): RegistryItem[] {
    const seen = new Set<string>();
    const results: RegistryItem[] = [];
    for (const db of this.dbOrder()) {
      const m = this.byId.get(db);
      if (!m) continue;
      for (const item of m.values()) {
        if (item.template === target && !seen.has(item.id)) {
          seen.add(item.id);
          results.push(item);
        }
      }
    }
    return results;
  }
}
