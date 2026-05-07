/**
 * Worker-thread pool for parallel YAML parse. Distributes file targets
 * across N workers (default: cpus - 1). Each worker parses its batch
 * concurrently via Promise.all inside the worker, so per-worker IO
 * overlaps AND cross-worker parse CPU runs in parallel.
 *
 * Falls back to synchronous `parseItem` on the main thread when the
 * compiled `parse-worker.js` isn't present on disk — that's the test /
 * tsx dev path where only `.ts` sources exist. Production (compiled to
 * `dist/engine/`) always has both `parse-pool.js` and `parse-worker.js`.
 *
 * 0.4.0.24.
 */

import { Worker } from 'worker_threads';
import { cpus } from 'os';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { stat } from 'fs/promises';
import { parseItem, NotAnItemDocumentError } from './parser.js';

export interface PoolTarget {
  absolutePath: string;
  namespace?: string;
}

import type { WorkerResult } from './parse-worker.js';
export type PoolResult = WorkerResult;

export interface ParseInPoolOptions {
  onProgress?: (done: number, total: number) => void;
  /** Default: cpus() - 1, floor 1. Capped at `targets.length`. */
  workerCount?: number;
  /** Default: 64. Smaller = finer progress granularity, more IPC; larger =
   *  less overhead, coarser progress. */
  batchSize?: number;
}

const WORKER_JS_URL = new URL('./parse-worker.js', import.meta.url);
const WORKER_JS_PATH = fileURLToPath(WORKER_JS_URL);

/**
 * Whether worker-thread parallelism is available. False in vitest / tsx
 * runs where only `.ts` sources exist; true in the Docker-compiled runtime.
 */
export const WORKERS_AVAILABLE = existsSync(WORKER_JS_PATH);

export async function parseInPool(
  targets: PoolTarget[],
  options: ParseInPoolOptions = {},
): Promise<PoolResult[]> {
  if (targets.length === 0) return [];
  if (!WORKERS_AVAILABLE) {
    return parseSynchronously(targets, options);
  }

  const workerCount = Math.max(
    1,
    Math.min(options.workerCount ?? Math.max(1, cpus().length - 1), targets.length),
  );
  const batchSize = options.batchSize ?? 64;

  const batches: PoolTarget[][] = [];
  for (let i = 0; i < targets.length; i += batchSize) {
    batches.push(targets.slice(i, i + batchSize));
  }

  const results: PoolResult[] = new Array(targets.length);
  let nextBatchIdx = 0;
  let progressDone = 0;

  const workers: Worker[] = [];
  for (let w = 0; w < workerCount; w++) {
    workers.push(new Worker(WORKER_JS_URL));
  }

  try {
    await Promise.all(workers.map((worker) => runWorkerLoop(worker)));
  } finally {
    await Promise.all(workers.map((w) => w.terminate().catch(() => {})));
  }

  return results;

  async function runWorkerLoop(worker: Worker): Promise<void> {
    while (nextBatchIdx < batches.length) {
      const batchIdx = nextBatchIdx++;
      const batchTargets = batches[batchIdx];
      const batchResults = await dispatchBatch(worker, batchIdx, batchTargets);
      // Place each result into its original target position so the caller
      // can treat `results[i]` as matching `targets[i]`.
      const baseOffset = batchIdx * batchSize;
      for (let i = 0; i < batchResults.length; i++) {
        results[baseOffset + i] = batchResults[i];
      }
      progressDone += batchTargets.length;
      options.onProgress?.(progressDone, targets.length);
    }
  }
}

function dispatchBatch(
  worker: Worker,
  batchId: number,
  targets: PoolTarget[],
): Promise<PoolResult[]> {
  return new Promise<PoolResult[]>((resolve, reject) => {
    const onMessage = (msg: { kind: 'parse-yaml'; batchId: number; results: PoolResult[] }) => {
      if (msg.kind !== 'parse-yaml' || msg.batchId !== batchId) return;
      worker.off('message', onMessage);
      worker.off('error', onError);
      resolve(msg.results);
    };
    const onError = (err: Error) => {
      worker.off('message', onMessage);
      worker.off('error', onError);
      reject(err);
    };
    worker.on('message', onMessage);
    worker.on('error', onError);
    worker.postMessage({ kind: 'parse-yaml', batchId, targets });
  });
}


async function parseSynchronously(
  targets: PoolTarget[],
  options: ParseInPoolOptions,
): Promise<PoolResult[]> {
  const results: PoolResult[] = [];
  let done = 0;
  options.onProgress?.(done, targets.length);
  for (const t of targets) {
    try {
      const [item, fileStat] = await Promise.all([
        parseItem(t.absolutePath),
        stat(t.absolutePath),
      ]);
      results.push({
        ok: true,
        absolutePath: t.absolutePath,
        namespace: t.namespace,
        item,
        mtimeMs: fileStat.mtimeMs,
        size: fileStat.size,
      });
    } catch (err) {
      if (err instanceof NotAnItemDocumentError) {
        results.push({
          ok: false,
          absolutePath: t.absolutePath,
          reason: 'not-an-item',
          firstKey: err.firstKey,
        });
      } else {
        results.push({
          ok: false,
          absolutePath: t.absolutePath,
          reason: 'parse-error',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    done++;
    if (done === targets.length || done % 100 === 0) {
      options.onProgress?.(done, targets.length);
    }
  }
  return results;
}
