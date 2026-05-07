import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { resolve, join } from 'path';
import { cpSync } from 'fs';
import { fileURLToPath } from 'url';
import { Engine } from '../../src/engine/index.js';
import { duplicateItem } from '../../src/engine/duplicate-item.js';
import { FIELD_IDS } from '../../src/engine/constants.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const FIXTURES = resolve(__dirname, '../fixtures/valid');

describe('duplicateItem', () => {
  describe('single-item happy path (source has no children)', () => {
    let tempDir: string;
    let engine: Engine;
    const SOURCE_ID = 'a1b2c3d4-e5f6-7890-abcd-000000000004'; // leaf item in valid fixtures

    beforeEach(async () => {
      tempDir = await mkdtemp(resolve(tmpdir(), 'mockingbird-dup-'));
      cpSync(FIXTURES, tempDir, { recursive: true });
      engine = new Engine({ rootDir: tempDir });
      engine.startInit();
      await engine.readiness.ready();
    });
    afterEach(async () => {
      await engine.close();
      await rm(tempDir, { recursive: true, force: true });
    });

    it('creates a sibling at the same parent with a fresh GUID', async () => {
      const source = engine.getItemById(SOURCE_ID);
      expect(source).toBeDefined();
      const result = await duplicateItem(engine, { sourceId: SOURCE_ID, name: 'CopyOfFour' });

      expect(result.rootItemId).not.toBe(SOURCE_ID);
      expect(result.createdItems).toHaveLength(1);
      const copy = result.createdItems[0].item;
      expect(copy.parent).toBe(source!.item.parent);
      expect(copy.template).toBe(source!.item.template);
      expect(copy.path.endsWith('/CopyOfFour')).toBe(true);
    });

    it('copies all field values verbatim (no token expansion)', async () => {
      const source = engine.getItemById(SOURCE_ID)!;
      const result = await duplicateItem(engine, { sourceId: SOURCE_ID, name: 'CopyOfFour' });
      const copy = result.createdItems[0].item;

      expect(copy.sharedFields).toEqual(source.item.sharedFields);
      expect(copy.languages.length).toBe(source.item.languages.length);
    });

    it('stamps a fresh __Created on the copy', async () => {
      const result = await duplicateItem(engine, { sourceId: SOURCE_ID, name: 'CopyOfFour' });
      const copy = result.createdItems[0].item;
      const en = copy.languages.find(l => l.language === 'en');
      const v1 = en?.versions.find(v => v.version === 1);
      const created = v1?.fields.find(f => f.id === FIELD_IDS.created);
      expect(created).toBeDefined();
      expect(created!.value).toMatch(/^\d{8}T\d{6}Z?$/); // sitecoreDate format
    });

    it('does not stamp branchId (Duplicate is not a branch instantiation)', async () => {
      const result = await duplicateItem(engine, { sourceId: SOURCE_ID, name: 'CopyOfFour' });
      const copy = result.createdItems[0].item;
      expect(copy.branchId).toBeUndefined();
    });

    it('writes the YAML to disk', async () => {
      const result = await duplicateItem(engine, { sourceId: SOURCE_ID, name: 'CopyOfFour' });
      expect(result.createdItems[0].filePath).toBeTruthy();
      const reread = engine.getItemById(result.rootItemId);
      expect(reread).toBeDefined();
    });
  });

  describe('deep copy of descendants', () => {
    let tempDir: string;
    let engine: Engine;
    const PARENT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const SUBTREE_ROOT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    const CHILD_A_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
    const CHILD_B_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
    const GRANDCHILD_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

    beforeEach(async () => {
      tempDir = await mkdtemp(resolve(tmpdir(), 'mockingbird-dup-deep-'));
      await mkdir(join(tempDir, 'items', 'Sub', 'A'), { recursive: true });
      await mkdir(join(tempDir, 'items', 'Sub', 'B'), { recursive: true });

      await writeFile(join(tempDir, 'sitecore.json'), JSON.stringify({
        modules: ['*.module.json'],
      }), 'utf-8');
      await writeFile(join(tempDir, 'mod.module.json'), JSON.stringify({
        namespace: 'mod',
        items: { includes: [{ name: 'items', path: '/sitecore/content' }] },
      }), 'utf-8');

      // Tree shape:
      //   /sitecore/content/Parent
      //     /Sub                 <- subtree root we will Duplicate
      //       /A                 <- child
      //         /Grand           <- grandchild under A
      //       /B                 <- child
      const TPL = 'a1b2c3d4-e5f6-7890-abcd-000000000001';

      await writeFile(join(tempDir, 'items', 'Parent.yml'), `---
ID: "{${PARENT_ID.toUpperCase()}}"
Parent: "{00000000-0000-0000-0000-000000000000}"
Template: "{${TPL.toUpperCase()}}"
Path: /sitecore/content/Parent
`, 'utf-8');

      await writeFile(join(tempDir, 'items', 'Sub.yml'), `---
ID: "{${SUBTREE_ROOT_ID.toUpperCase()}}"
Parent: "{${PARENT_ID.toUpperCase()}}"
Template: "{${TPL.toUpperCase()}}"
Path: /sitecore/content/Parent/Sub
SharedFields:
- ID: "11111111-1111-1111-1111-111111111111"
  Hint: SomeField
  Value: subroot-value
`, 'utf-8');

      await writeFile(join(tempDir, 'items', 'Sub', 'A.yml'), `---
ID: "{${CHILD_A_ID.toUpperCase()}}"
Parent: "{${SUBTREE_ROOT_ID.toUpperCase()}}"
Template: "{${TPL.toUpperCase()}}"
Path: /sitecore/content/Parent/Sub/A
SharedFields:
- ID: "22222222-2222-2222-2222-222222222222"
  Hint: ChildField
  Value: child-a-value
`, 'utf-8');

      await writeFile(join(tempDir, 'items', 'Sub', 'A', 'Grand.yml'), `---
ID: "{${GRANDCHILD_ID.toUpperCase()}}"
Parent: "{${CHILD_A_ID.toUpperCase()}}"
Template: "{${TPL.toUpperCase()}}"
Path: /sitecore/content/Parent/Sub/A/Grand
`, 'utf-8');

      await writeFile(join(tempDir, 'items', 'Sub', 'B.yml'), `---
ID: "{${CHILD_B_ID.toUpperCase()}}"
Parent: "{${SUBTREE_ROOT_ID.toUpperCase()}}"
Template: "{${TPL.toUpperCase()}}"
Path: /sitecore/content/Parent/Sub/B
`, 'utf-8');

      engine = new Engine({ rootDir: tempDir });
      engine.startInit();
      await engine.readiness.ready();
    });

    afterEach(async () => {
      await engine.close();
      await rm(tempDir, { recursive: true, force: true });
    });

    it('creates root + every descendant with fresh GUIDs', async () => {
      const result = await duplicateItem(engine, { sourceId: SUBTREE_ROOT_ID, name: 'SubCopy' });
      // 1 root + 2 children + 1 grandchild = 4 nodes.
      expect(result.createdItems).toHaveLength(4);
      const newIds = result.createdItems.map(n => n.item.id);
      // No new id matches any source id.
      const sourceIds = [SUBTREE_ROOT_ID, CHILD_A_ID, CHILD_B_ID, GRANDCHILD_ID];
      for (const newId of newIds) {
        expect(sourceIds).not.toContain(newId);
      }
      // All new ids are unique.
      expect(new Set(newIds).size).toBe(newIds.length);
    });

    it('remaps parent ids so descendants point at new ancestors', async () => {
      const result = await duplicateItem(engine, { sourceId: SUBTREE_ROOT_ID, name: 'SubCopy' });
      const root = result.createdItems[0];
      const grand = result.createdItems.find(n => n.item.path.endsWith('/Grand'))!;
      const childA = result.createdItems.find(n => n.item.path.endsWith('/A'))!;
      expect(grand.item.parent).toBe(childA.item.id);
      expect(childA.item.parent).toBe(root.item.id);
      expect(root.item.parent).toBe(PARENT_ID);
    });

    it('remaps paths under the new root name', async () => {
      const result = await duplicateItem(engine, { sourceId: SUBTREE_ROOT_ID, name: 'SubCopy' });
      const paths = result.createdItems.map(n => n.item.path).sort();
      expect(paths).toEqual([
        '/sitecore/content/Parent/SubCopy',
        '/sitecore/content/Parent/SubCopy/A',
        '/sitecore/content/Parent/SubCopy/A/Grand',
        '/sitecore/content/Parent/SubCopy/B',
      ]);
    });

    it('copies field values verbatim across the subtree', async () => {
      const result = await duplicateItem(engine, { sourceId: SUBTREE_ROOT_ID, name: 'SubCopy' });

      // Root field preserved.
      const newRoot = result.createdItems.find(n => n.item.id === result.rootItemId)!.item;
      const rootField = newRoot.sharedFields.find(f => f.id === '11111111-1111-1111-1111-111111111111');
      expect(rootField?.value).toBe('subroot-value');

      // Descendant field preserved (verbatim contract holds across the subtree,
      // not just the root).
      const newChildA = result.createdItems.find(n => n.item.path.endsWith('/SubCopy/A'))!.item;
      const childField = newChildA.sharedFields.find(f => f.id === '22222222-2222-2222-2222-222222222222');
      expect(childField?.value).toBe('child-a-value');
    });
  });

  describe('edge cases', () => {
    let tempDir: string;
    let engine: Engine;
    const REGISTRY_JSON = resolve(__dirname, '../fixtures/registry/test-registry.json');

    beforeEach(async () => {
      tempDir = await mkdtemp(resolve(tmpdir(), 'mockingbird-dup-edge-'));
      cpSync(FIXTURES, tempDir, { recursive: true });
      engine = new Engine({ rootDir: tempDir, registryPath: REGISTRY_JSON });
      engine.startInit();
      await engine.readiness.ready();
    });
    afterEach(async () => {
      await engine.close();
      await rm(tempDir, { recursive: true, force: true });
    });

    it('rejects a registry-only source with a clear error', async () => {
      // The Standard template fixture is registry-only.
      const STANDARD_TEMPLATE_ID = '1930bbeb-7805-471a-a3be-4858ac7cf696';
      await expect(
        duplicateItem(engine, { sourceId: STANDARD_TEMPLATE_ID, name: 'Copy' }),
      ).rejects.toThrow(/Cannot duplicate registry-only item/);
    });

    it('throws on unresolvable source id', async () => {
      await expect(
        duplicateItem(engine, { sourceId: '00000000-0000-0000-0000-000000000000', name: 'Copy' }),
      ).rejects.toThrow(/Source item not found/);
    });

    it('rejects an invalid name (Sitecore character rules)', async () => {
      const SOURCE_ID = 'a1b2c3d4-e5f6-7890-abcd-000000000004';
      await expect(
        duplicateItem(engine, { sourceId: SOURCE_ID, name: 'Bad/Name' }),
      ).rejects.toThrow(/invalid characters/i);
    });

    it('rejects a name colliding with an existing sibling (case-insensitive)', async () => {
      const SOURCE_ID = 'a1b2c3d4-e5f6-7890-abcd-000000000004';
      const source = engine.getItemById(SOURCE_ID)!;
      const existingName = source.item.path.split('/').pop()!;
      await expect(
        duplicateItem(engine, { sourceId: SOURCE_ID, name: existingName.toUpperCase() }),
      ).rejects.toThrow(/already exists/i);
    });
  });
});
