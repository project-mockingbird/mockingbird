import { describe, it, expect, afterEach, beforeAll, afterAll } from 'vitest';
import { Engine } from '../../src/engine/index.js';
import { mkdir, writeFile, rm } from 'fs/promises';
import { resolve, join } from 'path';
import { tmpdir } from 'os';

const registryFixture = resolve(__dirname, '../../data/registry.json.gz');

const minimalYaml = (id: string, parent: string, path: string) => `---
ID: "${id}"
Parent: "${parent}"
Template: "bbbbbbbb-bbbb-bbbb-bbbb-000000000020"
Path: ${path}
SharedFields: []
Languages: []
`;

let workspaceRoot: string;
let engine: Engine | null = null;

beforeAll(async () => {
  workspaceRoot = resolve(tmpdir(), `stats-test-${Date.now()}`);
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

describe('Engine.getLayerStats', () => {
  it('returns the single layer with its tree-size effectiveCount in single-layer mode', async () => {
    const layerRoot = join(workspaceRoot, 'one', `case-${Date.now()}`);
    // serialization/items/ matches module config: path='serialization', name='items'
    await mkdir(join(layerRoot, 'serialization', 'items'), { recursive: true });
    await writeFile(
      join(layerRoot, 'sitecore.json'),
      JSON.stringify({ modules: ['*.module.json'], plugins: ['Sitecore.DevEx.Extensibility.Serialization@6.0.23'] }),
    );
    await writeFile(
      join(layerRoot, 'm.module.json'),
      JSON.stringify({
        namespace: 'M',
        items: {
          path: 'serialization',
          includes: [{ name: 'items', path: '/sitecore/content/x', allowedPushOperations: 'CreateUpdateAndDelete' }],
        },
      }),
    );
    await writeFile(
      join(layerRoot, 'serialization', 'items', 'a.yml'),
      minimalYaml('aaaaaaaa-aaaa-aaaa-aaaa-100000000001', '00000000-0000-0000-0000-000000000000', '/sitecore/content/x/a'),
    );
    await writeFile(
      join(layerRoot, 'serialization', 'items', 'b.yml'),
      minimalYaml('aaaaaaaa-aaaa-aaaa-aaaa-100000000002', '00000000-0000-0000-0000-000000000000', '/sitecore/content/x/b'),
    );

    engine = new Engine({ registryPath: registryFixture });
    await engine.openWorkspace([{ sitecoreJsonPath: join(layerRoot, 'sitecore.json'), name: 'only' }]);

    const stats = engine.getLayerStats();
    expect(stats.find((s) => s.name === 'only')?.effectiveCount).toBe(2);
    expect(stats.find((s) => s.name === 'ootb')?.effectiveCount).toBeGreaterThan(0);
  });

  it('returns winning-item counts per layer that sum to the merged tree size in multi-layer mode', async () => {
    const root = join(workspaceRoot, 'multi', `case-${Date.now()}`);
    const layerA = join(root, 'a');
    const layerB = join(root, 'b');
    for (const [dir, ops] of [[layerA, 'CreateOnly'], [layerB, 'CreateUpdateAndDelete']] as const) {
      await mkdir(join(dir, 'serialization', 'items'), { recursive: true });
      await writeFile(
        join(dir, 'sitecore.json'),
        JSON.stringify({ modules: ['*.module.json'], plugins: ['Sitecore.DevEx.Extensibility.Serialization@6.0.23'] }),
      );
      await writeFile(
        join(dir, 'm.module.json'),
        JSON.stringify({
          namespace: dir === layerA ? 'A' : 'B',
          items: {
            path: 'serialization',
            includes: [{ name: 'items', path: '/sitecore/content/x', allowedPushOperations: ops }],
          },
        }),
      );
    }
    await writeFile(
      join(layerA, 'serialization', 'items', '1.yml'),
      minimalYaml('aaaaaaaa-aaaa-aaaa-aaaa-200000000001', '00000000-0000-0000-0000-000000000000', '/sitecore/content/x/one'),
    );
    await writeFile(
      join(layerA, 'serialization', 'items', '2.yml'),
      minimalYaml('aaaaaaaa-aaaa-aaaa-aaaa-200000000002', '00000000-0000-0000-0000-000000000000', '/sitecore/content/x/two'),
    );
    await writeFile(
      join(layerB, 'serialization', 'items', '2.yml'),
      minimalYaml('aaaaaaaa-aaaa-aaaa-aaaa-200000000002', '00000000-0000-0000-0000-000000000000', '/sitecore/content/x/two'),
    );
    await writeFile(
      join(layerB, 'serialization', 'items', '3.yml'),
      minimalYaml('aaaaaaaa-aaaa-aaaa-aaaa-200000000003', '00000000-0000-0000-0000-000000000000', '/sitecore/content/x/three'),
    );

    engine = new Engine({ registryPath: registryFixture });
    await engine.openWorkspace([
      { sitecoreJsonPath: join(layerA, 'sitecore.json'), name: 'A' },
      { sitecoreJsonPath: join(layerB, 'sitecore.json'), name: 'B' },
    ]);

    const stats = engine.getLayerStats();
    expect(stats.find((s) => s.name === 'A')?.effectiveCount).toBe(1);
    expect(stats.find((s) => s.name === 'B')?.effectiveCount).toBe(2);
  });
});
