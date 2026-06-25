import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Engine } from '../../src/engine/index.js';
import { refreshItem } from '../../src/engine/refresh-item.js';

// Well-known ids (lowercase, no braces).
const PARENT_ID = 'aaaa0000-0000-0000-0000-000000000001';
const CHILD_A_ID = 'aaaa0000-0000-0000-0000-00000000000a';
const CHILD_B_ID = 'aaaa0000-0000-0000-0000-00000000000b';
const GRAND_A_ID = 'aaaa0000-0000-0000-0000-0000000000aa';
const TEMPLATE_FOLDER_ID = '0437fee2-44c9-46a6-abe9-28858d9fee8c';

function item(id: string, parent: string, path: string): string {
  return `---
ID: "{${id.toUpperCase()}}"
Parent: "{${parent.toUpperCase()}}"
Template: "{${TEMPLATE_FOLDER_ID.toUpperCase()}}"
Path: ${path}
`;
}

/**
 * On-disk fixture: a Parent with two children (ChildA, ChildB) where ChildA
 * itself has a grandchild (GrandA). Uses the standard SCS layout:
 * `<Name>.yml` is the item, `<Name>/` (sibling dir) holds its children.
 *
 *   items/Parent.yml
 *   items/Parent/ChildA.yml
 *   items/Parent/ChildA/GrandA.yml
 *   items/Parent/ChildB.yml
 */
function buildFixture() {
  const dir = mkdtempSync(join(tmpdir(), 'mb-refresh-'));
  mkdirSync(join(dir, 'items', 'Parent', 'ChildA'), { recursive: true });
  writeFileSync(join(dir, 'sitecore.json'), JSON.stringify({ modules: ['*.module.json'] }));
  writeFileSync(
    join(dir, 'mod.module.json'),
    JSON.stringify({
      namespace: 'mod',
      items: { includes: [{ name: 'items', path: '/sitecore/templates' }] },
    }),
  );

  writeFileSync(join(dir, 'items', 'Parent.yml'), item(PARENT_ID, '00000000-0000-0000-0000-000000000000', '/sitecore/templates/Parent'));
  writeFileSync(join(dir, 'items', 'Parent', 'ChildA.yml'), item(CHILD_A_ID, PARENT_ID, '/sitecore/templates/Parent/ChildA'));
  writeFileSync(join(dir, 'items', 'Parent', 'ChildB.yml'), item(CHILD_B_ID, PARENT_ID, '/sitecore/templates/Parent/ChildB'));
  writeFileSync(join(dir, 'items', 'Parent', 'ChildA', 'GrandA.yml'), item(GRAND_A_ID, CHILD_A_ID, '/sitecore/templates/Parent/ChildA/GrandA'));

  return dir;
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
  dir = buildFixture();
  engine = new Engine({ rootDir: dir });
  await engine.init();
  return { dir, engine };
}

describe('refreshItem reconcile (add + delete)', () => {
  it('removes a leaf child whose YAML was deleted on disk', async () => {
    const built = await boot();
    // Sanity: ChildB is present before deletion.
    expect(built.engine.getItemById(CHILD_B_ID)).toBeDefined();

    rmSync(join(built.dir, 'items', 'Parent', 'ChildB.yml'));
    const result = await refreshItem(built.engine, { itemId: PARENT_ID });

    expect(built.engine.getItemById(CHILD_B_ID)).toBeUndefined();
    expect(result.removed).toBe(1);
    // Untouched siblings survive.
    expect(built.engine.getItemById(CHILD_A_ID)).toBeDefined();
    expect(built.engine.getItemById(GRAND_A_ID)).toBeDefined();
    expect(built.engine.getItemById(PARENT_ID)).toBeDefined();
  });

  it('removes a whole deleted subtree (item + its directory) - the consumer scenario', async () => {
    const built = await boot();
    expect(built.engine.getItemById(CHILD_A_ID)).toBeDefined();
    expect(built.engine.getItemById(GRAND_A_ID)).toBeDefined();

    // Delete ChildA's YAML AND its children directory (GrandA goes with it).
    rmSync(join(built.dir, 'items', 'Parent', 'ChildA.yml'));
    rmSync(join(built.dir, 'items', 'Parent', 'ChildA'), { recursive: true, force: true });

    const result = await refreshItem(built.engine, { itemId: PARENT_ID });

    expect(built.engine.getItemById(CHILD_A_ID)).toBeUndefined();
    expect(built.engine.getItemById(GRAND_A_ID)).toBeUndefined();
    expect(result.removed).toBe(2);
    // ChildB and Parent untouched.
    expect(built.engine.getItemById(CHILD_B_ID)).toBeDefined();
    expect(built.engine.getItemById(PARENT_ID)).toBeDefined();
  });

  it('still adds a child added on disk (additive path unchanged)', async () => {
    const built = await boot();
    const NEW_ID = 'aaaa0000-0000-0000-0000-00000000000c';
    writeFileSync(
      join(built.dir, 'items', 'Parent', 'ChildC.yml'),
      item(NEW_ID, PARENT_ID, '/sitecore/templates/Parent/ChildC'),
    );

    await refreshItem(built.engine, { itemId: PARENT_ID });

    expect(built.engine.getItemById(NEW_ID)).toBeDefined();
  });

  it('never removes an item whose YAML is still on disk (partial-delete safety)', async () => {
    const built = await boot();
    // Delete only ChildA's own YAML; leave its grandchild GrandA on disk.
    rmSync(join(built.dir, 'items', 'Parent', 'ChildA.yml'));

    await refreshItem(built.engine, { itemId: PARENT_ID });

    // The on-disk grandchild MUST survive - reconcile must not destroy live data.
    expect(built.engine.getItemById(GRAND_A_ID)).toBeDefined();
  });

  it('does not remove the refresh root itself', async () => {
    const built = await boot();
    const result = await refreshItem(built.engine, { itemId: PARENT_ID });
    expect(built.engine.getItemById(PARENT_ID)).toBeDefined();
    expect(result.removed).toBe(0);
  });
});
