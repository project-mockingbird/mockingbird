import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { walkBranchSubtree, writeAtomic } from '../../src/engine/insert-branch.js';
import { makeItem, buildEngine } from './layout/_helpers.js';
import { Engine } from '../../src/engine/index.js';
import { TEMPLATE_TEMPLATE_ID, BRANCH_TEMPLATE_ID } from '../../src/engine/constants.js';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('walkBranchSubtree', () => {
  it('iterates the branch template item children depth-first', () => {
    const branch = makeItem({ id: 'branch1', template: TEMPLATE_TEMPLATE_ID, path: '/sitecore/templates/Branches/My/Branch' });
    const nameChild = makeItem({ id: 'nm', template: TEMPLATE_TEMPLATE_ID, parent: 'branch1', path: '/sitecore/templates/Branches/My/Branch/$name' });
    const grandChild = makeItem({ id: 'gc', template: TEMPLATE_TEMPLATE_ID, parent: 'nm', path: '/sitecore/templates/Branches/My/Branch/$name/Sub' });
    const engine = buildEngine([branch, nameChild, grandChild]);

    const collected = walkBranchSubtree(engine, 'branch1');
    expect(collected.map(c => c.id)).toEqual(['nm', 'gc']);
  });

  it('skips the branch template item itself (only iterates its children)', () => {
    const branch = makeItem({ id: 'branch1', template: TEMPLATE_TEMPLATE_ID, path: '/sitecore/templates/Branches/My/Branch' });
    const nameChild = makeItem({ id: 'nm', template: TEMPLATE_TEMPLATE_ID, parent: 'branch1', path: '/sitecore/templates/Branches/My/Branch/$name' });
    const engine = buildEngine([branch, nameChild]);
    const collected = walkBranchSubtree(engine, 'branch1');
    expect(collected.map(c => c.id)).not.toContain('branch1');
  });

  it('returns empty array when the branch template has no children', () => {
    const branch = makeItem({ id: 'branch1', template: TEMPLATE_TEMPLATE_ID, path: '/sitecore/templates/Branches/Empty' });
    const engine = buildEngine([branch]);
    expect(walkBranchSubtree(engine, 'branch1')).toEqual([]);
  });

  it('returns empty array when the branch template id does not resolve', () => {
    const engine = buildEngine([]);
    expect(walkBranchSubtree(engine, 'nonexistent-id')).toEqual([]);
  });
});

describe('writeAtomic', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'mb-atomic-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('writes all files into final positions on success', async () => {
    const items = [
      { finalPath: join(dir, 'a/file1.yml'), contents: 'hello1' },
      { finalPath: join(dir, 'b/file2.yml'), contents: 'hello2' },
    ];
    await writeAtomic(items);
    expect(readFileSync(items[0].finalPath, 'utf-8')).toBe('hello1');
    expect(readFileSync(items[1].finalPath, 'utf-8')).toBe('hello2');
  });

  it('rolls back: leaves no final-position files when one rename fails', async () => {
    const items = [
      { finalPath: join(dir, 'ok.yml'), contents: 'ok' },
      // Force failure on the second rename: target's parent path contains a
      // NUL char which is invalid on every OS. mkdir will throw, abort, cleanup.
      { finalPath: join(dir, 'bad\0dir/x.yml'), contents: 'fail' },
    ];
    await expect(writeAtomic(items)).rejects.toThrow();
    expect(existsSync(join(dir, 'ok.yml'))).toBe(false);
  });

  it('stages inside <workspace>/.mockingbird/staging/ when MOCKINGBIRD_WORKSPACE is set', async () => {
    // Regression: a bind-mounted workspace lives on a different filesystem
    // than the container's overlay /tmp; staging in /tmp then renaming into
    // /workspaces fails with EXDEV. Staging under the workspace itself keeps
    // the rename within a single filesystem.
    const original = process.env.MOCKINGBIRD_WORKSPACE;
    process.env.MOCKINGBIRD_WORKSPACE = dir;
    try {
      await writeAtomic([{ finalPath: join(dir, 'sub/final.yml'), contents: 'x' }]);
      expect(readFileSync(join(dir, 'sub/final.yml'), 'utf-8')).toBe('x');
      // Staging dir created under the workspace; cleaned up after the call.
      expect(existsSync(join(dir, '.mockingbird/staging'))).toBe(true);
    } finally {
      if (original === undefined) delete process.env.MOCKINGBIRD_WORKSPACE;
      else process.env.MOCKINGBIRD_WORKSPACE = original;
    }
  });
});

describe('Engine.insertItem (branch path)', () => {
  let dir: string;
  let engine: Engine;
  let parentId: string;
  let branchId: string;

  // Stable field-ids set on the branch's $name child + descendant. Pinned at
  // module scope so test bodies can assert against them.
  const TITLE_FIELD_ID = '11111111-1111-1111-1111-111111111111';
  const OWNER_FIELD_ID = '22222222-2222-2222-2222-222222222222';
  // Source GUIDs of the branch template's $name child + SubItem descendant.
  const SRC_NAME_CHILD_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  const SRC_SUB_ITEM_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

  beforeEach(async () => {
    const built = await buildBranchFixtureEngine();
    dir = built.dir;
    engine = built.engine;
    parentId = built.parentId;
    branchId = built.branchId;
  });

  afterEach(async () => {
    await engine.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('creates the full subtree under the destination', async () => {
    const result = await engine.insertItem({
      parentId,
      templateId: branchId,
      name: 'NewRoot',
    });
    // Branch fixture has $name + $name/SubItem -> 2 items get created.
    expect(result.createdItems).toHaveLength(2);
    const root = engine.getItemByPath('/sitecore/content/Parent/NewRoot');
    const sub = engine.getItemByPath('/sitecore/content/Parent/NewRoot/SubItem');
    expect(root).toBeDefined();
    expect(sub).toBeDefined();
    // Both YAMLs landed on disk.
    expect(existsSync(result.createdItems[0].filePath)).toBe(true);
    expect(existsSync(result.createdItems[1].filePath)).toBe(true);
  });

  it('mints fresh GUIDs for every item in the subtree', async () => {
    const result = await engine.insertItem({
      parentId, templateId: branchId, name: 'X',
    });
    const ids = result.createdItems.map(c => c.item.id);
    // All unique.
    expect(new Set(ids).size).toBe(ids.length);
    // None of the new ids collide with the source branch-template ids.
    expect(ids).not.toContain(SRC_NAME_CHILD_ID);
    expect(ids).not.toContain(SRC_SUB_ITEM_ID);
    expect(ids).not.toContain(branchId);
  });

  it('expands $name globally to the user-provided name across the subtree', async () => {
    // Fixture's branch has:
    //   $name (shared TITLE = "Welcome to $name")
    //     SubItem (shared OWNER = "$name's data")
    // Both must resolve $name to "Hello" - the user-provided branch root
    // name - NOT to each item's own name. The descendant's own name is
    // "SubItem" so without a global override $name would resolve to that.
    const result = await engine.insertItem({
      parentId, templateId: branchId, name: 'Hello',
    });
    const root = result.createdItems[0];
    const sub = result.createdItems[1];
    const rootTitle = root.item.sharedFields.find(f => f.id === TITLE_FIELD_ID);
    const subOwner = sub.item.sharedFields.find(f => f.id === OWNER_FIELD_ID);
    expect(rootTitle?.value).toBe('Welcome to Hello');
    expect(subOwner?.value).toBe("Hello's data");
  });

  it('stamps branchId on the top-level item but not descendants', async () => {
    const result = await engine.insertItem({
      parentId, templateId: branchId, name: 'X',
    });
    const root = result.createdItems[0];
    const sub = result.createdItems[1];
    expect(root.item.branchId).toBe(branchId);
    expect(sub.item.branchId).toBeUndefined();
  });

  // Build a real-disk fixture with:
  //   - sitecore.json + mod.module.json declaring includes for content + templates + branches
  //   - Parent item at /sitecore/content/Parent (the destination)
  //   - T_LEAF template at /sitecore/templates/Leaf with TITLE + OWNER fields defined
  //   - Branch template at /sitecore/templates/Branches/MyBranch (template = TEMPLATE_TEMPLATE_ID)
  //   - $name child under the branch (template = T_LEAF, shared TITLE = "Welcome to $name")
  //   - SubItem grandchild under $name (template = T_LEAF, shared OWNER = "$name's data")
  async function buildBranchFixtureEngine() {
    const fixDir = mkdtempSync(join(tmpdir(), 'mb-insert-branch-'));

    writeFileSync(join(fixDir, 'sitecore.json'), JSON.stringify({
      modules: ['*.module.json'],
    }));
    writeFileSync(join(fixDir, 'mod.module.json'), JSON.stringify({
      namespace: 'mod',
      items: {
        includes: [
          { name: 'content', path: '/sitecore/content' },
          { name: 'templates', path: '/sitecore/templates' },
          { name: 'branches', path: '/sitecore/templates/Branches' },
        ],
      },
    }));

    const PARENT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const T_LEAF_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    const BRANCH_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

    // Parent item under /sitecore/content/Parent
    const contentDir = join(fixDir, 'content');
    mkdirSync(contentDir, { recursive: true });
    writeFileSync(join(contentDir, 'Parent.yml'), `---
ID: "{${PARENT_ID.toUpperCase()}}"
Parent: "{00000000-0000-0000-0000-000000000000}"
Template: "{${T_LEAF_ID.toUpperCase()}}"
Path: /sitecore/content/Parent
`);

    // T_LEAF template item (a regular template, NOT a branch). Its template
    // field is TEMPLATE_TEMPLATE_ID (not BRANCH_TEMPLATE_ID), so the
    // template-id branch detection treats it as a regular template.
    const templatesDir = join(fixDir, 'templates');
    mkdirSync(templatesDir, { recursive: true });
    writeFileSync(join(templatesDir, 'Leaf.yml'), `---
ID: "{${T_LEAF_ID.toUpperCase()}}"
Parent: "{00000000-0000-0000-0000-000000000000}"
Template: "${TEMPLATE_TEMPLATE_ID}"
Path: /sitecore/templates/Leaf
`);

    // Branch template item under /sitecore/templates/Branches/MyBranch.
    // template = BRANCH_TEMPLATE_ID (Sitecore.Data.TemplateIDs.BranchTemplate)
    // - this is what tags it as a branch, not its location.
    const branchesDir = join(fixDir, 'branches');
    mkdirSync(branchesDir, { recursive: true });
    writeFileSync(join(branchesDir, 'MyBranch.yml'), `---
ID: "{${BRANCH_ID.toUpperCase()}}"
Parent: "{00000000-0000-0000-0000-000000000000}"
Template: "${BRANCH_TEMPLATE_ID}"
Path: /sitecore/templates/Branches/MyBranch
`);

    // $name child of the branch (the prototype root). template = T_LEAF.
    // Shared field TITLE carries a $name token that must resolve to the
    // user-provided branch root name (e.g. "Hello"), not to "$name" itself.
    const branchSubDir = join(branchesDir, 'MyBranch');
    mkdirSync(branchSubDir, { recursive: true });
    writeFileSync(join(branchSubDir, '$name.yml'), `---
ID: "{${SRC_NAME_CHILD_ID.toUpperCase()}}"
Parent: "{${BRANCH_ID.toUpperCase()}}"
Template: "{${T_LEAF_ID.toUpperCase()}}"
Path: /sitecore/templates/Branches/MyBranch/$name
SharedFields:
- ID: "${TITLE_FIELD_ID}"
  Hint: Title
  Value: "Welcome to $name"
`);

    // Descendant: SubItem under $name. template = T_LEAF. Shared field
    // OWNER carries a $name token that, with global override, must resolve
    // to the user-provided root name - NOT to "SubItem" (the descendant's
    // own name) which would happen if $name fell back to per-item resolution.
    const nameChildDir = join(branchSubDir, '$name');
    mkdirSync(nameChildDir, { recursive: true });
    writeFileSync(join(nameChildDir, 'SubItem.yml'), `---
ID: "{${SRC_SUB_ITEM_ID.toUpperCase()}}"
Parent: "{${SRC_NAME_CHILD_ID.toUpperCase()}}"
Template: "{${T_LEAF_ID.toUpperCase()}}"
Path: /sitecore/templates/Branches/MyBranch/$name/SubItem
SharedFields:
- ID: "${OWNER_FIELD_ID}"
  Hint: Owner
  Value: "$name's data"
`);

    const fixEngine = new Engine({ rootDir: fixDir });
    await fixEngine.init();

    return {
      dir: fixDir,
      engine: fixEngine,
      parentId: PARENT_ID,
      branchId: BRANCH_ID,
    };
  }
});
