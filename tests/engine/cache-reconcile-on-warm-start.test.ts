import { describe, it, expect, afterEach } from 'vitest';
import { Engine } from '../../src/engine/index.js';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { resolve, join } from 'path';

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
});
