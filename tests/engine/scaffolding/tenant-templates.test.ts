import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Engine } from '../../../src/engine/index.js';
import { getSourceTemplateIds, createTenantTemplate, applyTenantTemplates } from '../../../src/engine/scaffolding/tenant-templates.js';
import { resolveInsertParent } from '../../../src/engine/insert-branch.js';
import { clearTemplateSchemaCache } from '../../../src/engine/template-schema.js';
import type { DefinitionItem } from '../../../src/engine/scaffolding/types.js';

// clearTemplateSchemaCache is required because the schema cache is
// process-global; leaving it populated between tests would cause stale
// field-scope data from one test to contaminate the next. Hoisted to
// file-level so every current and future test in this file is covered.
beforeEach(() => { clearTemplateSchemaCache(); });
afterEach(() => { clearTemplateSchemaCache(); });

/**
 * Writes the 3-item fixture registry (Template Template -> Data section ->
 * __Base template field) into `fixDir` and returns the absolute path.
 * Both createTenantTemplate and applyTenantTemplates tests need this registry
 * so that:
 *   (a) insertItemAtParent's template-exists guard can resolve Template Template
 *       via engine.getRegistryItem, and
 *   (b) applyFieldUpdates can route __Base template to sharedFields by reading
 *       the field's shared=1 flag via getTemplateSchema.
 */
function writeFixtureRegistry(fixDir: string): string {
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
  return registryPath;
}

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

    const registryPath = writeFixtureRegistry(fixDir);

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

describe('applyTenantTemplates', () => {
  it('creates one tenant template per unique source across definitions, returns their ids', async () => {
    const fixDir = mkdtempSync(join(tmpdir(), 'mb-tenant-apply-'));
    writeFileSync(join(fixDir, 'sitecore.json'), JSON.stringify({ modules: ['*.module.json'] }));
    writeFileSync(join(fixDir, 'tenant.module.json'), JSON.stringify({
      namespace: 'tenant',
      items: { includes: [{ name: 'templates', path: '/sitecore/templates/Project/Y' }] },
    }));
    writeFileSync(join(fixDir, 'src.module.json'), JSON.stringify({
      namespace: 'src',
      items: { includes: [{ name: 'src', path: '/sitecore/templates/sources' }] },
    }));
    const tplRootId = '33333333-3333-3333-3333-333333333333';
    const srcAId = '44444444-4444-4444-4444-444444444444';
    const srcBId = '55555555-5555-5555-5555-555555555555';
    const protoAId = '66666666-6666-6666-6666-666666666666';
    const protoBId = '77777777-7777-7777-7777-777777777777';
    mkdirSync(join(fixDir, 'templates'), { recursive: true });
    mkdirSync(join(fixDir, 'src'), { recursive: true });
    writeFileSync(join(fixDir, 'templates', 'Y.yml'),
      `---\nID: "${tplRootId}"\nParent: "00000000-0000-0000-0000-000000000000"\nTemplate: "0437fee2-44c9-46a6-abe9-28858d9fee8c"\nPath: /sitecore/templates/Project/Y\n`,
    );
    writeFileSync(join(fixDir, 'src', 'srcA.yml'),
      `---\nID: "${srcAId}"\nParent: "00000000-0000-0000-0000-000000000000"\nTemplate: "ab86861a-6030-46c5-b394-e8f99e8b87db"\nPath: /sitecore/templates/sources/srcA\n`,
    );
    writeFileSync(join(fixDir, 'src', 'srcB.yml'),
      `---\nID: "${srcBId}"\nParent: "00000000-0000-0000-0000-000000000000"\nTemplate: "ab86861a-6030-46c5-b394-e8f99e8b87db"\nPath: /sitecore/templates/sources/srcB\n`,
    );
    // Prototypes: items whose `template` IS the source template id - that's
    // the "prototype.template.id" key getSourceTemplateIds derives.
    mkdirSync(join(fixDir, 'src', 'protos'), { recursive: true });
    writeFileSync(join(fixDir, 'src', 'protos', 'protoA.yml'),
      `---\nID: "${protoAId}"\nParent: "${srcAId}"\nTemplate: "${srcAId}"\nPath: /sitecore/templates/sources/srcA/protoA\n`,
    );
    writeFileSync(join(fixDir, 'src', 'protos', 'protoB.yml'),
      `---\nID: "${protoBId}"\nParent: "${srcBId}"\nTemplate: "${srcBId}"\nPath: /sitecore/templates/sources/srcB/protoB\n`,
    );

    const registryPath = writeFixtureRegistry(fixDir);

    const engine = new Engine({ rootDir: fixDir, registryPath });
    await engine.init();
    try {
      const parent = resolveInsertParent(engine, '/sitecore/templates/Project/Y')!;
      const defs: DefinitionItem[] = [
        {
          id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', path: '/d1', name: 'd1',
          isSystemModule: false, includeByDefault: true, includeIfInstalled: [], hasChildren: false,
          source: 'tree',
          actions: [
            { kind: 'EditTenantTemplate', editType: 'AddBaseTemplate', prototypeId: protoAId, argumentIds: [] },
            { kind: 'EditTenantTemplate', editType: 'AddBaseTemplate', prototypeId: protoBId, argumentIds: [] },
            // Duplicate prototypeId should not produce a duplicate tenant template.
            { kind: 'EditTenantTemplate', editType: 'AddInsertOptions', prototypeId: protoAId, argumentIds: [] },
          ],
        },
      ];
      const created = await applyTenantTemplates(engine, parent, defs);
      expect(created.tenantTemplateIds).toHaveLength(2);
      // Verify both new templates exist as children of tpl root.
      const rootNode = engine.getItemById(tplRootId)!;
      const childIds = new Set(Array.from(rootNode.children.values()).map(c => c.item.id));
      for (const id of created.tenantTemplateIds) {
        expect(childIds.has(id)).toBe(true);
      }
      // Verify each tenant template's __Base template points at one of the source ids.
      for (const id of created.tenantTemplateIds) {
        const node = engine.getItemById(id)!;
        const baseField = node.item.sharedFields.find(
          f => f.id.toLowerCase() === '12c33f3f-86c5-43a5-aeb4-5598cec45116',
        );
        expect([srcAId, srcBId]).toContain(baseField?.value.toLowerCase());
      }
    } finally {
      rmSync(fixDir, { recursive: true, force: true });
    }
  });

  it('hydrates un-hydrated defs (actions:[]) before computing source ids - no crash, empty result when no action items exist', async () => {
    // Test approach: cheapest option - pass a def with actions:[] whose id does
    // not exist in the engine. hydrateDefinitionActions will warn ("not found in
    // tree or registry") and return []. applyTenantTemplates must not throw and
    // must return zero tenantTemplateIds. This regression-safe shape ensures the
    // hydration branch is exercised; any future regression that skips hydration
    // will break only the existing test above (where pre-hydrated actions already
    // carry prototypeIds). Together the two tests pin both paths.
    const fixDir = mkdtempSync(join(tmpdir(), 'mb-tenant-apply-hydrate-'));
    writeFileSync(join(fixDir, 'sitecore.json'), JSON.stringify({ modules: ['*.module.json'] }));
    writeFileSync(join(fixDir, 'tenant.module.json'), JSON.stringify({
      namespace: 'tenant',
      items: { includes: [{ name: 'templates', path: '/sitecore/templates/Project/Z' }] },
    }));
    const tplRootId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
    mkdirSync(join(fixDir, 'templates'), { recursive: true });
    writeFileSync(join(fixDir, 'templates', 'Z.yml'),
      `---\nID: "${tplRootId}"\nParent: "00000000-0000-0000-0000-000000000000"\nTemplate: "0437fee2-44c9-46a6-abe9-28858d9fee8c"\nPath: /sitecore/templates/Project/Z\n`,
    );
    const registryPath = writeFixtureRegistry(fixDir);
    const engine = new Engine({ rootDir: fixDir, registryPath });
    await engine.init();
    try {
      const parent = resolveInsertParent(engine, '/sitecore/templates/Project/Z')!;
      // Def has actions:[] and a definition-item id that does not exist in the
      // engine. hydrateDefinitionActions warns and returns []; the function must
      // not throw and must produce zero tenantTemplateIds.
      const defs: DefinitionItem[] = [
        {
          id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
          path: '/definitions/empty-def', name: 'EmptyDef',
          isSystemModule: false, includeByDefault: true, includeIfInstalled: [],
          hasChildren: true, source: 'registry',
          actions: [],
        },
      ];
      const result = await applyTenantTemplates(engine, parent, defs);
      expect(result.tenantTemplateIds).toHaveLength(0);
      // hydrateDefinitionActions emits one warning when the definition item is
      // not found; that warning surfaces through the shared warnings array.
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toMatch(/not found in tree or registry/i);
    } finally {
      rmSync(fixDir, { recursive: true, force: true });
    }
  });
});
