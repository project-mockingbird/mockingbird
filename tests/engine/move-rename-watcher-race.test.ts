import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { resolve, join } from 'path';
import { Engine } from '../../src/engine/index.js';
import { moveItem } from '../../src/engine/move-item.js';
import { renameItem } from '../../src/engine/rename-item.js';

/**
 * Regression net for the watcher race that re-linked moved/renamed items
 * back to their pre-move state. Symptom: after a move, the item stayed
 * under its OLD parent in the tree even though the file had moved on
 * disk. Root cause: fs.rename only moved bytes; the YAML's `Parent` /
 * `Path` fields still reflected the pre-move state. When chokidar fired
 * `add` on the new path, the parser returned an item with stale
 * `parent` / `path`, and `tree.addItem`'s idempotent re-add (introduced
 * for the watcher-race child-loss bug) saw the disagreement with the
 * just-relinked `parentNode` and re-linked the node BACK to the old
 * parent. Fix: rewrite YAMLs after relinking + suppress the watcher
 * for affected paths during the operation.
 */
describe('move/rename watcher race', () => {
  let tempDir: string;
  let engine: Engine;
  const TPL = 'a1b2c3d4-e5f6-7890-abcd-000000000001';
  const PARENT_A_ID = '11111111-1111-1111-1111-111111111111';
  const PARENT_B_ID = '22222222-2222-2222-2222-222222222222';
  const ITEM_ID = '33333333-3333-3333-3333-333333333333';
  const CHILD_ID = '44444444-4444-4444-4444-444444444444';

  beforeEach(async () => {
    tempDir = await mkdtemp(resolve(tmpdir(), 'mb-move-race-'));
    await mkdir(join(tempDir, 'items', 'A', 'X'), { recursive: true });
    await mkdir(join(tempDir, 'items', 'B'), { recursive: true });

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

    await writeItem(join(tempDir, 'items', 'A.yml'), PARENT_A_ID,
      '00000000-0000-0000-0000-000000000000', '/sitecore/content/A');
    await writeItem(join(tempDir, 'items', 'B.yml'), PARENT_B_ID,
      '00000000-0000-0000-0000-000000000000', '/sitecore/content/B');
    await writeItem(join(tempDir, 'items', 'A', 'X.yml'), ITEM_ID, PARENT_A_ID,
      '/sitecore/content/A/X');
    await writeItem(join(tempDir, 'items', 'A', 'X', 'Child.yml'), CHILD_ID, ITEM_ID,
      '/sitecore/content/A/X/Child');

    engine = new Engine({ rootDir: tempDir, watch: true });
    await engine.init();
  });

  afterEach(async () => {
    await engine.close();
    await rm(tempDir, { recursive: true, force: true });
  });

  it('moveItem updates the YAML Parent + Path fields and survives the watcher echo', async () => {
    await moveItem(engine, {
      sourceId: ITEM_ID,
      destinationParentId: PARENT_B_ID,
    });
    // Wait long enough for chokidar to fire any add/change/unlink events
    // and for the watcher's async handler to process them.
    await new Promise(r => setTimeout(r, 1500));

    // In-memory state: item is under B, not A.
    const moved = engine.getItemById(ITEM_ID);
    expect(moved).toBeDefined();
    expect(moved!.item.parent.toLowerCase()).toBe(PARENT_B_ID);
    expect(moved!.item.path).toBe('/sitecore/content/B/X');
    expect(moved!.parentNode?.item.id.toLowerCase()).toBe(PARENT_B_ID);

    // Old parent A no longer claims the item.
    const a = engine.getItemById(PARENT_A_ID)!;
    expect(a.children.has(ITEM_ID)).toBe(false);
    // New parent B does.
    const b = engine.getItemById(PARENT_B_ID)!;
    expect(b.children.has(ITEM_ID)).toBe(true);

    // Descendant's path was rewritten too.
    const child = engine.getItemById(CHILD_ID);
    expect(child!.item.path).toBe('/sitecore/content/B/X/Child');

    // YAML on disk reflects the new state. Critical for survival across
    // a restart's startup scan.
    const yaml = await readFile(moved!.filePath, 'utf-8');
    expect(yaml).toMatch(new RegExp(`Parent:\\s*"?\\{?${PARENT_B_ID}`, 'i'));
    expect(yaml).toContain('Path: /sitecore/content/B/X');
  });

  it('renameItem updates the YAML Path field and survives the watcher echo', async () => {
    await renameItem(engine, { itemId: ITEM_ID, newName: 'X-renamed' });
    await new Promise(r => setTimeout(r, 1500));

    const renamed = engine.getItemById(ITEM_ID);
    expect(renamed).toBeDefined();
    expect(renamed!.item.path).toBe('/sitecore/content/A/X-renamed');
    expect(renamed!.parentNode?.item.id.toLowerCase()).toBe(PARENT_A_ID);

    const child = engine.getItemById(CHILD_ID);
    expect(child!.item.path).toBe('/sitecore/content/A/X-renamed/Child');

    // Rainbow quotes values containing `-` (along with other reserved chars),
    // so accept either bare or quoted Path emission.
    const yaml = await readFile(renamed!.filePath, 'utf-8');
    expect(yaml).toMatch(/Path:\s*"?\/sitecore\/content\/A\/X-renamed"?/);

    const childYaml = await readFile(child!.filePath, 'utf-8');
    expect(childYaml).toMatch(/Path:\s*"?\/sitecore\/content\/A\/X-renamed\/Child"?/);
  });
});
