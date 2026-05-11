import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Engine } from '../../../src/engine/index.js';
import { setTenantTemplate } from '../../../src/engine/scaffolding/set-tenant-template.js';

// Sitecore's __Base template field id (shared, type TreelistEx).
const BASE_TEMPLATE_FIELD_ID = '12c33f3f-86c5-43a5-aeb4-5598cec45116';
const TEMPLATE_TEMPLATE_ID = 'ab86861a-6030-46c5-b394-e8f99e8b87db';
const FOLDER_TEMPLATE_ID = 'a87a00b1-e6db-45ab-8b54-636fec3b5523';

function makeFixture() {
  const fixDir = mkdtempSync(join(tmpdir(), 'mb-set-tenant-tpl-'));
  writeFileSync(join(fixDir, 'sitecore.json'), JSON.stringify({ modules: ['*.module.json'] }));
  writeFileSync(join(fixDir, 'mod.module.json'), JSON.stringify({
    namespace: 'mod',
    items: { includes: [{ name: 'tree', path: '/sitecore/content' }] },
  }));
  writeFileSync(join(fixDir, 'tpl.module.json'), JSON.stringify({
    namespace: 'tpl',
    items: { includes: [{ name: 'tpls', path: '/sitecore/templates' }] },
  }));
  mkdirSync(join(fixDir, 'tree'), { recursive: true });
  mkdirSync(join(fixDir, 'tpls'), { recursive: true });
  return fixDir;
}

function seedItem(fixDir: string, relPath: string, id: string, parentId: string, templateId: string, sitecorePath: string, extraSharedFields?: Array<{ id: string; value: string; hint?: string }>): void {
  const fullPath = join(fixDir, relPath);
  mkdirSync(join(fullPath, '..'), { recursive: true });
  let yaml = `---\nID: "${id}"\nParent: "${parentId}"\nTemplate: "${templateId}"\nPath: ${sitecorePath}\n`;
  if (extraSharedFields && extraSharedFields.length > 0) {
    yaml += 'SharedFields:\n';
    for (const f of extraSharedFields) {
      yaml += `- ID: "${f.id}"\n`;
      if (f.hint) yaml += `  Hint: ${f.hint}\n`;
      yaml += `  Value: "${f.value}"\n`;
    }
  }
  writeFileSync(fullPath, yaml);
}

describe('setTenantTemplate', () => {
  it('re-templates descendants whose template is directly referenced by a tenant template __Base template (pass 1)', async () => {
    const fixDir = makeFixture();
    // Source prototypes (e.g. Foundation/JSS Page, Foundation/JSS Site).
    const PROTO_PAGE = 'aaaaaaaa-aaaa-aaaa-aaaa-000000000001';
    const PROTO_SITE = 'aaaaaaaa-aaaa-aaaa-aaaa-000000000002';
    // Tenant templates that DIRECTLY reference the prototypes.
    const TENANT_PAGE = 'bbbbbbbb-bbbb-bbbb-bbbb-000000000001';
    const TENANT_SITE = 'bbbbbbbb-bbbb-bbbb-bbbb-000000000002';
    // Site descendants.
    const SITE_ROOT = 'cccccccc-cccc-cccc-cccc-000000000001';
    const HOME = 'cccccccc-cccc-cccc-cccc-000000000002';
    const ABOUT = 'cccccccc-cccc-cccc-cccc-000000000003';

    // Seed prototypes (under /sitecore/templates).
    seedItem(fixDir, 'tpls/PROTO_PAGE.yml', PROTO_PAGE, '00000000-0000-0000-0000-000000000000', TEMPLATE_TEMPLATE_ID, '/sitecore/templates/ProtoPage');
    seedItem(fixDir, 'tpls/PROTO_SITE.yml', PROTO_SITE, '00000000-0000-0000-0000-000000000000', TEMPLATE_TEMPLATE_ID, '/sitecore/templates/ProtoSite');

    // Seed tenant templates with __Base template field pointing at prototypes.
    seedItem(fixDir, 'tpls/TENANT_PAGE.yml', TENANT_PAGE, '00000000-0000-0000-0000-000000000000', TEMPLATE_TEMPLATE_ID, '/sitecore/templates/TenantPage', [
      { id: BASE_TEMPLATE_FIELD_ID, hint: '__Base template', value: `{${PROTO_PAGE.toUpperCase()}}` },
    ]);
    seedItem(fixDir, 'tpls/TENANT_SITE.yml', TENANT_SITE, '00000000-0000-0000-0000-000000000000', TEMPLATE_TEMPLATE_ID, '/sitecore/templates/TenantSite', [
      { id: BASE_TEMPLATE_FIELD_ID, hint: '__Base template', value: `{${PROTO_SITE.toUpperCase()}}` },
    ]);

    // Seed site root + descendants. Site is templated as PROTO_SITE; Home as
    // PROTO_PAGE; About already correctly templated as TENANT_PAGE.
    seedItem(fixDir, 'tree/Site.yml', SITE_ROOT, '00000000-0000-0000-0000-000000000000', PROTO_SITE, '/sitecore/content/Site');
    seedItem(fixDir, 'tree/Site/Home.yml', HOME, SITE_ROOT, PROTO_PAGE, '/sitecore/content/Site/Home');
    seedItem(fixDir, 'tree/Site/About.yml', ABOUT, SITE_ROOT, TENANT_PAGE, '/sitecore/content/Site/About');

    const engine = new Engine({ rootDir: fixDir });
    await engine.init();
    try {
      const result = await setTenantTemplate(engine, SITE_ROOT, [TENANT_PAGE, TENANT_SITE]);
      expect(result.warnings).toEqual([]);
      // Site root + Home re-templated; About skipped (already tenant template).
      expect(new Set(result.reTemplated)).toEqual(new Set([SITE_ROOT, HOME]));
      expect(engine.getItemById(SITE_ROOT)!.item.template).toBe(TENANT_SITE);
      expect(engine.getItemById(HOME)!.item.template).toBe(TENANT_PAGE);
      expect(engine.getItemById(ABOUT)!.item.template).toBe(TENANT_PAGE);
    } finally {
      rmSync(fixDir, { recursive: true, force: true });
    }
  });

  it('falls back to full inheritance chain when no tenant template directly references the source (pass 2)', async () => {
    const fixDir = makeFixture();
    const PROTO_PAGE = 'dddddddd-dddd-dddd-dddd-000000000001';
    // Intermediate template stands between the prototype and the tenant template.
    const INTERMEDIATE = 'dddddddd-dddd-dddd-dddd-000000000002';
    const TENANT_PAGE = 'eeeeeeee-eeee-eeee-eeee-000000000001';
    const SITE_ROOT = 'ffffffff-ffff-ffff-ffff-000000000001';
    const HOME = 'ffffffff-ffff-ffff-ffff-000000000002';

    seedItem(fixDir, 'tpls/PROTO_PAGE.yml', PROTO_PAGE, '00000000-0000-0000-0000-000000000000', TEMPLATE_TEMPLATE_ID, '/sitecore/templates/ProtoPage');
    // INTERMEDIATE's __Base template = PROTO_PAGE.
    seedItem(fixDir, 'tpls/INTERMEDIATE.yml', INTERMEDIATE, '00000000-0000-0000-0000-000000000000', TEMPLATE_TEMPLATE_ID, '/sitecore/templates/Intermediate', [
      { id: BASE_TEMPLATE_FIELD_ID, hint: '__Base template', value: `{${PROTO_PAGE.toUpperCase()}}` },
    ]);
    // TENANT_PAGE's __Base template = INTERMEDIATE (NOT directly PROTO_PAGE).
    seedItem(fixDir, 'tpls/TENANT_PAGE.yml', TENANT_PAGE, '00000000-0000-0000-0000-000000000000', TEMPLATE_TEMPLATE_ID, '/sitecore/templates/TenantPage', [
      { id: BASE_TEMPLATE_FIELD_ID, hint: '__Base template', value: `{${INTERMEDIATE.toUpperCase()}}` },
    ]);

    seedItem(fixDir, 'tree/Site.yml', SITE_ROOT, '00000000-0000-0000-0000-000000000000', FOLDER_TEMPLATE_ID, '/sitecore/content/Site');
    seedItem(fixDir, 'tree/Site/Home.yml', HOME, SITE_ROOT, PROTO_PAGE, '/sitecore/content/Site/Home');

    const engine = new Engine({ rootDir: fixDir });
    await engine.init();
    try {
      const result = await setTenantTemplate(engine, SITE_ROOT, [TENANT_PAGE]);
      expect(result.warnings).toEqual([]);
      // Pass 1 misses (no tenant tpl directly references PROTO_PAGE); pass 2
      // finds TENANT_PAGE via the INTERMEDIATE -> PROTO_PAGE chain.
      expect(result.reTemplated).toEqual([HOME]);
      expect(engine.getItemById(HOME)!.item.template).toBe(TENANT_PAGE);
      // Site root not re-templated (its template is generic Folder, not in any tenant chain).
      expect(engine.getItemById(SITE_ROOT)!.item.template).toBe(FOLDER_TEMPLATE_ID);
    } finally {
      rmSync(fixDir, { recursive: true, force: true });
    }
  });

  it('skips descendants whose template has no inheritance chain to any tenant template', async () => {
    const fixDir = makeFixture();
    const PROTO_PAGE = '12345678-1234-1234-1234-000000000001';
    const TENANT_PAGE = '12345678-1234-1234-1234-000000000002';
    const SITE_ROOT = '12345678-1234-1234-1234-000000000003';
    const DATA = '12345678-1234-1234-1234-000000000004';

    seedItem(fixDir, 'tpls/PROTO_PAGE.yml', PROTO_PAGE, '00000000-0000-0000-0000-000000000000', TEMPLATE_TEMPLATE_ID, '/sitecore/templates/ProtoPage');
    seedItem(fixDir, 'tpls/TENANT_PAGE.yml', TENANT_PAGE, '00000000-0000-0000-0000-000000000000', TEMPLATE_TEMPLATE_ID, '/sitecore/templates/TenantPage', [
      { id: BASE_TEMPLATE_FIELD_ID, hint: '__Base template', value: `{${PROTO_PAGE.toUpperCase()}}` },
    ]);
    seedItem(fixDir, 'tree/Site.yml', SITE_ROOT, '00000000-0000-0000-0000-000000000000', FOLDER_TEMPLATE_ID, '/sitecore/content/Site');
    // Data templated as generic Folder - no relationship to any tenant template.
    seedItem(fixDir, 'tree/Site/Data.yml', DATA, SITE_ROOT, FOLDER_TEMPLATE_ID, '/sitecore/content/Site/Data');

    const engine = new Engine({ rootDir: fixDir });
    await engine.init();
    try {
      const result = await setTenantTemplate(engine, SITE_ROOT, [TENANT_PAGE]);
      expect(result.warnings).toEqual([]);
      expect(result.reTemplated).toEqual([]);
      expect(engine.getItemById(DATA)!.item.template).toBe(FOLDER_TEMPLATE_ID);
      expect(engine.getItemById(SITE_ROOT)!.item.template).toBe(FOLDER_TEMPLATE_ID);
    } finally {
      rmSync(fixDir, { recursive: true, force: true });
    }
  });

  it('returns empty result when tenantTemplateIds is empty', async () => {
    const fixDir = makeFixture();
    const SITE_ROOT = 'aaaa1111-aaaa-aaaa-aaaa-000000000001';
    seedItem(fixDir, 'tree/Site.yml', SITE_ROOT, '00000000-0000-0000-0000-000000000000', FOLDER_TEMPLATE_ID, '/sitecore/content/Site');
    const engine = new Engine({ rootDir: fixDir });
    await engine.init();
    try {
      const result = await setTenantTemplate(engine, SITE_ROOT, []);
      expect(result).toEqual({ reTemplated: [], warnings: [] });
    } finally {
      rmSync(fixDir, { recursive: true, force: true });
    }
  });
});
