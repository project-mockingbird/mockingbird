import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Engine } from '../../../src/engine/index.js';
import { getSourceTemplateIds, createTenantTemplate } from '../../../src/engine/scaffolding/tenant-templates.js';
import { resolveInsertParent } from '../../../src/engine/insert-branch.js';
import { clearTemplateSchemaCache } from '../../../src/engine/template-schema.js';
import type { DefinitionItem } from '../../../src/engine/scaffolding/types.js';

async function buildEmptyEngine() {
  const fixDir = mkdtempSync(join(tmpdir(), 'mb-tenant-tpl-'));
  writeFileSync(join(fixDir, 'sitecore.json'), JSON.stringify({ modules: ['*.module.json'] }));
  writeFileSync(join(fixDir, 'mod.module.json'), JSON.stringify({
    namespace: 'mod',
    items: { includes: [{ name: 'content', path: '/sitecore/content' }] },
  }));
  mkdirSync(join(fixDir, 'content'), { recursive: true });
  const engine = new Engine({ rootDir: fixDir });
  await engine.init();
  return { engine, cleanup: () => rmSync(fixDir, { recursive: true, force: true }) };
}

describe('getSourceTemplateIds', () => {
  it('returns empty array when no definitions provided', async () => {
    const { engine, cleanup } = await buildEmptyEngine();
    try {
      expect(getSourceTemplateIds(engine, [])).toEqual([]);
    } finally {
      cleanup();
    }
  });

  it('returns empty array when definitions have no EditTenantTemplate actions', async () => {
    const { engine, cleanup } = await buildEmptyEngine();
    try {
      const defs: DefinitionItem[] = [{
        id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        path: '/x', name: 'X', isSystemModule: false, includeByDefault: true,
        includeIfInstalled: [], hasChildren: false, source: 'tree',
        actions: [{ kind: 'AddItem', locationPrototypeId: 'p', templateId: 't', name: 'n', fieldUpdates: [] }],
      }];
      expect(getSourceTemplateIds(engine, defs)).toEqual([]);
    } finally {
      cleanup();
    }
  });
});

describe('createTenantTemplate', () => {
  // clearTemplateSchemaCache() is required because the schema cache is
  // process-global; leaving it populated between tests would cause
  // stale field-scope data from one test to contaminate the next.
  beforeEach(() => { clearTemplateSchemaCache(); });
  afterEach(() => { clearTemplateSchemaCache(); });

  it('creates Template item under parent with __Base template + Standard Values child', async () => {
    const fixDir = mkdtempSync(join(tmpdir(), 'mb-tenant-tpl-create-'));
    writeFileSync(join(fixDir, 'sitecore.json'), JSON.stringify({ modules: ['*.module.json'] }));
    writeFileSync(join(fixDir, 'mod.module.json'), JSON.stringify({
      namespace: 'mod',
      items: { includes: [{ name: 'templates', path: '/sitecore/templates/Project/X' }] },
    }));
    // Seed a templates-root item + a source template, both on-disk.
    const tplRootId = '11111111-1111-1111-1111-111111111111';
    const sourceTplId = '22222222-2222-2222-2222-222222222222';
    const folderTplId = '0437fee2-44c9-46a6-abe9-28858d9fee8c'; // Template Folder
    const dir = join(fixDir, 'templates');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'X.yml'),
      `---\nID: "${tplRootId}"\nParent: "00000000-0000-0000-0000-000000000000"\nTemplate: "${folderTplId}"\nPath: /sitecore/templates/Project/X\n`,
    );
    // The source template can live OUTSIDE the include - it just needs to
    // exist in the engine. Use a second include for it.
    writeFileSync(join(fixDir, 'src.module.json'), JSON.stringify({
      namespace: 'src',
      items: { includes: [{ name: 'src', path: '/sitecore/templates/source-template' }] },
    }));
    mkdirSync(join(fixDir, 'src'), { recursive: true });
    writeFileSync(join(fixDir, 'src', 'source-template.yml'),
      `---\nID: "${sourceTplId}"\nParent: "00000000-0000-0000-0000-000000000000"\nTemplate: "ab86861a-6030-46c5-b394-e8f99e8b87db"\nPath: /sitecore/templates/source-template\nSharedFields:\n- ID: "1c0f74da-c4f6-4180-922b-3aef02e1c1e8"\n  Hint: __Long description\n  Value: "Source"\n`,
    );
    // sitecore.json already uses *.module.json glob - no rewrite needed; both
    // mod.module.json and src.module.json are picked up on engine.init().

    // Seed a minimal registry so the engine can:
    //   (a) resolve Template Template (ab86861a) via getRegistryItem - needed by
    //       insertItemAtParent's template-exists guard.
    //   (b) resolve __Base template (12c33f3f) field scope via getTemplateSchema -
    //       needed by applyFieldUpdates so it routes the field to sharedFields.
    // The registry contains: Template Template -> Data section -> __Base template field.
    const TEMPLATE_TEMPLATE_ID = 'ab86861a-6030-46c5-b394-e8f99e8b87db';
    const TEMPLATE_SECTION_TEMPLATE_ID = 'e269fbb5-3750-427a-9149-7aa950b49301';
    const TEMPLATE_FIELD_TEMPLATE_ID = '455a3e98-a627-4b40-8035-e683a0331ac7';
    const BASE_TEMPLATE_FIELD_ID = '12c33f3f-86c5-43a5-aeb4-5598cec45116';
    const DATA_SECTION_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
    const registryPath = join(fixDir, 'fixture-registry.json');
    writeFileSync(registryPath, JSON.stringify({
      version: '3.0',
      source: 'fixture',
      extractedAt: '2024-01-01T00:00:00Z',
      items: [
        {
          id: TEMPLATE_TEMPLATE_ID,
          name: 'Template',
          parent: '12345678-1234-1234-1234-123456789abc',
          template: TEMPLATE_TEMPLATE_ID,
          path: '/sitecore/templates/System/Templates/Template',
          database: 'master',
          sharedFields: {},
        },
        {
          id: DATA_SECTION_ID,
          name: 'Data',
          parent: TEMPLATE_TEMPLATE_ID,
          template: TEMPLATE_SECTION_TEMPLATE_ID,
          path: '/sitecore/templates/System/Templates/Template/Data',
          database: 'master',
          sharedFields: {},
        },
        {
          id: BASE_TEMPLATE_FIELD_ID,
          name: '__Base template',
          parent: DATA_SECTION_ID,
          template: TEMPLATE_FIELD_TEMPLATE_ID,
          path: '/sitecore/templates/System/Templates/Template/Data/__Base template',
          database: 'master',
          sharedFields: {
            // shared = "1" so applyFieldUpdates routes this to sharedFields
            'be351a73-fcb0-4213-93fa-c302d8ab4f51': '1',
            // type = TreelistEx
            'ab162cc0-dc80-4abf-8871-998ee5d7ba32': 'TreelistEx',
          },
        },
      ],
    }));

    const engine = new Engine({ rootDir: fixDir, registryPath });
    await engine.init();
    try {
      const parent = resolveInsertParent(engine, '/sitecore/templates/Project/X');
      expect(parent).toBeDefined();
      const result = await createTenantTemplate(engine, parent!, sourceTplId, 'MyTpl');
      expect(result.templateId).toMatch(/^[0-9a-f-]{36}$/);
      expect(result.standardValuesId).toMatch(/^[0-9a-f-]{36}$/);

      // Verify on-tree state.
      const node = engine.getItemById(result.templateId)!;
      expect(node.item.path).toBe('/sitecore/templates/Project/X/MyTpl');
      expect(node.item.template.toLowerCase()).toBe('ab86861a-6030-46c5-b394-e8f99e8b87db');
      const baseField = node.item.sharedFields.find(f => f.id.toLowerCase() === '12c33f3f-86c5-43a5-aeb4-5598cec45116');
      expect(baseField?.value.toLowerCase()).toBe(sourceTplId);

      const sv = engine.getItemById(result.standardValuesId)!;
      expect(sv.item.path).toBe('/sitecore/templates/Project/X/MyTpl/__Standard Values');
      expect(sv.item.template.toLowerCase()).toBe(result.templateId);
    } finally {
      rmSync(fixDir, { recursive: true, force: true });
    }
  });
});
