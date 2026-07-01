import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Engine } from '../../../src/engine/index.js';

// Build a minimal tmp workspace with:
//   - sitecore.json: modules glob = "serialization/*.module.json"
//   - serialization/existing.module.json: one include at /sitecore/content/Site
//   - serialization/second.module.json: empty includes (used for cross-module collision tests)
//   - registry.json: Tasks paths + /sitecore/content/Site + /sitecore/content/Site/Home
// Mirrors the fixture idiom from tests/engine/walk-subtree-registry.test.ts and
// tests/engine/insert-item-template.test.ts.
async function buildFixtureEngine(): Promise<{ dir: string; engine: Engine; secondModulePath: string }> {
  const dir = mkdtempSync(join(tmpdir(), 'mb-root-'));

  writeFileSync(join(dir, 'sitecore.json'), JSON.stringify({
    modules: ['serialization/*.module.json'],
  }, null, 2));

  mkdirSync(join(dir, 'serialization'), { recursive: true });
  writeFileSync(join(dir, 'serialization', 'existing.module.json'), JSON.stringify({
    namespace: 'Existing',
    items: {
      path: 'items',
      includes: [
        { name: 'content', path: '/sitecore/content/Site', database: 'master' },
      ],
    },
  }, null, 3) + '\n');

  // Second module with no includes - target for cross-module collision tests.
  const secondModulePath = join(dir, 'serialization', 'second.module.json');
  writeFileSync(secondModulePath, JSON.stringify({
    namespace: 'Second',
    items: {
      path: 'items',
      includes: [],
    },
  }, null, 3) + '\n');

  // Inline registry providing the Tasks paths + Site paths for collision tests.
  // Neither Tasks path is serialized on disk; the orchestrator resolves them via
  // getRegistryItemByPath. Site and Site/Home are included so the orchestrator
  // can resolve those paths for the collision and redundancy tests.
  const registryPath = join(dir, 'registry.json');
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
      {
        id: 'bbbb0001-0000-0000-0000-000000000002',
        name: 'Home',
        parent: 'bbbb0001-0000-0000-0000-000000000001',
        template: 'AB86861A-6030-46C5-B394-E8F99E8B87DB',
        path: '/sitecore/content/Site/Home',
        database: 'master',
        sharedFields: {},
      },
    ],
  }));

  const engine = new Engine({ rootDir: dir, registryPath });
  await engine.init();
  return { dir, engine, secondModulePath };
}

describe('addSerializationRoot', () => {
  let dir: string;
  let engine: Engine;

  beforeEach(async () => {
    // secondModulePath captured but not needed for the core tests below.
    ({ dir, engine } = await buildFixtureEngine());
  });

  afterEach(async () => {
    await engine.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('dry-run appends to a chosen module without touching disk', async () => {
    const before = readFileSync(join(dir, 'serialization', 'existing.module.json'), 'utf-8');
    const res = await engine.addSerializationRoot({
      path: '/sitecore/system/Tasks/Commands',
      target: { modulePath: join(dir, 'serialization', 'existing.module.json') },
    }, { dryRun: true });
    expect(res.applied).toBe(false);
    expect(res.willCreateFile).toBe(false);
    expect(res.include.scope).toBe('DescendantsOnly');
    expect(JSON.parse(res.contents).items.includes).toHaveLength(2);
    expect(readFileSync(join(dir, 'serialization', 'existing.module.json'), 'utf-8')).toBe(before);
  });

  it('accept writes the append and reloads so the path is covered', async () => {
    const res = await engine.addSerializationRoot({
      path: '/sitecore/system/Tasks/Commands',
      target: { modulePath: join(dir, 'serialization', 'existing.module.json') },
    });
    expect(res.applied).toBe(true);
    expect(res.reloaded).toBe(true);
    const onDisk = JSON.parse(readFileSync(join(dir, 'serialization', 'existing.module.json'), 'utf-8'));
    expect(onDisk.items.includes.some((i: { path: string }) => i.path === '/sitecore/system/Tasks/Commands')).toBe(true);
    expect(engine.coversNewChildAt('/sitecore/system/Tasks/Commands')).toBe(true);
  });

  it('accept new-file writes a discoverable module', async () => {
    const res = await engine.addSerializationRoot({
      path: '/sitecore/system/Tasks/Schedules',
      target: { newFile: true },
    });
    expect(res.willCreateFile).toBe(true);
    expect(existsSync(res.targetFilePath)).toBe(true);
    expect(engine.coversNewChildAt('/sitecore/system/Tasks/Schedules')).toBe(true);
  });

  it('rejects a path that exists in neither tree nor registry', async () => {
    await expect(engine.addSerializationRoot({
      path: '/sitecore/system/DoesNotExist',
      target: { newFile: true },
    })).rejects.toMatchObject({ code: 'path-not-found' });
  });
});

describe('addSerializationRoot - include-collision and redundancy', () => {
  let dir: string;
  let engine: Engine;
  let secondModulePath: string;

  beforeEach(async () => {
    ({ dir, engine, secondModulePath } = await buildFixtureEngine());
  });

  afterEach(async () => {
    await engine.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('rejects exact-path collision via new-file when path already covered in existing module', async () => {
    // /sitecore/content/Site is in existing.module.json's includes and also in the registry.
    // Requesting a new file for this exact path must throw include-collision.
    await expect(engine.addSerializationRoot({
      path: '/sitecore/content/Site',
      target: { newFile: true },
    })).rejects.toMatchObject({ code: 'include-collision' });
  });

  it('rejects exact-path collision via append to a different module when path already covered', async () => {
    // Appending /sitecore/content/Site to second.module.json must fail because
    // existing.module.json already includes that exact path.
    await expect(engine.addSerializationRoot({
      path: '/sitecore/content/Site',
      target: { modulePath: secondModulePath },
    })).rejects.toMatchObject({ code: 'include-collision' });
  });

  it('warns when path children are already covered by a broader ancestor include (dry-run)', async () => {
    // /sitecore/content/Site/Home is not exactly covered, but its children are
    // reached by the ItemAndDescendants (default) include at /sitecore/content/Site.
    // Should succeed with a redundancy warning, not throw.
    const result = await engine.addSerializationRoot(
      {
        path: '/sitecore/content/Site/Home',
        target: { modulePath: secondModulePath },
      },
      { dryRun: true },
    );
    expect(result.warnings).toContain(
      'New children under this path are already covered by an existing include; this serialization root may be redundant.',
    );
    expect(result.applied).toBe(false);
  });
});
