import { describe, it, expect, vi } from 'vitest';
import { Engine } from '../../src/engine/index.js';
import { resolve, resolve as resolvePath } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const FIXTURES = resolve(__dirname, '../fixtures/valid');

const __dirname2 = fileURLToPath(new URL('.', import.meta.url));
const REGISTRY_JSON = resolvePath(__dirname2, '../fixtures/registry/test-registry.json');

describe('Engine', () => {
  it('initializes by scanning a directory and building the tree', async () => {
    const engine = new Engine({ rootDir: FIXTURES });
    await engine.init();
    expect(engine.getAllItems()).toHaveLength(10);
    await engine.close();
  });

  it('validates the item tree', async () => {
    const engine = new Engine({ rootDir: FIXTURES });
    await engine.init();
    const result = engine.validate();
    expect(result.valid).toBe(true);
    await engine.close();
  });

  it('gets an item by ID', async () => {
    const engine = new Engine({ rootDir: FIXTURES });
    await engine.init();
    const node = engine.getItemById('a1b2c3d4-e5f6-7890-abcd-000000000001');
    expect(node).toBeDefined();
    expect(node!.item.path).toContain('MyTemplate');
    await engine.close();
  });

  it('gets an item by path', async () => {
    const engine = new Engine({ rootDir: FIXTURES });
    await engine.init();
    const node = engine.getItemByPath('/sitecore/templates/Project/MyProject/MyTemplate');
    expect(node).toBeDefined();
    expect(node!.item.id).toBe('a1b2c3d4-e5f6-7890-abcd-000000000001');
    await engine.close();
  });

  it('creates a new template with standard values', async () => {
    const { mkdtemp, rm } = await import('fs/promises');
    const { cpSync, existsSync } = await import('fs');
    const { tmpdir } = await import('os');
    const tempDir = await mkdtemp(resolve(tmpdir(), 'scp-test-'));
    cpSync(FIXTURES, tempDir, { recursive: true });

    const engine = new Engine({ rootDir: tempDir });
    await engine.init();

    const templateNode = await engine.createTemplate('NewTemplate', '/sitecore/templates/Project/MyProject');
    expect(templateNode.item.path).toBe('/sitecore/templates/Project/MyProject/NewTemplate');
    expect(templateNode.item.template).toBe('ab86861a-6030-46c5-b394-e8f99e8b87db');
    expect(existsSync(templateNode.filePath)).toBe(true);

    await engine.close();
    await rm(tempDir, { recursive: true, force: true });
  });
});

describe('Engine with registry', () => {
  it('loads registry and uses it for validation', async () => {
    const { mkdtemp, rm } = await import('fs/promises');
    const { cpSync } = await import('fs');
    const { tmpdir } = await import('os');
    const tempDir = await mkdtemp(resolvePath(tmpdir(), 'scp-reg-test-'));
    cpSync(FIXTURES, tempDir, { recursive: true });

    const engine = new Engine({ rootDir: tempDir, registryPath: REGISTRY_JSON });
    await engine.init();

    expect(engine.isRegistryLoaded()).toBe(true);
    expect(engine.registrySize()).toBeGreaterThan(0);

    await engine.close();
    await rm(tempDir, { recursive: true, force: true });
  });

  it('validates successfully when base template is in registry', async () => {
    const { mkdtemp, rm, writeFile: writeF, mkdir: mkdirF } = await import('fs/promises');
    const { cpSync } = await import('fs');
    const { tmpdir } = await import('os');
    const tempDir = await mkdtemp(resolvePath(tmpdir(), 'scp-reg-test-'));
    cpSync(FIXTURES, tempDir, { recursive: true });

    const templateYaml = `---
ID: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee"
Parent: "b2c3d4e5-f6a7-8901-bcde-000000000000"
Template: "ab86861a-6030-46c5-b394-e8f99e8b87db"
Path: /sitecore/templates/Project/MyProject/RegistryTest
SharedFields:
- ID: "12c33f3f-86c5-43a5-aeb4-5598cec45116"
  Hint: __Base template
  Value: "{AAAAAAAA-BBBB-CCCC-DDDD-111111111111}"
`;
    const dir = resolvePath(tempDir, 'authoring/items/templates/RegistryTest');
    await mkdirF(dir, { recursive: true });
    await writeF(resolvePath(dir, 'RegistryTest.yml'), templateYaml);

    const engine = new Engine({ rootDir: tempDir, registryPath: REGISTRY_JSON });
    await engine.init();

    const result = engine.validate();
    const baseTemplateErrors = result.errors.filter(e => e.rule === 'unresolved-base-template' && e.itemId === 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee');
    expect(baseTemplateErrors).toHaveLength(0);

    await engine.close();
    await rm(tempDir, { recursive: true, force: true });
  });

  it('works without registry (graceful degradation)', async () => {
    const engine = new Engine({ rootDir: FIXTURES });
    await engine.init();
    expect(engine.isRegistryLoaded()).toBe(false);
    const result = engine.validate();
    expect(result).toBeDefined();
    await engine.close();
  });
});

describe('Engine - orphan classification at startup', () => {
  it('logs registry-parented and truly-broken orphans separately', async () => {
    const { mkdtemp, writeFile, mkdir, rm } = await import('fs/promises');
    const { tmpdir } = await import('os');

    const tempRoot = await mkdtemp(resolve(tmpdir(), 'mockingbird-orphan-'));
    const itemsDir = resolve(tempRoot, 'items');
    await mkdir(itemsDir, { recursive: true });

    // Item rooted under a registry-known parent (Standard template GUID is
    // present in the test-registry.json fixture).
    await writeFile(
      resolve(itemsDir, 'registry-parented.yml'),
      `---
ID: "11111111-1111-1111-1111-111111111111"
Parent: "1930bbeb-7805-471a-a3be-4858ac7cf696"
Template: "ab86861a-6030-46c5-b394-e8f99e8b87db"
Path: /sitecore/templates/RegistryParented
`,
      'utf-8',
    );

    // Item with a fabricated parent GUID that exists in NEITHER fixtures NOR
    // the test registry - should classify as truly broken.
    await writeFile(
      resolve(itemsDir, 'truly-broken.yml'),
      `---
ID: "22222222-2222-2222-2222-222222222222"
Parent: "deadbeef-dead-dead-dead-deadbeefdead"
Template: "ab86861a-6030-46c5-b394-e8f99e8b87db"
Path: /sitecore/templates/TrulyBroken
`,
      'utf-8',
    );

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      const engine = new Engine({ rootDir: tempRoot, registryPath: REGISTRY_JSON });
      await engine.init();
      await engine.close();

      const registryParentedCall = logSpy.mock.calls.find(
        (args) =>
          typeof args[0] === 'string' &&
          args[0].includes('rooted under registry parents'),
      );
      expect(registryParentedCall?.[0]).toContain('rooted under registry parents');
      expect(registryParentedCall?.[0]).toContain('1 item(s)');

      const trulyBrokenSummaryCall = warnSpy.mock.calls.find(
        (args) =>
          typeof args[0] === 'string' &&
          args[0].includes('reference parents that exist in neither'),
      );
      expect(trulyBrokenSummaryCall?.[0]).toContain('reference parents that exist in neither');
      expect(trulyBrokenSummaryCall?.[0]).toContain('1 item(s)');

      const trulyBrokenPathCall = warnSpy.mock.calls.find(
        (args) =>
          typeof args[0] === 'string' &&
          args[0].includes('/sitecore/templates/TrulyBroken') &&
          args[0].includes('deadbeef'),
      );
      expect(trulyBrokenPathCall).toBeDefined();
    } finally {
      logSpy.mockRestore();
      warnSpy.mockRestore();
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
