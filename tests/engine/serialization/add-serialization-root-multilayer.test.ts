import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Engine } from '../../../src/engine/index.js';

/**
 * Build a two-layer workspace on disk and return an Engine configured for
 * multi-layer mode (rootDir: undefined, openWorkspace called).
 *
 * Layer A (weaker, CreateOnly): has an existing module with one include at
 *   /sitecore/content/Site so collision tests work.
 * Layer B (stronger, CreateUpdateAndDelete): has a module with no includes
 *   so we can add serialization roots into it.
 *
 * Registry provides the Tasks paths that addSerializationRoot resolves via
 * getRegistryItemByPath, mirroring the inline registry idiom in
 * tests/engine/serialization/add-serialization-root.test.ts.
 */
async function buildMultilayerFixture(): Promise<{
  workspaceRoot: string;
  layerARoot: string;
  layerBRoot: string;
  layerAModulePath: string;
  layerBModulePath: string;
  engine: Engine;
}> {
  const workspaceRoot = mkdtempSync(join(tmpdir(), 'mb-multilayer-'));

  // Layer A: weaker - has one existing include at /sitecore/content/Site
  const layerARoot = join(workspaceRoot, 'layer-a');
  mkdirSync(join(layerARoot, 'serialization'), { recursive: true });
  writeFileSync(join(layerARoot, 'sitecore.json'), JSON.stringify({
    modules: ['serialization/*.module.json'],
  }, null, 2));
  const layerAModulePath = join(layerARoot, 'serialization', 'a.module.json');
  writeFileSync(layerAModulePath, JSON.stringify({
    namespace: 'LayerA',
    items: {
      path: 'items',
      includes: [
        { name: 'content', path: '/sitecore/content/Site', database: 'master' },
      ],
    },
  }, null, 3) + '\n');

  // Layer B: stronger - module starts with no includes (receives new roots)
  const layerBRoot = join(workspaceRoot, 'layer-b');
  mkdirSync(join(layerBRoot, 'serialization'), { recursive: true });
  writeFileSync(join(layerBRoot, 'sitecore.json'), JSON.stringify({
    modules: ['serialization/*.module.json'],
  }, null, 2));
  const layerBModulePath = join(layerBRoot, 'serialization', 'b.module.json');
  writeFileSync(layerBModulePath, JSON.stringify({
    namespace: 'LayerB',
    items: {
      path: 'items',
      includes: [],
    },
  }, null, 3) + '\n');

  // Inline registry providing the Tasks paths and Site paths.
  const registryPath = join(workspaceRoot, 'registry.json');
  writeFileSync(registryPath, JSON.stringify({
    version: '1.0',
    source: 'test',
    extractedAt: new Date().toISOString(),
    items: [
      {
        id: 'aaaa0001-0000-0000-0000-000000000001',
        name: 'Commands',
        parent: '00000000-0000-0000-0000-000000000000',
        template: 'AB86861A-6030-46C5-B394-E8F99E8B87DB',
        path: '/sitecore/system/Tasks/Commands',
        database: 'master',
        sharedFields: {},
      },
      {
        id: 'aaaa0001-0000-0000-0000-000000000002',
        name: 'Schedules',
        parent: '00000000-0000-0000-0000-000000000000',
        template: 'AB86861A-6030-46C5-B394-E8F99E8B87DB',
        path: '/sitecore/system/Tasks/Schedules',
        database: 'master',
        sharedFields: {},
      },
      {
        id: 'bbbb0001-0000-0000-0000-000000000001',
        name: 'Site',
        parent: '00000000-0000-0000-0000-000000000000',
        template: 'AB86861A-6030-46C5-B394-E8F99E8B87DB',
        path: '/sitecore/content/Site',
        database: 'master',
        sharedFields: {},
      },
    ],
  }));

  const engine = new Engine({ rootDir: undefined, watch: false, registryPath });
  await engine.startInit();
  await engine.readiness.ready();
  await engine.openWorkspace([
    { sitecoreJsonPath: join(layerARoot, 'sitecore.json'), name: 'A' },
    { sitecoreJsonPath: join(layerBRoot, 'sitecore.json'), name: 'B' },
  ]);

  return { workspaceRoot, layerARoot, layerBRoot, layerAModulePath, layerBModulePath, engine };
}

describe('reloadModules - multi-layer', () => {
  let workspaceRoot: string;
  let engine: Engine;

  afterEach(async () => {
    await engine.close();
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('rootDir is undefined in multi-layer mode (pre-condition)', async () => {
    ({ workspaceRoot, engine } = await buildMultilayerFixture());
    // Confirm the bug pre-condition: openWorkspace with two layers never sets rootDir.
    expect(engine.getRootDir()).toBeUndefined();
  });

  it('picks up a newly written include in layerA without a restart', async () => {
    let layerARoot: string;
    let layerAModulePath: string;
    ({ workspaceRoot, layerARoot, layerAModulePath, engine } = await buildMultilayerFixture());

    // Before: /sitecore/system/Tasks/Commands is NOT covered.
    expect(engine.coversNewChildAt('/sitecore/system/Tasks/Commands')).toBe(false);

    // Simulate what addSerializationRoot's append path does: write a new include
    // into the on-disk module file directly.
    const existing = JSON.parse(readFileSync(layerAModulePath, 'utf-8'));
    existing.items.includes.push({
      name: 'tasks-commands',
      path: '/sitecore/system/Tasks/Commands',
      database: 'master',
      scope: 'DescendantsOnly',
    });
    writeFileSync(layerAModulePath, JSON.stringify(existing, null, 3) + '\n');

    // Before fix: reloadModules() early-returned (rootDir undefined) so the
    // in-memory module list was never updated. coversNewChildAt stayed false.
    await engine.reloadModules();

    // After fix: layer roots are used, the new include is live.
    expect(engine.coversNewChildAt('/sitecore/system/Tasks/Commands')).toBe(true);
  });
});

describe('addSerializationRoot - multi-layer append', () => {
  let workspaceRoot: string;
  let engine: Engine;

  afterEach(async () => {
    await engine.close();
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('append end-to-end: after accept, coversNewChildAt becomes true without restart', async () => {
    let layerBModulePath: string;
    ({ workspaceRoot, layerBModulePath, engine } = await buildMultilayerFixture());

    expect(engine.coversNewChildAt('/sitecore/system/Tasks/Commands')).toBe(false);

    const res = await engine.addSerializationRoot({
      path: '/sitecore/system/Tasks/Commands',
      target: { modulePath: layerBModulePath },
    });

    expect(res.applied).toBe(true);
    expect(res.reloaded).toBe(true);
    expect(res.willCreateFile).toBe(false);
    // The on-disk module now contains the new include.
    const onDisk = JSON.parse(readFileSync(layerBModulePath, 'utf-8'));
    expect(onDisk.items.includes.some((i: { path: string }) => i.path === '/sitecore/system/Tasks/Commands')).toBe(true);
    // The live engine reflects the change immediately.
    expect(engine.coversNewChildAt('/sitecore/system/Tasks/Commands')).toBe(true);
  });
});

describe('addSerializationRoot - multi-layer new file', () => {
  let workspaceRoot: string;
  let engine: Engine;

  afterEach(async () => {
    await engine.close();
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('new-file does NOT throw and emits into a layer module dir, then coversNewChildAt is true', async () => {
    ({ workspaceRoot, engine } = await buildMultilayerFixture());

    // Before fix: deriveEmitTarget threw 'Scaffolding requires an open project
    // (rootDir is undefined)' before even checking loaded modules, so new-file
    // always 500-ed in multi-layer. After fix: mirrors a loaded module's dir.
    const res = await engine.addSerializationRoot({
      path: '/sitecore/system/Tasks/Schedules',
      target: { newFile: true },
    });

    expect(res.applied).toBe(true);
    expect(res.reloaded).toBe(true);
    expect(res.willCreateFile).toBe(true);
    // The emitted file must exist inside one of the layer roots.
    const { existsSync } = await import('fs');
    expect(existsSync(res.targetFilePath)).toBe(true);
    // Live engine covers the new path.
    expect(engine.coversNewChildAt('/sitecore/system/Tasks/Schedules')).toBe(true);
  });
});
