import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import { cpSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { Engine } from '../../src/engine/index.js';
import { planUpdateFields } from '../../src/engine/plan-update-fields.js';
import { FIELD_IDS } from '../../src/engine/constants.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const FIXTURES = resolve(__dirname, '../fixtures/valid');

describe('planUpdateFields', () => {
  let dir: string;
  let engine: Engine;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'mb-plan-'));
    cpSync(FIXTURES, dir, { recursive: true });
    engine = new Engine({ rootDir: dir });
    await engine.init();
  });

  afterEach(async () => {
    await engine.close();
    await rm(dir, { recursive: true, force: true });
  });

  it('produces a plan with one file mutation for a single field update', async () => {
    const node = await engine.createTemplate('PlanFooTpl', '/sitecore/templates/Project/MyProject');
    const plan = await planUpdateFields(engine, node.item.id,
      { [FIELD_IDS.created]: '20260101T000000Z' }, 'en', 1);
    expect(plan.files).toHaveLength(1);
    expect(plan.files[0].op).toBe('update');
    expect(plan.files[0].path).toBe(node.filePath);
    expect(plan.files[0].before).not.toBe(plan.files[0].after);
    expect(plan.summary).toContain('1 field');
  });

  it('returns no-op plan (empty files array) when fields dict is empty', async () => {
    const plan = await planUpdateFields(engine, 'nonexistent-id', {}, 'en', 1);
    expect(plan.files).toHaveLength(0);
    expect(plan.warnings).toContain('No fields provided');
  });

  it('records a warning if the item id is not found', async () => {
    const plan = await planUpdateFields(engine, 'no-such-id', { x: 'y' }, 'en', 1);
    expect(plan.files).toHaveLength(0);
    expect(plan.warnings.some(w => w.includes('not found'))).toBe(true);
  });
});
