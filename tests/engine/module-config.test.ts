import { describe, it, expect } from 'vitest';
import { loadProjectConfig, loadModuleConfig, discoverModules } from '../../src/engine/module-config.js';
import { resolve } from 'path';

// Use import.meta.url for ESM __dirname
import { fileURLToPath } from 'url';
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const FIXTURES = resolve(__dirname, '../fixtures/valid');

describe('loadProjectConfig', () => {
  it('parses sitecore.json', async () => {
    const config = await loadProjectConfig(resolve(FIXTURES, 'sitecore.json'));
    expect(config.modules).toEqual(['authoring/items/**/*.module.json']);
  });
});

describe('loadModuleConfig', () => {
  it('parses a *.module.json file', async () => {
    const config = await loadModuleConfig(resolve(FIXTURES, 'authoring/items/Content.module.json'));
    expect(config.namespace).toBe('Project.MyProject');
    expect(config.items.includes).toHaveLength(2);
    expect(config.items.includes[0].name).toBe('templates');
    expect(config.items.includes[0].path).toBe('/sitecore/templates/Project/MyProject');
  });
});

describe('discoverModules', () => {
  it('discovers module files from sitecore.json globs', async () => {
    const modules = await discoverModules(FIXTURES);
    expect(modules).toHaveLength(1);
    expect(modules[0].namespace).toBe('Project.MyProject');
  });

  it('propagates sitecore.json defaultModuleRelativeSerializationPath into modules that do not set their own items.path', async () => {
    const modules = await discoverModules(
      resolve(__dirname, '../fixtures/valid-default-serialization-path'),
    );
    expect(modules).toHaveLength(1);
    expect(modules[0].items.path).toBe('items');
  });

  it('does not override an explicit module items.path with the project default', async () => {
    const modules = await discoverModules(
      resolve(__dirname, '../fixtures/valid-default-serialization-path-with-override'),
    );
    expect(modules).toHaveLength(1);
    expect(modules[0].items.path).toBe('serialization');
  });
});
