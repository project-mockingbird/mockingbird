import { describe, it, expect, vi } from 'vitest';
import { scanDirectory } from '../../src/engine/scanner.js';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { mkdtemp, writeFile, mkdir, rm } from 'fs/promises';
import { tmpdir } from 'os';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const FIXTURES = resolve(__dirname, '../fixtures/valid');

describe('scanDirectory', () => {
  it('scans a directory and returns an ItemTree with all items', async () => {
    const tree = await scanDirectory(FIXTURES);
    const allNodes = tree.getAllNodes();
    // Fixture has: TemplatesRoot, Project folder, MyProject folder, MyTemplate, Data section, Title field, Description field, __Standard Values, MyRendering, MyRenderingWithParams
    expect(allNodes.length).toBe(10);
  });

  it('correctly parses template item', async () => {
    const tree = await scanDirectory(FIXTURES);
    const template = tree.getById('a1b2c3d4-e5f6-7890-abcd-000000000001');
    expect(template).toBeDefined();
    expect(template!.item.path).toBe('/sitecore/templates/Project/MyProject/MyTemplate');
  });

  it('establishes parent-child relationships', async () => {
    const tree = await scanDirectory(FIXTURES);
    const template = tree.getById('a1b2c3d4-e5f6-7890-abcd-000000000001')!;
    // Template has children: Data section and __Standard Values
    expect(template.children.size).toBe(2);
  });

  it('assigns module namespace to items', async () => {
    const tree = await scanDirectory(FIXTURES);
    const template = tree.getById('a1b2c3d4-e5f6-7890-abcd-000000000001')!;
    expect(template.module).toBe('Project.MyProject');
  });

  it('resolves items under sitecore.json defaultModuleRelativeSerializationPath when module omits items.path', async () => {
    const fixture = resolve(__dirname, '../fixtures/valid-default-serialization-path');
    const tree = await scanDirectory(fixture);
    const item = tree.getById('c0ffee01-0000-0000-0000-000000000001');
    expect(item).toBeDefined();
    expect(item!.item.path).toBe('/sitecore/templates/Project/Demo/DemoTemplate');
  });
});

describe('scanDirectory - non-item documents', () => {
  it('skips Role-shaped files and emits a summary log naming the first key', async () => {
    const tempRoot = await mkdtemp(resolve(tmpdir(), 'mockingbird-scan-'));
    const itemsDir = resolve(tempRoot, 'items');
    await mkdir(itemsDir, { recursive: true });

    // One real Item file.
    await writeFile(
      resolve(itemsDir, 'good.yml'),
      `---
ID: "11111111-2222-3333-4444-555555555555"
Parent: "00000000-0000-0000-0000-000000000000"
Template: "ab86861a-6030-46c5-b394-e8f99e8b87db"
Path: /sitecore/test/Good
`,
      'utf-8',
    );

    // One Role-shaped file (no ID).
    await writeFile(
      resolve(itemsDir, 'editor.yml'),
      `---
Role: editor
Description: not an Item
`,
      'utf-8',
    );

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const tree = await scanDirectory(tempRoot);
      const allNodes = tree.getAllNodes();
      expect(allNodes.length).toBe(1);
      expect(allNodes[0].item.id).toBe('11111111-2222-3333-4444-555555555555');

      const summaryCall = logSpy.mock.calls.find((args) =>
        typeof args[0] === 'string' && args[0].includes('skipped') && args[0].includes('non-item'),
      );
      expect(summaryCall).toBeDefined();
      expect(summaryCall![0]).toContain('Role(1)');
    } finally {
      logSpy.mockRestore();
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
