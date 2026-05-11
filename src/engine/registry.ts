import { readFile } from 'fs/promises';
import { gunzipSync } from 'zlib';
import { TEMPLATE_TEMPLATE_ID } from './constants.js';
import { normalizeGuid } from './guid.js';
import type { RegistryData, RegistryItem } from './types.js';

export class Registry {
  private byId = new Map<string, RegistryItem>();
  private byPath = new Map<string, RegistryItem>();
  private byParent = new Map<string, RegistryItem[]>();
  private data: RegistryData | null = null;
  private databases = new Set<string>();
  private visibleByDb = new Map<string, Set<string>>();

  get size(): number {
    return this.byId.size;
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
      const normalized: RegistryItem = {
        ...item,
        id: item.id.toLowerCase(),
        parent: item.parent.toLowerCase(),
        template: item.template.toLowerCase(),
        database: item.database ?? 'master',
      };
      this.byId.set(normalized.id, normalized);
      this.byPath.set(normalized.path.toLowerCase(), normalized);
      this.databases.add(normalized.database);

      const parentId = normalized.parent;
      if (!this.byParent.has(parentId)) {
        this.byParent.set(parentId, []);
      }
      this.byParent.get(parentId)!.push(normalized);
    }

    this.buildVisibilityIndex();
  }

  /** For each database, compute the set of item IDs that should be visible:
   *  items belonging to that DB plus all their ancestors. */
  private buildVisibilityIndex(): void {
    this.visibleByDb.clear();
    for (const db of this.databases) {
      const visible = new Set<string>();
      for (const item of this.byId.values()) {
        if (item.database === db) {
          // Walk up the parent chain, marking each ancestor visible
          let current: RegistryItem | undefined = item;
          while (current && !visible.has(current.id)) {
            visible.add(current.id);
            current = this.byId.get(current.parent);
          }
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
    // Include all master-tagged items
    for (const item of this.byId.values()) {
      if (item.database === 'master') {
        visible.add(item.id);
      }
    }
    // Walk up from serialized items' parents to build the structural ancestor chain
    for (const parentId of serializedParentIds) {
      let current = this.byId.get(parentId.toLowerCase());
      while (current && !visible.has(current.id)) {
        visible.add(current.id);
        current = this.byId.get(current.parent);
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

  getById(id: string): RegistryItem | undefined {
    return this.byId.get(normalizeGuid(id));
  }

  getByPath(path: string): RegistryItem | undefined {
    return this.byPath.get(path.toLowerCase());
  }

  has(id: string): boolean {
    return this.byId.has(normalizeGuid(id));
  }

  getChildren(parentId: string, database?: string): RegistryItem[] {
    const children = this.byParent.get(normalizeGuid(parentId)) ?? [];
    if (!database) return children;
    const visible = this.visibleByDb.get(database);
    if (!visible) return [];
    return children.filter(c => visible.has(c.id));
  }

  private static readonly NULL_GUID = '00000000-0000-0000-0000-000000000000';

  getRootItems(database?: string): RegistryItem[] {
    const roots: RegistryItem[] = [];
    for (const item of this.byId.values()) {
      if (item.parent === Registry.NULL_GUID) {
        if (!database || this.isVisibleInDb(item.id, database)) {
          roots.push(item);
        }
      }
    }
    return roots;
  }

  getDatabases(): string[] {
    return Array.from(this.databases).sort();
  }

  sizeByDatabase(database: string): number {
    let count = 0;
    for (const item of this.byId.values()) {
      if (item.database === database) count++;
    }
    return count;
  }

  getAllTemplates(): RegistryItem[] {
    const results: RegistryItem[] = [];
    for (const item of this.byId.values()) {
      if (item.template === TEMPLATE_TEMPLATE_ID) {
        results.push(item);
      }
    }
    return results;
  }

  getItemsByTemplate(templateId: string): RegistryItem[] {
    const target = normalizeGuid(templateId);
    const results: RegistryItem[] = [];
    for (const item of this.byId.values()) {
      if (item.template === target) results.push(item);
    }
    return results;
  }
}
