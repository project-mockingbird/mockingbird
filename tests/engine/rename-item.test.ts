import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Engine } from '../../src/engine/index.js';

function makeFixture() {
  const fixDir = mkdtempSync(join(tmpdir(), 'mb-rename-'));
  writeFileSync(join(fixDir, 'sitecore.json'), JSON.stringify({ modules: ['*.module.json'] }));
  writeFileSync(join(fixDir, 'mod.module.json'), JSON.stringify({
    namespace: 'mod',
    items: { includes: [{ name: 'tree', path: '/sitecore/content' }] },
  }));
  return fixDir;
}

const ROOT_ID = '11111111-1111-1111-1111-111111111111';
const CHILD_ID = '22222222-2222-2222-2222-222222222222';
const GRANDCHILD_ID = '33333333-3333-3333-3333-333333333333';
const SIBLING_ID = '44444444-4444-4444-4444-444444444444';
const FOLDER_TPL = 'a87a00b1-e6db-45ab-8b54-636fec3b5523';

function seedRoot(fixDir: string): void {
  mkdirSync(join(fixDir, 'tree'), { recursive: true });
  writeFileSync(join(fixDir, 'tree', 'Root.yml'),
    `---\nID: "${ROOT_ID}"\nParent: "00000000-0000-0000-0000-000000000000"\nTemplate: "${FOLDER_TPL}"\nPath: /sitecore/content/Root\n`,
  );
}

function seedChildAt(fixDir: string, relDir: string, fileName: string, id: string, parentId: string, sitecorePath: string): void {
  const dir = join(fixDir, relDir);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${fileName}.yml`),
    `---\nID: "${id}"\nParent: "${parentId}"\nTemplate: "${FOLDER_TPL}"\nPath: ${sitecorePath}\n`,
  );
}

describe('engine.renameItem', () => {
  it('renames a leaf: updates in-memory path, writes new YAML, deletes old', async () => {
    const fixDir = makeFixture();
    seedRoot(fixDir);
    seedChildAt(fixDir, 'tree/Root', 'OldName', CHILD_ID, ROOT_ID, '/sitecore/content/Root/OldName');
    const engine = new Engine({ rootDir: fixDir });
    await engine.init();
    try {
      const oldFilePath = engine.getItemById(CHILD_ID)!.filePath;
      const node = await engine.renameItem(CHILD_ID, 'NewName');
      expect(node.item.path).toBe('/sitecore/content/Root/NewName');
      expect(engine.getItemByPath('/sitecore/content/Root/NewName')?.item.id).toBe(CHILD_ID);
      expect(engine.getItemByPath('/sitecore/content/Root/OldName')).toBeUndefined();
      // Old file deleted
      expect(existsSync(oldFilePath)).toBe(false);
      // New file exists at the engine-routed location with updated Path
      const newFilePath = node.filePath;
      expect(existsSync(newFilePath)).toBe(true);
      const contents = readFileSync(newFilePath, 'utf-8');
      expect(contents).toContain('Path: /sitecore/content/Root/NewName');
    } finally {
      rmSync(fixDir, { recursive: true, force: true });
    }
  });

  it('renames a parent: descendants get updated paths in-memory and on disk', async () => {
    const fixDir = makeFixture();
    seedRoot(fixDir);
    seedChildAt(fixDir, 'tree/Root', 'Parent', CHILD_ID, ROOT_ID, '/sitecore/content/Root/Parent');
    seedChildAt(fixDir, 'tree/Root/Parent', 'Kid', GRANDCHILD_ID, CHILD_ID, '/sitecore/content/Root/Parent/Kid');
    const engine = new Engine({ rootDir: fixDir });
    await engine.init();
    try {
      const oldKidFilePath = engine.getItemById(GRANDCHILD_ID)!.filePath;
      await engine.renameItem(CHILD_ID, 'Renamed');
      const kid = engine.getItemById(GRANDCHILD_ID);
      expect(kid?.item.path).toBe('/sitecore/content/Root/Renamed/Kid');
      expect(engine.getItemByPath('/sitecore/content/Root/Renamed/Kid')?.item.id).toBe(GRANDCHILD_ID);
      expect(engine.getItemByPath('/sitecore/content/Root/Parent/Kid')).toBeUndefined();
      // Old kid file deleted
      expect(existsSync(oldKidFilePath)).toBe(false);
      // New kid file exists at its updated routed location
      expect(existsSync(kid!.filePath)).toBe(true);
      const contents = readFileSync(kid!.filePath, 'utf-8');
      expect(contents).toContain('Path: /sitecore/content/Root/Renamed/Kid');
    } finally {
      rmSync(fixDir, { recursive: true, force: true });
    }
  });

  it('throws on name collision with an existing sibling', async () => {
    const fixDir = makeFixture();
    seedRoot(fixDir);
    seedChildAt(fixDir, 'tree/Root', 'A', CHILD_ID, ROOT_ID, '/sitecore/content/Root/A');
    seedChildAt(fixDir, 'tree/Root', 'B', SIBLING_ID, ROOT_ID, '/sitecore/content/Root/B');
    const engine = new Engine({ rootDir: fixDir });
    await engine.init();
    try {
      await expect(engine.renameItem(CHILD_ID, 'B')).rejects.toThrow(/Name collision/);
    } finally {
      rmSync(fixDir, { recursive: true, force: true });
    }
  });

  it('throws on invalid name (empty or contains slash)', async () => {
    const fixDir = makeFixture();
    seedRoot(fixDir);
    seedChildAt(fixDir, 'tree/Root', 'X', CHILD_ID, ROOT_ID, '/sitecore/content/Root/X');
    const engine = new Engine({ rootDir: fixDir });
    await engine.init();
    try {
      await expect(engine.renameItem(CHILD_ID, '')).rejects.toThrow(/Invalid name/);
      await expect(engine.renameItem(CHILD_ID, 'a/b')).rejects.toThrow(/Invalid name/);
    } finally {
      rmSync(fixDir, { recursive: true, force: true });
    }
  });

  it('no-ops when newName equals current name', async () => {
    const fixDir = makeFixture();
    seedRoot(fixDir);
    seedChildAt(fixDir, 'tree/Root', 'Same', CHILD_ID, ROOT_ID, '/sitecore/content/Root/Same');
    const engine = new Engine({ rootDir: fixDir });
    await engine.init();
    try {
      const before = engine.getItemById(CHILD_ID)!.item.path;
      const beforeFp = engine.getItemById(CHILD_ID)!.filePath;
      const node = await engine.renameItem(CHILD_ID, 'Same');
      expect(node.item.path).toBe(before);
      expect(existsSync(beforeFp)).toBe(true);
    } finally {
      rmSync(fixDir, { recursive: true, force: true });
    }
  });
});
