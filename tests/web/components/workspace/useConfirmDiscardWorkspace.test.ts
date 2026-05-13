// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useConfirmDiscardWorkspace } from '@/components/workspace/useConfirmDiscardWorkspace';
import { workspaceStore } from '@/state/workspaceStore';

beforeEach(() => {
  workspaceStore.reset();
});

function seedTab(tabId: string, edits: Record<string, string>) {
  workspaceStore.addTab(0, { id: tabId, editedFields: edits });
}

describe('useConfirmDiscardWorkspace', () => {
  it('runs the proceed callback immediately when no tabs are dirty', () => {
    const proceed = vi.fn();
    const { result } = renderHook(() => useConfirmDiscardWorkspace());
    act(() => result.current.request('close', proceed));
    expect(proceed).toHaveBeenCalledOnce();
    expect(result.current.pendingAction).toBeNull();
  });

  it('arms the dialog and stashes the proceed callback when at least one tab is dirty', () => {
    seedTab('t1', { 'field-a': 'edited' });
    const proceed = vi.fn();
    const { result } = renderHook(() => useConfirmDiscardWorkspace());
    act(() => result.current.request('close', proceed));
    expect(proceed).not.toHaveBeenCalled();
    expect(result.current.pendingAction).toBe('close');
    expect(result.current.pendingDirtyCount).toBe(1);

    act(() => result.current.onConfirm());
    expect(proceed).toHaveBeenCalledOnce();
    expect(result.current.pendingAction).toBeNull();
  });

  it('drops the stashed callback on cancel', () => {
    seedTab('t1', { 'field-a': 'edited' });
    const proceed = vi.fn();
    const { result } = renderHook(() => useConfirmDiscardWorkspace());
    act(() => result.current.request('switch', proceed));
    expect(result.current.pendingAction).toBe('switch');

    act(() => result.current.onCancel());
    expect(proceed).not.toHaveBeenCalled();
    expect(result.current.pendingAction).toBeNull();
  });

  it('reports the dirty count across multiple tabs', () => {
    seedTab('t1', { 'field-a': 'edited' });
    seedTab('t2', { 'field-b': 'also edited' });
    const { result } = renderHook(() => useConfirmDiscardWorkspace());
    act(() => result.current.request('close', () => {}));
    expect(result.current.pendingDirtyCount).toBe(2);
  });
});
