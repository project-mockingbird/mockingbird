// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePackageCart } from '@/state/usePackageCart';
import { packageCartStore } from '@/state/packageCartStore';

const STORAGE_KEY = 'mockingbird.packageCart.v1';

// See packageCartStore.test.ts for why we stub localStorage explicitly.
let mem: Record<string, string>;

describe('usePackageCart', () => {
  beforeEach(() => {
    mem = {};
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => mem[k] ?? null,
      setItem: (k: string, v: string) => { mem[k] = v; },
      removeItem: (k: string) => { delete mem[k]; },
      clear: () => { mem = {}; },
    });
    // The singleton was created at module-load time with whatever localStorage
    // was in scope then; reset its in-memory state so each test starts clean.
    packageCartStore.clearAll();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('starts empty', () => {
    const { result } = renderHook(() => usePackageCart());
    expect(result.current.sources).toEqual([]);
  });

  it('reflects addSource through the hook', () => {
    const { result } = renderHook(() => usePackageCart());
    act(() => {
      result.current.addSource({
        rootItemId: 'root1',
        rootItemPath: '/sitecore/content/Site/Home',
        rootItemName: 'Home',
        scope: 'itemAndDescendants',
      });
    });
    expect(result.current.sources).toHaveLength(1);
    expect(result.current.sources[0].rootItemPath).toBe('/sitecore/content/Site/Home');
    expect(result.current.sources[0].database).toBe('master');
  });

  it('reflects removeSource and setScope through the hook', () => {
    const { result } = renderHook(() => usePackageCart());
    act(() => {
      result.current.addSource({
        rootItemId: 'root1', rootItemPath: '/a', rootItemName: 'a', scope: 'itemAndDescendants',
      });
    });
    const id = result.current.sources[0].id;
    act(() => { result.current.setScope(id, 'childrenOnly'); });
    expect(result.current.sources[0].scope).toBe('childrenOnly');
    act(() => { result.current.removeSource(id); });
    expect(result.current.sources).toHaveLength(0);
  });

  it('persists adds across hook unmount via localStorage', () => {
    const first = renderHook(() => usePackageCart());
    act(() => {
      first.result.current.addSource({
        rootItemId: 'root1', rootItemPath: '/persist', rootItemName: 'p', scope: 'itemAndDescendants',
      });
    });
    expect(mem[STORAGE_KEY]).toContain('/persist');
    first.unmount();

    // Singleton store is still alive after unmount; a fresh hook reads its
    // existing snapshot.
    const second = renderHook(() => usePackageCart());
    expect(second.result.current.sources).toHaveLength(1);
    expect(second.result.current.sources[0].rootItemPath).toBe('/persist');
  });
});
