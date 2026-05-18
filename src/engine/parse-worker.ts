/**
 * Worker-thread entry point for parallel YAML parse. Receives a batch of
 * file targets, parses each via the shared `parseItem`, returns results.
 *
 * Batch granularity is controlled by the pool (parse-pool.ts). Workers do
 * their own readFile inside `parseItem` so IO concurrency is per-worker;
 * main-thread gets one postMessage per batch rather than per file.
 *
 * 0.4.0.24 - ports the Sitecore `DatFilesLoaderAsyncRunner` pattern
 * (`Task.StartNew` per .dat file → parallel background deserialize). Our
 * analog is one worker per CPU core parsing YAML in parallel; the
 * `scan:root` parse loop was 85% of cold-start time at 25 items/s on
 * instrumented cold-start data, limited by single-threaded YAML CPU cost
 * on heavy-XML presentation items.
 */

import { parentPort } from 'worker_threads';
import { stat } from 'fs/promises';
import { parseItem, NotAnItemDocumentError } from './parser.js';
import type { ScsItem } from './types.js';

interface YamlJob {
  kind: 'parse-yaml';
  batchId: number;
  targets: Array<{ absolutePath: string; namespace?: string }>;
}

export type WorkerResult =
  | {
      ok: true;
      absolutePath: string;
      namespace?: string;
      item: ScsItem;
      /** mtime in ms epoch - captured during parse so the cache-write
       *  signature pass can skip its own stat-all-files sweep (B). */
      mtimeMs: number;
      size: number;
    }
  | {
      ok: false;
      absolutePath: string;
      reason: 'parse-error';
      error: string;
    }
  | {
      ok: false;
      absolutePath: string;
      reason: 'not-an-item';
      firstKey: string;
    };

interface YamlReply {
  kind: 'parse-yaml';
  batchId: number;
  results: WorkerResult[];
}

if (!parentPort) {
  throw new Error('parse-worker must be spawned via worker_threads, not invoked directly');
}

const port = parentPort;

port.on('message', async (msg: YamlJob) => {
  const results: WorkerResult[] = await Promise.all(
    msg.targets.map(async (t): Promise<WorkerResult> => {
      try {
        // 0.4.0.24 change B: stat alongside parseItem. The file's inode
        // is in the OS page cache after the readFile inside parseItem,
        // so this extra stat is near-free (microseconds) and lets the
        // cache-write path skip its 12.7s stat-all-files sweep.
        const [item, fileStat] = await Promise.all([
          parseItem(t.absolutePath),
          stat(t.absolutePath),
        ]);
        return {
          ok: true,
          absolutePath: t.absolutePath,
          namespace: t.namespace,
          item,
          mtimeMs: fileStat.mtimeMs,
          size: fileStat.size,
        };
      } catch (err) {
        if (err instanceof NotAnItemDocumentError) {
          return {
            ok: false,
            absolutePath: t.absolutePath,
            reason: 'not-an-item',
            firstKey: err.firstKey,
          };
        }
        return {
          ok: false,
          absolutePath: t.absolutePath,
          reason: 'parse-error',
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }),
  );
  const reply: YamlReply = { kind: 'parse-yaml', batchId: msg.batchId, results };
  port.postMessage(reply);
});
