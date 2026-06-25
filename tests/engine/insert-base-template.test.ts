import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Engine } from '../../src/engine/index.js';
import type { ItemNode } from '../../src/engine/types.js';

// Well-known Sitecore ids (lowercase, no braces).
const TEMPLATE_TEMPLATE_ID = 'ab86861a-6030-46c5-b394-e8f99e8b87db';
const STANDARD_TEMPLATE_ID = '1930bbeb-7805-471a-a3be-4858ac7cf696';
const BASE_TEMPLATE_FIELD_ID = '12c33f3f-86c5-43a5-aeb4-5598cec45116';
const COMMAND_MASTER_ID = 'b2613cc1-a748-46a3-a0db-3774574bd339';
const COMMAND_FIELD_ID = '854cc8f6-94ad-4521-a4b6-44ed8f794c98';
const TEMPLATE_FOLDER_ID = '0437fee2-44c9-46a6-abe9-28858d9fee8c';

// Fixture ids.
const PARENT_ID = 'aaaa0000-0000-0000-0000-000000000001';
const NEW_TEMPLATE_CMD_ID = 'bbbb0000-0000-0000-0000-000000000002';
const PLAIN_TEMPLATE_ID = 'dddd0000-0000-0000-0000-000000000004';

const norm = (v: string | undefined): string => String(v ?? '').replace(/[{}]/g, '').toLowerCase();

function baseTemplateValue(node: ItemNode): string | undefined {
  const f = node.item.sharedFields.find((x) => norm(x.id) === BASE_TEMPLATE_FIELD_ID);
  return f ? norm(f.value) : undefined;
}

/**
 * Parent Template Folder whose __Masters lists two insert options: the OOTB-style
 * "New Template" command master (templates:new -> creates a Template), and a plain
 * template used as an ordinary insert master (creates a content item of that type).
 */
function buildEngine() {
  const dir = mkdtempSync(join(tmpdir(), 'mb-basetpl-'));
  mkdirSync(join(dir, 'items'), { recursive: true });
  writeFileSync(join(dir, 'sitecore.json'), JSON.stringify({ modules: ['*.module.json'] }));
  writeFileSync(
    join(dir, 'mod.module.json'),
    JSON.stringify({ namespace: 'mod', items: { includes: [{ name: 'items', path: '/sitecore/templates' }] } }),
  );

  writeFileSync(
    join(dir, 'items', 'Parent.yml'),
    `---
ID: "{${PARENT_ID.toUpperCase()}}"
Parent: "{00000000-0000-0000-0000-000000000000}"
Template: "{${TEMPLATE_FOLDER_ID.toUpperCase()}}"
Path: /sitecore/templates/Parent
SharedFields:
- ID: "1172f251-dad4-4efb-a329-0c63500e4f1e"
  Hint: __Masters
  Value: "{${NEW_TEMPLATE_CMD_ID.toUpperCase()}}|{${PLAIN_TEMPLATE_ID.toUpperCase()}}"
`,
  );

  writeFileSync(
    join(dir, 'items', 'NewTemplate.yml'),
    `---
ID: "{${NEW_TEMPLATE_CMD_ID.toUpperCase()}}"
Parent: "{00000000-0000-0000-0000-000000000000}"
Template: "{${COMMAND_MASTER_ID.toUpperCase()}}"
Path: /sitecore/templates/NewTemplate
SharedFields:
- ID: "${COMMAND_FIELD_ID}"
  Hint: Command
  Value: "templates:new(id=$ParentID)"
`,
  );

  writeFileSync(
    join(dir, 'items', 'Plain.yml'),
    `---
ID: "{${PLAIN_TEMPLATE_ID.toUpperCase()}}"
Parent: "{00000000-0000-0000-0000-000000000000}"
Template: "{${TEMPLATE_TEMPLATE_ID.toUpperCase()}}"
Path: /sitecore/templates/Plain
`,
  );

  return { dir, engine: new Engine({ rootDir: dir }) };
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

async function boot() {
  const built = buildEngine();
  dir = built.dir;
  engine = built.engine;
  await engine.init();
  return engine;
}

describe('Base Template on template create', () => {
  it('defaults __Base template to Standard template when creating a Template', async () => {
    const eng = await boot();
    const res = await eng.insertItem({ parentId: PARENT_ID, templateId: NEW_TEMPLATE_CMD_ID, name: 'MyTpl' });
    const created = res.createdItems[0];
    // New Template command master produces a real Template definition...
    expect(norm(created.item.template)).toBe(TEMPLATE_TEMPLATE_ID);
    // ...and that template inherits Standard template by default.
    expect(baseTemplateValue(created)).toBe(STANDARD_TEMPLATE_ID);
  });

  it('writes the chosen baseTemplateId to __Base template', async () => {
    const eng = await boot();
    const customBase = '1111aaaa-2222-bbbb-3333-cccc4444dddd';
    const res = await eng.insertItem({
      parentId: PARENT_ID,
      templateId: NEW_TEMPLATE_CMD_ID,
      name: 'MyTpl2',
      baseTemplateId: customBase,
    });
    expect(baseTemplateValue(res.createdItems[0])).toBe(customBase);
  });

  it('does NOT set __Base template when the insert is not a Template definition', async () => {
    const eng = await boot();
    // Inserting a plain template creates a content item OF that template,
    // not a new Template definition - so no base template is assigned.
    const res = await eng.insertItem({
      parentId: PARENT_ID,
      templateId: PLAIN_TEMPLATE_ID,
      name: 'AnItem',
      baseTemplateId: STANDARD_TEMPLATE_ID,
    });
    expect(norm(res.createdItems[0].item.template)).toBe(PLAIN_TEMPLATE_ID);
    expect(baseTemplateValue(res.createdItems[0])).toBeUndefined();
  });
});
