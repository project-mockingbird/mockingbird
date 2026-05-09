import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Engine } from '../../../src/engine/index.js';
import { applyFieldUpdates } from '../../../src/engine/scaffolding/field-updates.js';

const T_LEAF_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const TEMPLATE_TEMPLATE_ID = 'AB86861A-6030-46C5-B394-E8F99E8B87DB';
const PARENT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TITLE_FIELD_ID = '11111111-1111-1111-1111-111111111111';
const OWNER_FIELD_ID = '22222222-2222-2222-2222-222222222222';

async function buildFieldUpdatesFixtureEngine(): Promise<{ engine: Engine; cleanup: () => void }> {
  const fixDir = mkdtempSync(join(tmpdir(), 'mb-field-updates-'));

  writeFileSync(join(fixDir, 'sitecore.json'), JSON.stringify({ modules: ['*.module.json'] }));
  writeFileSync(join(fixDir, 'mod.module.json'), JSON.stringify({
    namespace: 'mod',
    items: {
      includes: [
        { name: 'content', path: '/sitecore/content' },
        { name: 'templates', path: '/sitecore/templates' },
      ],
    },
  }));

  const contentDir = join(fixDir, 'content');
  mkdirSync(contentDir, { recursive: true });

  const templatesDir = join(fixDir, 'templates');
  mkdirSync(templatesDir, { recursive: true });

  // Template that has TITLE (shared) and OWNER (shared) fields.
  writeFileSync(join(templatesDir, 'Leaf.yml'), `---
ID: "{${T_LEAF_ID.toUpperCase()}}"
Parent: "{00000000-0000-0000-0000-000000000000}"
Template: "${TEMPLATE_TEMPLATE_ID}"
Path: /sitecore/templates/Leaf
`);

  const leafDir = join(templatesDir, 'Leaf');
  mkdirSync(leafDir, { recursive: true });

  // Section under template
  const SECTION_ID = '33333333-3333-3333-3333-333333333333';
  writeFileSync(join(leafDir, 'Section.yml'), `---
ID: "{${SECTION_ID.toUpperCase()}}"
Parent: "{${T_LEAF_ID.toUpperCase()}}"
Template: "E269FBB5-3750-427A-9149-7AA950B49301"
Path: /sitecore/templates/Leaf/Section
`);

  const sectionDir = join(leafDir, 'Section');
  mkdirSync(sectionDir, { recursive: true });

  writeFileSync(join(sectionDir, 'Title.yml'), `---
ID: "{${TITLE_FIELD_ID.toUpperCase()}}"
Parent: "{${SECTION_ID.toUpperCase()}}"
Template: "455A3E98-A627-4B40-8035-E683A0331AC7"
Path: /sitecore/templates/Leaf/Section/Title
SharedFields:
- ID: "{BE351A73-FCB0-4213-93FA-C302D8AB4F51}"
  Hint: __Type
  Value: "Single-Line Text"
- ID: "{12C33F3F-86C5-43A5-AEB4-5598CEC45116}"
  Hint: __Shared
  Value: "1"
`);

  writeFileSync(join(sectionDir, 'Owner.yml'), `---
ID: "{${OWNER_FIELD_ID.toUpperCase()}}"
Parent: "{${SECTION_ID.toUpperCase()}}"
Template: "455A3E98-A627-4B40-8035-E683A0331AC7"
Path: /sitecore/templates/Leaf/Section/Owner
SharedFields:
- ID: "{BE351A73-FCB0-4213-93FA-C302D8AB4F51}"
  Hint: __Type
  Value: "Single-Line Text"
- ID: "{12C33F3F-86C5-43A5-AEB4-5598CEC45116}"
  Hint: __Shared
  Value: "1"
`);

  // The actual item we'll mutate. Both TITLE and OWNER pre-populated so
  // tests can assert against sharedFields[].find(...) without depending on
  // the schema-resolved scope for new fields.
  writeFileSync(join(contentDir, 'Parent.yml'), `---
ID: "{${PARENT_ID.toUpperCase()}}"
Parent: "{00000000-0000-0000-0000-000000000000}"
Template: "{${T_LEAF_ID.toUpperCase()}}"
Path: /sitecore/content/Parent
SharedFields:
- ID: "{${TITLE_FIELD_ID.toUpperCase()}}"
  Hint: Title
  Value: "Initial title"
- ID: "{${OWNER_FIELD_ID.toUpperCase()}}"
  Hint: Owner
  Value: "Initial owner"
`);

  const engine = new Engine({ rootDir: fixDir });
  await engine.init();

  return {
    engine,
    cleanup: () => rmSync(fixDir, { recursive: true, force: true }),
  };
}

describe('applyFieldUpdates', () => {
  let engine: Engine;
  let cleanup: () => void;

  beforeEach(async () => {
    const built = await buildFieldUpdatesFixtureEngine();
    engine = built.engine;
    cleanup = built.cleanup;
  });

  afterEach(() => {
    cleanup();
  });

  it('writes a single field update and the new value reads back', async () => {
    await applyFieldUpdates(engine, [
      { itemId: PARENT_ID, fieldId: TITLE_FIELD_ID, value: 'Updated title' },
    ]);

    const item = engine.getItemById(PARENT_ID);
    expect(item).toBeDefined();
    const titleField = item!.item.sharedFields?.find(f => f.id.toLowerCase() === TITLE_FIELD_ID);
    expect(titleField?.value).toBe('Updated title');
  });

  it('batches multiple field updates on the same item into one write', async () => {
    await applyFieldUpdates(engine, [
      { itemId: PARENT_ID, fieldId: TITLE_FIELD_ID, value: 'Title A' },
      { itemId: PARENT_ID, fieldId: OWNER_FIELD_ID, value: 'Owner B' },
    ]);

    const item = engine.getItemById(PARENT_ID);
    const title = item!.item.sharedFields?.find(f => f.id.toLowerCase() === TITLE_FIELD_ID);
    const owner = item!.item.sharedFields?.find(f => f.id.toLowerCase() === OWNER_FIELD_ID);
    expect(title?.value).toBe('Title A');
    expect(owner?.value).toBe('Owner B');
  });

  it('throws ScaffoldError when itemId is not in the tree', async () => {
    await expect(
      applyFieldUpdates(engine, [
        { itemId: 'cccccccc-cccc-cccc-cccc-cccccccccccc', fieldId: TITLE_FIELD_ID, value: 'x' },
      ]),
    ).rejects.toThrow(/not found/);
  });

  it('no-op when fields list is empty', async () => {
    await applyFieldUpdates(engine, []);
    // No throw; nothing to assert beyond that.
  });
});
