import { stat, mkdir, unlink, rename } from 'fs/promises';
import { createReadStream, createWriteStream } from 'fs';
import { createGzip, createGunzip } from 'zlib';
import { createInterface } from 'readline';
import { dirname } from 'path';
import { createHash } from 'crypto';
import { pipeline } from 'stream/promises';
import { collectFileTargets, type FileTarget } from './scanner.js';
import { ItemTree } from './tree.js';
import { startPhase, formatBytes } from './index-timing.js';
import { internItem, internPoolSize } from './intern.js';
import { BLOB_FIELD_ID } from './constants.js';
import type { ScsItem } from './types.js';

/**
 * Cache format version.
 *
 * v2: gzipped NDJSON — one header line + one JSON-encoded entry per line.
 * v3 (0.4.0.22): one-shot `v8.serialize` (reverted in 0.4.0.23 — slower).
 * v4 (0.4.0.23): back to NDJSON.
 * v5 (0.4.0.25): NDJSON with `Blob` fields (`40e50ed9-…`) stripped from
 *     cache entries to cut size ~89% (media-item audit found Blob is
 *     538 MB of 607 MB decompressed on the reference content tree). `extractBlob`
 *     fault-reads the field from the item's YAML on demand, backed by a
 *     small LRU. The cache has always been an accelerator over the
 *     authoritative YAML tree, so dropping a derivable field doesn't
 *     break the round-trip contract.
 */
const CACHE_VERSION = 5;

export interface CacheRoot {
  /** Absolute rootDir path. */
  rootDir: string;
  /** Whether this root's targets have module namespaces attached. */
  additional: boolean;
}

/**
 * Result of a successful cache load. `tree` is populated and ready to serve;
 * `verifyPromise` resolves asynchronously after the signature check against
 * the on-disk source tree completes.
 *
 * 0.4.0.23 — separated from the sync verify path so callers can markReady
 * immediately on cache hit (warm-start budget was 63% signature verify on
 * instrumented runs). Callers that want old synchronous semantics can
 * `await` the promise before using the tree; the typical path is to serve
 * from `tree` and fire-and-forget the verify, deleting the cache file if
 * it resolves false so the next container start rebuilds.
 */
export interface CachedTree {
  tree: ItemTree;
  entryCount: number;
  /** Resolves to `true` if the on-disk source tree matches the cache's
   *  signature, `false` if the cache is stale. */
  verifyPromise: Promise<boolean>;
}

interface CacheHeader {
  version: number;
  signature: string;
}

interface CacheEntry {
  filePath: string;
  namespace?: string;
  item: ScsItem;
}

/**
 * Gather file targets across all roots in a stable order and stat each to
 * build a signature consisting of (path, mtimeMs, size) triples. Used both
 * for cache invalidation and to skip re-parsing when nothing changed.
 *
 * 0.4.0.24 change B: optional `prefetchedStats` map short-circuits the
 * stat pass — the scanner already captured `{mtimeMs, size}` per file
 * alongside `parseItem`, and those are hot in the OS page cache. Warm
 * (verify) path doesn't populate this, so it still stats from scratch.
 */
async function gatherTargetsAndSignature(
  roots: CacheRoot[],
  prefetchedStats?: Map<string, { mtimeMs: number; size: number }>,
): Promise<{ targets: Array<FileTarget & { root: CacheRoot }>; signature: string }> {
  const collectTimer = startPhase('cache signature: collectFileTargets');
  const all: Array<FileTarget & { root: CacheRoot }> = [];
  for (const root of roots) {
    const targets = await collectFileTargets(root.rootDir);
    for (const t of targets) all.push({ ...t, root });
  }
  collectTimer.end({ files: all.length });

  const stats: Array<{ path: string; mtimeMs: number; size: number }> = new Array(all.length);

  if (prefetchedStats) {
    const reuseTimer = startPhase('cache signature: reuse scan-time stats');
    let missing = 0;
    for (let i = 0; i < all.length; i++) {
      const t = all[i];
      const pre = prefetchedStats.get(t.absolutePath);
      if (pre) {
        stats[i] = { path: t.absolutePath, mtimeMs: pre.mtimeMs, size: pre.size };
      } else {
        // Fallback stat for any path missing from the prefetch (e.g. file
        // added between scan and signature, or parse failure that left
        // the file out of the map).
        missing++;
        const s = await stat(t.absolutePath).catch(() => null);
        stats[i] = s
          ? { path: t.absolutePath, mtimeMs: s.mtimeMs, size: s.size }
          : { path: t.absolutePath, mtimeMs: 0, size: 0 };
      }
    }
    reuseTimer.end({ files: all.length, missingFallback: missing });
  } else {
    // Parallelise stats in chunks — each stat is fast, the sum is what hurts.
    const statTimer = startPhase('cache signature: stat all files');
    const CHUNK = 200;
    for (let i = 0; i < all.length; i += CHUNK) {
      const slice = all.slice(i, i + CHUNK);
      const results = await Promise.all(
        slice.map(async (t) => {
          const s = await stat(t.absolutePath).catch(() => null);
          return s
            ? { path: t.absolutePath, mtimeMs: s.mtimeMs, size: s.size }
            : { path: t.absolutePath, mtimeMs: 0, size: 0 };
        }),
      );
      for (let j = 0; j < results.length; j++) stats[i + j] = results[j];
    }
    statTimer.end({ files: all.length, chunkSize: CHUNK });
  }

  const hashTimer = startPhase('cache signature: sort+hash');
  stats.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const hash = createHash('sha256');
  for (const s of stats) hash.update(`${s.path}|${s.mtimeMs}|${s.size}\n`);
  hashTimer.end();

  return { targets: all, signature: hash.digest('hex') };
}

/**
 * Decides whether to trust the cache without re-statting every YAML on
 * disk. When the cache file was written within the configured threshold
 * (default 30s, override via `MOCKINGBIRD_CACHE_VERIFY_SKIP_SECONDS`), the
 * watcher's initial scan will catch any drift from the brief edit window
 * - cheaper than walking 21K files through 9p on every container restart.
 * Set the env var to 0 (or a negative value) to always run full verification.
 *
 * Pure function so the threshold logic is unit-testable independent of fs
 * fixtures or mtime mocking.
 */
export function shouldSkipSignatureVerify(
  cacheMtimeMs: number,
  nowMs: number,
  env: { MOCKINGBIRD_CACHE_VERIFY_SKIP_SECONDS?: string } = process.env,
): boolean {
  const raw = env.MOCKINGBIRD_CACHE_VERIFY_SKIP_SECONDS;
  const skipSeconds = raw === undefined ? 30 : parseInt(raw, 10);
  if (!Number.isFinite(skipSeconds) || skipSeconds <= 0) return false;
  const deltaMs = nowMs - cacheMtimeMs;
  // Future-stamped cache (clock skew or someone touch'd the file) - don't
  // trust. Force verify so we don't silently serve a divergent tree.
  if (deltaMs < 0) return false;
  return deltaMs < skipSeconds * 1000;
}

/**
 * Try to load a cached tree from `cachePath`. Streams the file through
 * gunzip + readline, decoding one NDJSON entry per line — parse overlaps
 * with decompress so we never materialize the full decompressed payload.
 *
 * Signature verification is deferred to a background Promise so the caller
 * can markReady immediately (0.4.0.23 trust-then-verify). On verify failure
 * the caller is responsible for deleting the cache file so the next restart
 * rebuilds.
 *
 * Returns null only on pre-tree failures (file absent, version mismatch,
 * parse error). Signature mismatch returns a populated tree with
 * `verifyPromise` resolving to `false`.
 */
export async function loadCachedTree(
  roots: CacheRoot[],
  cachePath: string,
): Promise<CachedTree | null> {
  // Check file exists first — stat is cheap and the common miss path.
  let cacheSize = 0;
  let cacheMtimeMs = 0;
  try {
    const s = await stat(cachePath);
    cacheSize = s.size;
    cacheMtimeMs = s.mtimeMs;
  } catch {
    return null;
  }

  // Sync line-by-line JSON.parse through gunzip+readline. 0.4.0.24
  // briefly moved the JSON.parse to a worker pool (change C) on the
  // hypothesis that parse was CPU-bound; measurement showed the phase
  // was dominated by gunzip+readline IO on the main thread and the
  // worker-pool variant regressed by ~2s (IPC cost of structured-
  // cloning ~350MB of CacheEntry objects), so it's been reverted.
  const readTimer = startPhase('cache load: read + gunzip + parse NDJSON');
  let header: CacheHeader | null = null;
  const entries: CacheEntry[] = [];
  try {
    const stream = createReadStream(cachePath).pipe(createGunzip());
    const rl = createInterface({ input: stream, crlfDelay: Infinity });
    for await (const line of rl) {
      if (!line) continue;
      if (header === null) {
        header = JSON.parse(line) as CacheHeader;
        if (header.version !== CACHE_VERSION) {
          readTimer.end({ result: 'version-mismatch', cacheFile: formatBytes(cacheSize) });
          return null;
        }
      } else {
        entries.push(JSON.parse(line) as CacheEntry);
      }
    }
  } catch {
    readTimer.end({ result: 'parse-error', cacheFile: formatBytes(cacheSize) });
    return null;
  }
  readTimer.end({ entries: entries.length, cacheFile: formatBytes(cacheSize) });

  if (!header) return null;

  const buildTimer = startPhase('cache load: tree build from entries');
  const tree = new ItemTree();
  const poolSizeBefore = internPoolSize();
  for (const entry of entries) {
    tree.addItem(internItem(entry.item), entry.filePath, entry.namespace);
  }
  tree.resolveOrphans();
  buildTimer.end({
    items: entries.length,
    internPool: `+${internPoolSize() - poolSizeBefore}`,
  });

  // Verify signature in the background — tree is usable immediately, and
  // the promise resolves to `false` iff on-disk YAMLs drifted from the
  // cache's recorded signature. Caller handles the mismatch path.
  //
  // Fast path: if the cache file was written within the skip threshold,
  // we trust it and let the file watcher catch any drift after the fact.
  // This sidesteps the per-file stat-storm on slow bind-mounted FS (Docker
  // Desktop 9p/drvfs); the cost is a brief window where stale data could
  // be served if someone edited a YAML during the recreate gap. Watcher
  // then catches up and the in-memory tree converges. Override default
  // 30s with MOCKINGBIRD_CACHE_VERIFY_SKIP_SECONDS=0 to force verify.
  const expectedSignature = header.signature;
  const skipVerify = shouldSkipSignatureVerify(cacheMtimeMs, Date.now());
  const verifyPromise = (async (): Promise<boolean> => {
    if (skipVerify) {
      const skipTimer = startPhase('cache load: signature verify skipped (recent cache)');
      const ageSeconds = ((Date.now() - cacheMtimeMs) / 1000).toFixed(1);
      skipTimer.end({ cacheAgeSeconds: ageSeconds });
      return true;
    }
    const verifyTimer = startPhase('cache load: async signature verify');
    const { signature } = await gatherTargetsAndSignature(roots);
    const match = signature === expectedSignature;
    verifyTimer.end({ match: match ? 'yes' : 'no' });
    return match;
  })();

  return { tree, entryCount: entries.length, verifyPromise };
}

/**
 * Delete a stale cache file. Called by the engine when `verifyPromise`
 * resolves false — removes the stale cache so the next container start
 * does a cold parse instead of re-serving stale data.
 */
export async function deleteStaleCache(cachePath: string): Promise<void> {
  await unlink(cachePath).catch(() => {
    /* already gone, ignore */
  });
}

/**
 * Serialise the given tree to `cachePath` as gzipped NDJSON — one header
 * line, then one `CacheEntry` per line. This keeps each `JSON.stringify`
 * call bounded to a single item so we never hit V8's max string length,
 * and the write pipeline streams naturally through gzip with no full-
 * payload buffer in memory.
 *
 * Best-effort: failures are logged but non-fatal.
 */
export async function writeCachedTree(
  roots: CacheRoot[],
  tree: ItemTree,
  cachePath: string,
  prefetchedStats?: Map<string, { mtimeMs: number; size: number }>,
): Promise<void> {
  try {
    const sigTimer = startPhase('cache write: signature');
    const { signature } = await gatherTargetsAndSignature(roots, prefetchedStats);
    sigTimer.end();

    await mkdir(dirname(cachePath), { recursive: true });

    const writeTimer = startPhase('cache write: NDJSON + gzip + fs write');
    const header: CacheHeader = { version: CACHE_VERSION, signature };
    const nodes = tree.getAllNodes();
    let blobsStripped = 0;

    // Write to a sibling `.tmp` first and atomic-rename at the end (D).
    // If the container crashes mid-write, the main cache file stays at
    // its previous content (or absent, triggering a clean cold parse).
    // Prevents the "partial file, header-only, trailing truncated JSON"
    // failure mode.
    const tmpPath = cachePath + '.tmp';
    const gzip = createGzip();
    const out = createWriteStream(tmpPath);

    async function* lines(): AsyncGenerator<string> {
      yield JSON.stringify(header) + '\n';
      for (const node of nodes) {
        // Drop Blob from the cached item copy without mutating the
        // in-memory tree. Only media items have Blob, so the filter is
        // a no-op for most entries; when it triggers, it shrinks the
        // entry ~30-10000× (a headshot is ~13 MB base64-encoded).
        let item = node.item;
        const hasBlob =
          item.sharedFields.length > 0 &&
          item.sharedFields.some((f) => f.id === BLOB_FIELD_ID);
        if (hasBlob) {
          item = {
            ...node.item,
            sharedFields: node.item.sharedFields.filter(
              (f) => f.id !== BLOB_FIELD_ID,
            ),
          };
          blobsStripped++;
        }
        const entry: CacheEntry = {
          filePath: node.filePath,
          namespace: node.module,
          item,
        };
        yield JSON.stringify(entry) + '\n';
      }
    }

    await pipeline(
      (async function* () {
        for await (const line of lines()) yield Buffer.from(line, 'utf-8');
      })(),
      gzip,
      out,
    );

    await rename(tmpPath, cachePath);

    const written = await stat(cachePath).catch(() => null);
    writeTimer.end({
      items: nodes.length,
      blobsStripped,
      cacheFile: written ? formatBytes(written.size) : 'unknown',
    });
  } catch (err) {
    console.error(`  [index] cache write failed:`, err);
  }
}
