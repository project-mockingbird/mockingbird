import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Engine } from '../../../src/engine/index.js';
import { scaffoldHeadlessTenant } from '../../../src/engine/scaffolding/tenant-orchestrator.js';

async function buildEmptyEngine() {
  const fixDir = mkdtempSync(join(tmpdir(), 'mb-tenant-orch-'));
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

describe('scaffoldHeadlessTenant - input validation', () => {
  it('rejects when tenantLocation is not /sitecore/content', async () => {
    const { engine, cleanup } = await buildEmptyEngine();
    try {
      await expect(
        scaffoldHeadlessTenant(engine, {
          tenantLocation: '/sitecore/templates',
          tenantName: 'X',
          definitionItemIds: ['00000000-0000-0000-0000-000000000000'],
        }),
      ).rejects.toThrow(/under \/sitecore\/content/);
    } finally {
      cleanup();
    }
  });

  it('throws ScaffoldError when /sitecore/content parent is missing from tree', async () => {
    const { engine, cleanup } = await buildEmptyEngine();
    try {
      // Empty fixture has no /sitecore/content node, so parent-not-found fires.
      await expect(
        scaffoldHeadlessTenant(engine, {
          tenantLocation: '/sitecore/content',
          tenantName: 'X',
          definitionItemIds: ['00000000-0000-0000-0000-000000000000'],
        }),
      ).rejects.toThrow(/Parent not found/);
    } finally {
      cleanup();
    }
  });
});
