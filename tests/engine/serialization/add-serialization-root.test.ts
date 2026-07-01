import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Engine } from '../../../src/engine/index.js';

// Build a minimal tmp workspace with:
//   - sitecore.json: modules glob = "serialization/*.module.json"
//   - serialization/existing.module.json: one include at /sitecore/content/Site
//   - registry.json: two items /sitecore/system/Tasks/Commands and /sitecore/system/Tasks/Schedules
// Mirrors the fixture idiom from tests/engine/walk-subtree-registry.test.ts and
// tests/engine/insert-item-template.test.ts.
async function buildFixtureEngine(): Promise<{ dir: string; engine: Engine }> {
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

  // Inline registry providing the two Tasks paths. Neither is serialized on
  // disk; the orchestrator must resolve them via getRegistryItemByPath.
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
    ],
  }));

  const engine = new Engine({ rootDir: dir, registryPath });
  await engine.init();
  return { dir, engine };
}

describe('addSerializationRoot', () => {
  let dir: string;
  let engine: Engine;

  beforeEach(async () => {
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
