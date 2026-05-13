import { describe, it, expect, afterEach, beforeAll, afterAll } from 'vitest';
import { Engine } from '../../src/engine/index.js';
import { mkdir, writeFile, rm, access } from 'fs/promises';
import { resolve, join } from 'path';
import { tmpdir } from 'os';

const registryFixture = resolve(__dirname, '../../data/registry.json.gz');
let workspaceRoot: string;
let projectA: string;
let projectB: string;
let cacheDir: string;
let engine: Engine | null = null;

const ITEM_ID_A = 'aaaaaaaa-cccc-cccc-cccc-000000000001';
const ITEM_ID_B = 'bbbbbbbb-cccc-cccc-cccc-000000000002';
const TEMPLATE_ID = 'cccccccc-cccc-cccc-cccc-000000000003';

function minimalYaml(id: string, name: string): string {
  return `---
ID: "${id}"
Parent: "00000000-0000-0000-0000-000000000000"
Template: "${TEMPLATE_ID}"
Path: /sitecore/content/${name}
SharedFields: []
Languages: []
`;
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

beforeAll(async () => {
  workspaceRoot = resolve(tmpdir(), `cache-per-project-${Date.now()}`);
  cacheDir = join(workspaceRoot, 'cache');
  await mkdir(cacheDir, { recursive: true });

  // Project A - mirrors the multilayer test fixture layout
  projectA = join(workspaceRoot, 'project-a');
  await mkdir(join(projectA, 'serialization', 'items'), { recursive: true });
  await writeFile(
    join(projectA, 'sitecore.json'),
    JSON.stringify({ modules: ['*.module.json'] }),
  );
  await writeFile(
    join(projectA, 'a.module.json'),
    JSON.stringify({
      namespace: 'A',
      items: {
        path: 'serialization',
        includes: [
          { name: 'items', path: '/sitecore/content/projectA', allowedPushOperations: 'CreateUpdateAndDelete' },
        ],
      },
    }),
  );
  await writeFile(join(projectA, 'serialization', 'items', 'Home.yml'), minimalYaml(ITEM_ID_A, 'projectA/Home'));

  // Project B
  projectB = join(workspaceRoot, 'project-b');
  await mkdir(join(projectB, 'serialization', 'items'), { recursive: true });
  await writeFile(
    join(projectB, 'sitecore.json'),
    JSON.stringify({ modules: ['*.module.json'] }),
  );
  await writeFile(
    join(projectB, 'b.module.json'),
    JSON.stringify({
      namespace: 'B',
      items: {
        path: 'serialization',
        includes: [
          { name: 'items', path: '/sitecore/content/projectB', allowedPushOperations: 'CreateUpdateAndDelete' },
        ],
      },
    }),
  );
  await writeFile(join(projectB, 'serialization', 'items', 'Home.yml'), minimalYaml(ITEM_ID_B, 'projectB/Home'));
});

afterAll(async () => {
  await rm(workspaceRoot, { recursive: true, force: true });
});

afterEach(async () => {
  if (engine) {
    await engine.close();
    engine = null;
  }
});

describe('Per-project index cache', () => {
  it('derives distinct cache paths for project A and project B', async () => {
    const baseCachePath = join(cacheDir, 'index.json.gz').replace(/\\/g, '/');

    // Open project A - this should write a hashed cache for A.
    engine = new Engine({
      watch: false,
      registryPath: registryFixture,
      indexCachePath: baseCachePath,
    });
    await engine.openWorkspace([
      { sitecoreJsonPath: join(projectA, 'sitecore.json'), name: 'proj-a' },
    ]);
    expect(engine.readiness.state).toBe('ready');
    // The engine's resolved cache path should NOT equal the base path.
    // We can confirm by opening project B and checking both cache files exist.
    await engine.close();
    engine = null;

    // Open project B.
    engine = new Engine({
      watch: false,
      registryPath: registryFixture,
      indexCachePath: baseCachePath,
    });
    await engine.openWorkspace([
      { sitecoreJsonPath: join(projectB, 'sitecore.json'), name: 'proj-b' },
    ]);
    expect(engine.readiness.state).toBe('ready');
    await engine.close();
    engine = null;

    // Both per-project cache files should now exist.
    const files = await import('fs/promises').then((m) =>
      m.readdir(cacheDir),
    );
    // Should have at least two hashed cache files (one per project).
    const cacheFiles = files.filter((f) => f.endsWith('.json.gz'));
    expect(cacheFiles.length).toBeGreaterThanOrEqual(2);
    // The base filename itself (index.json.gz without a hash) should NOT exist.
    expect(cacheFiles.some((f) => f === 'index.json.gz')).toBe(false);
  });

  it('reopening project A loads from its own cache (not project B cache)', async () => {
    const baseCachePath = join(cacheDir, 'index2.json.gz').replace(/\\/g, '/');

    // Open A and close to warm its cache.
    engine = new Engine({ watch: false, registryPath: registryFixture, indexCachePath: baseCachePath });
    await engine.openWorkspace([
      { sitecoreJsonPath: join(projectA, 'sitecore.json'), name: 'proj-a' },
    ]);
    await engine.close();
    engine = null;

    // Open B and close to warm its cache.
    engine = new Engine({ watch: false, registryPath: registryFixture, indexCachePath: baseCachePath });
    await engine.openWorkspace([
      { sitecoreJsonPath: join(projectB, 'sitecore.json'), name: 'proj-b' },
    ]);
    await engine.close();
    engine = null;

    // Reopen A - should load from A's own hashed cache.
    engine = new Engine({ watch: false, registryPath: registryFixture, indexCachePath: baseCachePath });
    await engine.openWorkspace([
      { sitecoreJsonPath: join(projectA, 'sitecore.json'), name: 'proj-a' },
    ]);
    expect(engine.readiness.state).toBe('ready');
    // A's item should be present; B's item should NOT (different trees).
    const nodeA = engine.getItemById(ITEM_ID_A);
    const nodeB = engine.getItemById(ITEM_ID_B);
    expect(nodeA).toBeDefined();
    expect(nodeB).toBeUndefined();
  });
});
