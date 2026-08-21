import { describe, it, expect } from 'vitest';
import { buildInstallPlan } from '../../../src/engine/sitecoreai/planner.js';
import type { ScsItem } from '../../../src/engine/types.js';
import { ALL_ZERO_GUID } from '../../../src/engine/sitecoreai/types.js';
import type { ItemSnapshot } from '../../../src/engine/sitecoreai/types.js';

function mk(id: string, path: string, template: string): ScsItem {
  return { id, parent: 'p', template, path, sharedFields: [], languages: [] };
}
// probes helper gains readItem; default returns null (not found).
const probes = (existing: Set<string>, templates: Set<string>, targets: Map<string, ItemSnapshot> = new Map()) => ({
  itemExists: async (id: string) => existing.has(id),
  templateExists: async (id: string) => templates.has(id),
  readItem: async (path: string) => targets.get(path) ?? null,
});

// trivial source-snapshot provider for planner tests: template + a single shared field.
const srcSnap = (over: Partial<ItemSnapshot> = {}): ItemSnapshot => ({
  id: 'a', templateId: 'tpl', sharedFields: [{ fieldId: 'title', value: 'source' }], unversionedFields: [], versions: [], ...over,
});
const buildSourceSnapshot = async (_item: unknown) => srcSnap();

describe('buildInstallPlan', () => {
  it('creates absent items and preserves input order', async () => {
    const items = [mk('a', '/x/a', 'tpl'), mk('b', '/x/a/b', 'tpl')];
    const plan = await buildInstallPlan(items, 'skip', probes(new Set(), new Set(['tpl'])), buildSourceSnapshot);
    expect(plan.steps.map((s) => [s.itemId, s.action])).toEqual([['a', 'create'], ['b', 'create']]);
    expect(plan.summary).toEqual({ create: 2, update: 0, skip: 0 });
    expect(plan.blockingErrors).toEqual([]);
  });

  it('overwrite: UPDATE with diff ops when target differs; empty diff -> skip; keepExisting -> skip', async () => {
    const items = [mk('a', '/x/a', 'tpl')];
    const t = new Set(['tpl']);
    const differing = new Map([['/x/a', srcSnap({ sharedFields: [{ fieldId: 'title', value: 'target-old' }] })]]);
    const p = await buildInstallPlan(items, 'overwrite', probes(new Set(['a']), t, differing), buildSourceSnapshot);
    expect(p.steps[0].action).toBe('update');
    expect(p.steps[0].ops).toEqual([{ kind: 'updateField', fieldId: 'title', value: 'source' }]);

    const same = new Map([['/x/a', srcSnap()]]);
    const p2 = await buildInstallPlan(items, 'overwrite', probes(new Set(['a']), t, same), buildSourceSnapshot);
    expect(p2.steps[0].action).toBe('skip');

    const p3 = await buildInstallPlan(items, 'keepExisting', probes(new Set(['a']), t), buildSourceSnapshot);
    expect(p3.steps[0].action).toBe('skip');
  });

  it('overwrite: id mismatch at path -> warning + skip', async () => {
    const items = [mk('a', '/x/a', 'tpl')];
    const other = new Map([['/x/a', srcSnap({ id: 'different-id' })]]);
    const p = await buildInstallPlan(items, 'overwrite', probes(new Set(['a']), new Set(['tpl']), other), buildSourceSnapshot);
    expect(p.steps[0].action).toBe('skip');
    expect(p.warnings.some((w) => w.itemId === 'a')).toBe(true);
  });

  it('blocks when a template is neither in the payload nor on target', async () => {
    const items = [mk('a', '/x/a', 'missing-tpl')];
    const plan = await buildInstallPlan(items, 'skip', probes(new Set(), new Set()), buildSourceSnapshot);
    expect(plan.blockingErrors).toHaveLength(1);
    expect(plan.blockingErrors[0]).toMatchObject({ itemId: 'a', reason: expect.stringContaining('missing-tpl') });
    expect(plan.steps[0].action).toBe('skip');
  });

  it('does not block when the template is one of the payload items', async () => {
    const items = [mk('tpl', '/templates/tpl', 'meta-tpl'), mk('a', '/x/a', 'tpl')];
    const plan = await buildInstallPlan(items, 'skip', probes(new Set(), new Set(['meta-tpl'])), buildSourceSnapshot);
    // 'tpl' is in the payload, so item 'a' is not blocked on it.
    expect(plan.blockingErrors).toEqual([]);
  });

  it('blocks when branchId is missing on target and not in payload', async () => {
    const item = { ...mk('a', '/x/a', 'tpl'), branchId: 'missing-branch' };
    const plan = await buildInstallPlan([item], 'skip', probes(new Set(), new Set(['tpl'])), buildSourceSnapshot);
    expect(plan.blockingErrors).toHaveLength(1);
    expect(plan.blockingErrors[0]).toMatchObject({ itemId: 'a', reason: expect.stringContaining('missing-branch') });
    expect(plan.steps[0].action).toBe('skip');
  });

  it('does not check branchId when it is ALL_ZERO_GUID', async () => {
    const item = { ...mk('a', '/x/a', 'tpl'), branchId: ALL_ZERO_GUID };
    const plan = await buildInstallPlan([item], 'skip', probes(new Set(), new Set(['tpl'])), buildSourceSnapshot);
    expect(plan.blockingErrors).toEqual([]);
    expect(plan.steps[0].action).toBe('create');
  });
});
