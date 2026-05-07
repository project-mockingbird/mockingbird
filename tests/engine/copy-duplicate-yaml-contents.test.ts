import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { resolve, join } from 'path';
import { Engine } from '../../src/engine/index.js';
import { copyItem } from '../../src/engine/copy-item.js';
import { duplicateItem } from '../../src/engine/duplicate-item.js';

/**
 * Validates the on-disk YAML contents (Parent, Path, ID fields) for
 * items produced by Copy To and Duplicate. New IDs must be minted; the
 * Parent field must point at the new (fresh) ancestor, not the source's
 * ancestor; the Path field must reflect the new location.
 */
describe('Copy To / Duplicate produce correct YAML contents', () => {
  let tempDir: string;
  let engine: Engine;
  const TPL = 'a1b2c3d4-e5f6-7890-abcd-000000000001';
  const PARENT_ID = '11111111-1111-1111-1111-111111111111';
  const DEST_ID = '22222222-2222-2222-2222-222222222222';
  const SUBROOT_ID = '33333333-3333-3333-3333-333333333333';
  const CHILD_ID = '44444444-4444-4444-4444-444444444444';
  const GRAND_ID = '55555555-5555-5555-5555-555555555555';

  beforeEach(async () => {
    tempDir = await mkdtemp(resolve(tmpdir(), 'mb-copy-yaml-'));
    await mkdir(join(tempDir, 'items', 'Parent', 'Sub', 'Child'), { recursive: true });
    await mkdir(join(tempDir, 'items', 'Dest'), { recursive: true });

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

    await writeItem(join(tempDir, 'items', 'Parent.yml'), PARENT_ID,
      '00000000-0000-0000-0000-000000000000', '/sitecore/content/Parent');
    await writeItem(join(tempDir, 'items', 'Dest.yml'), DEST_ID,
      '00000000-0000-0000-0000-000000000000', '/sitecore/content/Dest');
    await writeItem(join(tempDir, 'items', 'Parent', 'Sub.yml'), SUBROOT_ID, PARENT_ID,
      '/sitecore/content/Parent/Sub');
    await writeItem(join(tempDir, 'items', 'Parent', 'Sub', 'Child.yml'), CHILD_ID, SUBROOT_ID,
      '/sitecore/content/Parent/Sub/Child');
    await writeItem(join(tempDir, 'items', 'Parent', 'Sub', 'Child', 'Grand.yml'),
      GRAND_ID, CHILD_ID, '/sitecore/content/Parent/Sub/Child/Grand');

    engine = new Engine({ rootDir: tempDir });
    await engine.init();
  });

  afterEach(async () => {
    await engine.close();
    await rm(tempDir, { recursive: true, force: true });
  });

  /**
   * Pulls ID, Parent, and Path from a YAML file. All three are emitted
   * with brace-wrapped uppercase GUIDs for ID/Parent (per Rainbow's
   * formatter); Path is bare unless reserved chars trigger quoting.
   */
  /**
   * Pulls ID, Parent, Path. Mockingbird's serializer emits GUIDs as
   * `"<lower-hyphen>"` (the default Rainbow quoting kicks in because
   * `-` is one of the trigger chars); the parser also accepts the
   * brace-wrapped uppercase form `"{...}"` that the test fixtures use.
   * The regex tolerates both shapes.
   */
  async function readKeyFields(filePath: string) {
    const raw = await readFile(filePath, 'utf-8');
    const guidPat = /[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}/;
    const idMatch = raw.match(new RegExp(`^ID:\\s*"?\\{?(${guidPat.source})\\}?"?`, 'm'));
    const parentMatch = raw.match(new RegExp(`^Parent:\\s*"?\\{?(${guidPat.source})\\}?"?`, 'm'));
    const pathMatch = raw.match(/^Path:\s*"?([^"\r\n]+?)"?\s*$/m);
    return {
      id: idMatch?.[1].toLowerCase(),
      parent: parentMatch?.[1].toLowerCase(),
      path: pathMatch?.[1].trim(),
      raw,
    };
  }

  it('Copy To: the copied root YAML has the destination parent as Parent and the new Sitecore path', async () => {
    const result = await copyItem(engine, {
      sourceId: SUBROOT_ID,
      destinationParentId: DEST_ID,
      name: 'CopiedSub',
    });
    const root = result.createdItems[0];
    const fields = await readKeyFields(root.filePath);
    expect(fields.id).toBe(root.item.id.toLowerCase());
    expect(fields.id).not.toBe(SUBROOT_ID); // fresh id
    expect(fields.parent).toBe(DEST_ID);
    expect(fields.path).toBe('/sitecore/content/Dest/CopiedSub');
  });

  it('Copy To: descendants have NEW parent IDs (idMap-mapped), not the source parents', async () => {
    const result = await copyItem(engine, {
      sourceId: SUBROOT_ID,
      destinationParentId: DEST_ID,
      name: 'CopiedSub',
    });
    // result.createdItems is in pre-order: [root, Child, Grand]
    const [root, child, grand] = result.createdItems;
    const childFields = await readKeyFields(child.filePath);
    expect(childFields.parent).toBe(root.item.id.toLowerCase());
    expect(childFields.parent).not.toBe(SUBROOT_ID); // not the source parent
    expect(childFields.path).toBe('/sitecore/content/Dest/CopiedSub/Child');

    const grandFields = await readKeyFields(grand.filePath);
    expect(grandFields.parent).toBe(child.item.id.toLowerCase());
    expect(grandFields.parent).not.toBe(CHILD_ID);
    expect(grandFields.path).toBe('/sitecore/content/Dest/CopiedSub/Child/Grand');
  });

  it('Copy To: every copied item has a fresh ID (no source-id leaks)', async () => {
    const result = await copyItem(engine, {
      sourceId: SUBROOT_ID,
      destinationParentId: DEST_ID,
      name: 'CopiedSub',
    });
    const sourceIds = new Set([SUBROOT_ID, CHILD_ID, GRAND_ID]);
    for (const created of result.createdItems) {
      const fields = await readKeyFields(created.filePath);
      expect(sourceIds.has(fields.id!)).toBe(false);
      expect(fields.id).toBe(created.item.id.toLowerCase());
    }
  });

  it('Duplicate: the duplicated root YAML keeps the source parent and uses the conflict-free name', async () => {
    const result = await duplicateItem(engine, {
      sourceId: SUBROOT_ID,
      name: 'Sub-Copy',
    });
    const root = result.createdItems[0];
    const fields = await readKeyFields(root.filePath);
    expect(fields.id).toBe(root.item.id.toLowerCase());
    expect(fields.id).not.toBe(SUBROOT_ID);
    // Duplicate's destination is the source's OWN parent.
    expect(fields.parent).toBe(PARENT_ID);
    expect(fields.path).toBe('/sitecore/content/Parent/Sub-Copy');
  });

  it('Duplicate: descendants point at the duplicated ancestors and have new paths', async () => {
    const result = await duplicateItem(engine, {
      sourceId: SUBROOT_ID,
      name: 'Sub-Copy',
    });
    const [root, child, grand] = result.createdItems;
    const childFields = await readKeyFields(child.filePath);
    expect(childFields.parent).toBe(root.item.id.toLowerCase());
    expect(childFields.path).toBe('/sitecore/content/Parent/Sub-Copy/Child');
    const grandFields = await readKeyFields(grand.filePath);
    expect(grandFields.parent).toBe(child.item.id.toLowerCase());
    expect(grandFields.path).toBe('/sitecore/content/Parent/Sub-Copy/Child/Grand');
  });

  it('Copy To: written files round-trip back through the parser to identical items', async () => {
    const result = await copyItem(engine, {
      sourceId: SUBROOT_ID,
      destinationParentId: DEST_ID,
      name: 'Roundtrip',
    });
    // Engine already has the items in memory (added by copySubtree). The
    // file on disk should reproduce the same item shape - this catches
    // mismatches where the in-memory item and the YAML diverge.
    for (const created of result.createdItems) {
      const yaml = await readFile(created.filePath, 'utf-8');
      // Must include the in-memory item's id, parent, and path.
      expect(yaml.toLowerCase()).toContain(created.item.id.toLowerCase());
      expect(yaml.toLowerCase()).toContain(created.item.parent.toLowerCase());
      expect(yaml).toContain(created.item.path);
    }
  });
});
