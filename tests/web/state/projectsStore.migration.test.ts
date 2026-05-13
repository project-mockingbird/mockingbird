// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { migrateFromLocalStorage } from '@/state/projectsStoreMigration';

// Node 25 ships a barebones globalThis.localStorage stub without real methods.
// jsdom supplies a full Storage, but only after environment hooks. Stub
// explicitly so each test gets a clean isolated map and all methods exist.
let mem: Record<string, string>;

beforeEach(() => {
  mem = {};
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem[k] ?? null,
    setItem: (k: string, v: string) => { mem[k] = v; },
    removeItem: (k: string) => { delete mem[k]; },
    clear: () => { mem = {}; },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('migrateFromLocalStorage', () => {
  it('returns null when no localStorage entry exists', async () => {
    const result = await migrateFromLocalStorage();
    expect(result).toBeNull();
  });

  it('returns parsed projects map when localStorage has data', async () => {
    localStorage.setItem(
      'mockingbird.projects',
      JSON.stringify({
        projects: {
          h1: {
            hash: 'h1',
            name: 'Legacy',
            layers: [{ sitecoreJsonPath: '/a', name: 'a', color: '#000' }],
            createdAt: '2026-05-01T00:00:00.000Z',
            lastOpenedAt: '2026-05-02T00:00:00.000Z',
          },
        },
        lastOpenedHash: 'h1',
        prefs: { autoRestore: true },
      }),
    );
    const result = await migrateFromLocalStorage();
    expect(result).not.toBeNull();
    expect(result!.projects.h1.name).toBe('Legacy');
    // ISO strings converted to ms.
    expect(typeof result!.projects.h1.createdAt).toBe('number');
    expect(result!.lastOpenedHash).toBe('h1');
    expect(result!.autoRestore).toBe(true);
  });

  it('returns null when localStorage payload is malformed', async () => {
    localStorage.setItem('mockingbird.projects', 'not json');
    const result = await migrateFromLocalStorage();
    expect(result).toBeNull();
  });

  it('clears the localStorage key after a successful read', async () => {
    localStorage.setItem(
      'mockingbird.projects',
      JSON.stringify({ projects: {}, lastOpenedHash: null, prefs: { autoRestore: true } }),
    );
    await migrateFromLocalStorage();
    expect(localStorage.getItem('mockingbird.projects')).toBeNull();
  });
});
