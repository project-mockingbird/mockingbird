import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, writeFileSync, mkdirSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Engine } from '../../src/engine/index.js';
import { FIELD_IDS } from '../../src/engine/constants.js';

const TPL_ID = '11111111-1111-1111-1111-111111111111';
const FOLDER_ID = '22222222-2222-2222-2222-222222222222';

// Minimal on-disk workspace: one real Template item (template = the Template
// template) and one non-template folder item, both under /sitecore/templates.
async function buildEngine() {
  const dir = mkdtempSync(join(tmpdir(), 'mb-sv-'));
  mkdirSync(join(dir, 'items'), { recursive: true });
  writeFileSync(join(dir, 'sitecore.json'), JSON.stringify({ modules: ['*.module.json'] }));
  writeFileSync(
    join(dir, 'mod.module.json'),
    JSON.stringify({ namespace: 'mod', items: { includes: [{ name: 'items', path: '/sitecore/templates' }] } }),
  );
  writeFileSync(
    join(dir, 'items', 'MyTemplate.yml'),
    `---
ID: "{11111111-1111-1111-1111-111111111111}"
Parent: "{00000000-0000-0000-0000-000000000000}"
Template: "{AB86861A-6030-46C5-B394-E8F99E8B87DB}"
Path: /sitecore/templates/MyTemplate
SharedFields:
- ID: "12c33f3f-86c5-43a5-aeb4-5598cec45116"
  Hint: __Base template
  Value: "{1930BBEB-7805-471A-A3BE-4858AC7CF696}"
`,
  );
  writeFileSync(
    join(dir, 'items', 'NotATemplate.yml'),
    `---
ID: "{22222222-2222-2222-2222-222222222222}"
Parent: "{00000000-0000-0000-0000-000000000000}"
Template: "{0437FEE2-44C9-46A6-ABE9-28858D9FEE8C}"
Path: /sitecore/templates/NotATemplate
`,
  );
  const engine = new Engine({ rootDir: dir });
  await engine.init();
  return { dir, engine };
}

let dir: string | null = null;
let engine: Engine | null = null;

afterEach(async () => {
  if (engine) {
    await engine.close();
    engine = null;
  }
  if (dir) {
    rmSync(dir, { recursive: true, force: true });
    dir = null;
  }
});

describe('Engine.createStandardValues (item 3)', () => {
  it('creates the __Standard Values child with the template as its own template', async () => {
    const built = await buildEngine();
    dir = built.dir;
    engine = built.engine;

    const sv = await engine.createStandardValues(TPL_ID);

    expect(sv.item.path).toBe('/sitecore/templates/MyTemplate/__Standard Values');
    expect(sv.item.parent).toBe(TPL_ID);
    expect(sv.item.template).toBe(TPL_ID);
    expect(existsSync(sv.filePath)).toBe(true);

    // The new SV item is resolvable through the tree without a restart.
    expect(engine.getItemByPath('/sitecore/templates/MyTemplate/__Standard Values')).toBeDefined();
  });

  it('points the template\'s __Standard values field at the new item and persists it', async () => {
    const built = await buildEngine();
    dir = built.dir;
    engine = built.engine;

    const sv = await engine.createStandardValues(TPL_ID);

    const tpl = engine.getItemById(TPL_ID)!;
    const field = tpl.item.sharedFields.find((f) => f.id === FIELD_IDS.standardValues);
    expect(field).toBeDefined();
    expect(field!.value.toLowerCase()).toContain(sv.item.id.toLowerCase());

    // Persisted to disk, not just mutated in memory.
    const onDisk = readFileSync(tpl.filePath, 'utf8');
    expect(onDisk.toLowerCase()).toContain(sv.item.id.toLowerCase());
  });

  it('rejects a template that already has standard values', async () => {
    const built = await buildEngine();
    dir = built.dir;
    engine = built.engine;

    await engine.createStandardValues(TPL_ID);
    await expect(engine.createStandardValues(TPL_ID)).rejects.toThrow(/standard values/i);
  });

  it('allows (re)creation when the __Standard values field dangles at a deleted item', async () => {
    const built = await buildEngine();
    dir = built.dir;
    engine = built.engine;

    // Simulate a previously-deleted SV: deleting the SV item never rewrote the
    // template, so its __Standard values field still points at a now-nonexistent
    // item. No SV child exists on disk.
    const tpl = engine.getItemById(TPL_ID)!;
    tpl.item.sharedFields.push({
      id: FIELD_IDS.standardValues,
      hint: '__Standard values',
      value: '{DEADDEAD-0000-0000-0000-000000000000}',
    });

    // The dangling pointer must NOT block re-creation.
    const sv = await engine.createStandardValues(TPL_ID);
    expect(sv.item.path).toBe('/sitecore/templates/MyTemplate/__Standard Values');
    expect(existsSync(sv.filePath)).toBe(true);

    // The field is repointed to the NEW sv item, not left dangling at the dead guid.
    const field = engine.getItemById(TPL_ID)!.item.sharedFields.find((f) => f.id === FIELD_IDS.standardValues);
    expect(field!.value.toLowerCase()).toContain(sv.item.id.toLowerCase());
    expect(field!.value.toLowerCase()).not.toContain('deaddead');
  });

  it('rejects an item that is not a template', async () => {
    const built = await buildEngine();
    dir = built.dir;
    engine = built.engine;

    await expect(engine.createStandardValues(FOLDER_ID)).rejects.toThrow(/not a template/i);
  });

  it('rejects an unknown item id', async () => {
    const built = await buildEngine();
    dir = built.dir;
    engine = built.engine;

    await expect(
      engine.createStandardValues('99999999-9999-9999-9999-999999999999'),
    ).rejects.toThrow(/not found/i);
  });
});
