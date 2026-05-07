import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { resolve } from 'path';
import { cpSync } from 'fs';
import { fileURLToPath } from 'url';
import { Engine } from '../../src/engine/index.js';
import { copyItem } from '../../src/engine/copy-item.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const FIXTURES = resolve(__dirname, '../fixtures/valid');
const REGISTRY_JSON = resolve(__dirname, '../fixtures/registry/test-registry.json');

describe('copyItem', () => {
  let tempDir: string;
  let engine: Engine;
  // SOURCE_ID: leaf "Description" item used by duplicate-item.test.ts.
  const SOURCE_ID = 'a1b2c3d4-e5f6-7890-abcd-000000000004';
  // ALT_PARENT_ID: "MyTemplate" - a different parent than SOURCE's parent
  // ("Data" = ...0002). MyTemplate already hosts Data + __Standard Values
  // children, so it's a valid host for new children, and no "Description"
  // collision exists at that level.
  const ALT_PARENT_ID = 'a1b2c3d4-e5f6-7890-abcd-000000000001';

  beforeEach(async () => {
    tempDir = await mkdtemp(resolve(tmpdir(), 'mockingbird-copy-'));
    cpSync(FIXTURES, tempDir, { recursive: true });
    engine = new Engine({ rootDir: tempDir, registryPath: REGISTRY_JSON });
    engine.startInit();
    await engine.readiness.ready();
  });
  afterEach(async () => {
    await engine.close();
    await rm(tempDir, { recursive: true, force: true });
  });

  it('copies to the picked destination and uses source.name when no collision', async () => {
    const source = engine.getItemById(SOURCE_ID)!;
    const altParent = engine.getItemById(ALT_PARENT_ID)!;
    const result = await copyItem(engine, {
      sourceId: SOURCE_ID,
      destinationParentId: ALT_PARENT_ID,
    });
    const copy = result.createdItems[0].item;
    expect(copy.parent).toBe(altParent.item.id);
    expect(copy.path).toBe(`${altParent.item.path}/${source.item.path.split('/').pop()}`);
    expect(copy.id).not.toBe(SOURCE_ID);
  });

  it('auto-renames to "Copy of <name>" when destination already has source.name', async () => {
    const source = engine.getItemById(SOURCE_ID)!;
    const baseName = source.item.path.split('/').pop()!;
    await copyItem(engine, { sourceId: SOURCE_ID, destinationParentId: ALT_PARENT_ID });
    const second = await copyItem(engine, { sourceId: SOURCE_ID, destinationParentId: ALT_PARENT_ID });
    expect(second.createdItems[0].item.path.endsWith(`/Copy of ${baseName}`)).toBe(true);
  });

  it('honors a caller-supplied name override', async () => {
    const result = await copyItem(engine, {
      sourceId: SOURCE_ID,
      destinationParentId: ALT_PARENT_ID,
      name: 'CustomName',
    });
    expect(result.createdItems[0].item.path.endsWith('/CustomName')).toBe(true);
  });

  it('refuses to copy a registry-only item', async () => {
    // Standard template is registry-only in the test-registry fixture.
    const REG_ID = '1930bbeb-7805-471a-a3be-4858ac7cf696';
    await expect(
      copyItem(engine, { sourceId: REG_ID, destinationParentId: ALT_PARENT_ID }),
    ).rejects.toThrow(/Cannot copy registry-only item/);
  });
});
