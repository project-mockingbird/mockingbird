import { describe, it, expect } from 'vitest';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { discoverModules } from '../../src/engine/module-config.js';
import { Engine } from '../../src/engine/index.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const FIXTURE_ROOT = resolve(__dirname, '../fixtures/valid');

describe('sitecore.json-driven path resolution', () => {
  it('discoverModules anchors module paths to the dir containing sitecore.json', async () => {
    const modules = await discoverModules(FIXTURE_ROOT);
    expect(modules.length).toBeGreaterThan(0);
    for (const mod of modules) {
      expect(mod.filePath).toMatch(/[\\/]authoring[\\/]items[\\/]/);
      expect(mod.filePath.startsWith(FIXTURE_ROOT)).toBe(true);
    }
  });

  it('Engine boots from any rootDir where sitecore.json + modules colocate (not just /app/data)', async () => {
    const engine = new Engine({ rootDir: FIXTURE_ROOT, watch: false });
    await engine.startInit();
    await engine.readiness.ready();
    expect(engine.getAllItems().length).toBeGreaterThan(0);
    await engine.close();
  });
});
