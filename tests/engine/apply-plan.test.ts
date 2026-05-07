import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile, stat } from 'fs/promises';
import { cpSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { Engine } from '../../src/engine/index.js';
import { applyPlan } from '../../src/engine/apply-plan.js';
import type { MutationPlan } from '../../src/engine/mutation-plan.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const FIXTURES = resolve(__dirname, '../fixtures/valid');

describe('applyPlan', () => {
  let dir: string;
  let engine: Engine;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'mb-apply-'));
    cpSync(FIXTURES, dir, { recursive: true });
    engine = new Engine({ rootDir: dir });
    await engine.init();
  });

  afterEach(async () => {
    await engine.close();
    await rm(dir, { recursive: true, force: true });
  });

  it('writes the after-content for an update file mutation', async () => {
    const target = join(dir, 'apply-plan-update.yml');
    await writeFile(target, 'old\n');
    const plan: MutationPlan = {
      files: [{ path: target, before: 'old\n', after: 'new\n', op: 'update' }],
      summary: 'test',
      warnings: [],
    };
    await applyPlan(engine, plan);
    expect(await readFile(target, 'utf-8')).toBe('new\n');
  });

  it('removes the file for a delete mutation', async () => {
    const target = join(dir, 'apply-plan-doomed.yml');
    await writeFile(target, 'bye\n');
    const plan: MutationPlan = {
      files: [{ path: target, before: 'bye\n', after: '', op: 'delete' }],
      summary: 'test',
      warnings: [],
    };
    await applyPlan(engine, plan);
    await expect(stat(target)).rejects.toThrow();
  });

  it('creates the file for a create mutation', async () => {
    const target = join(dir, 'apply-plan-new.yml');
    const plan: MutationPlan = {
      files: [{ path: target, before: '', after: 'hello\n', op: 'create' }],
      summary: 'test',
      warnings: [],
    };
    await applyPlan(engine, plan);
    expect(await readFile(target, 'utf-8')).toBe('hello\n');
  });

  it('is a no-op when files array is empty', async () => {
    const plan: MutationPlan = { files: [], summary: 'noop', warnings: [] };
    await expect(applyPlan(engine, plan)).resolves.toBeUndefined();
  });

  it('a delete also removes the item\'s wrapping children directory recursively', async () => {
    // SCS sibling-style layout: item lives at <stem>.yml, children inside <stem>/.
    const itemFile = join(dir, 'wrapping-test.yml');
    const wrappingDir = join(dir, 'wrapping-test');
    await writeFile(itemFile, 'parent\n');
    await mkdir(join(wrappingDir, 'a', 'b'), { recursive: true });
    await writeFile(join(wrappingDir, 'a', 'A.yml'), 'a\n');
    await writeFile(join(wrappingDir, 'a', 'b', 'B.yml'), 'b\n');

    const plan: MutationPlan = {
      files: [{ path: itemFile, before: 'parent\n', after: '', op: 'delete' }],
      summary: 'test',
      warnings: [],
    };
    await applyPlan(engine, plan);
    await expect(stat(itemFile)).rejects.toThrow();
    await expect(stat(wrappingDir)).rejects.toThrow();
  });

  it('a delete cleans up orphan files left in the wrapping directory', async () => {
    // Models the residue from a buggy move where a descendant YAML's on-disk
    // location no longer matches its in-memory tree position. The delete
    // plan only includes paths the in-memory walker found, but the wrapping
    // directory cleanup catches the orphan anyway.
    const itemFile = join(dir, 'orphan-test.yml');
    const wrappingDir = join(dir, 'orphan-test');
    await writeFile(itemFile, 'parent\n');
    await mkdir(join(wrappingDir, 'Data'), { recursive: true });
    // Orphan: looks like an item but isn't in the deletion plan.
    await writeFile(join(wrappingDir, 'Data', 'orphan.yml'), 'orphan\n');

    const plan: MutationPlan = {
      files: [{ path: itemFile, before: 'parent\n', after: '', op: 'delete' }],
      summary: 'test',
      warnings: [],
    };
    await applyPlan(engine, plan);
    await expect(stat(join(wrappingDir, 'Data', 'orphan.yml'))).rejects.toThrow();
    await expect(stat(wrappingDir)).rejects.toThrow();
  });

  it('a delete does not fail when there is no wrapping directory (leaf item)', async () => {
    const itemFile = join(dir, 'leaf-test.yml');
    await writeFile(itemFile, 'leaf\n');
    const plan: MutationPlan = {
      files: [{ path: itemFile, before: 'leaf\n', after: '', op: 'delete' }],
      summary: 'test',
      warnings: [],
    };
    await expect(applyPlan(engine, plan)).resolves.toBeUndefined();
    await expect(stat(itemFile)).rejects.toThrow();
  });
});
