import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Engine } from '../../../src/engine/index.js';
import {
  discoverTenantDefinitions,
  discoverSiteDefinitions,
} from '../../../src/engine/scaffolding/definition-items.js';

async function buildEmptyEngine(): Promise<{ engine: Engine; cleanup: () => void }> {
  const fixDir = mkdtempSync(join(tmpdir(), 'mb-defs-'));
  writeFileSync(join(fixDir, 'sitecore.json'), JSON.stringify({ modules: ['*.module.json'] }));
  writeFileSync(join(fixDir, 'mod.module.json'), JSON.stringify({
    namespace: 'mod',
    items: { includes: [{ name: 'content', path: '/sitecore/content' }] },
  }));
  mkdirSync(join(fixDir, 'content'), { recursive: true });
  const engine = new Engine({ rootDir: fixDir });
  await engine.init();
  return { engine, cleanup: () => rmSync(fixDir, { recursive: true, force: true }) };
}

describe('discoverTenantDefinitions', () => {
  it('returns empty list when registry + tree contain no setup-typed items', async () => {
    const { engine, cleanup } = await buildEmptyEngine();
    try {
      const list = await discoverTenantDefinitions(engine);
      expect(list).toEqual([]);
    } finally {
      cleanup();
    }
  });
});

describe('discoverSiteDefinitions', () => {
  it('returns empty list when registry + tree contain no setup-typed items', async () => {
    const { engine, cleanup } = await buildEmptyEngine();
    try {
      const list = await discoverSiteDefinitions(engine);
      expect(list).toEqual([]);
    } finally {
      cleanup();
    }
  });
});
