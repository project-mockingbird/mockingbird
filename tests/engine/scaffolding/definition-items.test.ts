import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Engine } from '../../../src/engine/index.js';
import {
  discoverTenantDefinitions,
  discoverSiteDefinitions,
} from '../../../src/engine/scaffolding/definition-items.js';
import { CURATED_TENANT_DEFINITIONS, CURATED_SITE_DEFINITIONS } from '../../../src/engine/scaffolding/curated-definitions.js';

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
  it('returns curated definitions when registry + tree are empty', async () => {
    const { engine, cleanup } = await buildEmptyEngine();
    try {
      const list = await discoverTenantDefinitions(engine);
      expect(list.length).toBe(CURATED_TENANT_DEFINITIONS.length);
      expect(list.find(d => d.name === 'Empty Headless Tenant')).toBeDefined();
      expect(list.every(d => d.source === 'curated')).toBe(true);
    } finally {
      cleanup();
    }
  });

  it('filters out IsSystemModule (not visible in dialog)', async () => {
    const { engine, cleanup } = await buildEmptyEngine();
    try {
      const list = await discoverTenantDefinitions(engine);
      expect(list.every(d => !d.isSystemModule)).toBe(true);
    } finally {
      cleanup();
    }
  });
});

describe('discoverSiteDefinitions', () => {
  it('returns curated site definitions on a fresh install', async () => {
    const { engine, cleanup } = await buildEmptyEngine();
    try {
      const list = await discoverSiteDefinitions(engine);
      expect(list.find(d => d.name === 'Empty Headless Site')).toBeDefined();
      expect(list.every(d => d.source === 'curated')).toBe(true);
      expect(list.length).toBe(CURATED_SITE_DEFINITIONS.length);
    } finally {
      cleanup();
    }
  });
});
