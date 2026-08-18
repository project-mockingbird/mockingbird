import { describe, it, expect, vi } from 'vitest';
import type { ScsItem } from '../../../src/engine/types.js';
import type { CartSource } from '../../../src/engine/package/types.js';

const items: ScsItem[] = [
  { id: 'a', parent: 'p', template: 'tpl', path: '/x/a', sharedFields: [], languages: [] },
  { id: 'b', parent: 'a', template: 'tpl', path: '/x/a/b', sharedFields: [], languages: [] },
];
vi.mock('../../../src/engine/package/collect.js', () => ({
  collectSources: () => ({ items, warnings: [] }),
}));
// Deterministic tiny serialize output so byte-budget math is predictable.
vi.mock('../../../src/engine/sitecoreai/serialize-command.js', () => ({
  toSerializeItemData: async (_e: unknown, it: ScsItem) => ({
    id: it.id, parentId: it.parent, path: it.path, name: it.id, branchId: '0', templateId: it.template,
    sharedFields: [], unversionedFields: [], versions: [],
  }),
}));

import { previewInstall, executeInstall } from '../../../src/engine/sitecoreai/install.js';
import type { InstallProgress } from '../../../src/engine/sitecoreai/types.js';

const engine = {} as any;
const sources: CartSource[] = [{ id: 's', rootItemId: 'a', rootItemPath: '/x/a', rootItemName: 'a', scope: 'itemAndDescendants', database: 'master' }];

function fakeClient(existing = new Set<string>()) {
  return {
    itemExists: async (id: string) => existing.has(id),
    templateExists: async () => true,
    executeSerializationCommands: vi.fn(async () => ({ ok: true, errors: [], messages: [] })),
  };
}

describe('previewInstall', () => {
  it('returns a plan with two creates', async () => {
    const plan = await previewInstall(engine, sources, 'skip', fakeClient());
    expect(plan.summary).toEqual({ create: 2, update: 0, skip: 0 });
  });
});

describe('executeInstall', () => {
  it('sends commands and ends with a done event', async () => {
    const client = fakeClient();
    const events: InstallProgress[] = [];
    const final = await executeInstall(engine, sources, 'skip', client, { onProgress: (p) => events.push(p) });
    expect(client.executeSerializationCommands).toHaveBeenCalled();
    expect(final.kind).toBe('done');
    expect(final.completed).toBe(2);
    expect(events.at(-1)?.kind).toBe('done');
  });

  it('refuses to send when the plan has blocking errors', async () => {
    const client = { ...fakeClient(), templateExists: async () => false } as any;
    const final = await executeInstall(engine, sources, 'skip', client);
    expect(final.kind).toBe('error');
    expect(client.executeSerializationCommands).not.toHaveBeenCalled();
  });

  it('stops when the abort signal is already aborted', async () => {
    const client = fakeClient();
    const ac = new AbortController(); ac.abort();
    const final = await executeInstall(engine, sources, 'skip', client, { signal: ac.signal });
    expect(final.kind).toBe('error');
    expect(final.message).toMatch(/cancel/i);
    expect(client.executeSerializationCommands).not.toHaveBeenCalled();
  });

  it('splits into multiple batches when the byte budget is tiny', async () => {
    const client = fakeClient();
    const final = await executeInstall(engine, sources, 'skip', client, { byteBudget: 1 });
    expect(client.executeSerializationCommands).toHaveBeenCalledTimes(2); // one batch per item
    expect(final.kind).toBe('done');
    expect(final.completed).toBe(2);
  });
});
