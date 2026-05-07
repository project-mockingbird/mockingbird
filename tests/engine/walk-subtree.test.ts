import { describe, it, expect, beforeAll } from 'vitest';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { Engine } from '../../src/engine/index.js';
import { walkSubtree } from '../../src/engine/walk-subtree.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const FIXTURES = resolve(__dirname, '../fixtures/valid');

describe('walkSubtree', () => {
  let engine: Engine;
  beforeAll(async () => {
    engine = new Engine({ rootDir: FIXTURES });
    engine.startInit();
    await engine.readiness.ready();
  });

  it('returns empty array for unknown root id', () => {
    const result = walkSubtree(engine, '00000000-0000-0000-0000-000000000000');
    expect(result).toEqual([]);
  });

  it('includeRoot=true (default) returns root + descendants in pre-order', () => {
    const ROOT_ID = 'b2c3d4e5-f6a7-8901-bcde-000000000000';
    const result = walkSubtree(engine, ROOT_ID);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].id).toBe(ROOT_ID);
  });

  it('includeRoot=false returns descendants only (matches walkBranchSubtree shape)', () => {
    const ROOT_ID = 'b2c3d4e5-f6a7-8901-bcde-000000000000';
    const result = walkSubtree(engine, ROOT_ID, { includeRoot: false });
    // The fixture root must have at least one descendant; otherwise this test
    // proves nothing about the includeRoot:false contract. Assert loudly.
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].id).not.toBe(ROOT_ID);
  });

  it('breaks cycles via visited set', () => {
    const ROOT_ID = 'b2c3d4e5-f6a7-8901-bcde-000000000000';
    const result = walkSubtree(engine, ROOT_ID);
    const ids = result.map(i => i.id);
    // Need >1 node for the unique-set check to be meaningful.
    expect(ids.length).toBeGreaterThan(1);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
