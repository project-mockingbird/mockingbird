import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Engine } from '../../src/engine/index.js';

function makeFixture() {
  const fixDir = mkdtempSync(join(tmpdir(), 'mb-change-tpl-'));
  writeFileSync(join(fixDir, 'sitecore.json'), JSON.stringify({ modules: ['*.module.json'] }));
  writeFileSync(join(fixDir, 'mod.module.json'), JSON.stringify({
    namespace: 'mod',
    items: { includes: [{ name: 'tree', path: '/sitecore/content' }] },
  }));
  return fixDir;
}

const ROOT_ID = '11111111-1111-1111-1111-111111111111';
const ITEM_ID = '22222222-2222-2222-2222-222222222222';
const OLD_TPL = 'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const NEW_TPL = 'bbbb2222-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

function seedRoot(fixDir: string): void {
  mkdirSync(join(fixDir, 'tree'), { recursive: true });
  writeFileSync(join(fixDir, 'tree', 'Root.yml'),
    `---\nID: "${ROOT_ID}"\nParent: "00000000-0000-0000-0000-000000000000"\nTemplate: "${OLD_TPL}"\nPath: /sitecore/content/Root\n`,
  );
}

function seedItem(fixDir: string, relDir: string, fileName: string, id: string, parentId: string, sitecorePath: string, templateId: string): void {
  const dir = join(fixDir, relDir);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${fileName}.yml`),
    `---\nID: "${id}"\nParent: "${parentId}"\nTemplate: "${templateId}"\nPath: ${sitecorePath}\n`,
  );
}

// Seed a fake "template" item so engine.changeTemplate's validate-target
// step finds something. Lives under /sitecore/content for fixture
// simplicity; real-world template items live under /sitecore/templates.
function seedTemplateItem(fixDir: string, id: string, name: string): void {
  const TEMPLATE_TEMPLATE_ID = 'ab86861a-6030-46c5-b394-e8f99e8b87db';
  writeFileSync(join(fixDir, 'tree', `${name}.yml`),
    `---\nID: "${id}"\nParent: "${ROOT_ID}"\nTemplate: "${TEMPLATE_TEMPLATE_ID}"\nPath: /sitecore/content/${name}\n`,
  );
}

describe('engine.changeTemplate', () => {
  it('updates in-memory item.template and rewrites the YAML', async () => {
    const fixDir = makeFixture();
    seedRoot(fixDir);
    seedItem(fixDir, 'tree/Root', 'Page', ITEM_ID, ROOT_ID, '/sitecore/content/Root/Page', OLD_TPL);
    seedTemplateItem(fixDir, NEW_TPL, 'NewTemplate');
    const engine = new Engine({ rootDir: fixDir });
    await engine.init();
    try {
      const before = engine.getItemById(ITEM_ID)!;
      expect(before.item.template).toBe(OLD_TPL);
      const filePath = before.filePath;
      const after = await engine.changeTemplate(ITEM_ID, NEW_TPL);
      expect(after.item.template).toBe(NEW_TPL);
      // YAML on disk reflects the new template.
      const contents = readFileSync(filePath, 'utf-8');
      expect(contents).toContain(`Template: "${NEW_TPL}"`);
      expect(contents).not.toContain(`Template: "${OLD_TPL}"`);
    } finally {
      rmSync(fixDir, { recursive: true, force: true });
    }
  });

  it('no-ops when the new template equals the current template', async () => {
    const fixDir = makeFixture();
    seedRoot(fixDir);
    seedItem(fixDir, 'tree/Root', 'Page', ITEM_ID, ROOT_ID, '/sitecore/content/Root/Page', OLD_TPL);
    const engine = new Engine({ rootDir: fixDir });
    await engine.init();
    try {
      const before = engine.getItemById(ITEM_ID)!;
      const node = await engine.changeTemplate(ITEM_ID, OLD_TPL);
      expect(node).toBe(before);
      expect(node.item.template).toBe(OLD_TPL);
    } finally {
      rmSync(fixDir, { recursive: true, force: true });
    }
  });

  it('rejects an empty template id', async () => {
    const fixDir = makeFixture();
    seedRoot(fixDir);
    seedItem(fixDir, 'tree/Root', 'Page', ITEM_ID, ROOT_ID, '/sitecore/content/Root/Page', OLD_TPL);
    const engine = new Engine({ rootDir: fixDir });
    await engine.init();
    try {
      await expect(engine.changeTemplate(ITEM_ID, '')).rejects.toThrow(/Invalid template/);
    } finally {
      rmSync(fixDir, { recursive: true, force: true });
    }
  });

  it('rejects a template id that resolves to neither tree nor registry', async () => {
    const fixDir = makeFixture();
    seedRoot(fixDir);
    seedItem(fixDir, 'tree/Root', 'Page', ITEM_ID, ROOT_ID, '/sitecore/content/Root/Page', OLD_TPL);
    const engine = new Engine({ rootDir: fixDir });
    await engine.init();
    try {
      const phantomId = 'deadbeef-dead-beef-dead-beefdeadbeef';
      await expect(engine.changeTemplate(ITEM_ID, phantomId)).rejects.toThrow(/Template not found/);
    } finally {
      rmSync(fixDir, { recursive: true, force: true });
    }
  });

  it('throws when the target item does not exist', async () => {
    const fixDir = makeFixture();
    seedRoot(fixDir);
    seedTemplateItem(fixDir, NEW_TPL, 'NewTemplate');
    const engine = new Engine({ rootDir: fixDir });
    await engine.init();
    try {
      const ghost = '99999999-9999-9999-9999-999999999999';
      await expect(engine.changeTemplate(ghost, NEW_TPL)).rejects.toThrow(/Item not found/);
    } finally {
      rmSync(fixDir, { recursive: true, force: true });
    }
  });
});
