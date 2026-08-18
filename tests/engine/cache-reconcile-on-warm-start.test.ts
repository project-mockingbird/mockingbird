import { describe, it, expect, afterEach } from 'vitest';
import { Engine } from '../../src/engine/index.js';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import { tmpdir } from 'os';
import { resolve, join, dirname } from 'path';

const registryFixture = resolve(__dirname, '../../data/registry.json.gz');
const FOLDER_TEMPLATE_ID = '0437fee2-44c9-46a6-abe9-28858d9fee8c';

const Z_ID = 'dddd0000-0000-0000-0000-00000000000c';
const NEW_ID = 'dddd0000-0000-0000-0000-00000000000e';

function yaml(id: string, parent: string, path: string): string {
  return `---
ID: "{${id.toUpperCase()}}"
Parent: "{${parent.toUpperCase()}}"
Template: "{${FOLDER_TEMPLATE_ID.toUpperCase()}}"
Path: ${path}
`;
}

const SOURCE_FIELD_ID = '1eb8ae32-e190-44a6-968d-ed904c794ebf';

function yamlWithSource(id: string, parent: string, path: string, source: string): string {
  return `---
ID: "{${id.toUpperCase()}}"
Parent: "{${parent.toUpperCase()}}"
Template: "{${FOLDER_TEMPLATE_ID.toUpperCase()}}"
Path: ${path}
SharedFields:
- ID: "${SOURCE_FIELD_ID}"
  Hint: Source
  Value: "${source}"
`;
}

function readSource(e: Engine, id: string): string | undefined {
  return e.getItemById(id)?.item.sharedFields.find(f => f.id.toLowerCase() === SOURCE_FIELD_ID)?.value;
}

function moduleJson(namespace: string): string {
  return JSON.stringify({
    namespace,
    items: {
      path: 'serialization',
      includes: [
        {
          name: 'items',
          path: '/sitecore/content/test',
          allowedPushOperations: namespace === 'C' ? 'CreateUpdateAndDelete' : 'CreateOnly',
        },
      ],
    },
  });
}

/** Two sibling layers (authoring A, content C) plus a shared cache path. */
function buildWorkspace() {
  const root = mkdtempSync(join(tmpdir(), 'mb-cache-reconcile-'));

  const authoring = join(root, 'authoring');
  mkdirSync(join(authoring, 'serialization', 'items'), { recursive: true });
  writeFileSync(join(authoring, 'sitecore.json'), JSON.stringify({ modules: ['*.module.json'] }));
  writeFileSync(join(authoring, 'a.module.json'), moduleJson('A'));

  const content = join(root, 'content');
  mkdirSync(join(content, 'serialization', 'items'), { recursive: true });
  writeFileSync(join(content, 'sitecore.json'), JSON.stringify({ modules: ['*.module.json'] }));
  writeFileSync(join(content, 'c.module.json'), moduleJson('C'));
  // Z exists at cold-scan time.
  writeFileSync(
    join(content, 'serialization', 'items', 'Z.yml'),
    yaml(Z_ID, '00000000-0000-0000-0000-000000000000', '/sitecore/content/test/Z'),
  );

  const cachePath = join(root, 'cache', 'index.json.gz');
  return { root, authoring, content, cachePath };
}

let root: string | null = null;
let engine: Engine | null = null;

afterEach(async () => {
  if (engine) { await engine.close(); engine = null; }
  if (root) { rmSync(root, { recursive: true, force: true }); root = null; }
});

async function open(ws: { authoring: string; content: string; cachePath: string }): Promise<Engine> {
  const e = new Engine({ rootDir: undefined, watch: false, registryPath: registryFixture, indexCachePath: ws.cachePath });
  await e.startInit();
  await e.readiness.ready();
  await e.openWorkspace([
    { sitecoreJsonPath: join(ws.authoring, 'sitecore.json'), name: 'authoring' },
    { sitecoreJsonPath: join(ws.content, 'sitecore.json'), name: 'content' },
  ]);
  return e;
}

describe('multi-layer warm start self-heals an item created after the last cold scan', () => {
  it('surfaces a content-layer item that landed on disk after the per-layer cache was written', async () => {
    const ws = buildWorkspace();
    root = ws.root;

    // Cold open: scans both layers, writes per-layer caches (Z only).
    const a = await open(ws);
    await a.close(); // flushes the background per-layer cache writes.

    // A new content-layer item lands on disk AFTER the cache was written -
    // exactly the "created via API, container restarted" situation.
    mkdirSync(join(ws.content, 'serialization', 'items', 'Z'), { recursive: true });
    writeFileSync(
      join(ws.content, 'serialization', 'items', 'Z', 'new-item.yml'),
      yaml(NEW_ID, Z_ID, '/sitecore/content/test/Z/new-item'),
    );

    // Warm open: per-layer caches are hit (stale - they predate new-item).
    engine = await open(ws);
    await engine.awaitReconcile();

    // The new item must be present after the warm start, without a manual
    // Refresh, and carry the content-layer provenance.
    expect(engine.getItemById(NEW_ID)).toBeDefined();
    expect(engine.getItemProvenance(NEW_ID)?.winnerLayer).toBe('content');
  });

  it('heals an EDITED item in-session when its per-layer cache is stale', async () => {
    // Mirrors the real bug: a field value (Source) changed on disk while the
    // cache still held the old value; the boot loads the stale cache and the
    // add-only reconcile skips the (unchanged-id) item, so it stayed stale
    // for the whole session. Force full signature verify so the staleness is
    // actually detected (the 30s skip-window would otherwise trust the cache).
    const saved = process.env.MOCKINGBIRD_CACHE_VERIFY_SKIP_SECONDS;
    process.env.MOCKINGBIRD_CACHE_VERIFY_SKIP_SECONDS = '0';
    try {
      const ws = buildWorkspace();
      root = ws.root;
      // Z carries a Source field at cold-scan time.
      writeFileSync(
        join(ws.content, 'serialization', 'items', 'Z.yml'),
        yamlWithSource(Z_ID, '00000000-0000-0000-0000-000000000000', '/sitecore/content/test/Z', 'query:old'),
      );

      const a = await open(ws);
      expect(readSource(a, Z_ID)).toBe('query:old');
      await a.close(); // flush per-layer cache writes (Source=query:old)

      // Edit the Source on disk - the cache is now stale for this item.
      writeFileSync(
        join(ws.content, 'serialization', 'items', 'Z.yml'),
        yamlWithSource(Z_ID, '00000000-0000-0000-0000-000000000000', '/sitecore/content/test/Z', 'query:new-with-slash-star/*'),
      );

      // Warm open: per-layer cache hit (stale). The reconcile must heal the edit.
      engine = await open(ws);
      await engine.awaitReconcile();

      expect(readSource(engine, Z_ID)).toBe('query:new-with-slash-star/*');
    } finally {
      if (saved === undefined) delete process.env.MOCKINGBIRD_CACHE_VERIFY_SKIP_SECONDS;
      else process.env.MOCKINGBIRD_CACHE_VERIFY_SKIP_SECONDS = saved;
    }
  });

  it('a mutation invalidates the on-disk index caches so the next boot cannot serve stale', async () => {
    const ws = buildWorkspace();
    root = ws.root;
    writeFileSync(
      join(ws.content, 'serialization', 'items', 'Z.yml'),
      yamlWithSource(Z_ID, '00000000-0000-0000-0000-000000000000', '/sitecore/content/test/Z', 'query:old'),
    );

    const a = await open(ws);
    await a.close(); // flush the background per-layer cache writes

    const cacheDir = dirname(ws.cachePath);
    const isCache = (f: string): boolean => /^index.*\.json\.gz$/.test(f);
    expect(readdirSync(cacheDir).filter(isCache).length).toBeGreaterThan(0);

    // Reopen (populates _layers), let the warm-start reconcile settle, then edit
    // a field through the engine - the mutation must drop the on-disk caches.
    engine = await open(ws);
    await engine.awaitReconcile();
    const plan = await engine.planUpdateFields(Z_ID, { [SOURCE_FIELD_ID]: 'query:mutated' }, 'en', 1);
    await engine.applyPlan(plan);

    expect(readdirSync(cacheDir).filter(isCache)).toEqual([]);
  });
});
