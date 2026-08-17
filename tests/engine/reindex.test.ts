import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm, readdir } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { Engine } from '../../src/engine/index.js';

// engine.beginReindex - in-process re-index used by the "power button" restart.
// Resets readiness synchronously (so an HTTP 202 + client reload sees the
// warming-up state) and re-indexes in the background, optionally after wiping
// the on-disk index caches for a cold rebuild.

describe('engine.beginReindex', () => {
  const cleanup: Array<() => Promise<void>> = [];
  afterEach(async () => {
    for (const c of cleanup.splice(0)) await c().catch(() => {});
  });

  it('returns false and leaves readiness untouched when nothing is loaded', () => {
    const engine = new Engine({});
    expect(engine.beginReindex()).toBe(false);
    expect(engine.beginReindex({ clearCache: true })).toBe(false);
  });

  it('flips readiness back to initializing so the UI can show a restart', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mb-reindex-root-'));
    cleanup.push(() => rm(root, { recursive: true, force: true }));
    const engine = new Engine({ rootDir: root, watch: false });
    cleanup.push(() => engine.close());
    await engine.startInit();
    await engine.readiness.ready();
    expect(engine.readiness.state).toBe('ready');

    expect(engine.beginReindex()).toBe(true);
    // Synchronous reset: observable immediately, before the reindex finishes.
    expect(engine.readiness.state).toBe('initializing');

    await engine.readiness.ready();
    expect(engine.readiness.state).toBe('ready');
  });

  it('deletes the on-disk index caches when clearCache is set, keeping bystanders', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mb-reindex-root-'));
    const cacheDir = await mkdtemp(join(tmpdir(), 'mb-reindex-cache-'));
    cleanup.push(() => rm(root, { recursive: true, force: true }));
    cleanup.push(() => rm(cacheDir, { recursive: true, force: true }));

    const engine = new Engine({ rootDir: root, watch: false, indexCachePath: join(cacheDir, 'index.json.gz') });
    cleanup.push(() => engine.close());
    await engine.startInit();
    await engine.readiness.ready();

    // Seed fake index caches plus a bystander that must survive.
    await writeFile(join(cacheDir, 'index-aaaaaaaaaaaa.json.gz'), 'x');
    await writeFile(join(cacheDir, 'index-bbbbbbbbbbbb.json.gz'), 'y');
    await writeFile(join(cacheDir, 'keep.txt'), 'keep');

    expect(engine.beginReindex({ clearCache: true })).toBe(true);
    await engine.readiness.ready();

    const after = await readdir(cacheDir);
    expect(after).not.toContain('index-aaaaaaaaaaaa.json.gz');
    expect(after).not.toContain('index-bbbbbbbbbbbb.json.gz');
    expect(after).toContain('keep.txt');
  });
});
