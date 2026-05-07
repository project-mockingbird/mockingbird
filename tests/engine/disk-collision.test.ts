import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { resolve, join } from 'path';
import { Engine } from '../../src/engine/index.js';
import { renameItem } from '../../src/engine/rename-item.js';
import { moveItem } from '../../src/engine/move-item.js';

/**
 * Pre-flight disk-collision guard for rename/move.
 *
 * The sibling-collision validator only sees tree-registered items. A
 * file or directory at the destination path with no matching .yml is
 * invisible to the validator and ambushes fs.rename, which on Windows
 * surfaces as a raw EPERM. The guard stat's both target paths up
 * front and throws an actionable error instead.
 */
describe('rename/move pre-flight disk-collision guard', () => {
  let tempDir: string;
  let engine: Engine;
  const TPL = 'a1b2c3d4-e5f6-7890-abcd-000000000001';
  const ROOT_ID = '11111111-1111-1111-1111-111111111111';
  const PARENT_ID = '22222222-2222-2222-2222-222222222222';
  const ITEM_ID = '33333333-3333-3333-3333-333333333333';
  const CHILD_ID = '44444444-4444-4444-4444-444444444444';
  const ALT_PARENT_ID = '55555555-5555-5555-5555-555555555555';

  beforeEach(async () => {
    tempDir = await mkdtemp(resolve(tmpdir(), 'mb-disk-collision-'));
    await mkdir(join(tempDir, 'items', 'Root', 'Parent', 'Source'), { recursive: true });
    await mkdir(join(tempDir, 'items', 'Root', 'AltParent'), { recursive: true });

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
SharedFields: []
Languages: []
`, 'utf-8');
    };

    await writeItem(join(tempDir, 'items', 'Root.yml'), ROOT_ID,
      '00000000-0000-0000-0000-000000000000', '/sitecore/content/Root');
    await writeItem(join(tempDir, 'items', 'Root', 'Parent.yml'), PARENT_ID, ROOT_ID,
      '/sitecore/content/Root/Parent');
    await writeItem(join(tempDir, 'items', 'Root', 'Parent', 'Source.yml'), ITEM_ID, PARENT_ID,
      '/sitecore/content/Root/Parent/Source');
    await writeItem(join(tempDir, 'items', 'Root', 'Parent', 'Source', 'Child.yml'), CHILD_ID, ITEM_ID,
      '/sitecore/content/Root/Parent/Source/Child');
    await writeItem(join(tempDir, 'items', 'Root', 'AltParent.yml'), ALT_PARENT_ID, ROOT_ID,
      '/sitecore/content/Root/AltParent');

    engine = new Engine({ rootDir: tempDir });
    engine.startInit();
    await engine.readiness.ready();
  });

  afterEach(async () => {
    await engine.close();
    await rm(tempDir, { recursive: true, force: true });
  });

  it('renameItem rejects with a clear error when an orphan target dir exists on disk', async () => {
    // Orphan empty "Target/" sits next to "Source.yml" with no .yml of
    // its own - invisible to the tree, but fs.rename of "Source/" ->
    // "Target/" would fail with EPERM on Windows.
    await mkdir(join(tempDir, 'items', 'Root', 'Parent', 'Target'), { recursive: true });

    await expect(
      renameItem(engine, { itemId: ITEM_ID, newName: 'Target' })
    ).rejects.toThrow(/already exists on disk.*not registered in the engine/);
  });

  it('renameItem rejects with a clear error when an orphan target .yml exists on disk', async () => {
    // Orphan "Target.yml" file with no engine knowledge of it.
    await writeFile(
      join(tempDir, 'items', 'Root', 'Parent', 'Target.yml'),
      'orphan content',
      'utf-8',
    );

    await expect(
      renameItem(engine, { itemId: ITEM_ID, newName: 'Target' })
    ).rejects.toThrow(/already exists on disk.*not registered in the engine/);
  });

  it('renameItem leaves the source untouched when the disk-collision guard fires', async () => {
    await mkdir(join(tempDir, 'items', 'Root', 'Parent', 'Target'), { recursive: true });

    await expect(
      renameItem(engine, { itemId: ITEM_ID, newName: 'Target' })
    ).rejects.toThrow();

    // Source .yml still in place. Without the guard the .yml rename
    // would have succeeded then been rolled back by the catch block,
    // but a regression that drops the rollback would leave it gone.
    const stillThere = engine.getItemById(ITEM_ID);
    expect(stillThere).toBeDefined();
    expect(stillThere!.item.path).toBe('/sitecore/content/Root/Parent/Source');
  });

  it('moveItem rejects with a clear error when an orphan target dir exists at the destination', async () => {
    // Orphan "Source/" already at the destination parent on disk.
    await mkdir(join(tempDir, 'items', 'Root', 'AltParent', 'Source'), { recursive: true });

    await expect(
      moveItem(engine, { sourceId: ITEM_ID, destinationParentId: ALT_PARENT_ID })
    ).rejects.toThrow(/already exists on disk.*not registered in the engine/);
  });

  it('moveItem rejects with a clear error when an orphan target .yml exists at the destination', async () => {
    await writeFile(
      join(tempDir, 'items', 'Root', 'AltParent', 'Source.yml'),
      'orphan content',
      'utf-8',
    );

    await expect(
      moveItem(engine, { sourceId: ITEM_ID, destinationParentId: ALT_PARENT_ID })
    ).rejects.toThrow(/already exists on disk.*not registered in the engine/);
  });
});
