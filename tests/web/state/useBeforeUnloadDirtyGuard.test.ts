// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBeforeUnloadDirtyGuard } from '@/state/useBeforeUnloadDirtyGuard';
import { workspaceStore, DEFAULT_TAB_ID } from '@/state/workspaceStore';

describe('useBeforeUnloadDirtyGuard', () => {
  beforeEach(() => {
    const s = workspaceStore.getState();
    if (s.panes.length === 2) act(() => workspaceStore.collapseSplit());
    for (const id of Object.keys(workspaceStore.getState().tabs)) {
      if (id !== DEFAULT_TAB_ID) act(() => workspaceStore.closeTab(id));
    }
    workspaceStore.patchTab(DEFAULT_TAB_ID, { editedFields: {} });
  });

  it('does not preventDefault when no tab is dirty', () => {
    renderHook(() => useBeforeUnloadDirtyGuard());
    const ev = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
  });

  it('preventDefault and sets returnValue when any tab is dirty', () => {
    renderHook(() => useBeforeUnloadDirtyGuard());
    workspaceStore.patchTab(DEFAULT_TAB_ID, { editedFields: { x: 'y' } });
    const ev = new Event('beforeunload', { cancelable: true });
    Object.defineProperty(ev, 'returnValue', { writable: true, value: '' });
    window.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect((ev as BeforeUnloadEvent).returnValue).toBeTruthy();
  });
});
