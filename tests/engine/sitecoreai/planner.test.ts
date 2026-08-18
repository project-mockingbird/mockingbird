import { describe, it, expect } from 'vitest';
import { buildInstallPlan } from '../../../src/engine/sitecoreai/planner.js';
import type { ScsItem } from '../../../src/engine/types.js';

function mk(id: string, path: string, template: string): ScsItem {
  return { id, parent: 'p', template, path, sharedFields: [], languages: [] };
}
const probes = (existing: Set<string>, templates: Set<string>) => ({
  itemExists: async (id: string) => existing.has(id),
  templateExists: async (id: string) => templates.has(id),
});

describe('buildInstallPlan', () => {
  it('creates absent items and preserves input order', async () => {
    const items = [mk('a', '/x/a', 'tpl'), mk('b', '/x/a/b', 'tpl')];
    const plan = await buildInstallPlan(items, 'skip', probes(new Set(), new Set(['tpl'])));
    expect(plan.steps.map((s) => [s.itemId, s.action])).toEqual([['a', 'create'], ['b', 'create']]);
    expect(plan.summary).toEqual({ create: 2, update: 0, skip: 0 });
    expect(plan.blockingErrors).toEqual([]);
  });

  it('overwrite updates an existing item; keepExisting skips it', async () => {
    const items = [mk('a', '/x/a', 'tpl')];
    const t = new Set(['tpl']);
    expect((await buildInstallPlan(items, 'overwrite', probes(new Set(['a']), t))).steps[0].action).toBe('update');
    expect((await buildInstallPlan(items, 'keepExisting', probes(new Set(['a']), t))).steps[0].action).toBe('skip');
  });

  it('blocks when a template is neither in the payload nor on target', async () => {
    const items = [mk('a', '/x/a', 'missing-tpl')];
    const plan = await buildInstallPlan(items, 'skip', probes(new Set(), new Set()));
    expect(plan.blockingErrors).toHaveLength(1);
    expect(plan.blockingErrors[0]).toMatchObject({ itemId: 'a', reason: expect.stringContaining('missing-tpl') });
    expect(plan.steps[0].action).toBe('skip');
  });

  it('does not block when the template is one of the payload items', async () => {
    const items = [mk('tpl', '/templates/tpl', 'meta-tpl'), mk('a', '/x/a', 'tpl')];
    const plan = await buildInstallPlan(items, 'skip', probes(new Set(), new Set(['meta-tpl'])));
    // 'tpl' is in the payload, so item 'a' is not blocked on it.
    expect(plan.blockingErrors).toEqual([]);
  });
});
