import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Engine } from '../../src/engine/index.js';
import { walkSubtree } from '../../src/engine/walk-subtree.js';

/**
 * Builds an Engine with an inline registry (one branch + two descendants)
 * via the registry's loadFromJson public path. The registry's items are
 * NOT in the user's tree, so walkSubtree must fall back to registry to
 * find them.
 */
async function buildRegistryFixtureEngine(): Promise<{ engine: Engine; cleanup: () => void; ids: { branch: string; child: string; grandchild: string } }> {
  const fixDir = mkdtempSync(join(tmpdir(), 'mb-walk-registry-'));

  writeFileSync(join(fixDir, 'sitecore.json'), JSON.stringify({ modules: ['*.module.json'] }));
  writeFileSync(join(fixDir, 'mod.module.json'), JSON.stringify({
    namespace: 'mod',
    items: { includes: [{ name: 'content', path: '/sitecore/content' }] },
  }));
  // Empty content dir so the engine has something to scan but no items.
  mkdirSync(join(fixDir, 'content'), { recursive: true });

  const branch = '11111111-1111-1111-1111-111111111111';
  const child = '22222222-2222-2222-2222-222222222222';
  const grandchild = '33333333-3333-3333-3333-333333333333';

  const registryPath = join(fixDir, 'registry.json');
  writeFileSync(registryPath, JSON.stringify({
    version: '1.0',
    source: 'test',
    extractedAt: new Date().toISOString(),
    items: [
      {
        id: branch,
        name: 'TestBranch',
        parent: '00000000-0000-0000-0000-000000000000',
        template: 'AB86861A-6030-46C5-B394-E8F99E8B87DB',
        path: '/sitecore/templates/Branches/TestBranch',
        database: 'master',
        sharedFields: {},
      },
      {
        id: child,
        name: '$name',
        parent: branch,
        template: 'AB86861A-6030-46C5-B394-E8F99E8B87DB',
        path: '/sitecore/templates/Branches/TestBranch/$name',
        database: 'master',
        sharedFields: { 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa': 'shared-val' },
      },
      {
        id: grandchild,
        name: 'Sub',
        parent: child,
        template: 'AB86861A-6030-46C5-B394-E8F99E8B87DB',
        path: '/sitecore/templates/Branches/TestBranch/$name/Sub',
        database: 'master',
        sharedFields: {},
      },
    ],
  }));

  const engine = new Engine({ rootDir: fixDir, registryPath });
  await engine.init();

  return {
    engine,
    cleanup: () => rmSync(fixDir, { recursive: true, force: true }),
    ids: { branch, child, grandchild },
  };
}

describe('walkSubtree - registry fallback', () => {
  it('walks a registry-resident subtree when the root is not in the tree', async () => {
    const { engine, cleanup, ids } = await buildRegistryFixtureEngine();
    try {
      // Pre-condition: the branch is in the registry, NOT in the tree.
      expect(engine.getItemById(ids.branch)).toBeUndefined();
      expect(engine.getRegistryItem(ids.branch)).toBeDefined();

      const walked = walkSubtree(engine, ids.branch, { includeRoot: false });
      const walkedIds = walked.map(i => i.id);
      expect(walkedIds).toContain(ids.child);
      expect(walkedIds).toContain(ids.grandchild);
      expect(walkedIds).not.toContain(ids.branch);

      // Field-copy semantics: the registry item's shared field surfaces.
      const childItem = walked.find(i => i.id === ids.child);
      expect(childItem?.sharedFields[0]?.value).toBe('shared-val');
    } finally {
      cleanup();
    }
  });

  it('returns empty array when the root is in neither tree nor registry', async () => {
    const { engine, cleanup } = await buildRegistryFixtureEngine();
    try {
      const walked = walkSubtree(engine, '99999999-9999-9999-9999-999999999999');
      expect(walked).toEqual([]);
    } finally {
      cleanup();
    }
  });
});
