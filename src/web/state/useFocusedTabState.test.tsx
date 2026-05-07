/// <reference types="vitest" />
/// <reference types="@testing-library/react" />
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { workspaceStore, DEFAULT_TAB_ID } from './workspaceStore';
import { useFocusedTabState } from './useFocusedTabState';

describe('useFocusedTabState', () => {
  beforeEach(() => {
    // Reset the singleton store's default tab state before each test
    workspaceStore.patchTab(DEFAULT_TAB_ID, {
      database: 'master',
      language: 'en',
      detailTab: null,
      selectedItemId: null,
      expandedNodes: new Map(),
      editedFields: {},
    });
  });

  afterEach(() => {
    // Clean up any extra tabs added during a test, in case the test threw
    // before its inline cleanup ran. Refocus the default tab first so
    // closeTab on the previously-focused tab does not trigger the
    // last-tab-replacement path.
    workspaceStore.focusTab(DEFAULT_TAB_ID);
    const extras = workspaceStore.getState().panes[0].tabIds.filter((id) => id !== DEFAULT_TAB_ID);
    for (const id of extras) workspaceStore.closeTab(id);
  });

  it("returns the focused-active tab's state", () => {
    const { result } = renderHook(() => useFocusedTabState());
    expect(result.current.state.id).toBe(DEFAULT_TAB_ID);
    expect(result.current.state.database).toBe('master');
    expect(result.current.state.language).toBe('en');
  });

  it('navigate writes to the focused tab', () => {
    const { result } = renderHook(() => useFocusedTabState());
    act(() => { result.current.navigate({ database: 'web' }); });
    expect(result.current.state.database).toBe('web');
    expect(workspaceStore.getState().tabs[DEFAULT_TAB_ID].database).toBe('web');
  });

  it('reflects focus changes', () => {
    const newId = workspaceStore.addTab(0); // becomes focused-active
    const { result } = renderHook(() => useFocusedTabState());
    expect(result.current.state.id).toBe(newId);
  });
});
