import { describe, it, expect, beforeEach, vi } from 'vitest';

const KEY = 'mockingbird.settings.v1';

let mem: Record<string, string>;

beforeEach(() => {
  mem = {};
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem[k] ?? null,
    setItem: (k: string, v: string) => { mem[k] = v; },
    removeItem: (k: string) => { delete mem[k]; },
    clear: () => { mem = {}; },
  });
  vi.resetModules();
});

async function loadStore() {
  return await import('../../../src/web/settings/store');
}

describe('settings store', () => {
  it('returns defaults when nothing is stored', async () => {
    const { getSnapshot } = await loadStore();
    const s = getSnapshot();
    expect(s['editor.defaultTab']).toBe('content');
    expect(s['versioning.trimKeepCount']).toBe(5);
  });

  it('setSetting writes a non-default override', async () => {
    const { setSetting, getSnapshot, getOverrides } = await loadStore();
    setSetting('editor.defaultTab', 'layout');
    expect(getSnapshot()['editor.defaultTab']).toBe('layout');
    expect(getOverrides()).toEqual({ 'editor.defaultTab': 'layout' });
    expect(JSON.parse(mem[KEY])).toEqual({ 'editor.defaultTab': 'layout' });
  });

  it('setting a key to its default value removes it from overrides', async () => {
    const { setSetting, getOverrides } = await loadStore();
    setSetting('editor.defaultTab', 'layout');
    expect(getOverrides()).toEqual({ 'editor.defaultTab': 'layout' });
    setSetting('editor.defaultTab', 'content'); // == default
    expect(getOverrides()).toEqual({});
    expect(mem[KEY]).toBeUndefined();
  });

  it('reset() clears all overrides and removes the storage key', async () => {
    const { setSetting, reset, getOverrides } = await loadStore();
    setSetting('editor.defaultTab', 'layout');
    setSetting('versioning.trimKeepCount', 20);
    reset();
    expect(getOverrides()).toEqual({});
    expect(mem[KEY]).toBeUndefined();
  });

  it('subscribers fire on setSetting', async () => {
    const { setSetting, subscribe } = await loadStore();
    const listener = vi.fn();
    const unsub = subscribe(listener);
    setSetting('editor.defaultTab', 'standard');
    expect(listener).toHaveBeenCalledTimes(1);
    unsub();
    setSetting('editor.defaultTab', 'layout');
    expect(listener).toHaveBeenCalledTimes(1); // not called after unsub
  });

  it('falls back to empty overrides when localStorage has bad JSON', async () => {
    mem[KEY] = '{not valid json';
    const { getSnapshot, getOverrides } = await loadStore();
    expect(getOverrides()).toEqual({});
    expect(getSnapshot()['editor.defaultTab']).toBe('content');
  });
});
