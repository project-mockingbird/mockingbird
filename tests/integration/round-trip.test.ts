import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Engine } from '../../src/engine/index.js';
import { readFile, mkdtemp, rm } from 'fs/promises';
import { cpSync, existsSync } from 'fs';
import { resolve } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const VALID_FIXTURES = resolve(__dirname, '../fixtures/valid');
const REGISTRY_JSON = resolve(__dirname, '../fixtures/registry/test-registry.json');

describe('round-trip integration', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(resolve(tmpdir(), 'scp-integration-'));
    cpSync(VALID_FIXTURES, tempDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('creates a full template with section and fields, then validates', async () => {
    const engine = new Engine({ rootDir: tempDir });
    await engine.init();

    const template = await engine.createTemplate('Hero', '/sitecore/templates/Project/MyProject');
    expect(template.item.path).toBe('/sitecore/templates/Project/MyProject/Hero');

    const section = await engine.createSection('Content', template.item.path);
    expect(section.item.path).toBe('/sitecore/templates/Project/MyProject/Hero/Content');

    const heading = await engine.createField('Heading', section.item.path, 'Single-Line Text');
    const body = await engine.createField('Body', section.item.path, 'Rich Text');

    const result = engine.validate();
    expect(result.valid).toBe(true);

    expect(existsSync(template.filePath)).toBe(true);
    expect(existsSync(section.filePath)).toBe(true);
    expect(existsSync(heading.filePath)).toBe(true);
    expect(existsSync(body.filePath)).toBe(true);

    const templateYaml = await readFile(template.filePath, 'utf-8');
    expect(templateYaml).toContain('ID:');
    expect(templateYaml).toContain('Parent:');
    expect(templateYaml).toContain('Template:');
    expect(templateYaml).toContain('Path:');

    await engine.close();
  });

  it('detects validation errors in invalid items', async () => {
    const invalidFixtures = resolve(__dirname, '../fixtures/invalid');
    cpSync(invalidFixtures, resolve(tempDir, 'authoring/items/templates/Invalid'), { recursive: true });

    const engine = new Engine({ rootDir: tempDir });
    await engine.init();

    const result = engine.validate();
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);

    await engine.close();
  });
});

describe('registry integration', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(resolve(tmpdir(), 'scp-reg-integration-'));
    cpSync(VALID_FIXTURES, tempDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('validates a project referencing OOTB templates with registry loaded', async () => {
    const { writeFile: writeF, mkdir: mkdirF } = await import('fs/promises');

    const yaml = `---
ID: "ffffffff-ffff-ffff-ffff-ffffffffffff"
Parent: "b2c3d4e5-f6a7-8901-bcde-000000000000"
Template: "ab86861a-6030-46c5-b394-e8f99e8b87db"
Path: /sitecore/templates/Project/MyProject/MyRenderingParams
SharedFields:
- ID: "12c33f3f-86c5-43a5-aeb4-5598cec45116"
  Hint: __Base template
  Value: "{66AD4CA1-E325-4B76-A8FB-28F7A4A9E8B7}"
Languages:
- Language: en
  Versions:
  - Version: 1
    Fields:
    - ID: "25bed78c-4957-4165-998a-ca1b52f67497"
      Hint: __Created
      Value: 20260410T120000Z
`;
    const dir = resolve(tempDir, 'authoring/items/templates/MyRenderingParams');
    await mkdirF(dir, { recursive: true });
    await writeF(resolve(dir, 'MyRenderingParams.yml'), yaml);

    // Without registry — should report unresolved base template
    const engineNoReg = new Engine({ rootDir: tempDir });
    await engineNoReg.init();
    const resultNoReg = engineNoReg.validate();
    const unresolvedErrors = resultNoReg.errors.filter(
      e => e.rule === 'unresolved-base-template' && e.itemId === 'ffffffff-ffff-ffff-ffff-ffffffffffff'
    );
    expect(unresolvedErrors.length).toBeGreaterThan(0);
    await engineNoReg.close();

    // With registry — should pass (Rendering Parameters is in the registry)
    const engineWithReg = new Engine({ rootDir: tempDir, registryPath: REGISTRY_JSON });
    await engineWithReg.init();
    const resultWithReg = engineWithReg.validate();
    const unresolvedWithReg = resultWithReg.errors.filter(
      e => e.rule === 'unresolved-base-template' && e.itemId === 'ffffffff-ffff-ffff-ffff-ffffffffffff'
    );
    expect(unresolvedWithReg).toHaveLength(0);
    await engineWithReg.close();
  });
});
