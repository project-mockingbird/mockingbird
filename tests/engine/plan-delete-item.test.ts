import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'fs/promises';
import { cpSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { Engine } from '../../src/engine/index.js';
import { planDeleteItem } from '../../src/engine/plan-delete-item.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const FIXTURES = resolve(__dirname, '../fixtures/valid');

describe('planDeleteItem', () => {
  let dir: string;
  let engine: Engine;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'mb-plan-delete-'));
    cpSync(FIXTURES, dir, { recursive: true });
    engine = new Engine({ rootDir: dir });
    await engine.init();
  });

  afterEach(async () => {
    await engine.close();
    await rm(dir, { recursive: true, force: true });
  });

  it('plans a delete with one file mutation per affected file', async () => {
    const tpl = await engine.createTemplate('PlanDeleteTpl1', '/sitecore/templates/Project/MyProject');
    const plan = await planDeleteItem(engine, tpl.item.id);
    expect(plan.files.length).toBeGreaterThan(0);
    expect(plan.files.every(f => f.op === 'delete')).toBe(true);
    expect(plan.summary).toContain('PlanDeleteTpl1');
  });

  it('returns no-op for unknown id', async () => {
    const plan = await planDeleteItem(engine, 'no-such-id');
    expect(plan.files).toHaveLength(0);
    expect(plan.warnings.some(w => w.includes('not found'))).toBe(true);
  });

  it('does not actually delete files (preview-only)', async () => {
    const tpl = await engine.createTemplate('PlanDeleteTpl2', '/sitecore/templates/Project/MyProject');
    const filePath = tpl.filePath;
    await planDeleteItem(engine, tpl.item.id);
    // file still exists
    await expect(readFile(filePath, 'utf-8')).resolves.toBeDefined();
  });
});
