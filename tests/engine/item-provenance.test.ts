import { describe, it, expect, afterEach, beforeAll, afterAll } from 'vitest';
import { Engine } from '../../src/engine/index.js';
import { mkdir, writeFile, rm } from 'fs/promises';
import { resolve, join } from 'path';
import { tmpdir } from 'os';

const registryFixture = resolve(__dirname, '../../data/registry.json.gz');

const SAMPLE_ITEM_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-000000000010';
const SAMPLE_TEMPLATE_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-000000000020';

const minimalYaml = (id: string, marker: string) => `---
ID: "${id}"
Parent: "00000000-0000-0000-0000-000000000000"
Template: "${SAMPLE_TEMPLATE_ID}"
Path: /sitecore/content/test/Item-${marker}
SharedFields:
- ID: "11111111-1111-1111-1111-111111111111"
  Hint: marker
  Value: ${marker}
Languages: []
`;

let workspaceRoot: string;
let engine: Engine | null = null;

beforeAll(async () => {
  workspaceRoot = resolve(tmpdir(), `prov-test-${Date.now()}`);
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

describe('Engine.getItemProvenance (single-layer mode)', () => {
  it('returns the single layer as both winner and sole contributor for every tree item', async () => {
    const layerRoot = join(workspaceRoot, 'single', `case-${Date.now()}`);
    // serialization/items/ matches module config: path='serialization', name='items'
    await mkdir(join(layerRoot, 'serialization', 'items'), { recursive: true });
    await writeFile(
      join(layerRoot, 'sitecore.json'),
      JSON.stringify({
        modules: ['*.module.json'],
        plugins: ['Sitecore.DevEx.Extensibility.Serialization@6.0.23'],
      }),
    );
    await writeFile(
      join(layerRoot, 's.module.json'),
      JSON.stringify({
        namespace: 'S',
        items: {
          path: 'serialization',
          includes: [
            { name: 'items', path: '/sitecore/content/test', allowedPushOperations: 'CreateUpdateAndDelete' },
          ],
        },
      }),
    );
    await writeFile(join(layerRoot, 'serialization', 'items', 'Item-S.yml'), minimalYaml(SAMPLE_ITEM_ID, 'S'));

    engine = new Engine({ registryPath: registryFixture });
    await engine.openWorkspace([{ sitecoreJsonPath: join(layerRoot, 'sitecore.json'), name: 'single' }]);

    const prov = engine.getItemProvenance(SAMPLE_ITEM_ID);
    expect(prov).toEqual({ winnerLayer: 'single', contributingLayers: ['single'] });
  });

  it('returns the ootb sentinel shape for registry-only items', async () => {
    engine = new Engine({ registryPath: registryFixture });
    await engine.openWorkspace([]);
    // Use a real registry item by walking the registry:
    const registry = engine['registry'];
    if (!registry) throw new Error('registry not loaded');
    const roots = registry.getRootItems('master');
    if (roots.length === 0) throw new Error('registry fixture missing roots');
    const root = roots[0];

    const prov = engine.getItemProvenance(root.id);
    expect(prov).toEqual({ winnerLayer: 'ootb', contributingLayers: ['ootb'] });
  });

  it('returns null for an unknown item ID', async () => {
    engine = new Engine({ registryPath: registryFixture });
    await engine.openWorkspace([]);
    const prov = engine.getItemProvenance('99999999-9999-9999-9999-999999999999');
    expect(prov).toBeNull();
  });
});
