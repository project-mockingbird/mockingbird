import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Engine } from '../../src/engine/index.js';
import {
  FIELD_IDS,
  TEMPLATE_SECTION_TEMPLATE_ID,
  TEMPLATE_FIELD_TEMPLATE_ID,
  TEMPLATE_TEMPLATE_ID,
} from '../../src/engine/constants.js';
import { clearTemplateSchemaCache } from '../../src/engine/template-schema.js';

describe('Engine.insertItem (single-template skeleton)', () => {
  let dir: string;
  let engine: Engine;
  let parentId: string;
  let templateId: string;
  let registryTemplateId: string;

  beforeEach(async () => {
    const built = await buildFixtureEngine();
    dir = built.dir;
    engine = built.engine;
    parentId = built.parentId;
    templateId = built.templateId;
    registryTemplateId = built.registryTemplateId;
  });

  afterEach(async () => {
    await engine.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('rejects an empty name', async () => {
    await expect(engine.insertItem({
      parentId, templateId, name: '',
    })).rejects.toThrow(/blank/);
  });

  it('rejects a sibling-name collision (case-insensitive)', async () => {
    // Fixture has a child named "ExistingChild"
    await expect(engine.insertItem({
      parentId, templateId, name: 'existingchild',
    })).rejects.toThrow(/already exists/);
  });

  it('creates a new YAML file with the right skeleton fields', async () => {
    const result = await engine.insertItem({
      parentId, templateId, name: 'NewPage',
    });
    expect(result.rootItemId).toBeDefined();
    expect(result.createdItems).toHaveLength(1);
    const created = result.createdItems[0];
    expect(created.item.path.endsWith('/NewPage')).toBe(true);
    expect(created.item.template).toBe(templateId);
    expect(created.item.parent).toBe(parentId);
    expect(existsSync(created.filePath)).toBe(true);
    // Pin the resolved path shape per SCS
    // SubtreeFilesystemPathProvider.GetPhysicalPathForItemPath: include
    // `{name: 'items', path: '/sitecore/content'}` yields
    // `physicalPath=<dir>/items` and leaf-prepends 'content' (the
    // include's last sitecore segment) into every descendant's relative
    // path. The fixture's existing Parent.yml lives at a non-canonical
    // <dir>/items/Parent.yml position; SCS-correct writes go to the
    // leaf-prepended location.
    expect(created.filePath).toBe(join(dir, 'items', 'content', 'Parent', 'NewPage.yml'));

    // __Created stamp is present (matches sitecoreDate format).
    const lang = created.item.languages.find(l => l.language === 'en');
    const ver = lang?.versions.find(v => v.version === 1);
    const createdField = ver?.fields.find(f => f.id === FIELD_IDS.created);
    expect(createdField?.value).toMatch(/^\d{8}T\d{6}Z$/);
  });

  it('makes the new item visible via getItemById without restart', async () => {
    const result = await engine.insertItem({
      parentId, templateId, name: 'Visible',
    });
    expect(engine.getItemById(result.rootItemId)).toBeDefined();
  });

  it('rejects when the parent does not resolve', async () => {
    await expect(engine.insertItem({
      parentId: '00000000-0000-0000-0000-000000000999',
      templateId, name: 'X',
    })).rejects.toThrow(/parent/i);
  });

  it('rejects when the template does not resolve', async () => {
    await expect(engine.insertItem({
      parentId,
      templateId: '00000000-0000-0000-0000-000000000999',
      name: 'X',
    })).rejects.toThrow(/template/i);
  });

  it('creates an item against a registry-only template', async () => {
    // The fixture's registry contains a template item that is NOT in the
    // serialized tree. The insertItem registry fallback should resolve it
    // and stamp the new item's `template` field with that GUID.
    expect(engine.getItemById(registryTemplateId)).toBeUndefined();
    expect(engine.getRegistryItem(registryTemplateId)).toBeDefined();

    const result = await engine.insertItem({
      parentId,
      templateId: registryTemplateId,
      name: 'FromRegistryTpl',
    });
    const created = result.createdItems[0];
    expect(created.item.template).toBe(registryTemplateId);
    expect(existsSync(created.filePath)).toBe(true);
  });
});

// Build a minimal real-disk fixture with:
//   - sitecore.json (declares modules glob)
//   - mod.module.json declaring an items include for /sitecore/content
//   - items/Parent.yml (parent at /sitecore/content/Parent, template = page-tpl)
//   - items/Parent/ExistingChild.yml (child of Parent named "ExistingChild")
//   - items/Page.yml (the page-tpl template item)
//   - registry.json (one registry-only template, not present on disk)
async function buildFixtureEngine() {
  const dir = mkdtempSync(join(tmpdir(), 'mb-insert-'));
  mkdirSync(join(dir, 'items'), { recursive: true });
  mkdirSync(join(dir, 'items', 'Parent'), { recursive: true });

  writeFileSync(join(dir, 'sitecore.json'), JSON.stringify({
    modules: ['*.module.json'],
  }));
  writeFileSync(join(dir, 'mod.module.json'), JSON.stringify({
    namespace: 'mod',
    items: { includes: [{ name: 'items', path: '/sitecore/content' }] },
  }));

  // Parent item
  writeFileSync(join(dir, 'items', 'Parent.yml'), `---
ID: "{AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA}"
Parent: "{00000000-0000-0000-0000-000000000000}"
Template: "{BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB}"
Path: /sitecore/content/Parent
`);

  // Existing child of parent (for collision test)
  writeFileSync(join(dir, 'items', 'Parent', 'ExistingChild.yml'), `---
ID: "{CCCCCCCC-CCCC-CCCC-CCCC-CCCCCCCCCCCC}"
Parent: "{AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA}"
Template: "{BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB}"
Path: /sitecore/content/Parent/ExistingChild
`);

  // Page template
  writeFileSync(join(dir, 'items', 'Page.yml'), `---
ID: "{BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB}"
Parent: "{00000000-0000-0000-0000-000000000000}"
Template: "{AB86861A-6030-46C5-B394-E8F99E8B87DB}"
Path: /sitecore/content/Page
`);

  // Registry containing a template that is NOT serialized on disk -
  // exercises the registry fallback path in insertItem.
  const registryTemplateId = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  const registryPath = join(dir, 'registry.json');
  writeFileSync(registryPath, JSON.stringify({
    version: '3.0',
    source: 'fixture',
    extractedAt: '2024-01-01T00:00:00Z',
    items: [
      {
        id: registryTemplateId,
        name: 'RegistryOnlyTemplate',
        parent: '00000000-0000-0000-0000-000000000000',
        template: 'ab86861a-6030-46c5-b394-e8f99e8b87db', // template-template id
        path: '/sitecore/templates/RegistryOnlyTemplate',
        database: 'master',
        sharedFields: {},
      },
    ],
  }));

  const engine = new Engine({ rootDir: dir, registryPath });
  await engine.init();

  return {
    dir,
    engine,
    parentId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    templateId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    registryTemplateId,
  };
}

describe('Engine.insertItem token expansion (MasterVariablesReplacer port)', () => {
  let dir: string;
  let engine: Engine;
  let parentId: string;
  let templateId: string;
  // Stable field-ids for SV fields used in fixture
  const TITLE_FIELD_ID = '11111111-1111-1111-1111-111111111111';
  const SUBTITLE_FIELD_ID = '22222222-2222-2222-2222-222222222222';
  const CREATED_AT_FIELD_ID = '33333333-3333-3333-3333-333333333333';
  const PARENT_REF_FIELD_ID = '44444444-4444-4444-4444-444444444444';
  // Edge-case field ids (distinct GUIDs to avoid colliding with SECTION_ID
  // and SV_ID inside the fixture).
  const UPPER_NAME_FIELD_ID = 'aabbccdd-0000-0000-0000-000000000001';
  const ADJACENT_FIELD_ID = 'aabbccdd-0000-0000-0000-000000000002';
  const COMPOUND_FIELD_ID = 'aabbccdd-0000-0000-0000-000000000003';

  beforeEach(async () => {
    clearTemplateSchemaCache();
    const built = await buildTokenFixture();
    dir = built.dir;
    engine = built.engine;
    parentId = built.parentId;
    templateId = built.templateId;
  });

  afterEach(async () => {
    await engine.close();
    rmSync(dir, { recursive: true, force: true });
    clearTemplateSchemaCache();
  });

  it('writes expanded values for token-bearing SV fields', async () => {
    const result = await engine.insertItem({
      parentId, templateId, name: 'NewPage',
    });
    const created = result.createdItems[0];
    const titleField = created.item.sharedFields.find(f => f.id === TITLE_FIELD_ID);
    expect(titleField?.value).toBe('Welcome to NewPage');
  });

  it('leaves non-token SV fields unwritten on the new item (cascade fallback)', async () => {
    const result = await engine.insertItem({
      parentId, templateId, name: 'NewPage',
    });
    const created = result.createdItems[0];
    const subtitle = created.item.sharedFields.find(f => f.id === SUBTITLE_FIELD_ID);
    expect(subtitle).toBeUndefined();
  });

  it('preserves field scope when copying token-expanded values (versioned)', async () => {
    const result = await engine.insertItem({
      parentId, templateId, name: 'X',
    });
    const created = result.createdItems[0];
    const lang = created.item.languages.find(l => l.language === 'en');
    const ver = lang?.versions.find(v => v.version === 1);
    const ca = ver?.fields.find(f => f.id === CREATED_AT_FIELD_ID);
    expect(ca?.value).toMatch(/^\d{8}T\d{6}Z$/); // sitecore compact date-time
  });

  it('expands $parentname against the existing parent', async () => {
    // Fixture's parent is named "Home"; SV has shared field whose value is "Under $parentname"
    const result = await engine.insertItem({
      parentId, templateId, name: 'Child',
    });
    const created = result.createdItems[0];
    const f = created.item.sharedFields.find(x => x.id === PARENT_REF_FIELD_ID);
    expect(f?.value).toBe('Under Home');
  });

  it('does NOT expand uppercase tokens (Sitecore is case-sensitive via string.Replace)', async () => {
    // SV holds a field with literal "$NAME". TOKEN_REGEX (case-sensitive)
    // rejects it, so it should NOT be persisted onto the new item; the
    // SV cascade keeps serving the literal at read time.
    const result = await engine.insertItem({
      parentId, templateId, name: 'NewPage',
    });
    const created = result.createdItems[0];
    const upperName = created.item.sharedFields.find(f => f.id === UPPER_NAME_FIELD_ID);
    expect(upperName).toBeUndefined();
  });

  it('expands adjacent tokens both: $name$id', async () => {
    const result = await engine.insertItem({
      parentId, templateId, name: 'Foo',
    });
    const created = result.createdItems[0];
    const adjacent = created.item.sharedFields.find(f => f.id === ADJACENT_FIELD_ID);
    expect(adjacent?.value).toMatch(/^Foo\{[A-F0-9-]{36}\}$/);
  });

  it('expands compound values: "$name created on $now"', async () => {
    const result = await engine.insertItem({
      parentId, templateId, name: 'Bar',
    });
    const created = result.createdItems[0];
    const compound = created.item.sharedFields.find(f => f.id === COMPOUND_FIELD_ID);
    expect(compound?.value).toMatch(/^Bar created on \d{8}T\d{6}Z$/);
  });
});

// Build a real-disk fixture with:
//   - Home item (parent, template = page-tpl)
//   - page-tpl template item with one section "Page Section"
//   - Section has four field-definition children (Title/Subtitle/Parent Ref/Created At)
//   - __Standard Values item under page-tpl with token-bearing values
//
// Field schema layout (so getTemplateSchema picks up all four fields):
//   page-tpl
//     Page Section (template = TEMPLATE_SECTION_TEMPLATE_ID)
//       Title       (TEMPLATE_FIELD_TEMPLATE_ID, shared=1)
//       Subtitle    (TEMPLATE_FIELD_TEMPLATE_ID, shared=1)
//       Parent Ref  (TEMPLATE_FIELD_TEMPLATE_ID, shared=1)
//       Created At  (TEMPLATE_FIELD_TEMPLATE_ID, shared=0, unversioned=0  -> versioned)
//     __Standard Values (template = page-tpl itself)
async function buildTokenFixture() {
  const dir = mkdtempSync(join(tmpdir(), 'mb-insert-tok-'));

  writeFileSync(join(dir, 'sitecore.json'), JSON.stringify({
    modules: ['*.module.json'],
  }));
  // Single module spanning both /sitecore/content and /sitecore/templates so a
  // fresh tempdir holds both branches without separate include-roots. Each
  // include `name` is a directory sibling to the .module.json file (relative
  // to its dirname).
  writeFileSync(join(dir, 'mod.module.json'), JSON.stringify({
    namespace: 'mod',
    items: {
      includes: [
        { name: 'content', path: '/sitecore/content' },
        { name: 'templates', path: '/sitecore/templates' },
      ],
    },
  }));

  const PAGE_TPL_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const HOME_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const SECTION_ID = '55555555-5555-5555-5555-555555555555';
  const SV_ID = '66666666-6666-6666-6666-666666666666';

  const TITLE_FIELD_ID = '11111111-1111-1111-1111-111111111111';
  const SUBTITLE_FIELD_ID = '22222222-2222-2222-2222-222222222222';
  const CREATED_AT_FIELD_ID = '33333333-3333-3333-3333-333333333333';
  const PARENT_REF_FIELD_ID = '44444444-4444-4444-4444-444444444444';
  const UPPER_NAME_FIELD_ID = 'aabbccdd-0000-0000-0000-000000000001';
  const ADJACENT_FIELD_ID = 'aabbccdd-0000-0000-0000-000000000002';
  const COMPOUND_FIELD_ID = 'aabbccdd-0000-0000-0000-000000000003';

  // Home item (parent for new items)
  const contentDir = join(dir, 'content');
  mkdirSync(contentDir, { recursive: true });
  writeFileSync(join(contentDir, 'Home.yml'), `---
ID: "{${HOME_ID.toUpperCase()}}"
Parent: "{00000000-0000-0000-0000-000000000000}"
Template: "{${PAGE_TPL_ID.toUpperCase()}}"
Path: /sitecore/content/Home
`);

  // page-tpl template item (under /sitecore/templates)
  const templatesDir = join(dir, 'templates');
  mkdirSync(templatesDir, { recursive: true });
  writeFileSync(join(templatesDir, 'Page.yml'), `---
ID: "{${PAGE_TPL_ID.toUpperCase()}}"
Parent: "{00000000-0000-0000-0000-000000000000}"
Template: "${TEMPLATE_TEMPLATE_ID}"
Path: /sitecore/templates/Page
`);

  // Section under page-tpl
  const pageDir = join(templatesDir, 'Page');
  mkdirSync(pageDir, { recursive: true });
  writeFileSync(join(pageDir, 'Page Section.yml'), `---
ID: "{${SECTION_ID.toUpperCase()}}"
Parent: "{${PAGE_TPL_ID.toUpperCase()}}"
Template: "${TEMPLATE_SECTION_TEMPLATE_ID}"
Path: /sitecore/templates/Page/Page Section
`);

  // Field-definition items under the section
  const sectionDir = join(pageDir, 'Page Section');
  mkdirSync(sectionDir, { recursive: true });

  // Title - shared, token-bearing
  writeFileSync(join(sectionDir, 'Title.yml'), `---
ID: "{${TITLE_FIELD_ID.toUpperCase()}}"
Parent: "{${SECTION_ID.toUpperCase()}}"
Template: "${TEMPLATE_FIELD_TEMPLATE_ID}"
Path: /sitecore/templates/Page/Page Section/Title
SharedFields:
- ID: "${FIELD_IDS.shared}"
  Hint: __Shared
  Value: "1"
- ID: "${FIELD_IDS.type}"
  Hint: Type
  Value: "Single-Line Text"
`);

  // Subtitle - shared, NO token
  writeFileSync(join(sectionDir, 'Subtitle.yml'), `---
ID: "{${SUBTITLE_FIELD_ID.toUpperCase()}}"
Parent: "{${SECTION_ID.toUpperCase()}}"
Template: "${TEMPLATE_FIELD_TEMPLATE_ID}"
Path: /sitecore/templates/Page/Page Section/Subtitle
SharedFields:
- ID: "${FIELD_IDS.shared}"
  Hint: __Shared
  Value: "1"
- ID: "${FIELD_IDS.type}"
  Hint: Type
  Value: "Single-Line Text"
`);

  // Parent Ref - shared, $parentname token
  writeFileSync(join(sectionDir, 'Parent Ref.yml'), `---
ID: "{${PARENT_REF_FIELD_ID.toUpperCase()}}"
Parent: "{${SECTION_ID.toUpperCase()}}"
Template: "${TEMPLATE_FIELD_TEMPLATE_ID}"
Path: /sitecore/templates/Page/Page Section/Parent Ref
SharedFields:
- ID: "${FIELD_IDS.shared}"
  Hint: __Shared
  Value: "1"
- ID: "${FIELD_IDS.type}"
  Hint: Type
  Value: "Single-Line Text"
`);

  // Created At - versioned (shared=0, unversioned=0), $now token
  writeFileSync(join(sectionDir, 'Created At.yml'), `---
ID: "{${CREATED_AT_FIELD_ID.toUpperCase()}}"
Parent: "{${SECTION_ID.toUpperCase()}}"
Template: "${TEMPLATE_FIELD_TEMPLATE_ID}"
Path: /sitecore/templates/Page/Page Section/Created At
SharedFields:
- ID: "${FIELD_IDS.type}"
  Hint: Type
  Value: "Datetime"
`);

  // Upper Name - shared, value is "$NAME" (uppercase, NOT a token)
  writeFileSync(join(sectionDir, 'Upper Name.yml'), `---
ID: "{${UPPER_NAME_FIELD_ID.toUpperCase()}}"
Parent: "{${SECTION_ID.toUpperCase()}}"
Template: "${TEMPLATE_FIELD_TEMPLATE_ID}"
Path: /sitecore/templates/Page/Page Section/Upper Name
SharedFields:
- ID: "${FIELD_IDS.shared}"
  Hint: __Shared
  Value: "1"
- ID: "${FIELD_IDS.type}"
  Hint: Type
  Value: "Single-Line Text"
`);

  // Adjacent - shared, value is "$name$id" (two tokens back-to-back)
  writeFileSync(join(sectionDir, 'Adjacent.yml'), `---
ID: "{${ADJACENT_FIELD_ID.toUpperCase()}}"
Parent: "{${SECTION_ID.toUpperCase()}}"
Template: "${TEMPLATE_FIELD_TEMPLATE_ID}"
Path: /sitecore/templates/Page/Page Section/Adjacent
SharedFields:
- ID: "${FIELD_IDS.shared}"
  Hint: __Shared
  Value: "1"
- ID: "${FIELD_IDS.type}"
  Hint: Type
  Value: "Single-Line Text"
`);

  // Compound - shared, value mixes literals and tokens
  writeFileSync(join(sectionDir, 'Compound.yml'), `---
ID: "{${COMPOUND_FIELD_ID.toUpperCase()}}"
Parent: "{${SECTION_ID.toUpperCase()}}"
Template: "${TEMPLATE_FIELD_TEMPLATE_ID}"
Path: /sitecore/templates/Page/Page Section/Compound
SharedFields:
- ID: "${FIELD_IDS.shared}"
  Hint: __Shared
  Value: "1"
- ID: "${FIELD_IDS.type}"
  Hint: Type
  Value: "Single-Line Text"
`);

  // __Standard Values - sibling of "Page Section" under page-tpl
  // Carries shared values for Title, Subtitle, Parent Ref AND a versioned
  // value for Created At. Mirrors Sitecore's SV item shape: same template id
  // as the template it belongs to (page-tpl).
  writeFileSync(join(pageDir, '__Standard Values.yml'), `---
ID: "{${SV_ID.toUpperCase()}}"
Parent: "{${PAGE_TPL_ID.toUpperCase()}}"
Template: "{${PAGE_TPL_ID.toUpperCase()}}"
Path: /sitecore/templates/Page/__Standard Values
SharedFields:
- ID: "${TITLE_FIELD_ID}"
  Hint: Title
  Value: "Welcome to $name"
- ID: "${SUBTITLE_FIELD_ID}"
  Hint: Subtitle
  Value: "Static text"
- ID: "${PARENT_REF_FIELD_ID}"
  Hint: Parent Ref
  Value: "Under $parentname"
- ID: "${UPPER_NAME_FIELD_ID}"
  Hint: Upper Name
  Value: "$NAME"
- ID: "${ADJACENT_FIELD_ID}"
  Hint: Adjacent
  Value: "$name$id"
- ID: "${COMPOUND_FIELD_ID}"
  Hint: Compound
  Value: "$name created on $now"
Languages:
- Language: en
  Versions:
  - Version: 1
    Fields:
    - ID: "${CREATED_AT_FIELD_ID}"
      Hint: Created At
      Value: "$now"
`);

  const engine = new Engine({ rootDir: dir });
  await engine.init();

  return {
    dir,
    engine,
    parentId: HOME_ID,
    templateId: PAGE_TPL_ID,
  };
}
