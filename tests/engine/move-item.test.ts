import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'fs/promises';
import { cpSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { resolve, join } from 'path';
import { fileURLToPath } from 'url';
import { Engine } from '../../src/engine/index.js';
import { moveItem } from '../../src/engine/move-item.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const FIXTURES = resolve(__dirname, '../fixtures/valid');
const REGISTRY_JSON = resolve(__dirname, '../fixtures/registry/test-registry.json');

describe('moveItem - validation guards', () => {
  let tempDir: string;
  let engine: Engine;
  const TPL = 'a1b2c3d4-e5f6-7890-abcd-000000000001';
  const PARENT_ID = '11111111-1111-1111-1111-111111111111';
  const ALT_PARENT_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
  const SUBROOT_ID = '22222222-2222-2222-2222-222222222222';
  const CHILD_ID = '33333333-3333-3333-3333-333333333333';
  const GRANDCHILD_ID = '44444444-4444-4444-4444-444444444444';
  const SIBLING_AT_ALT_ID = '55555555-5555-5555-5555-555555555555';

  beforeEach(async () => {
    tempDir = await mkdtemp(resolve(tmpdir(), 'mockingbird-move-'));
    await mkdir(join(tempDir, 'items', 'Sub', 'Child'), { recursive: true });
    await mkdir(join(tempDir, 'items', 'Alt'), { recursive: true });
    await writeFile(join(tempDir, 'sitecore.json'), JSON.stringify({
      modules: ['*.module.json'],
    }), 'utf-8');
    await writeFile(join(tempDir, 'mod.module.json'), JSON.stringify({
      namespace: 'mod',
      items: { includes: [{ name: 'items', path: '/sitecore/content' }] },
    }), 'utf-8');

    const writeItem = async (filePath: string, id: string, parent: string, path: string) => {
      await writeFile(filePath, `---
ID: "{${id.toUpperCase()}}"
Parent: "{${parent.toUpperCase()}}"
Template: "{${TPL.toUpperCase()}}"
Path: ${path}
`, 'utf-8');
    };

    await writeItem(join(tempDir, 'items', 'Parent.yml'), PARENT_ID,
      '00000000-0000-0000-0000-000000000000', '/sitecore/content/Parent');
    await writeItem(join(tempDir, 'items', 'Sub.yml'), SUBROOT_ID, PARENT_ID,
      '/sitecore/content/Parent/Sub');
    await writeItem(join(tempDir, 'items', 'Sub', 'Child.yml'), CHILD_ID, SUBROOT_ID,
      '/sitecore/content/Parent/Sub/Child');
    await writeItem(join(tempDir, 'items', 'Sub', 'Child', 'Grand.yml'),
      GRANDCHILD_ID, CHILD_ID, '/sitecore/content/Parent/Sub/Child/Grand');
    await writeItem(join(tempDir, 'items', 'Alt.yml'), ALT_PARENT_ID, PARENT_ID,
      '/sitecore/content/Parent/Alt');
    await writeItem(join(tempDir, 'items', 'Alt', 'Sub.yml'), SIBLING_AT_ALT_ID,
      ALT_PARENT_ID, '/sitecore/content/Parent/Alt/Sub');

    engine = new Engine({ rootDir: tempDir });
    engine.startInit();
    await engine.readiness.ready();
  });
  afterEach(async () => {
    await engine.close();
    await rm(tempDir, { recursive: true, force: true });
  });

  it('refuses moving an item into itself', async () => {
    await expect(
      moveItem(engine, { sourceId: SUBROOT_ID, destinationParentId: SUBROOT_ID }),
    ).rejects.toThrow(/Cannot move an item into itself/);
  });

  it('refuses moving an item into one of its descendants', async () => {
    await expect(
      moveItem(engine, { sourceId: SUBROOT_ID, destinationParentId: CHILD_ID }),
    ).rejects.toThrow(/Cannot move an item into one of its own descendants/);
    await expect(
      moveItem(engine, { sourceId: SUBROOT_ID, destinationParentId: GRANDCHILD_ID }),
    ).rejects.toThrow(/Cannot move an item into one of its own descendants/);
  });

  it('refuses moving to the current parent', async () => {
    await expect(
      moveItem(engine, { sourceId: SUBROOT_ID, destinationParentId: PARENT_ID }),
    ).rejects.toThrow(/already a child of/);
  });

  it('refuses on name collision at the destination (no auto-rename)', async () => {
    await expect(
      moveItem(engine, { sourceId: SUBROOT_ID, destinationParentId: ALT_PARENT_ID }),
    ).rejects.toThrow(/already exists at/);
  });

  it('refuses with 404-ish error on unknown source', async () => {
    await expect(
      moveItem(engine, {
        sourceId: '00000000-1111-2222-3333-444444444444',
        destinationParentId: ALT_PARENT_ID,
      }),
    ).rejects.toThrow(/Source item not found/);
  });

  it('refuses with 404-ish error on unknown destination', async () => {
    await expect(
      moveItem(engine, {
        sourceId: SUBROOT_ID,
        destinationParentId: '00000000-1111-2222-3333-444444444444',
      }),
    ).rejects.toThrow(/Destination parent not found/);
  });
});

describe('moveItem - happy path', () => {
  let tempDir: string;
  let engine: Engine;
  const TPL = 'a1b2c3d4-e5f6-7890-abcd-000000000001';
  const PARENT_ID = '11111111-1111-1111-1111-111111111111';
  const ALT_PARENT_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
  const SUBROOT_ID = '22222222-2222-2222-2222-222222222222';
  const CHILD_ID = '33333333-3333-3333-3333-333333333333';

  beforeEach(async () => {
    tempDir = await mkdtemp(resolve(tmpdir(), 'mockingbird-move-happy-'));
    await mkdir(join(tempDir, 'items', 'Sub'), { recursive: true });
    await mkdir(join(tempDir, 'items', 'Alt'), { recursive: true });
    await writeFile(join(tempDir, 'sitecore.json'), JSON.stringify({
      modules: ['*.module.json'],
    }), 'utf-8');
    await writeFile(join(tempDir, 'mod.module.json'), JSON.stringify({
      namespace: 'mod',
      items: { includes: [{ name: 'items', path: '/sitecore/content' }] },
    }), 'utf-8');

    const writeItem = async (filePath: string, id: string, parent: string, path: string) => {
      await writeFile(filePath, `---
ID: "{${id.toUpperCase()}}"
Parent: "{${parent.toUpperCase()}}"
Template: "{${TPL.toUpperCase()}}"
Path: ${path}
`, 'utf-8');
    };

    await writeItem(join(tempDir, 'items', 'Parent.yml'), PARENT_ID,
      '00000000-0000-0000-0000-000000000000', '/sitecore/content/Parent');
    await writeItem(join(tempDir, 'items', 'Sub.yml'), SUBROOT_ID, PARENT_ID,
      '/sitecore/content/Parent/Sub');
    await writeItem(join(tempDir, 'items', 'Sub', 'Child.yml'), CHILD_ID, SUBROOT_ID,
      '/sitecore/content/Parent/Sub/Child');
    await writeItem(join(tempDir, 'items', 'Alt.yml'), ALT_PARENT_ID, PARENT_ID,
      '/sitecore/content/Parent/Alt');

    engine = new Engine({ rootDir: tempDir });
    engine.startInit();
    await engine.readiness.ready();
  });
  afterEach(async () => {
    await engine.close();
    await rm(tempDir, { recursive: true, force: true });
  });

  it('relocates the subtree to the destination preserving IDs', async () => {
    const result = await moveItem(engine, {
      sourceId: SUBROOT_ID,
      destinationParentId: ALT_PARENT_ID,
    });

    expect(result.movedRootId).toBe(SUBROOT_ID);
    expect(engine.getItemById(SUBROOT_ID)!.item.path).toBe('/sitecore/content/Parent/Alt/Sub');
    expect(engine.getItemById(CHILD_ID)!.item.path).toBe('/sitecore/content/Parent/Alt/Sub/Child');

    expect(engine.getItemById(SUBROOT_ID)!.item.parent).toBe(ALT_PARENT_ID);
    expect(engine.getItemById(CHILD_ID)!.item.parent).toBe(SUBROOT_ID);

    expect(result.fromPath).toBe('/sitecore/content/Parent/Sub');

    expect(existsSync(join(tempDir, 'items', 'Sub.yml'))).toBe(false);
    expect(existsSync(join(tempDir, 'items', 'Sub'))).toBe(false);
    expect(existsSync(join(tempDir, 'items', 'Alt', 'Sub.yml'))).toBe(true);
    expect(existsSync(join(tempDir, 'items', 'Alt', 'Sub', 'Child.yml'))).toBe(true);
  });
});

describe('moveItem - leaf item (no children directory)', () => {
  let tempDir: string;
  let engine: Engine;
  const TPL = 'a1b2c3d4-e5f6-7890-abcd-000000000001';
  const PARENT_ID = '11111111-1111-1111-1111-111111111111';
  const ALT_PARENT_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
  const LEAF_ID = '99999999-9999-9999-9999-999999999999';

  beforeEach(async () => {
    tempDir = await mkdtemp(resolve(tmpdir(), 'mockingbird-move-leaf-'));
    await mkdir(join(tempDir, 'items', 'Alt'), { recursive: true });
    await writeFile(join(tempDir, 'sitecore.json'), JSON.stringify({
      modules: ['*.module.json'],
    }), 'utf-8');
    await writeFile(join(tempDir, 'mod.module.json'), JSON.stringify({
      namespace: 'mod',
      items: { includes: [{ name: 'items', path: '/sitecore/content' }] },
    }), 'utf-8');

    const writeItem = async (filePath: string, id: string, parent: string, path: string) => {
      await writeFile(filePath, `---
ID: "{${id.toUpperCase()}}"
Parent: "{${parent.toUpperCase()}}"
Template: "{${TPL.toUpperCase()}}"
Path: ${path}
`, 'utf-8');
    };

    await writeItem(join(tempDir, 'items', 'Parent.yml'), PARENT_ID,
      '00000000-0000-0000-0000-000000000000', '/sitecore/content/Parent');
    await writeItem(join(tempDir, 'items', 'Leaf.yml'), LEAF_ID, PARENT_ID,
      '/sitecore/content/Parent/Leaf');
    await writeItem(join(tempDir, 'items', 'Alt.yml'), ALT_PARENT_ID, PARENT_ID,
      '/sitecore/content/Parent/Alt');

    engine = new Engine({ rootDir: tempDir });
    engine.startInit();
    await engine.readiness.ready();
  });
  afterEach(async () => {
    await engine.close();
    await rm(tempDir, { recursive: true, force: true });
  });

  it('moves a leaf item with no children directory', async () => {
    const result = await moveItem(engine, {
      sourceId: LEAF_ID,
      destinationParentId: ALT_PARENT_ID,
    });

    expect(result.movedRootId).toBe(LEAF_ID);
    expect(result.movedItems).toHaveLength(1);
    expect(engine.getItemById(LEAF_ID)!.item.path).toBe('/sitecore/content/Parent/Alt/Leaf');
    expect(engine.getItemById(LEAF_ID)!.item.parent).toBe(ALT_PARENT_ID);

    expect(existsSync(join(tempDir, 'items', 'Leaf.yml'))).toBe(false);
    expect(existsSync(join(tempDir, 'items', 'Alt', 'Leaf.yml'))).toBe(true);
    // Source never had a wrapping directory; nothing to assert about it.
  });
});

describe('moveItem - registry-only refusal', () => {
  let tempDir: string;
  let engine: Engine;
  // Standard template is registry-only in the test-registry fixture - same id
  // pattern used by copy-item.test.ts and duplicate-item.test.ts.
  const REG_ID = '1930bbeb-7805-471a-a3be-4858ac7cf696';
  const ALT_PARENT_ID = 'a1b2c3d4-e5f6-7890-abcd-000000000001';

  beforeEach(async () => {
    tempDir = await mkdtemp(resolve(tmpdir(), 'mockingbird-move-reg-'));
    cpSync(FIXTURES, tempDir, { recursive: true });
    engine = new Engine({ rootDir: tempDir, registryPath: REGISTRY_JSON });
    engine.startInit();
    await engine.readiness.ready();
  });
  afterEach(async () => {
    await engine.close();
    await rm(tempDir, { recursive: true, force: true });
  });

  it('refuses to move a registry-only item', async () => {
    await expect(
      moveItem(engine, { sourceId: REG_ID, destinationParentId: ALT_PARENT_ID }),
    ).rejects.toThrow(/Cannot move registry-only item/);
  });
});
