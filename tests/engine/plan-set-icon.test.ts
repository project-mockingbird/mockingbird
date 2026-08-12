import { describe, it, expect } from 'vitest';
import { Engine } from '../../src/engine/index.js';
import { ItemTree } from '../../src/engine/tree.js';
import type { ScsItem } from '../../src/engine/types.js';
import { planSetIcon } from '../../src/engine/plan-set-icon.js';
import { FIELD_IDS } from '../../src/engine/constants.js';

const ITEM_ID = '11111111-1111-1111-1111-111111111111';
const TEMPLATE_ID = '22222222-2222-2222-2222-222222222222';

// Mirrors the local `buildEngine` convention used across tests/engine (e.g.
// tests/engine/search.test.ts): an in-memory Engine backed by an ItemTree
// with fake (non-existent) file paths, so no fixture directory is needed.
function buildEngine(items: ScsItem[]): Engine {
  const engine = Object.create(Engine.prototype) as Engine;
  const tree = new ItemTree();
  for (const item of items) tree.addItem(item, `/fake/${item.id}.yml`);
  (engine as any).tree = tree;
  (engine as any).registry = null;
  (engine as any).options = { rootDir: '/fake' };
  return engine;
}

function item(): ScsItem {
  return {
    id: ITEM_ID,
    path: '/sitecore/content/Thing',
    parent: '00000000-0000-0000-0000-000000000000',
    template: TEMPLATE_ID,
    sharedFields: [],
    languages: [],
  };
}

describe('planSetIcon', () => {
  it('plans a shared __Icon write', async () => {
    const engine = buildEngine([item()]);
    const plan = await planSetIcon(engine, ITEM_ID, 'Office/32x32/folder.png');
    expect(plan.files).toHaveLength(1);
    // The rewritten YAML carries __Icon in the shared block with the new value.
    expect(plan.files[0].after).toContain(FIELD_IDS.icon);
    expect(plan.files[0].after).toContain('Office/32x32/folder.png');
  });

  it('is a no-op when the icon already matches', async () => {
    const it0 = item();
    it0.sharedFields = [{ id: FIELD_IDS.icon, hint: '__Icon', value: 'Office/32x32/folder.png' }];
    const engine = buildEngine([it0]);
    const plan = await planSetIcon(engine, ITEM_ID, 'Office/32x32/folder.png');
    expect(plan.files).toHaveLength(0);
  });

  it('returns no-op files for a missing item', async () => {
    const engine = buildEngine([item()]);
    const plan = await planSetIcon(engine, 'deadbeef-0000-0000-0000-000000000000', 'Office/32x32/x.png');
    expect(plan.files).toHaveLength(0);
  });
});
