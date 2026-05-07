// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useApplyMode } from './useApplyMode';

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

describe('useApplyMode', () => {
  it('starts disabled when no persisted state', () => {
    const { result } = renderHook(() => useApplyMode());
    expect(result.current.applyMode).toBe(false);
    expect(result.current.pendingEnable).toBe(false);
  });

  it('requesting enable surfaces a pending confirmation, does not enable yet', () => {
    const { result } = renderHook(() => useApplyMode());
    act(() => { result.current.setApplyMode(true); });
    expect(result.current.applyMode).toBe(false);
    expect(result.current.pendingEnable).toBe(true);
  });

  it('confirmEnable commits the toggle and persists to localStorage', () => {
    const { result } = renderHook(() => useApplyMode());
    act(() => { result.current.setApplyMode(true); });
    act(() => { result.current.confirmEnable(); });
    expect(result.current.applyMode).toBe(true);
    expect(result.current.pendingEnable).toBe(false);
    expect(mem['mockingbird-ise-apply-mode-v1']).toBe('1');
  });

  it('cancelEnable closes the dialog without enabling', () => {
    const { result } = renderHook(() => useApplyMode());
    act(() => { result.current.setApplyMode(true); });
    act(() => { result.current.cancelEnable(); });
    expect(result.current.applyMode).toBe(false);
    expect(result.current.pendingEnable).toBe(false);
    expect(mem['mockingbird-ise-apply-mode-v1']).toBeUndefined();
  });

  it('disabling does not require confirmation', () => {
    mem['mockingbird-ise-apply-mode-v1'] = '1';
    const { result } = renderHook(() => useApplyMode());
    expect(result.current.applyMode).toBe(true);
    act(() => { result.current.setApplyMode(false); });
    expect(result.current.applyMode).toBe(false);
    expect(result.current.pendingEnable).toBe(false);
    expect(mem['mockingbird-ise-apply-mode-v1']).toBe('0');
  });
});
