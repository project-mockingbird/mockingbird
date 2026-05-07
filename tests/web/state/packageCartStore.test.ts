// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createPackageCartStore,
  type CartSource,
} from '@/state/packageCartStore';

const STORAGE_KEY = 'mockingbird.packageCart.v1';

// Node 25 ships a barebones globalThis.localStorage stub without methods like
// clear() / setItem() / getItem() (it's just an empty object). jsdom supplies a
// fully-functional Storage, but only after the environment hooks. Stubbing
// explicitly so each test gets a clean isolated map and the methods exist.
let mem: Record<string, string>;

describe('packageCartStore', () => {
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

  it('starts empty when localStorage is empty', () => {
    const store = createPackageCartStore();
    expect(store.getSnapshot().sources).toEqual([]);
  });

  it('addSource appends a CartSource with a fresh id and database=master', () => {
    const store = createPackageCartStore();
    store.addSource({
      rootItemId: 'a1b2c3',
      rootItemPath: '/sitecore/content/Site/Home',
      rootItemName: 'Home',
      scope: 'itemAndDescendants',
    });
    const sources = store.getSnapshot().sources;
    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({
      rootItemId: 'a1b2c3',
      rootItemPath: '/sitecore/content/Site/Home',
      rootItemName: 'Home',
      scope: 'itemAndDescendants',
      database: 'master',
    });
    expect(sources[0].id).toBeTruthy();
    expect(typeof sources[0].id).toBe('string');
  });

  it('addSource generates unique ids per call', () => {
    const store = createPackageCartStore();
    store.addSource({
      rootItemId: 'x',
      rootItemPath: '/a',
      rootItemName: 'a',
      scope: 'itemAndDescendants',
    });
    store.addSource({
      rootItemId: 'y',
      rootItemPath: '/b',
      rootItemName: 'b',
      scope: 'childrenOnly',
    });
    const sources = store.getSnapshot().sources;
    expect(sources).toHaveLength(2);
    expect(sources[0].id).not.toBe(sources[1].id);
  });

  it('removeSource filters by id without disturbing others', () => {
    const store = createPackageCartStore();
    store.addSource({ rootItemId: '1', rootItemPath: '/a', rootItemName: 'a', scope: 'itemAndDescendants' });
    store.addSource({ rootItemId: '2', rootItemPath: '/b', rootItemName: 'b', scope: 'itemAndChildren' });
    const [first, second] = store.getSnapshot().sources;
    store.removeSource(first.id);
    const after = store.getSnapshot().sources;
    expect(after).toHaveLength(1);
    expect(after[0].id).toBe(second.id);
  });

  it('setScope updates one source; others unchanged', () => {
    const store = createPackageCartStore();
    store.addSource({ rootItemId: '1', rootItemPath: '/a', rootItemName: 'a', scope: 'itemAndDescendants' });
    store.addSource({ rootItemId: '2', rootItemPath: '/b', rootItemName: 'b', scope: 'itemAndDescendants' });
    const [first, second] = store.getSnapshot().sources;
    store.setScope(first.id, 'childrenOnly');
    const after = store.getSnapshot().sources;
    expect(after.find((s) => s.id === first.id)?.scope).toBe('childrenOnly');
    expect(after.find((s) => s.id === second.id)?.scope).toBe('itemAndDescendants');
  });

  it('clearAll empties the cart', () => {
    const store = createPackageCartStore();
    store.addSource({ rootItemId: '1', rootItemPath: '/a', rootItemName: 'a', scope: 'itemAndDescendants' });
    store.addSource({ rootItemId: '2', rootItemPath: '/b', rootItemName: 'b', scope: 'itemAndChildren' });
    store.clearAll();
    expect(store.getSnapshot().sources).toEqual([]);
  });

  it('persists to localStorage on addSource', () => {
    const store = createPackageCartStore();
    store.addSource({
      rootItemId: 'a1',
      rootItemPath: '/sitecore/content/Site/Home',
      rootItemName: 'Home',
      scope: 'itemAndDescendants',
    });
    const raw = mem[STORAGE_KEY];
    expect(raw).toBeTruthy();
    expect(raw).toContain('/sitecore/content/Site/Home');
  });

  it('persists to localStorage on removeSource', () => {
    const store = createPackageCartStore();
    store.addSource({ rootItemId: '1', rootItemPath: '/a', rootItemName: 'a', scope: 'itemAndDescendants' });
    const id = store.getSnapshot().sources[0].id;
    store.removeSource(id);
    const raw = mem[STORAGE_KEY] ?? '{"sources":[]}';
    const parsed = JSON.parse(raw) as { sources: CartSource[] };
    expect(parsed.sources).toHaveLength(0);
  });

  it('persists to localStorage on clearAll', () => {
    const store = createPackageCartStore();
    store.addSource({ rootItemId: '1', rootItemPath: '/a', rootItemName: 'a', scope: 'itemAndDescendants' });
    store.clearAll();
    const raw = mem[STORAGE_KEY] ?? '{"sources":[]}';
    const parsed = JSON.parse(raw) as { sources: CartSource[] };
    expect(parsed.sources).toEqual([]);
  });

  it('rehydrates from localStorage on creation', () => {
    const seeded: CartSource = {
      id: 'fixed-id',
      rootItemId: 'rootA',
      rootItemPath: '/sitecore/content/Site/Home',
      rootItemName: 'Home',
      scope: 'itemAndChildren',
      database: 'master',
    };
    mem[STORAGE_KEY] = JSON.stringify({ sources: [seeded] });
    const store = createPackageCartStore();
    const sources = store.getSnapshot().sources;
    expect(sources).toHaveLength(1);
    expect(sources[0]).toEqual(seeded);
  });

  it('returns empty cart when localStorage contains corrupt JSON', () => {
    mem[STORAGE_KEY] = '{not-json';
    const store = createPackageCartStore();
    expect(store.getSnapshot().sources).toEqual([]);
  });

  it('subscribers fire on mutation', () => {
    const store = createPackageCartStore();
    let calls = 0;
    store.subscribe(() => { calls++; });
    store.addSource({ rootItemId: '1', rootItemPath: '/a', rootItemName: 'a', scope: 'itemAndDescendants' });
    expect(calls).toBe(1);
    const id = store.getSnapshot().sources[0].id;
    store.setScope(id, 'childrenOnly');
    expect(calls).toBe(2);
    store.removeSource(id);
    expect(calls).toBe(3);
  });

  it('unsubscribe stops further notifications', () => {
    const store = createPackageCartStore();
    let calls = 0;
    const unsubscribe = store.subscribe(() => { calls++; });
    store.addSource({ rootItemId: '1', rootItemPath: '/a', rootItemName: 'a', scope: 'itemAndDescendants' });
    expect(calls).toBe(1);
    unsubscribe();
    store.addSource({ rootItemId: '2', rootItemPath: '/b', rootItemName: 'b', scope: 'itemAndDescendants' });
    expect(calls).toBe(1);
  });
});
