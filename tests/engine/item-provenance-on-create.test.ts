import { describe, it, expect, afterEach } from 'vitest';
import { Engine } from '../../src/engine/index.js';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { resolve, join } from 'path';

const registryFixture = resolve(__dirname, '../../data/registry.json.gz');
const TEMPLATE_TEMPLATE_ID = 'ab86861a-6030-46c5-b394-e8f99e8b87db';
const PARENT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

// Build a single-layer workspace with one parent item under
// /sitecore/content/test, then open it under the named layer "mylayer".
function buildLayer(): string {
  const dir = mkdtempSync(join(tmpdir(), 'mb-prov-create-'));
  mkdirSync(join(dir, 'serialization', 'items'), { recursive: true });
  writeFileSync(join(dir, 'sitecore.json'), JSON.stringify({ modules: ['*.module.json'] }));
  writeFileSync(
    join(dir, 's.module.json'),
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
  writeFileSync(
    join(dir, 'serialization', 'items', 'Parent.yml'),
    `---
ID: "{AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA}"
Parent: "{00000000-0000-0000-0000-000000000000}"
Template: "{AB86861A-6030-46C5-B394-E8F99E8B87DB}"
Path: /sitecore/content/test/Parent
`,
  );
  return dir;
}

let engine: Engine | null = null;
let dir: string | null = null;

afterEach(async () => {
  if (engine) {
    await engine.close();
    engine = null;
  }
  if (dir) {
    rmSync(dir, { recursive: true, force: true });
    dir = null;
  }
});

describe('newly created items get layer provenance immediately (item 2: green bar)', () => {
  it('stamps an inserted item with the active layer, inherited from its parent', async () => {
    dir = buildLayer();
    engine = new Engine({ registryPath: registryFixture });
    await engine.openWorkspace([{ sitecoreJsonPath: join(dir, 'sitecore.json'), name: 'mylayer' }]);

    // Sanity: the pre-existing parent already carries provenance.
    expect(engine.getItemProvenance(PARENT_ID)).toEqual({
      winnerLayer: 'mylayer',
      contributingLayers: ['mylayer'],
    });

    const res = await engine.insertItem({
      parentId: PARENT_ID,
      templateId: TEMPLATE_TEMPLATE_ID,
      name: 'NewChild',
    });

    expect(engine.getItemProvenance(res.rootItemId)).toEqual({
      winnerLayer: 'mylayer',
      contributingLayers: ['mylayer'],
    });
  });

  it('stamps a created template AND its __Standard Values child', async () => {
    dir = buildLayer();
    engine = new Engine({ registryPath: registryFixture });
    await engine.openWorkspace([{ sitecoreJsonPath: join(dir, 'sitecore.json'), name: 'mylayer' }]);

    const tplNode = await engine.createTemplate('MyTpl', '/sitecore/content/test/Parent');
    expect(engine.getItemProvenance(tplNode.item.id)).toEqual({
      winnerLayer: 'mylayer',
      contributingLayers: ['mylayer'],
    });

    const svNode = engine.getItemByPath('/sitecore/content/test/Parent/MyTpl/__Standard Values');
    expect(svNode).toBeDefined();
    expect(engine.getItemProvenance(svNode!.item.id)).toEqual({
      winnerLayer: 'mylayer',
      contributingLayers: ['mylayer'],
    });
  });
});
