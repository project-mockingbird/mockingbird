import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Engine } from '../../src/engine/index.js';
import { getInsertOptions } from '../../src/engine/insert-options.js';

// Well-known ids (lowercase, no braces).
const TEMPLATE_TEMPLATE_ID = 'ab86861a-6030-46c5-b394-e8f99e8b87db';
const PARENT_ID = 'aaaa0000-0000-0000-0000-000000000001';
const NEW_TEMPLATE_CMD_ID = 'bbbb0000-0000-0000-0000-000000000002';
const BAD_CMD_ID = 'cccc0000-0000-0000-0000-000000000003';

// A Template Folder parent whose `__Masters` (Insert Options) lists two command
// masters: the OOTB-style "New Template" (Command = templates:new) and a bogus
// one with an unknown command. Both are templated on CommandMaster (b2613cc1).
function buildEngine() {
  const dir = mkdtempSync(join(tmpdir(), 'mb-cmdmaster-'));
  mkdirSync(join(dir, 'items'), { recursive: true });
  writeFileSync(join(dir, 'sitecore.json'), JSON.stringify({ modules: ['*.module.json'] }));
  writeFileSync(
    join(dir, 'mod.module.json'),
    JSON.stringify({ namespace: 'mod', items: { includes: [{ name: 'items', path: '/sitecore/templates' }] } }),
  );

  // Parent Template Folder, with __Masters listing both command masters.
  writeFileSync(
    join(dir, 'items', 'Parent.yml'),
    `---
ID: "{AAAA0000-0000-0000-0000-000000000001}"
Parent: "{00000000-0000-0000-0000-000000000000}"
Template: "{0437FEE2-44C9-46A6-ABE9-28858D9FEE8C}"
Path: /sitecore/templates/Parent
SharedFields:
- ID: "1172f251-dad4-4efb-a329-0c63500e4f1e"
  Hint: __Masters
  Value: "{BBBB0000-0000-0000-0000-000000000002}|{CCCC0000-0000-0000-0000-000000000003}"
`,
  );

  // "New Template" command master: templated on CommandMaster, Command field
  // holds the OOTB templates:new command.
  writeFileSync(
    join(dir, 'items', 'NewTemplate.yml'),
    `---
ID: "{BBBB0000-0000-0000-0000-000000000002}"
Parent: "{00000000-0000-0000-0000-000000000000}"
Template: "{B2613CC1-A748-46A3-A0DB-3774574BD339}"
Path: /sitecore/templates/NewTemplate
SharedFields:
- ID: "854cc8f6-94ad-4521-a4b6-44ed8f794c98"
  Hint: Command
  Value: "templates:new(id=$ParentID)"
`,
  );

  // A command master with a command Mockingbird doesn't (yet) support.
  writeFileSync(
    join(dir, 'items', 'BadCommand.yml'),
    `---
ID: "{CCCC0000-0000-0000-0000-000000000003}"
Parent: "{00000000-0000-0000-0000-000000000000}"
Template: "{B2613CC1-A748-46A3-A0DB-3774574BD339}"
Path: /sitecore/templates/BadCommand
SharedFields:
- ID: "854cc8f6-94ad-4521-a4b6-44ed8f794c98"
  Hint: Command
  Value: "something:unsupported"
`,
  );

  const engine = new Engine({ rootDir: dir });
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

describe('Command Master inserts (Sitecore AddMaster parity)', () => {
  it('insertItem on the "New Template" command master creates a real Template item', async () => {
    const built = await buildEngine();
    dir = built.dir;
    engine = built.engine;
    await engine.init();

    const result = await engine.insertItem({
      parentId: PARENT_ID,
      templateId: NEW_TEMPLATE_CMD_ID,
      name: 'MyTemplate',
    });
    const created = result.createdItems[0];

    // The new item must be a Template (templates:new -> TemplateIDs.Template),
    // NOT typed on the command master item itself.
    expect(created.item.template).toBe(TEMPLATE_TEMPLATE_ID);
    expect(created.item.template).not.toBe(NEW_TEMPLATE_CMD_ID);
    expect(created.item.path).toBe('/sitecore/templates/Parent/MyTemplate');
  });

  it('getInsertOptions substitutes the produced template for a command master', async () => {
    const built = await buildEngine();
    dir = built.dir;
    engine = built.engine;
    await engine.init();

    const options = getInsertOptions(engine, PARENT_ID);

    const newTemplateOption = options.find(o => o.templateName === 'NewTemplate');
    expect(newTemplateOption).toBeDefined();
    // The option resolves to the real Template template, not the command master.
    expect(newTemplateOption!.templateId).toBe(TEMPLATE_TEMPLATE_ID);
    expect(newTemplateOption!.kind).toBe('template');

    // The unsupported command master is dropped rather than offered as a broken insert.
    expect(options.find(o => o.templateName === 'BadCommand')).toBeUndefined();
  });

  it('rejects inserting a command master whose command is unsupported', async () => {
    const built = await buildEngine();
    dir = built.dir;
    engine = built.engine;
    await engine.init();

    await expect(
      engine.insertItem({ parentId: PARENT_ID, templateId: BAD_CMD_ID, name: 'Nope' }),
    ).rejects.toThrow(/unsupported command template/i);
  });
});
