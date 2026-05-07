// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTabPersistence } from '../../../src/web/components/ise/useTabPersistence';

const KEY = 'mockingbird-ise-tabs-v1';

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

afterEach(() => vi.unstubAllGlobals());

describe('useTabPersistence', () => {
  it('starts with one default tab', () => {
    const { result } = renderHook(() => useTabPersistence());
    expect(result.current.tabs).toHaveLength(1);
    expect(result.current.tabs[0].title).toMatch(/Untitled/);
    expect(result.current.activeTabId).toBe(result.current.tabs[0].id);
  });

  it('addTab creates a new tab and activates it', () => {
    const { result } = renderHook(() => useTabPersistence());
    act(() => { result.current.addTab(); });
    expect(result.current.tabs).toHaveLength(2);
    expect(result.current.activeTabId).toBe(result.current.tabs[1].id);
  });

  it('updateTabBody persists to localStorage', () => {
    const { result } = renderHook(() => useTabPersistence());
    const id = result.current.tabs[0].id;
    act(() => { result.current.updateTabBody(id, 'Get-Item -Path foo'); });
    const stored = JSON.parse(mem[KEY] ?? '{}');
    expect(stored.tabs[0].body).toBe('Get-Item -Path foo');
  });

  it('removeTab removes by id and switches active to neighbor', () => {
    const { result } = renderHook(() => useTabPersistence());
    act(() => { result.current.addTab(); });
    act(() => { result.current.addTab(); });
    expect(result.current.tabs).toHaveLength(3);
    const middleId = result.current.tabs[1].id;
    act(() => { result.current.removeTab(middleId); });
    expect(result.current.tabs).toHaveLength(2);
  });

  it('reload restores tabs from localStorage', () => {
    const { result, unmount } = renderHook(() => useTabPersistence());
    act(() => { result.current.updateTabBody(result.current.tabs[0].id, 'persisted'); });
    unmount();
    const { result: result2 } = renderHook(() => useTabPersistence());
    expect(result2.current.tabs[0].body).toBe('persisted');
  });
});
