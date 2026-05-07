/// <reference types="vitest" />
/// <reference types="@testing-library/react" />
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { TabContextProvider } from './tabContext';
import { workspaceStore, DEFAULT_TAB_ID } from './workspaceStore';
import { useTabState } from './useTabState';
import { type ReactNode } from 'react';

const wrapper = ({ children }: { children: ReactNode }) => (
  <TabContextProvider tabId={DEFAULT_TAB_ID}>{children}</TabContextProvider>
);

describe('useTabState', () => {
  beforeEach(() => {
    workspaceStore.patchTab(DEFAULT_TAB_ID, {
      selectedItemId: null,
      database: 'master',
      language: 'en',
      detailTab: null,
      expandedNodes: new Map(),
      editedFields: {},
    });
  });

  it("returns the contextual tab's store-backed state", () => {
    const { result } = renderHook(() => useTabState(), { wrapper });
    expect(result.current.state.id).toBe(DEFAULT_TAB_ID);
    expect(result.current.state.selectedItemId).toBeNull();
    expect(result.current.state.database).toBe('master');
    expect(result.current.state.language).toBe('en');
    expect(result.current.state.detailTab).toBeNull();
    expect(result.current.state.expandedNodes).toBeInstanceOf(Map);
    expect(result.current.state.editedFields).toEqual({});
  });

  it('navigate writes selectedItemId to the store', () => {
    const { result } = renderHook(() => useTabState(), { wrapper });
    act(() => { result.current.navigate({ selectedItemId: 'item-x' }); });
    expect(result.current.state.selectedItemId).toBe('item-x');
    expect(workspaceStore.getState().tabs[DEFAULT_TAB_ID].selectedItemId).toBe('item-x');
  });

  it('navigate writes database/language/detailTab to the store', () => {
    const { result } = renderHook(() => useTabState(), { wrapper });
    act(() => { result.current.navigate({ database: 'web', language: 'fr', detailTab: 'layout' }); });
    expect(result.current.state.database).toBe('web');
    expect(result.current.state.language).toBe('fr');
    expect(result.current.state.detailTab).toBe('layout');
  });

  it('navigate writes expandedNodes and editedFields to the store', () => {
    const { result } = renderHook(() => useTabState(), { wrapper });
    act(() => {
      result.current.navigate({
        expandedNodes: new Map([['/sitecore/content', true]]),
        editedFields: { 'field-1': 'new value' },
      });
    });
    expect(result.current.state.expandedNodes.get('/sitecore/content')).toBe(true);
    expect(result.current.state.editedFields).toEqual({ 'field-1': 'new value' });
  });

  it('does not touch window.location when navigate is called', () => {
    const { result } = renderHook(() => useTabState(), { wrapper });
    const before = window.location.href;
    act(() => { result.current.navigate({ selectedItemId: 'item-x' }); });
    expect(window.location.href).toBe(before);
  });
});
