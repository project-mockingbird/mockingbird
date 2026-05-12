import { describe, it, expect, afterEach, beforeAll, afterAll } from 'vitest';
import { Engine } from '../../src/engine/index.js';
import { mkdir, writeFile, rm } from 'fs/promises';
import { resolve, join } from 'path';
import { tmpdir } from 'os';

let workspaceRoot: string;
let layerA: string;
let layerB: string;
const registryFixture = resolve(__dirname, '../../data/registry.json.gz');
let engine: Engine | null = null;

const SAMPLE_ITEM_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-000000000001';
const SAMPLE_TEMPLATE_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-000000000002';

/**
 * Minimal Rainbow-compatible YAML for a single-language item with one shared
 * field carrying a marker so tests can identify which layer's version won.
 */
const minimalItemYaml = (marker: string) => `---
ID: "${SAMPLE_ITEM_ID}"
Parent: "00000000-0000-0000-0000-000000000000"
Template: "${SAMPLE_TEMPLATE_ID}"
Path: /sitecore/content/test/Home
SharedFields:
- ID: "11111111-1111-1111-1111-111111111111"
  Hint: marker
  Value: ${marker}
Languages:
- Language: en
  Versions:
  - Version: 1
    Fields:
    - ID: "22222222-2222-2222-2222-222222222222"
      Hint: Title
      Value: "Home from ${marker}"
`;

beforeAll(async () => {
  workspaceRoot = resolve(tmpdir(), `multilayer-test-${Date.now()}`);

  // Layer A: weaker (CreateOnly) - the "bootstrap" layer
  layerA = join(workspaceRoot, 'layer-a');
  await mkdir(join(layerA, 'serialization', 'items'), { recursive: true });
  await writeFile(
    join(layerA, 'sitecore.json'),
    JSON.stringify({
      modules: ['*.module.json'],
      plugins: ['Sitecore.DevEx.Extensibility.Serialization@6.0.23'],
    }),
  );
  await writeFile(
    join(layerA, 'a.module.json'),
    JSON.stringify({
      namespace: 'A',
      items: {
        path: 'serialization',
        includes: [
          {
            name: 'items',
            path: '/sitecore/content/test',
            allowedPushOperations: 'CreateOnly',
          },
        ],
      },
    }),
  );
  await writeFile(
    join(layerA, 'serialization', 'items', 'Home.yml'),
    minimalItemYaml('A'),
  );

  // Layer B: stronger (CreateUpdateAndDelete) - the "authored" layer overriding A
  layerB = join(workspaceRoot, 'layer-b');
  await mkdir(join(layerB, 'serialization', 'items'), { recursive: true });
  await writeFile(
    join(layerB, 'sitecore.json'),
    JSON.stringify({
      modules: ['*.module.json'],
      plugins: ['Sitecore.DevEx.Extensibility.Serialization@6.0.23'],
    }),
  );
  await writeFile(
    join(layerB, 'b.module.json'),
    JSON.stringify({
      namespace: 'B',
      items: {
        path: 'serialization',
        includes: [
          {
            name: 'items',
            path: '/sitecore/content/test',
            allowedPushOperations: 'CreateUpdateAndDelete',
          },
        ],
      },
    }),
  );
  await writeFile(
    join(layerB, 'serialization', 'items', 'Home.yml'),
    minimalItemYaml('B'),
  );
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

function readMarker(item: { sharedFields?: Array<{ hint: string; value: string }> } | undefined): string | undefined {
  return item?.sharedFields?.find((f) => f.hint === 'marker')?.value;
}

describe('Engine.openWorkspace - multi-layer precedence', () => {
  it('loads items from multi-layer workspaces and reaches ready', async () => {
    engine = new Engine({
      rootDir: undefined,
      watch: false,
      registryPath: registryFixture,
    });
    await engine.startInit();
    await engine.readiness.ready();

    await engine.openWorkspace([
      { sitecoreJsonPath: join(layerA, 'sitecore.json'), name: 'A' },
      { sitecoreJsonPath: join(layerB, 'sitecore.json'), name: 'B' },
    ]);

    expect(engine.readiness.state).toBe('ready');
    expect(engine.getAllItems().length).toBeGreaterThan(0);
  });

  it('stronger push-ops wins on item ID collision (B overrides A)', async () => {
    engine = new Engine({
      rootDir: undefined,
      watch: false,
      registryPath: registryFixture,
    });
    await engine.startInit();
    await engine.readiness.ready();

    await engine.openWorkspace([
      { sitecoreJsonPath: join(layerA, 'sitecore.json'), name: 'A' },
      { sitecoreJsonPath: join(layerB, 'sitecore.json'), name: 'B' },
    ]);

    const node = engine.getItemById(SAMPLE_ITEM_ID);
    expect(node).toBeDefined();
    expect(readMarker(node!.item)).toBe('B');
  });

  it('weaker push-ops wins when stronger layer absent (A alone)', async () => {
    engine = new Engine({
      rootDir: undefined,
      watch: false,
      registryPath: registryFixture,
    });
    await engine.startInit();
    await engine.readiness.ready();

    await engine.openWorkspace([
      { sitecoreJsonPath: join(layerA, 'sitecore.json'), name: 'A' },
    ]);

    const node = engine.getItemById(SAMPLE_ITEM_ID);
    expect(node).toBeDefined();
    expect(readMarker(node!.item)).toBe('A');
  });

  it('order of layers in spec does not affect precedence (push-ops decides)', async () => {
    engine = new Engine({
      rootDir: undefined,
      watch: false,
      registryPath: registryFixture,
    });
    await engine.startInit();
    await engine.readiness.ready();

    // Reverse order: B first, A second. B still wins on push-ops strength.
    await engine.openWorkspace([
      { sitecoreJsonPath: join(layerB, 'sitecore.json'), name: 'B' },
      { sitecoreJsonPath: join(layerA, 'sitecore.json'), name: 'A' },
    ]);

    const node = engine.getItemById(SAMPLE_ITEM_ID);
    expect(node).toBeDefined();
    expect(readMarker(node!.item)).toBe('B');
  });
});
