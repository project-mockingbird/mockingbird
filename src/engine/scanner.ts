import { resolve, dirname } from 'path';
import { glob } from 'glob';
import { ItemTree } from './tree.js';
import { discoverModules } from './module-config.js';
import { startPhase } from './index-timing.js';
import { parseInPool, WORKERS_AVAILABLE } from './parse-pool.js';
import { internItem, internPoolSize } from './intern.js';

export interface ScanOptions {
  onProgress?: (scanned: number, total: number) => void;
  /**
   * Short label used in phase-timing logs so the scan breakdown is legible
   * when multiple roots (e.g. `serialization` + `content`) are scanned.
   * Defaults to "scan".
   */
  label?: string;
  /**
   * 0.4.0.24 change B: optional map the scan populates with `(absolutePath →
   * {mtimeMs, size})` for every successfully-parsed file. Workers capture
   * the stat alongside `parseItem` (inode is hot from the readFile), and
   * the map is handed to the cache-write signature pass so it can skip
   * statting the full tree a second time. Populated across multiple
   * scan invocations when the same map reference is passed in.
   */
  statCollector?: Map<string, { mtimeMs: number; size: number }>;
}

export interface FileTarget {
  absolutePath: string;
  namespace?: string;
}

export async function collectFileTargets(rootDir: string): Promise<FileTarget[]> {
  const modules = await discoverModules(rootDir).catch(() => []);
  const targets: FileTarget[] = [];
  if (modules.length > 0) {
    for (const module of modules) {
      const moduleDir = dirname(module.filePath);
      const itemsBasePath = module.items.path ?? '';
      for (const include of module.items.includes) {
        const includeDir = resolve(moduleDir, itemsBasePath, include.name);
        const ymlFiles = await glob('**/*.yml', { cwd: includeDir });
        for (const ymlFile of ymlFiles) {
          targets.push({
            absolutePath: resolve(includeDir, ymlFile),
            namespace: module.namespace,
          });
        }
      }
    }
  } else {
    const ymlFiles = await glob('**/*.yml', { cwd: rootDir });
    for (const ymlFile of ymlFiles) {
      targets.push({ absolutePath: resolve(rootDir, ymlFile) });
    }
  }
  return targets;
}

async function runParseLoop(
  label: string,
  targets: FileTarget[],
  tree: ItemTree,
  options: ScanOptions,
): Promise<void> {
  const total = targets.length;
  options.onProgress?.(0, total);

  // parseInPool dispatches to a worker-thread pool when the compiled
  // worker script is on disk (production), or falls back to synchronous
  // parse on the main thread (tests / tsx dev). The tree.addItem calls
  // happen here on the main thread regardless.
  const phaseLabel = WORKERS_AVAILABLE
    ? `${label}: parse loop (worker pool)`
    : `${label}: parse loop (sequential fallback)`;
  const parseTimer = startPhase(phaseLabel);
  const t0 = process.hrtime.bigint();

  const results = await parseInPool(targets, {
    onProgress: (done, totalSeen) => options.onProgress?.(done, totalSeen),
  });

  let addedCount = 0;
  const poolSizeBefore = internPoolSize();
  const stats = options.statCollector;
  const skipped = new Map<string, number>();
  for (const r of results) {
    if (r.ok) {
      tree.addItem(internItem(r.item), r.absolutePath, r.namespace);
      addedCount++;
      if (stats) stats.set(r.absolutePath, { mtimeMs: r.mtimeMs, size: r.size });
    } else if (r.reason === 'not-an-item') {
      const k = r.firstKey || '<empty>'; // empty-document edge case
      skipped.set(k, (skipped.get(k) ?? 0) + 1);
    }
    // 'parse-error' results are silently skipped - bad YAML or IO errors
    // are rare and surface in the worker logs.
  }
  const poolGrowth = internPoolSize() - poolSizeBefore;

  const elapsedMs = Number(process.hrtime.bigint() - t0) / 1_000_000;
  parseTimer.end({
    items: addedCount,
    rate: addedCount > 0 ? `${(addedCount / (elapsedMs / 1000)).toFixed(0)}/s` : '0/s',
    internPool: `+${poolGrowth}`,
  });

  if (skipped.size > 0) {
    const skippedTotal = [...skipped.values()].reduce((sum, n) => sum + n, 0);
    const detail = [...skipped.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([k, n]) => `${k}(${n})`)
      .join(', ');
    console.log(`[index] ${label}: skipped ${skippedTotal} non-item document(s): ${detail}`);
  }
}

export async function scanDirectory(
  rootDir: string,
  options: ScanOptions = {}
): Promise<ItemTree> {
  const label = options.label ?? 'scan';
  const tree = new ItemTree();

  const collectTimer = startPhase(`${label}: collectFileTargets`);
  const targets = await collectFileTargets(rootDir);
  collectTimer.end({ files: targets.length });

  await runParseLoop(label, targets, tree, options);

  const resolveTimer = startPhase(`${label}: resolveOrphans`);
  tree.resolveOrphans();
  resolveTimer.end();

  return tree;
}

export async function scanAdditionalRoot(
  rootDir: string,
  tree: ItemTree,
  options: ScanOptions = {}
): Promise<void> {
  const label = options.label ?? 'scanAdditional';

  const collectTimer = startPhase(`${label}: collectFileTargets`);
  const targets = await collectFileTargets(rootDir);
  collectTimer.end({ files: targets.length });

  await runParseLoop(label, targets, tree, options);

  const resolveTimer = startPhase(`${label}: resolveOrphans`);
  tree.resolveOrphans();
  resolveTimer.end();
}
