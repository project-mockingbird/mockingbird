import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, stat, readdir } from 'fs/promises';
import { cpSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { Engine } from '../../src/engine/index.js';
import { planCreateItem } from '../../src/engine/plan-create-item.js';

async function listFilesRecursive(dir: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      out.push(...await listFilesRecursive(full));
    } else {
      out.push(full);
    }
  }
  return out.sort();
}

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const FIXTURES = resolve(__dirname, '../fixtures/valid');

describe('planCreateItem', () => {
  let dir: string;
  let engine: Engine;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'mb-plan-create-'));
    cpSync(FIXTURES, dir, { recursive: true });
    engine = new Engine({ rootDir: dir });
    await engine.init();
  });

  afterEach(async () => {
    await engine.close();
    await rm(dir, { recursive: true, force: true });
  });

  it('plans a template creation without writing files', async () => {
    const plan = await planCreateItem(engine, {
      type: 'template',
      name: 'PlanCreateTpl',
      parentPath: '/sitecore/templates/Project/MyProject',
    });
    expect(plan.files.length).toBeGreaterThan(0);
    expect(plan.files.every(f => f.op === 'create')).toBe(true);
    expect(plan.summary).toContain('PlanCreateTpl');
    // Verify nothing was written
    for (const fm of plan.files) {
      await expect(stat(fm.path)).rejects.toThrow();
    }
  });

  it('records a warning if parent path does not exist', async () => {
    const plan = await planCreateItem(engine, {
      type: 'template',
      name: 'X',
      parentPath: '/nope',
    });
    expect(plan.files).toHaveLength(0);
    expect(plan.warnings.some(w => w.includes('Parent'))).toBe(true);
  });

  it('plans a section creation', async () => {
    const tpl = await engine.createTemplate('PlanCreateSecHost', '/sitecore/templates/Project/MyProject');
    const plan = await planCreateItem(engine, {
      type: 'section',
      name: 'Data',
      parentPath: tpl.item.path,
    });
    expect(plan.files).toHaveLength(1);
    expect(plan.files[0].op).toBe('create');
    expect(plan.files[0].after).toContain('Data');
  });

  it('refuses to preview duplicate (writes-via-writeAtomic bypass _recording)', async () => {
    // Source = MyTemplate from the fixture content tree.
    const SOURCE_ID = 'a1b2c3d4-e5f6-7890-abcd-000000000001';
    const before = await listFilesRecursive(dir);

    const plan = await planCreateItem(engine, {
      type: 'duplicate',
      name: 'DupCopy',
      sourceId: SOURCE_ID,
    });

    expect(plan.files).toHaveLength(0);
    expect(plan.warnings.length).toBeGreaterThan(0);
    expect(plan.warnings[0].toLowerCase()).toContain('duplicate');

    // Critical: the disk must be untouched. If any new file appeared we
    // leaked a write past the recording sandbox.
    const after = await listFilesRecursive(dir);
    expect(after).toEqual(before);
  });

  it('refuses to preview fromTemplate when the template is a branch template (cannot guarantee no disk writes)', async () => {
    // Build a fixture branch template inline. Per Sitecore: a branch template
    // is any item whose own `template` field equals BRANCH_TEMPLATE_ID
    // (35e75c72-4985-4e09-88c3-0eac6cd1e64f).
    const { writeFile, mkdir } = await import('fs/promises');
    const branchTplId = 'dddddddd-eeee-ffff-0000-111111111111';
    const branchChildId = 'cccccccc-dddd-eeee-ffff-222222222222';
    const branchDir = resolve(dir, 'authoring/items/templates/MyProject/PreviewBranch');
    await mkdir(branchDir, { recursive: true });
    await writeFile(resolve(branchDir, 'PreviewBranch.yml'), `---
ID: "${branchTplId}"
Parent: "b2c3d4e5-f6a7-8901-bcde-000000000000"
Template: "35e75c72-4985-4e09-88c3-0eac6cd1e64f"
Path: /sitecore/templates/Project/MyProject/PreviewBranch
`, 'utf-8');
    await writeFile(resolve(branchDir, '$name.yml'), `---
ID: "${branchChildId}"
Parent: "${branchTplId}"
Template: "ab86861a-6030-46c5-b394-e8f99e8b87db"
Path: /sitecore/templates/Project/MyProject/PreviewBranch/$name
`, 'utf-8');

    // Re-init engine so it picks up the branch template fixture.
    await engine.close();
    engine = new Engine({ rootDir: dir });
    await engine.init();

    const before = await listFilesRecursive(dir);

    const plan = await planCreateItem(engine, {
      type: 'fromTemplate',
      name: 'PreviewBranchInstance',
      parentPath: '/sitecore/templates/Project/MyProject',
      templateId: branchTplId,
    });

    expect(plan.files).toHaveLength(0);
    expect(plan.warnings.length).toBeGreaterThan(0);
    expect(plan.warnings[0].toLowerCase()).toContain('branch');

    // Critical: no leaked writes.
    const after = await listFilesRecursive(dir);
    expect(after).toEqual(before);
  });

  it('isolates concurrent recordings via tokens', async () => {
    // Two beginRecording calls in flight simultaneously must not corrupt
    // each other's captured writes. The earlier boolean+array pair would
    // wipe the first frame's buffer when the second one started.
    const tokenA = engine.beginRecording();
    // Trigger one write on tokenA's frame.
    await engine.writeItemFile({
      id: '11111111-1111-1111-1111-aaaaaaaaaaaa',
      parent: 'b2c3d4e5-f6a7-8901-bcde-000000000000',
      template: 'ab86861a-6030-46c5-b394-e8f99e8b87db',
      path: '/sitecore/templates/Project/MyProject/A1',
      sharedFields: [], languages: [],
    });

    const tokenB = engine.beginRecording();
    // Two writes on tokenB's frame.
    await engine.writeItemFile({
      id: '22222222-2222-2222-2222-bbbbbbbbbbbb',
      parent: 'b2c3d4e5-f6a7-8901-bcde-000000000000',
      template: 'ab86861a-6030-46c5-b394-e8f99e8b87db',
      path: '/sitecore/templates/Project/MyProject/B1',
      sharedFields: [], languages: [],
    });
    await engine.writeItemFile({
      id: '33333333-3333-3333-3333-cccccccccccc',
      parent: 'b2c3d4e5-f6a7-8901-bcde-000000000000',
      template: 'ab86861a-6030-46c5-b394-e8f99e8b87db',
      path: '/sitecore/templates/Project/MyProject/B2',
      sharedFields: [], languages: [],
    });

    // End B first (LIFO; B is the topmost). Should yield exactly its 2 writes.
    const writesB = engine.endRecording(tokenB);
    expect(writesB).toHaveLength(2);
    expect(writesB.map(w => w.path).join('|')).toMatch(/B1\.yml.*B2\.yml/);

    // tokenA should still hold its single write, untouched by B's lifecycle.
    const writesA = engine.endRecording(tokenA);
    expect(writesA).toHaveLength(1);
    expect(writesA[0].path).toContain('A1.yml');

    // No cross-pollination: each recording's captured paths are disjoint.
    const aPaths = new Set(writesA.map(w => w.path));
    const bPaths = new Set(writesB.map(w => w.path));
    for (const p of bPaths) expect(aPaths.has(p)).toBe(false);
  });
});
