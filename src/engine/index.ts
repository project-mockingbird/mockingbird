import { mkdir, writeFile, stat, rm } from 'fs/promises';
import { resolve, dirname, sep } from 'path';
import { scanDirectory, scanAdditionalRoot } from './scanner.js';
import { ItemTree } from './tree.js';
import { Registry } from './registry.js';
import { loadCachedTree, writeCachedTree, deleteStaleCache, type CacheRoot } from './index-cache.js';
import { validate as runValidation } from './validation/index.js';
import { serializeItem } from './serializer.js';
import { generateGuid, formatGuidBraced } from './guid.js';
import { FileWatcher } from './watcher.js';
import { parseItem } from './parser.js';
import { discoverModules } from './module-config.js';
import {
  TEMPLATE_TEMPLATE_ID,
  TEMPLATE_SECTION_TEMPLATE_ID,
  TEMPLATE_FIELD_TEMPLATE_ID,
  RENDERING_TEMPLATE_ID,
  STANDARD_TEMPLATE_ID,
  FIELD_IDS,
} from './constants.js';
import type { EngineOptions, ItemNode, ModuleConfig, ScsItem, ValidationResult } from './types.js';
import type { MutationPlan } from './mutation-plan.js';
import { insertItem as insertItemImpl, type InsertItemArgs, type InsertItemResult } from './insert-item.js';
import { resolveChildFilePath } from './child-file-path.js';
import { ReadinessState } from './readiness.js';
import { startPhase } from './index-timing.js';
import { loadPublishDateOverrides } from './layout/publish-dates.js';

export class Engine {
  private options: EngineOptions;
  private tree: ItemTree = new ItemTree();
  private watcher: FileWatcher | null = null;
  private modules: ModuleConfig[] = [];
  private registry: Registry | null = null;
  readonly readiness = new ReadinessState();
  private _closed = false;
  private _initStarted = false;
  /**
   * 0.4.0.24 (change A): cache write runs in the background after
   * `markReady`, freeing ~40s from cold-start time-to-ready. The promise
   * is retained so `close()` can await a pending write before the process
   * exits — preserves the cache-flush contract used by tests that do
   * `await engine.init(); await engine.close();` and then spin up a new
   * engine pointing at the same cache path.
   */
  private _cacheWritePromise: Promise<void> | null = null;
  /**
   * Set to true when the post-ready signature verification of a cache hit
   * resolves to "stale" - meaning we served the cached tree this session but
   * the on-disk YAML drifted from it. The cache file is deleted at the same
   * time so the next start rebuilds, but the in-memory tree is NOT replaced
   * (would require a full reparse). Surfaced on `/api/status` so callers can
   * detect they're reading a stale-but-served session and decide to restart.
   */
  private _cacheStale: boolean = false;
  /**
   * Resolves when the file watcher has finished its initial scan and is
   * actively observing for changes. Separated from `readiness` because
   * queries only need the tree to be loaded — the watcher is a background
   * concern and on slow bind-mounted filesystems (Windows Docker Desktop)
   * chokidar's `ready` event can be slow or never fire at all. Pinning
   * `readiness` on the watcher caused the 0.1.3 container-hang regression.
   */
  private _watcherReady: Promise<void> = Promise.resolve();
  // Cached for the close-time cache rewrite so we don't re-run discoverModules on shutdown.
  private _cacheRoots: CacheRoot[] = [];

  constructor(options: EngineOptions) {
    this.options = options;
  }

  async init(): Promise<void> {
    await this.startInit();
    await this.readiness.ready();
    await this._watcherReady;
  }

  /** Awaits the file watcher's initial scan. Mainly useful for tests. */
  async awaitWatcherReady(): Promise<void> {
    await this._watcherReady;
  }

  async startInit(): Promise<void> {
    if (this._initStarted) return;
    this._initStarted = true;

    const modulesTimer = startPhase('discoverModules (rootDir)');
    this.modules = this.options.rootDir
      ? await discoverModules(this.options.rootDir).catch(() => [])
      : [];
    modulesTimer.end({ modules: this.modules.length });

    if (this.options.registryPath) {
      const registryTimer = startPhase('registry load');
      this.registry = new Registry();
      try {
        if (this.options.registryPath.endsWith('.gz')) {
          await this.registry.loadFromGzip(this.options.registryPath);
        } else {
          await this.registry.loadFromJson(this.options.registryPath);
        }
        registryTimer.end({ items: this.registry.size });
      } catch {
        this.registry = null;
        registryTimer.end({ result: 'failed' });
      }
    }

    // 0.4.0.31: load per-item publish-date overrides. Sitecore's
    // `GetValidVersion(publishDate, ...)` consults this when picking which
    // version of a multi-version item to emit. Missing file is a no-op.
    const pubDatesTimer = startPhase('publish-date overrides load');
    const overridesPath =
      process.env.MOCKINGBIRD_PUBLISH_DATE_OVERRIDES_PATH
      ?? '/app/data/publish-dates.yml';
    await loadPublishDateOverrides(overridesPath);
    pubDatesTimer.end();

    // Kick off background indexing; do not await
    void this.indexInBackground();
  }

  private async indexInBackground(): Promise<void> {
    const totalTimer = startPhase('indexInBackground TOTAL');
    if (!this.options.rootDir) {
      totalTimer.end({ items: 0, ready: 'no-project' });
      this.readiness.markNoProject();
      return;
    }
    let staleVerifyPromise: Promise<boolean> | null = null;
    try {
      const onProgress = (scanned: number, total: number) =>
        this.readiness.markProgress(scanned, total);

      // Build the list of roots once — used both by the cache loader and,
      // on cache miss, by the full scan below. The primary rootDir is
      // passed through `scanDirectory`, additional content roots through
      // `scanAdditionalRoot`, so we remember which is which.
      const cacheRoots: CacheRoot[] = [{ rootDir: this.options.rootDir, additional: false }];
      for (const contentPath of this.options.contentPaths ?? []) {
        const hasModules = (await discoverModules(contentPath).catch(() => [])).length > 0;
        if (hasModules) cacheRoots.push({ rootDir: contentPath, additional: true });
      }
      this._cacheRoots = cacheRoots;

      let cacheHit = false;
      if (this.options.indexCachePath) {
        console.error(`  [index] checking cache at ${this.options.indexCachePath}`);
        const cached = await loadCachedTree(cacheRoots, this.options.indexCachePath);
        if (cached) {
          console.error(`  [index] cache hit (${cached.entryCount} items) — serving; verifying signature in background`);
          this.tree = cached.tree;
          this.readiness.markProgress(cached.entryCount, cached.entryCount);
          // Still load module configs for additional content roots so
          // modules list stays accurate — we skipped that branch above.
          for (const root of cacheRoots.filter(r => r.additional)) {
            const contentModules = await discoverModules(root.rootDir).catch(() => []);
            if (contentModules.length > 0) this.modules.push(...contentModules);
          }
          cacheHit = true;
          staleVerifyPromise = cached.verifyPromise;
        } else {
          console.error(`  [index] cache miss — full parse required`);
        }
      }

      // 0.4.0.24 change B: scan-time stats map shared across both scan
      // roots so the cache-write signature pass can skip its own stat
      // sweep. Only populated on the cold path.
      let scanStats: Map<string, { mtimeMs: number; size: number }> | undefined;
      if (!cacheHit) {
        scanStats = new Map();
        this.tree = await scanDirectory(this.options.rootDir, {
          onProgress,
          label: 'scan:root',
          statCollector: scanStats,
        });

        if (this._closed) {
          this.readiness.markError(new Error('Engine closed during initialization'));
          return;
        }

        for (const root of cacheRoots.filter(r => r.additional)) {
          const contentModules = await discoverModules(root.rootDir).catch(() => []);
          if (contentModules.length > 0) {
            await scanAdditionalRoot(root.rootDir, this.tree, {
              onProgress,
              label: 'scan:content',
              statCollector: scanStats,
            });
            if (this._closed) {
              this.readiness.markError(new Error('Engine closed during initialization'));
              return;
            }
            this.modules.push(...contentModules);
          }
        }

        // Cache write deferred to post-markReady — see `_cacheWritePromise`
        // assignment below.
      }

      if (this.registry) {
        const crossRefTimer = startPhase('registry cross-ref (ancestor walk)');
        this.serializedAncestorIds.clear();
        for (const node of this.tree.getAllNodes()) {
          const itemPath = node.item.path.toLowerCase();
          const segments = itemPath.split('/').filter(Boolean);
          for (let i = 1; i <= segments.length; i++) {
            const ancestorPath = '/' + segments.slice(0, i).join('/');
            const registryItem = this.registry.getByPath(ancestorPath);
            if (registryItem) {
              this.serializedAncestorIds.add(registryItem.id);
            }
          }
        }
        this.registry.addToVisibility('master', this.serializedAncestorIds);
        crossRefTimer.end({
          nodes: this.tree.getAllNodes().length,
          ancestorIds: this.serializedAncestorIds.size,
        });
      }

      // Rebuild the children index from `item.parent` pointers as a final
      // consistency pass. Defense against any tree fragment where an item
      // was added before its parent was known and the per-addItem orphan
      // sweep missed it - e.g. a legacy cache entry whose parent guid was
      // serialised in a non-canonical form, or an additional-root scan
      // that split a parent/child pair across two phases. Logs a warning
      // when items remain unresolved so regressions surface in prod logs.
      const rebuildTimer = startPhase('rebuildChildrenIndex');
      const unresolved = this.tree.rebuildChildrenIndex();
      rebuildTimer.end({ nodes: this.tree.getAllNodes().length, unresolved });
      if (unresolved > 0) {
        const orphans = this.tree.getOrphans();
        const registryParented: typeof orphans = [];
        const trulyBroken: typeof orphans = [];
        for (const orphan of orphans) {
          if (this.registry?.getById(orphan.item.parent)) {
            registryParented.push(orphan);
          } else {
            trulyBroken.push(orphan);
          }
        }
        if (registryParented.length > 0) {
          console.log(
            `  [index] ${registryParented.length} item(s) rooted under registry parents ` +
            `(normal SXA pattern; merged-children walker handles them).`,
          );
        }
        if (trulyBroken.length > 0) {
          console.warn(
            `  [index] ${trulyBroken.length} item(s) reference parents that exist in neither ` +
            `the tree nor the registry:`,
          );
          for (const node of trulyBroken) {
            console.warn(`  [index]   - ${node.item.path} (parent ${node.item.parent})`);
          }
        }
      }

      // Mark readiness BEFORE the file watcher's `ready` event fires.
      // Queries only need the item tree + registry visibility, both of which
      // are already built at this point. Chokidar's initial-scan `ready`
      // event can be slow or (on slow bind-mounted filesystems on Windows
      // Docker Desktop) may never fire at all; blocking readiness on it
      // left mockingbird stuck at 503 forever in 0.1.3 — the regression
      // captured in `tests/engine/async-init.test.ts`.
      if (this._closed) {
        this.readiness.markError(new Error('Engine closed during initialization'));
        return;
      }
      this.readiness.markReady();

      // 0.4.0.24 (change A): cache write runs in the background post-ready
      // so the ~40s write cost doesn't block time-to-serve on cold start.
      // `writeCachedTree` snapshots `tree.getAllNodes()` at call time, so
      // subsequent watcher mutations don't corrupt the in-flight write —
      // they just get captured on the next write.
      if (!cacheHit && this.options.indexCachePath) {
        const cachePath = this.options.indexCachePath;
        console.error(`  [index] writing cache to ${cachePath} (background)`);
        this._cacheWritePromise = writeCachedTree(cacheRoots, this.tree, cachePath, scanStats)
          .catch((err) => {
            console.error(`  [index] background cache write failed:`, err);
          });
      }

      // 0.4.0.26: sequence the post-ready background tasks instead of
      // firing them all concurrently. The async signature verify and
      // chokidar's initial-scan both stat every file (~20k each on the
      // reference content tree). Concurrently on a Windows bind mount they double
      // up on FS IO and each takes ~2-3× longer than alone (measured
      // verify ballooned from ~15s to 2m41s in 0.4.0.25 when racing
      // the watcher). Sequence: verify first, then watcher.
      //
      // `_watcherReady` wraps the whole chain so `init()` callers block
      // on the combined "verify + watcher ready" the same way they
      // used to block on the watcher alone. Tests that `await
      // engine.init()` now also wait for verify — synthetic corpora
      // make this negligible.
      this._watcherReady = this.runPostReadyBackgroundTasks(staleVerifyPromise);
    } catch (err) {
      // Only swallow the error as a readiness failure if we haven't already
      // flipped to ready — otherwise the engine is usable and the failure
      // only affects the post-ready watcher setup, which we ignore.
      if (!this.readiness.isReady()) {
        this.readiness.markError(err instanceof Error ? err : new Error(String(err)));
      }
    } finally {
      totalTimer.end({
        items: this.tree.getAllNodes().length,
        ready: this.readiness.isReady() ? 'yes' : 'no',
      });
    }
  }

  /**
   * Sequences the post-ready background work so concurrent stat-all-files
   * sweeps (cache-write signature pass / async verify / chokidar initial
   * scan) don't contend for Windows bind-mount FS IO. Order:
   *
   *   1. Cold path: await cache write (includes its 56s signature glob
   *      + 17s gzip write — each 20k-file pass is expensive on bind
   *      mount).
   *   2. Warm path: await signature verify (20k stats). Handle stale-
   *      cache deletion on mismatch.
   *   3. Chokidar watcher: construct + await `ready`. Its own tree walk
   *      now runs alone — dropping the signature phase from 56s (racing)
   *      to ~5s (alone) on 0.4.0.26 measurements.
   *
   * Cold and warm are mutually exclusive: warm hits cache → no cache
   * write, cold misses cache → no verify. So at most one of steps 1/2
   * runs. During that ~5-15s window runtime YAML edits aren't watched,
   * which is acceptable for a dev tool.
   */
  private async runPostReadyBackgroundTasks(
    staleVerifyPromise: Promise<boolean> | null,
  ): Promise<void> {
    try {
      // 1. Cold path: await background cache write before starting the
      // watcher. Its internal signature glob (~56s when concurrent with
      // chokidar; ~5s when alone) is the dominant background cost, so
      // this is the higher-leverage sequencing change.
      if (this._cacheWritePromise) {
        await this._cacheWritePromise;
      }

      // 2. Warm path: await signature verify, handle stale cache.
      if (staleVerifyPromise) {
        const fresh = await staleVerifyPromise;
        if (!fresh) {
          this._cacheStale = true;
          console.error(
            `  [index] cache signature MISMATCH — on-disk YAML drifted from cache. ` +
              `Serving stale tree this session; restart the container to pick up drift.`,
          );
          if (this.options.indexCachePath) {
            await deleteStaleCache(this.options.indexCachePath);
            console.error(`  [index] stale cache deleted — next container start will rebuild`);
          }
        }
      }

      if (this._closed) return;

      if (this.options.watch) {
        const watchPaths = [this.options.rootDir!, ...(this.options.contentPaths ?? [])];
        // Tracks last-processed mtime per path. Docker Desktop (Windows / WSL2) gRPC FUSE bind mounts surface phantom polling events for the same underlying mtime as metadata resyncs; without this dedupe one save fires the watcher pipeline several times.
        const lastProcessedMtime = new Map<string, number>();
        this.watcher = new FileWatcher(watchPaths, async (event) => {
          // Skip events that the engine itself triggered. Move/rename
          // operations register suppressions on the affected paths
          // BEFORE doing fs ops, so any chokidar event fired during the
          // operation gets discarded here. Without this, in-process
          // moves race the watcher: chokidar parses the just-renamed
          // file (which still has stale `Parent` / `Path` content
          // because the file content rewrite hasn't run yet) and re-
          // links the node back to its pre-move parent via tree.addItem's
          // idempotent re-add path. See `move-item.ts` for the call site.
          if (this.consumeWatcherSuppression(event.path)) return;
          // Errors thrown here propagate as unhandled async rejections and crash the process under Node's default behavior, including transient mid-write parse failures on 9P bind mounts. Catch + log; the next polling tick retries.
          try {
            if (event.type === 'add' || event.type === 'change') {
              const stats = await stat(event.path).catch(() => null);
              const mtime = stats?.mtimeMs ?? 0;
              if (lastProcessedMtime.get(event.path) === mtime) return;
              lastProcessedMtime.set(event.path, mtime);
              let item;
              try {
                item = await parseItem(event.path);
              } catch {
                // Most parse failures here are transient mid-write reads on slow bind mounts. Retry once after a brief delay before treating as real corruption.
                await new Promise((r) => setTimeout(r, 250));
                item = await parseItem(event.path);
              }
              this.tree.addItem(item, event.path);
              this.options.onItemChange?.({
                type: event.type === 'add' ? 'added' : 'changed',
                itemId: item.id,
                itemPath: item.path,
              });
            } else if (event.type === 'unlink') {
              lastProcessedMtime.delete(event.path);
              const node = this.tree.getAllNodes().find((n) => n.filePath === event.path);
              if (node) {
                this.tree.removeItem(node.item.id);
                this.options.onItemChange?.({
                  type: 'removed',
                  itemId: node.item.id,
                  itemPath: node.item.path,
                });
              }
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`  [watch] skipped ${event.type} ${event.path}: ${msg}`);
          }
        });

        if (this._closed) {
          await this.watcher.close();
          this.watcher = null;
          return;
        }

        await this.watcher.ready().catch(() => {
          /* watcher comes up later or not at all */
        });
      }
    } catch (err) {
      console.error(`  [index] post-ready background tasks failed:`, err);
    }
  }

  validate(): ValidationResult {
    return runValidation(this.tree, this.registry ?? undefined);
  }

  getRegistryTemplates(): import('./types.js').RegistryItem[] {
    return this.registry?.getAllTemplates() ?? [];
  }

  getRegistryItem(id: string): import('./types.js').RegistryItem | undefined {
    return this.registry?.getById(id);
  }

  getRegistryItemByPath(path: string): import('./types.js').RegistryItem | undefined {
    return this.registry?.getByPath(path);
  }

  getRegistryChildren(parentId: string, database?: string): import('./types.js').RegistryItem[] {
    return this.registry?.getChildren(parentId, database) ?? [];
  }

  getRegistryRootItems(database?: string): import('./types.js').RegistryItem[] {
    return this.registry?.getRootItems(database) ?? [];
  }

  getRegistryItemsByTemplate(templateId: string): import('./types.js').RegistryItem[] {
    return this.registry?.getItemsByTemplate(templateId) ?? [];
  }

  /**
   * Find the serialization module include (if any) whose path covers the
   * given Sitecore item path. "Covers" matches the same prefix-test that
   * `resolveFilePath` uses: include.path === itemPath OR itemPath starts
   * with include.path + '/'. Returns the FIRST match in module-load order
   * (which mirrors `resolveFilePath`'s behavior on overlapping includes).
   *
   * Use this to detect coverage gaps BEFORE writing - silent fallback to
   * `<rootDir>/<sitecore-path-segments>/<name>.yml` is a footgun for any
   * caller, scaffold included.
   */
  findCoveringInclude(itemSitecorePath: string): { module: ModuleConfig; include: import('./types.js').ModuleInclude } | undefined {
    const normalized = itemSitecorePath.toLowerCase();
    for (const mod of this.modules) {
      for (const include of mod.items.includes) {
        const includePath = include.path.toLowerCase();
        if (normalized === includePath || normalized.startsWith(includePath + '/')) {
          return { module: mod, include };
        }
      }
    }
    return undefined;
  }

  /**
   * Re-run `discoverModules` to pick up newly-written `*.module.json` files
   * (the scaffold orchestrators emit these for new tenants/sites). Replaces
   * the in-memory module list; does NOT touch the parsed tree, registry,
   * or cache. Subsequent `resolveFilePath` / `findCoveringInclude` calls
   * see the new includes immediately.
   */
  async reloadModules(): Promise<void> {
    if (!this.options.rootDir) return;
    this.modules = await discoverModules(this.options.rootDir).catch(() => []);
  }

  /** Read-only view of the engine's currently-loaded module list. */
  getModules(): ReadonlyArray<ModuleConfig> {
    return this.modules;
  }

  /** Workspace root directory (the dir holding `sitecore.json`). */
  getRootDir(): string | undefined {
    return this.options.rootDir;
  }

  getRegistryDatabases(): string[] {
    return this.registry?.getDatabases() ?? [];
  }

  private serializedAncestorIds = new Set<string>();

  /** Check if a registry item is a path-ancestor of any serialized item
   *  (serialized item's path starts with this item's path). */
  hasSerializedDescendants(registryItemId: string): boolean {
    return this.serializedAncestorIds.has(registryItemId.toLowerCase());
  }

  isRegistryLoaded(): boolean {
    return this.registry !== null && this.registry.size > 0;
  }

  /**
   * True after the post-ready cache signature verification flagged the
   * served-from-cache tree as stale (on-disk YAML drifted from the cache
   * snapshot). The flag stays true for the rest of the session - restarting
   * the container is the only way to pick up the drift.
   */
  isCacheStale(): boolean {
    return this._cacheStale;
  }

  registrySize(): number {
    return this.registry?.size ?? 0;
  }

  getAllItems(): ItemNode[] {
    return this.tree.getAllNodes();
  }

  /**
   * Monotonic counter that bumps on every tree mutation. Cache-invalidation
   * signal for memoized engine-wide reads (e.g. `discoverSiteDefinitions`).
   */
  get treeGeneration(): number {
    return this.tree.generation;
  }

  getItemById(id: string): ItemNode | undefined {
    return this.tree.getById(id);
  }

  getItemByPath(path: string): ItemNode | undefined {
    return this.tree.getByPath(path);
  }

  /** Serialized items whose parent isn't itself serialized. Used by the
   *  merged-children walker so that a serialized child of a registry-only
   *  parent (e.g. /sitecore/layout/Renderings/Foo/Bar, where Foo is
   *  registry but Bar is serialized) still appears under its parent
   *  in the unified view. */
  getOrphansByParent(parentId: string): ItemNode[] {
    return this.tree.getOrphansByParent(parentId);
  }

  getTree(): ItemTree {
    return this.tree;
  }

  async planUpdateFields(
    id: string,
    fields: Record<string, string>,
    language: string,
    version: number,
  ) {
    const { planUpdateFields } = await import('./plan-update-fields.js');
    return planUpdateFields(this, id, fields, language, version);
  }

  async applyPlan(plan: MutationPlan): Promise<void> {
    const { applyPlan } = await import('./apply-plan.js');
    return applyPlan(this, plan);
  }

  async planCreateItem(args: import('./plan-create-item.js').CreateItemArgs) {
    const { planCreateItem } = await import('./plan-create-item.js');
    return planCreateItem(this, args);
  }

  async planDeleteItem(idOrPath: string) {
    const { planDeleteItem } = await import('./plan-delete-item.js');
    return planDeleteItem(this, idOrPath);
  }

  async createTemplate(name: string, parentPath: string): Promise<ItemNode> {
    const parentNode = this.tree.getByPath(parentPath);
    if (!parentNode) throw new Error(`Parent path not found: ${parentPath}`);

    const templateId = generateGuid();
    const stdValId = generateGuid();
    const now = sitecoreDate();

    const templateItem: ScsItem = {
      id: templateId,
      parent: parentNode.item.id,
      template: TEMPLATE_TEMPLATE_ID,
      path: `${parentPath}/${name}`,
      sharedFields: [
        {
          id: FIELD_IDS.baseTemplate,
          hint: '__Base template',
          value: formatGuidBraced(STANDARD_TEMPLATE_ID),
        },
        {
          id: FIELD_IDS.standardValues,
          hint: '__Standard values',
          value: formatGuidBraced(stdValId),
        },
      ],
      languages: [
        {
          language: 'en',
          fields: [],
          versions: [
            {
              version: 1,
              fields: [
                { id: FIELD_IDS.created, hint: '__Created', value: now },
              ],
            },
          ],
        },
      ],
    };

    const stdValItem: ScsItem = {
      id: stdValId,
      parent: templateId,
      template: templateId,
      path: `${parentPath}/${name}/__Standard Values`,
      sharedFields: [],
      languages: [],
    };

    const templateFilePath = await this.writeItemFileAt(
      templateItem,
      this.computeChildFilePath(parentNode.filePath, templateItem.path),
    );
    const stdValFilePath = await this.writeItemFileAt(
      stdValItem,
      this.computeChildFilePath(templateFilePath, stdValItem.path),
    );

    const templateNode = this.tree.addItem(templateItem, templateFilePath);
    this.tree.addItem(stdValItem, stdValFilePath);

    return templateNode;
  }

  async createSection(name: string, templatePath: string): Promise<ItemNode> {
    const templateNode = this.tree.getByPath(templatePath);
    if (!templateNode) throw new Error(`Template path not found: ${templatePath}`);

    const sectionId = generateGuid();
    const now = sitecoreDate();

    const sectionItem: ScsItem = {
      id: sectionId,
      parent: templateNode.item.id,
      template: TEMPLATE_SECTION_TEMPLATE_ID,
      path: `${templatePath}/${name}`,
      sharedFields: [],
      languages: [
        {
          language: 'en',
          fields: [],
          versions: [
            {
              version: 1,
              fields: [
                { id: FIELD_IDS.created, hint: '__Created', value: now },
              ],
            },
          ],
        },
      ],
    };

    const filePath = await this.writeItemFileAt(
      sectionItem,
      this.computeChildFilePath(templateNode.filePath, sectionItem.path),
    );
    return this.tree.addItem(sectionItem, filePath);
  }

  async createField(name: string, sectionPath: string, fieldType: string): Promise<ItemNode> {
    const sectionNode = this.tree.getByPath(sectionPath);
    if (!sectionNode) throw new Error(`Section path not found: ${sectionPath}`);

    const fieldId = generateGuid();
    const now = sitecoreDate();

    const fieldItem: ScsItem = {
      id: fieldId,
      parent: sectionNode.item.id,
      template: TEMPLATE_FIELD_TEMPLATE_ID,
      path: `${sectionPath}/${name}`,
      sharedFields: [
        { id: FIELD_IDS.type, hint: 'Type', value: fieldType },
      ],
      languages: [
        {
          language: 'en',
          fields: [],
          versions: [
            {
              version: 1,
              fields: [
                { id: FIELD_IDS.created, hint: '__Created', value: now },
              ],
            },
          ],
        },
      ],
    };

    const filePath = await this.writeItemFileAt(
      fieldItem,
      this.computeChildFilePath(sectionNode.filePath, fieldItem.path),
    );
    return this.tree.addItem(fieldItem, filePath);
  }

  async createRendering(name: string, parentPath: string): Promise<ItemNode> {
    const parentNode = this.tree.getByPath(parentPath);
    if (!parentNode) throw new Error(`Parent path not found: ${parentPath}`);

    const renderingId = generateGuid();
    const now = sitecoreDate();

    const renderingItem: ScsItem = {
      id: renderingId,
      parent: parentNode.item.id,
      template: RENDERING_TEMPLATE_ID,
      path: `${parentPath}/${name}`,
      sharedFields: [],
      languages: [
        {
          language: 'en',
          fields: [],
          versions: [
            {
              version: 1,
              fields: [
                { id: FIELD_IDS.created, hint: '__Created', value: now },
              ],
            },
          ],
        },
      ],
    };

    const filePath = await this.writeItemFileAt(
      renderingItem,
      this.computeChildFilePath(parentNode.filePath, renderingItem.path),
    );
    return this.tree.addItem(renderingItem, filePath);
  }

  async insertItem(args: InsertItemArgs): Promise<InsertItemResult> {
    return insertItemImpl(this, args);
  }

  deleteItem(idOrPath: string): string[] {
    const node =
      this.tree.getById(idOrPath) ?? this.tree.getByPath(idOrPath);
    if (!node) throw new Error(`Item not found: ${idOrPath}`);

    const filePaths = collectFilePaths(node);
    this.tree.removeItem(node.item.id);
    return filePaths;
  }

  /**
   * Rename an item (and update all descendants' paths). Same parent,
   * new last-segment. Writes each affected item's YAML at its new
   * computed file path and removes the old files. Watcher events for
   * both old and new paths are suppressed.
   *
   * Throws if the target doesn't exist, is at the root (no parent),
   * the new name is invalid, or a sibling already uses the new name.
   */
  async renameItem(idOrPath: string, newName: string): Promise<ItemNode> {
    const node =
      this.tree.getById(idOrPath) ?? this.tree.getByPath(idOrPath);
    if (!node) throw new Error(`Item not found: ${idOrPath}`);

    if (!newName || newName.includes('/')) {
      throw new Error(`Invalid name: "${newName}"`);
    }
    const oldName = node.item.path.split('/').pop()!;
    if (newName === oldName) return node;

    const parentId = node.item.parent;
    if (!parentId) throw new Error(`Cannot rename root item: ${idOrPath}`);
    const parentNode = this.tree.getById(parentId);
    if (!parentNode) throw new Error(`Parent not in tree: ${parentId}`);

    // Sibling collision check (tree + registry children of the parent).
    const lowerNew = newName.toLowerCase();
    for (const c of parentNode.children.values()) {
      if (c.item.id === node.item.id) continue;
      const last = c.item.path.split('/').pop() ?? '';
      if (last.toLowerCase() === lowerNew) {
        throw new Error(`Name collision: "${newName}" already exists under ${parentNode.item.path}`);
      }
    }
    for (const c of this.getRegistryChildren(parentId)) {
      const last = c.path.split('/').pop() ?? '';
      if (last.toLowerCase() === lowerNew) {
        throw new Error(`Name collision: "${newName}" already exists under ${parentNode.item.path}`);
      }
    }

    const newPath = `${parentNode.item.path}/${newName}`;

    // Capture old file paths BEFORE relink (paths change in-memory after).
    const oldFilePaths = collectFilePaths(node);

    // Relink updates in-memory paths for the node + all descendants.
    // Same parent, new path.
    this.tree.relinkItem(node.item.id, parentId, newPath);

    // Pre-order walk to compute new file paths using each parent's NEW
    // file path. The root rename target's parent (parentNode) is unchanged,
    // so its existing filePath is the right anchor.
    const updates: { node: ItemNode; newFilePath: string }[] = [];
    const walk = (n: ItemNode, parentFilePath: string): void => {
      const newFp = this.computeChildFilePath(parentFilePath, n.item.path);
      updates.push({ node: n, newFilePath: newFp });
      for (const child of n.children.values()) walk(child, newFp);
    };
    walk(node, parentNode.filePath);

    // Suppress watcher for both old and new paths so chokidar's echo of
    // the rename + write doesn't re-process the same items.
    for (const fp of oldFilePaths) this.suppressWatcherFor(fp);
    for (const u of updates) this.suppressWatcherFor(u.newFilePath);

    // Write new files in pre-order (parent before children).
    for (const u of updates) {
      const written = await this.writeItemFileAt(u.node.item, u.newFilePath);
      u.node.filePath = written;
    }

    // Delete old files that aren't reused as new paths.
    const newFilePathSet = new Set(updates.map(u => u.newFilePath));
    for (const fp of oldFilePaths) {
      if (newFilePathSet.has(fp)) continue;
      await rm(fp, { force: true }).catch(() => {});
    }

    return node;
  }

  /**
   * Change an item's template id. Updates the in-memory `item.template`,
   * rewrites the YAML on disk with the new Template field, and suppresses
   * the watcher echo. Item path, name, children, and field values are
   * preserved as-is — this is purely a template-id swap.
   *
   * Mirrors Sitecore's `Item.ChangeTemplate(...)`, which (in real Sitecore)
   * also remaps field values across template schemas. Mockingbird treats
   * field collections as pass-through bags keyed by GUID, so no remap is
   * needed — the YAML keeps every existing field exactly as it was. Any
   * field whose definition does not exist on the new template stays in the
   * file (Sitecore-faithful: real Sitecore also retains stale field values
   * after a ChangeTemplate; they just aren't surfaced through the schema).
   *
   * Throws if:
   *   - The item doesn't exist or is registry-only.
   *   - The new template id is empty.
   *   - The new template id is not resolvable (neither tree nor registry).
   *
   * No-op if the current template already matches.
   */
  async changeTemplate(idOrPath: string, newTemplateId: string): Promise<ItemNode> {
    const node =
      this.tree.getById(idOrPath) ?? this.tree.getByPath(idOrPath);
    if (!node) throw new Error(`Item not found: ${idOrPath}`);

    if (!newTemplateId) {
      throw new Error('Invalid template id: ""');
    }
    const newTpl = newTemplateId.toLowerCase();
    if (node.item.template === newTpl) return node;

    // Resolve the new template id against tree-first then registry.
    // Registry-only templates are valid targets — they're the OOTB
    // Sitecore template corpus and don't need on-disk YAML.
    const known =
      this.tree.getById(newTpl) ?? this.getRegistryItem(newTpl);
    if (!known) {
      throw new Error(`Template not found: ${newTemplateId}`);
    }

    // Suppress watcher before the write so chokidar's echo doesn't
    // re-parse the YAML and reapply the old Template via tree.addItem.
    this.suppressWatcherFor(node.filePath);

    node.item.template = newTpl;
    await this.writeItemFileAt(node.item, node.filePath);

    return node;
  }

  async moveItem(idOrPath: string, newParentPath: string): Promise<ItemNode> {
    const node =
      this.tree.getById(idOrPath) ?? this.tree.getByPath(idOrPath);
    if (!node) throw new Error(`Item not found: ${idOrPath}`);

    const newParentNode = this.tree.getByPath(newParentPath);
    if (!newParentNode) throw new Error(`New parent path not found: ${newParentPath}`);

    const itemName = node.item.path.split('/').pop()!;
    const newPath = `${newParentPath}/${itemName}`;

    // Relink node (and its subtree) to the new parent, updating all in-memory paths.
    // Children are preserved — relinkItem does NOT call removeItem.
    // TODO: old files on disk are not deleted here; callers should handle cleanup
    //       if needed (e.g. by recording the old filePath before calling moveItem).
    this.tree.relinkItem(node.item.id, newParentNode.item.id, newPath);

    // Write the moved item's file at the new location via the SCS-parity
    // path pipeline. Inherits the new parent's serialization root
    // automatically. See `child-file-path.ts`.
    const filePath = await this.writeItemFileAt(
      node.item,
      this.computeChildFilePath(newParentNode.filePath, node.item.path),
    );
    node.filePath = filePath;

    return node;
  }

  async close(): Promise<void> {
    this._closed = true;
    // 0.4.0.24 (change A): drain the background cache write before
    // closing so on-disk state reflects the tree we actually served.
    // Failure was already logged; swallow to avoid double-logging.
    if (this._cacheWritePromise) {
      await this._cacheWritePromise.catch(() => {});
      this._cacheWritePromise = null;
    }
    // Write a fresh cache reflecting in-session mutations (PUT, trim, etc.) so the next graceful start is both warm AND fresh. Hard kills fall back to the existing verify-and-delete path.
    if (this.options.indexCachePath && this.readiness.isReady() && this._cacheRoots.length > 0) {
      console.error(`  [index] writing cache on shutdown to ${this.options.indexCachePath}`);
      try {
        await writeCachedTree(this._cacheRoots, this.tree, this.options.indexCachePath);
      } catch (err) {
        console.error(`  [index] shutdown cache write failed:`, err);
      }
    }
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
  }

  /**
   * Closes the currently-open workspace, returning the engine to 'no-project'
   * state. Tears down the file watcher (if any) and clears the in-memory tree.
   * The OOTB registry stays loaded.
   *
   * Safe to call from no-project state (no-op).
   */
  async closeWorkspace(): Promise<void> {
    if (this.readiness.state === 'no-project') return;
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
    if (this._cacheWritePromise) {
      try { await this._cacheWritePromise; } catch { /* swallow - tear-down */ }
      this._cacheWritePromise = null;
    }
    this.tree = new ItemTree();
    this.modules = [];
    this._cacheRoots = [];
    this.readiness.reset();
    this.readiness.markNoProject();
  }

  async writeItemFile(item: ScsItem): Promise<string> {
    const itemName = item.path.split('/').pop()!;
    const filePath = this.resolveFilePath(item.path, itemName);
    return this.writeItemFileAt(item, filePath);
  }

  /**
   * Watcher-event suppression registry. Paths with an unexpired entry
   * here are skipped by the file-watcher handler. Used by move/rename
   * to silence chokidar's echo of the engine's own fs.rename + write
   * operations - without this, the watcher parses the just-renamed
   * file (which still has stale `Parent`/`Path` content during the
   * brief window before the rewrite lands) and re-links the moved
   * node back to its pre-move parent via tree.addItem's idempotent
   * re-add path.
   *
   * The TTL is duration-based rather than per-event-count: chokidar
   * coalesces add+change+unlink combos unpredictably across platforms,
   * so a count-based scheme can leak suppression credits. A short TTL
   * (~2s) covers the typical Windows-native chokidar latency without
   * masking concurrent manual edits to the same file.
   */
  private _watcherSuppressions = new Map<string, number>();

  /**
   * Register `path` as recently-touched by an in-process operation so
   * the watcher discards events for it within the duration. Re-call to
   * extend the window.
   */
  suppressWatcherFor(path: string, durationMs = 2000): void {
    this._watcherSuppressions.set(path, Date.now() + durationMs);
  }

  /**
   * Returns true if `path` is currently suppressed (within the
   * registered TTL). Expired entries are evicted lazily.
   */
  private consumeWatcherSuppression(path: string): boolean {
    const expiry = this._watcherSuppressions.get(path);
    if (expiry === undefined) return false;
    if (Date.now() > expiry) {
      this._watcherSuppressions.delete(path);
      return false;
    }
    return true;
  }

  /**
   * Compute the on-disk path for a new child YAML, given the destination
   * parent's existing filePath and the child's full Sitecore item path.
   * Routes through the SCS-parity pipeline in `child-file-path.ts`,
   * which handles per-segment filesystem-safe encoding, MAX_PATH-aware
   * tail hashing, and per-rule path aliases. Picks the include scope
   * by longest-prefix match against `parentFilePath`.
   */
  computeChildFilePath(parentFilePath: string, childItemSitecorePath: string): string {
    return resolveChildFilePath(parentFilePath, childItemSitecorePath, this.modules);
  }

  /**
   * Low-level write: serialize `item` and place its YAML at `filePath`.
   * Bypasses `resolveFilePath` entirely - the caller has already decided
   * where the YAML belongs. Used by all new-item creation paths so the
   * destination parent's existing on-disk root can drive the child's
   * location (sibling-style layout, multi-root routing). See
   * `child-file-path.ts` for the path-derivation helper.
   */
  async writeItemFileAt(item: ScsItem, filePath: string): Promise<string> {
    const yaml = serializeItem(item);
    if (this._recordingStack.length > 0) {
      // Push to the topmost active recording (LIFO). Concurrent recordings
      // each get their own slice via tokens; this avoids the data race the
      // earlier boolean+array pair had where a second beginRecording would
      // wipe the first's buffer.
      this._recordingStack[this._recordingStack.length - 1].writes.push({ path: filePath, after: yaml });
      return filePath;
    }
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, yaml, 'utf-8');
    return filePath;
  }

  // Recording infrastructure for planning - see plan-create-item.ts.
  // While at least one recording is active, writeItemFile captures
  // (path, after) into the topmost frame's writes array instead of
  // writing to disk. This lets the planner run the real create logic
  // (so it benefits from every quirk of the existing implementation)
  // and then roll back the in-memory mutations via the tree
  // snapshot/restore pair.
  //
  // Each beginRecording mints a unique token; endRecording matches by
  // token so two concurrent recordings cannot corrupt each other's
  // captured writes.
  private _recordingStack: Array<{ token: symbol; writes: Array<{ path: string; after: string }> }> = [];

  beginRecording(): symbol {
    const token = Symbol('mb-recording');
    this._recordingStack.push({ token, writes: [] });
    return token;
  }

  endRecording(token: symbol): Array<{ path: string; after: string }> {
    const idx = this._recordingStack.findIndex(r => r.token === token);
    if (idx === -1) return [];
    const [removed] = this._recordingStack.splice(idx, 1);
    return removed.writes;
  }

  resolveFilePath(itemSitecorePath: string, itemName: string): string {
    if (!this.options.rootDir) {
      throw new Error('resolveFilePath is not available in no-project mode');
    }
    const normalizedItem = itemSitecorePath.toLowerCase();
    for (const mod of this.modules) {
      const modDir = dirname(mod.filePath);
      for (const include of mod.items.includes) {
        const includePath = include.path.toLowerCase();
        if (normalizedItem === includePath || normalizedItem.startsWith(includePath + '/')) {
          // Strip the include path prefix from the item path to get the relative portion
          const relative = itemSitecorePath.slice(include.path.length);
          const relSegments = relative.split('/').filter(Boolean);
          const includeBase = resolve(modDir, include.name);
          const resolved = resolve(includeBase, ...relSegments, `${itemName}.yml`);
          assertContained(resolved, includeBase, itemSitecorePath);
          return resolved;
        }
      }
    }
    // Fallback: rootDir / <path segments after "sitecore"> / itemName / itemName.yml
    const pathSegments = itemSitecorePath.split('/').filter(Boolean);
    const fallbackBase = resolve(this.options.rootDir);
    const resolved = resolve(fallbackBase, ...pathSegments.slice(1), `${itemName}.yml`);
    assertContained(resolved, fallbackBase, itemSitecorePath);
    return resolved;
  }
}

/**
 * Reject a resolved file path that escapes its expected base directory.
 * Crafted YAML `Path:` values can contain `..` segments or absolute path
 * fragments (drive letters on Windows, leading slash on POSIX); without this
 * check, `resolve()` would happily return a path outside the SCS root and a
 * later `writeFile` would clobber arbitrary disk locations.
 */
function assertContained(resolved: string, base: string, itemSitecorePath: string): void {
  const baseWithSep = base.endsWith(sep) ? base : base + sep;
  if (resolved !== base && !resolved.startsWith(baseWithSep)) {
    throw new Error(
      `path traversal rejected: item path ${JSON.stringify(itemSitecorePath)} resolves outside ${base}`,
    );
  }
}

export function collectFilePaths(node: ItemNode): string[] {
  const paths: string[] = [node.filePath];
  for (const child of node.children.values()) {
    paths.push(...collectFilePaths(child));
  }
  return paths;
}

export function sitecoreDate(): string {
  const d = new Date();
  const pad = (n: number, len = 2) => String(n).padStart(len, '0');
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

// Re-export public types and utilities
export type { ScsItem, ScsField, ItemNode, ValidationResult, EngineOptions } from './types.js';
export { Registry } from './registry.js';
export { VALID_FIELD_TYPES, classifyItem, RENDERING_TEMPLATE_ID, KNOWN_BUILTIN_TEMPLATE_IDS } from './constants.js';
export { generateGuid, formatGuidBraced, normalizeGuid } from './guid.js';
export { parseItem, parseItemFromString } from './parser.js';
export { serializeItem, updateField } from './serializer.js';
export { ItemTree } from './tree.js';
export { getTemplateSchema, clearTemplateSchemaCache } from './template-schema.js';
export type { TemplateFieldSchema, TemplateSectionSchema, TemplateSchema } from './template-schema.js';
export { resolveLayout } from './layout/index.js';
export type { LayoutOptions, LayoutRoute, ComponentNode, JssFieldValue } from './layout/index.js';
export type { InsertOption } from './insert-options.js';
export type { InsertItemArgs, InsertItemResult } from './insert-item.js';
