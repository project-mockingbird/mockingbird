import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { resolve, join } from 'path';
import { cpSync } from 'fs';
import { fileURLToPath } from 'url';
import { Engine } from '../../src/engine/index.js';
import { copySubtree } from '../../src/engine/copy-subtree.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const FIXTURES = resolve(__dirname, '../fixtures/valid');

describe('copySubtree', () => {
  let tempDir: string;
  let engine: Engine;
  const SOURCE_ID = 'a1b2c3d4-e5f6-7890-abcd-000000000004';

  beforeEach(async () => {
    tempDir = await mkdtemp(resolve(tmpdir(), 'mockingbird-copysub-'));
    cpSync(FIXTURES, tempDir, { recursive: true });
    engine = new Engine({ rootDir: tempDir });
    engine.startInit();
    await engine.readiness.ready();
  });
  afterEach(async () => {
    await engine.close();
    await rm(tempDir, { recursive: true, force: true });
  });

  it('copies a single item to source parent with the given name (Duplicate-shape call)', async () => {
    const source = engine.getItemById(SOURCE_ID)!;
    const result = await copySubtree(engine, {
      sourceId: SOURCE_ID,
      destinationParentId: source.item.parent,
      rootName: 'CopiedAsSibling',
      rewriteIntraSubtreeRefs: false,
    });

    expect(result.rootItemId).not.toBe(SOURCE_ID);
    expect(result.createdItems).toHaveLength(1);
    const copy = result.createdItems[0].item;
    expect(copy.parent).toBe(source.item.parent);
    expect(copy.path.endsWith('/CopiedAsSibling')).toBe(true);
    expect(copy.template).toBe(source.item.template);
  });
});

describe('copySubtree intra-subtree ref retargeting', () => {
  let tempDir: string;
  let engine: Engine;
  const TPL = 'a1b2c3d4-e5f6-7890-abcd-000000000001';
  const PARENT_ID = '11111111-1111-1111-1111-111111111111';
  const SUBROOT_ID = '22222222-2222-2222-2222-222222222222';
  const CHILD_ID = '33333333-3333-3333-3333-333333333333';
  const OUTSIDE_ID = '44444444-4444-4444-4444-444444444444';

  beforeEach(async () => {
    tempDir = await mkdtemp(resolve(tmpdir(), 'mockingbird-copysub-rewrite-'));
    await mkdir(join(tempDir, 'items', 'Sub'), { recursive: true });
    await writeFile(join(tempDir, 'sitecore.json'), JSON.stringify({
      modules: ['*.module.json'],
    }), 'utf-8');
    await writeFile(join(tempDir, 'mod.module.json'), JSON.stringify({
      namespace: 'mod',
      items: { includes: [{ name: 'items', path: '/sitecore/content' }] },
    }), 'utf-8');

    await writeFile(join(tempDir, 'items', 'Parent.yml'), `---
ID: "{${PARENT_ID.toUpperCase()}}"
Parent: "{00000000-0000-0000-0000-000000000000}"
Template: "{${TPL.toUpperCase()}}"
Path: /sitecore/content/Parent
`, 'utf-8');

    await writeFile(join(tempDir, 'items', 'Sub.yml'), `---
ID: "{${SUBROOT_ID.toUpperCase()}}"
Parent: "{${PARENT_ID.toUpperCase()}}"
Template: "{${TPL.toUpperCase()}}"
Path: /sitecore/content/Parent/Sub
`, 'utf-8');

    await writeFile(join(tempDir, 'items', 'Sub', 'Child.yml'), `---
ID: "{${CHILD_ID.toUpperCase()}}"
Parent: "{${SUBROOT_ID.toUpperCase()}}"
Template: "{${TPL.toUpperCase()}}"
Path: /sitecore/content/Parent/Sub/Child
SharedFields:
- ID: "aaaaaaaa-0000-0000-0000-000000000001"
  Hint: IntraRef
  Value: "{${SUBROOT_ID.toUpperCase()}}"
- ID: "aaaaaaaa-0000-0000-0000-000000000002"
  Hint: ExternalRef
  Value: "{${OUTSIDE_ID.toUpperCase()}}"
`, 'utf-8');

    await writeFile(join(tempDir, 'items', 'Outside.yml'), `---
ID: "{${OUTSIDE_ID.toUpperCase()}}"
Parent: "{${PARENT_ID.toUpperCase()}}"
Template: "{${TPL.toUpperCase()}}"
Path: /sitecore/content/Parent/Outside
`, 'utf-8');

    engine = new Engine({ rootDir: tempDir });
    engine.startInit();
    await engine.readiness.ready();
  });
  afterEach(async () => {
    await engine.close();
    await rm(tempDir, { recursive: true, force: true });
  });

  it('rewrites intra-subtree GUIDs to new IDs when flag is true', async () => {
    const result = await copySubtree(engine, {
      sourceId: SUBROOT_ID,
      destinationParentId: PARENT_ID,
      rootName: 'Sub-copy',
      rewriteIntraSubtreeRefs: true,
    });
    const newSubrootId = result.rootItemId;
    const childCopy = result.createdItems.find(n => n.item.path.endsWith('/Child'))!;

    const intraField = childCopy.item.sharedFields.find(f => f.hint === 'IntraRef')!;
    const externalField = childCopy.item.sharedFields.find(f => f.hint === 'ExternalRef')!;

    // Intra ref: braced form should now hold the NEW subroot id (case-preserving means upper-case payload).
    expect(intraField.value.toLowerCase()).toContain(newSubrootId);
    expect(intraField.value.toLowerCase()).not.toContain(SUBROOT_ID);
    // External ref: unchanged.
    expect(externalField.value.toLowerCase()).toContain(OUTSIDE_ID);
  });

  it('leaves intra-subtree GUIDs alone when flag is false (Duplicate parity)', async () => {
    const result = await copySubtree(engine, {
      sourceId: SUBROOT_ID,
      destinationParentId: PARENT_ID,
      rootName: 'Sub-dup',
      rewriteIntraSubtreeRefs: false,
    });
    const childCopy = result.createdItems.find(n => n.item.path.endsWith('/Child'))!;
    const intraField = childCopy.item.sharedFields.find(f => f.hint === 'IntraRef')!;
    expect(intraField.value.toLowerCase()).toContain(SUBROOT_ID);
  });
});
