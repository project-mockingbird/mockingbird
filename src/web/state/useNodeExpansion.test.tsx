// @vitest-environment jsdom
// src/web/state/useNodeExpansion.test.tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { TabContextProvider } from './tabContext';
import { workspaceStore, DEFAULT_TAB_ID } from './workspaceStore';
import { useNodeExpansion } from './useNodeExpansion';
import { type ReactNode } from 'react';

const wrapper = ({ children }: { children: ReactNode }) => (
  <TabContextProvider tabId={DEFAULT_TAB_ID}>{children}</TabContextProvider>
);

describe('useNodeExpansion', () => {
  beforeEach(() => {
    workspaceStore.patchTab(DEFAULT_TAB_ID, { expandedNodes: new Map() });
  });

  it('absent in map: respects autoExpand default', () => {
    const { result: a } = renderHook(() => useNodeExpansion('node-1', false), { wrapper });
    expect(a.current.isExpanded).toBe(false);

    const { result: b } = renderHook(() => useNodeExpansion('node-2', true), { wrapper });
    expect(b.current.isExpanded).toBe(true);
  });

  it('setExpanded(true) records explicit true in the map', () => {
    const { result } = renderHook(() => useNodeExpansion('node-1', false), { wrapper });
    act(() => { result.current.setExpanded(true); });
    expect(result.current.isExpanded).toBe(true);
    expect(workspaceStore.getState().tabs[DEFAULT_TAB_ID].expandedNodes.get('node-1')).toBe(true);
  });

  it('setExpanded(false) on an autoExpand=true node records explicit false (overrides default)', () => {
    const { result } = renderHook(() => useNodeExpansion('node-1', true), { wrapper });
    expect(result.current.isExpanded).toBe(true);
    act(() => { result.current.setExpanded(false); });
    expect(result.current.isExpanded).toBe(false);
    expect(workspaceStore.getState().tabs[DEFAULT_TAB_ID].expandedNodes.get('node-1')).toBe(false);
  });

  it('explicit false in map overrides autoExpand on subsequent reads', () => {
    workspaceStore.patchTab(DEFAULT_TAB_ID, { expandedNodes: new Map([['node-1', false]]) });
    const { result } = renderHook(() => useNodeExpansion('node-1', true), { wrapper });
    expect(result.current.isExpanded).toBe(false);
  });
});
