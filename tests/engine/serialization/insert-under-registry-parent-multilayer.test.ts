/**
 * End-to-end regression test: insert a child item under a registry-only parent
 * in a MULTI-LAYER openWorkspace (engine.getRootDir() === undefined).
 *
 * This reproduces the full consumer flow that would have caught three
 * separate rootDir guard bugs:
 *   - reloadModules   (fixed commit d51e23d)
 *   - deriveEmitTarget (fixed commit d51e23d)
 *   - resolveFilePath  (fixed in the accompanying src/engine/index.ts edit)
 *
 * Without the resolveFilePath fix, step 3 below throws:
 *   "resolveFilePath is not available in no-project mode"
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Engine } from '../../../src/engine/index.js';
import { resolveInsertParent } from '../../../src/engine/insert-branch.js';
import { insertItemAtParent } from '../../../src/engine/insert-item.js';

// IDs used in the inline registry fixture.
const COMMANDS_FOLDER_ID = 'aaaa0001-0000-0000-0000-000000000001';
const COMMAND_TEMPLATE_ID = 'cccc0001-0000-0000-0000-000000000001';

// Template template - items typed on this are Template definitions.
const TEMPLATE_TEMPLATE_ID = 'ab86861a-6030-46c5-b394-e8f99e8b87db';

/**
 * Build a two-layer workspace identical to the one in
 * add-serialization-root-multilayer.test.ts, but with a "Command" Template
 * entry added to the registry so insertItemAtParent can resolve a template
 * when creating a child under the Commands folder.
 *
 * Layer A (weaker, CreateOnly) - has one existing include at
 *   /sitecore/content/Site so cross-include collision tests remain possible.
 * Layer B (stronger, CreateUpdateAndDelete) - starts with no includes; this
 *   is the layer that receives the new serialization root.
 */
async function buildMultilayerFixture() {
  const workspaceRoot = mkdtempSync(join(tmpdir(), 'mb-insert-reg-ml-'));

  // Layer A: weaker
  const layerARoot = join(workspaceRoot, 'layer-a');
  mkdirSync(join(layerARoot, 'serialization'), { recursive: true });
  writeFileSync(join(layerARoot, 'sitecore.json'), JSON.stringify({
    modules: ['serialization/*.module.json'],
  }, null, 2));
  writeFileSync(join(layerARoot, 'serialization', 'a.module.json'), JSON.stringify({
    namespace: 'LayerA',
    items: {
      path: 'items',
      includes: [
        { name: 'content', path: '/sitecore/content/Site', database: 'master' },
      ],
    },
  }, null, 2) + '\n');

  // Layer B: stronger - starts with an empty includes list
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
  }, null, 2) + '\n');

  // Inline registry.
  //   - Commands folder at /sitecore/system/Tasks/Commands (the insert target)
  //   - Command template at /sitecore/templates/System/Tasks/Command
  //     (used as the templateId when creating a child item)
  const registryPath = join(workspaceRoot, 'registry.json');
  writeFileSync(registryPath, JSON.stringify({
    version: '1.0',
    source: 'test',
    extractedAt: new Date().toISOString(),
    items: [
      {
        id: COMMANDS_FOLDER_ID,
        name: 'Commands',
        parent: '00000000-0000-0000-0000-000000000000',
        template: TEMPLATE_TEMPLATE_ID,
        path: '/sitecore/system/Tasks/Commands',
        database: 'master',
        sharedFields: {},
      },
      {
        id: COMMAND_TEMPLATE_ID,
        name: 'Command',
        parent: '00000000-0000-0000-0000-000000000000',
        template: TEMPLATE_TEMPLATE_ID,
        path: '/sitecore/templates/System/Tasks/Command',
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

  return { workspaceRoot, layerARoot, layerBRoot, layerBModulePath, engine };
}

describe('insert under registry parent - multi-layer end-to-end', () => {
  let workspaceRoot: string;
  let engine: Engine;

  afterEach(async () => {
    await engine.close();
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('pre-condition: rootDir is undefined in multi-layer mode', async () => {
    ({ workspaceRoot, engine } = await buildMultilayerFixture());
    expect(engine.getRootDir()).toBeUndefined();
  });

  it('full flow: addSerializationRoot -> resolveFilePath -> resolveInsertParent -> insertItemAtParent', async () => {
    let layerBModulePath: string;
    let layerBRoot: string;
    ({ workspaceRoot, layerBRoot, layerBModulePath, engine } = await buildMultilayerFixture());

    // Verify the pre-condition that triggered all three bugs.
    expect(engine.getRootDir()).toBeUndefined();

    // 1. addSerializationRoot (DescendantsOnly) at /sitecore/system/Tasks/Commands.
    //    Bug pre-condition: reloadModules() early-returned when rootDir was
    //    undefined, so coversNewChildAt never became true.
    const addResult = await engine.addSerializationRoot({
      path: '/sitecore/system/Tasks/Commands',
      target: { modulePath: layerBModulePath },
    });
    expect(addResult.applied).toBe(true);
    expect(addResult.reloaded).toBe(true);

    // Assert the live engine covers the new path (reloadModules works).
    expect(engine.coversNewChildAt('/sitecore/system/Tasks/Commands')).toBe(true);

    // 2. resolveFilePath must NOT throw and must return a path inside the
    //    layer B include dir.
    //    Bug pre-condition: the guard was at the TOP of the method and threw
    //    "resolveFilePath is not available in no-project mode" before the
    //    include-matching loop could run.
    let resolvedPath: string;
    expect(() => {
      resolvedPath = engine.resolveFilePath('/sitecore/system/Tasks/Commands', 'Commands');
    }).not.toThrow();

    // The resolved path must live under layer B's serialization dir.
    const layerBSerializationDir = join(layerBRoot, 'serialization');
    expect(resolvedPath!.startsWith(layerBSerializationDir)).toBe(true);

    // 3. resolveInsertParent + insertItemAtParent - the actual insert flow.
    //    Bug pre-condition: resolveInsertParent called resolveFilePath to
    //    build the ghost parent's filePath, which then threw in no-project mode.
    const parent = resolveInsertParent(engine, '/sitecore/system/Tasks/Commands');
    expect(parent).toBeDefined();
    expect(parent!.item.path).toBe('/sitecore/system/Tasks/Commands');
    // The synthesized filePath is what routes child writes into the right include.
    expect(parent!.filePath.startsWith(layerBSerializationDir)).toBe(true);

    const result = await insertItemAtParent(engine, parent!, {
      templateId: COMMAND_TEMPLATE_ID,
      name: 'MyCommand',
    });

    expect(result).toBeDefined();
    expect(result.createdItems).toHaveLength(1);

    const created = result.createdItems[0];
    expect(created.item.path).toBe('/sitecore/system/Tasks/Commands/MyCommand');

    // The YAML file must exist on disk inside the include's dir.
    expect(existsSync(created.filePath)).toBe(true);
    expect(created.filePath.startsWith(layerBSerializationDir)).toBe(true);
  });
});
