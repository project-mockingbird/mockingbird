import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Engine } from '../../../src/engine/index.js';
import { getSourceTemplateIds } from '../../../src/engine/scaffolding/tenant-templates.js';
import type { DefinitionItem } from '../../../src/engine/scaffolding/types.js';

async function buildEmptyEngine() {
  const fixDir = mkdtempSync(join(tmpdir(), 'mb-tenant-tpl-'));
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

describe('getSourceTemplateIds', () => {
  it('returns empty array when no definitions provided', async () => {
    const { engine, cleanup } = await buildEmptyEngine();
    try {
      expect(getSourceTemplateIds(engine, [])).toEqual([]);
    } finally {
      cleanup();
    }
  });

  it('returns empty array when definitions have no EditTenantTemplate actions', async () => {
    const { engine, cleanup } = await buildEmptyEngine();
    try {
      const defs: DefinitionItem[] = [{
        id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        path: '/x', name: 'X', isSystemModule: false, includeByDefault: true,
        includeIfInstalled: [], hasChildren: false, source: 'tree',
        actions: [{ kind: 'AddItem', locationPrototypeId: 'p', templateId: 't', name: 'n', fieldUpdates: [] }],
      }];
      expect(getSourceTemplateIds(engine, defs)).toEqual([]);
    } finally {
      cleanup();
    }
  });
});
