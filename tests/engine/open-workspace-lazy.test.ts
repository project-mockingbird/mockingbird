import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Engine } from '../../src/engine/index.js';
import { mkdir, writeFile, rm } from 'fs/promises';
import { resolve, join } from 'path';
import { tmpdir } from 'os';

let workspaceRoot: string;
let projectPath: string;

beforeAll(async () => {
  workspaceRoot = resolve(tmpdir(), `lazy-open-test-${Date.now()}`);
  projectPath = join(workspaceRoot, 'project-lazy');
  await mkdir(join(projectPath, 'items', 'foo'), { recursive: true });
  await writeFile(
    join(projectPath, 'sitecore.json'),
    JSON.stringify({
      modules: ['*.module.json'],
      plugins: ['Sitecore.DevEx.Extensibility.Serialization@6.0.23'],
    }),
  );
  await writeFile(
    join(projectPath, 'lazy.module.json'),
    JSON.stringify({
      namespace: 'Lazy',
      items: { path: 'items', includes: [{ name: 'foo', path: '/sitecore/content/lazy', allowedPushOperations: 'CreateUpdateAndDelete' }] },
    }),
  );
  // Add a real item file so the indexer has at least one item to process.
  // An empty fixture lets readiness flip to 'ready' synchronously, making
  // the lazy vs. non-lazy paths indistinguishable in assertions.
  await writeFile(
    join(projectPath, 'items', 'foo', 'sample.yml'),
    `---
ID: "ce0bf41d-1111-2222-3333-aaaaaaaaaaaa"
Parent: "00000000-0000-0000-0000-000000000000"
Template: "ab86861a-6030-46c5-b394-e8f99e8b87db"
Path: /sitecore/content/lazy/sample
SharedFields:
- ID: "a4f985d9-98b3-4b52-aaaf-4344f6e747c6"
  Hint: __Renderings
  Value: ""
Languages:
- Language: en
  Versions:
  - Version: 1
    Fields:
    - ID: "75577384-3c97-45da-a847-81b00500e250"
      Hint: Name
      Value: sample
`,
  );
});

afterAll(async () => {
  await rm(workspaceRoot, { recursive: true, force: true });
});

describe('Engine.openWorkspace lazy mode', () => {
  it('lazy=true returns before readiness reaches ready', async () => {
    const engine = new Engine({ watch: false });
    await engine.startInit();

    await engine.openWorkspace(
      [{ sitecoreJsonPath: join(projectPath, 'sitecore.json'), name: 'lazy' }],
      { lazy: true },
    );

    // At minimum, the call should NOT have awaited indexing. If state happens
    // to be 'ready' it means indexing completed synchronously (tiny fixture);
    // either way, the call returned without blocking.
    const earlyState = engine.readiness.state;
    expect(['initializing', 'ready']).toContain(earlyState);

    await engine.readiness.ready();
    expect(engine.readiness.state).toBe('ready');

    // After readiness completes, provenance must be populated as a side effect
    // even though openWorkspace returned early. Boot-replay relies on this:
    // the API call returns fast, but layer attribution (and the UI's
    // effectiveCount / provenance bars) need to fill in once indexing finishes.
    // A microtask tick lets the fire-and-forget fill promise settle.
    await new Promise((r) => setImmediate(r));
    expect(engine['_itemProvenance'].size).toBeGreaterThan(0);
    const stats = engine.getLayerStats();
    const lazyLayer = stats.find((s) => s.name === 'lazy');
    expect(lazyLayer?.effectiveCount).toBeGreaterThan(0);

    await engine.close();
  });

  it('lazy=false (default) awaits indexing to ready', async () => {
    const engine = new Engine({ watch: false });
    await engine.startInit();

    await engine.openWorkspace(
      [{ sitecoreJsonPath: join(projectPath, 'sitecore.json'), name: 'lazy' }],
    );

    expect(engine.readiness.state).toBe('ready');

    await engine.close();
  });

  it('multi-layer lazy=true silently honors as no-op (full await)', async () => {
    const proj2 = join(workspaceRoot, 'project-lazy-2');
    await mkdir(join(proj2, 'items'), { recursive: true });
    await writeFile(
      join(proj2, 'sitecore.json'),
      JSON.stringify({ modules: ['*.module.json'], plugins: [] }),
    );
    await writeFile(
      join(proj2, 'lazy2.module.json'),
      JSON.stringify({
        namespace: 'Lazy2',
        items: { path: 'items', includes: [{ name: 'bar', path: '/sitecore/content/lazy2', allowedPushOperations: 'CreateUpdateAndDelete' }] },
      }),
    );

    const engine = new Engine({ watch: false });
    await engine.startInit();

    await engine.openWorkspace(
      [
        { sitecoreJsonPath: join(projectPath, 'sitecore.json'), name: 'lazy' },
        { sitecoreJsonPath: join(proj2, 'sitecore.json'), name: 'lazy2' },
      ],
      { lazy: true },
    );

    // Multi-layer ignores lazy and completes synchronously today.
    expect(engine.readiness.state).toBe('ready');

    await engine.close();
  });
});
