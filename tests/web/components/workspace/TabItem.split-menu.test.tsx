// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent, act, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { TabItem } from '@/components/workspace/TabItem';
import { workspaceStore, DEFAULT_TAB_ID } from '@/state/workspaceStore';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

function renderTab(props: { tabId: string; paneIndex: 0 | 1; siblingCount: number }) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <TabItem
        tabId={props.tabId}
        paneIndex={props.paneIndex}
        isActive={true}
        selectedItemId={null}
        siblingCount={props.siblingCount}
      />
    </QueryClientProvider>,
  );
}

describe('TabItem split / move-to-other-pane menu', () => {
  beforeEach(() => {
    const s = workspaceStore.getState();
    if (s.panes.length === 2) act(() => workspaceStore.collapseSplit());
    for (const id of Object.keys(workspaceStore.getState().tabs)) {
      if (id !== DEFAULT_TAB_ID) act(() => workspaceStore.closeTab(id));
    }
  });

  it('shows Split right when single-pane', () => {
    const t = workspaceStore.addTab(0, { selectedItemId: 'A' });
    renderTab({ tabId: t, paneIndex: 0, siblingCount: 2 });
    fireEvent.contextMenu(screen.getByRole('tab'));
    expect(screen.queryByText('Split right')).toBeInTheDocument();
    expect(screen.queryByText('Move to other pane')).not.toBeInTheDocument();
  });

  it('shows Move to other pane when 2-pane', () => {
    const t = workspaceStore.addTab(0, { selectedItemId: 'A' });
    act(() => workspaceStore.splitRight(t));
    renderTab({ tabId: t, paneIndex: 1, siblingCount: 1 });
    fireEvent.contextMenu(screen.getByRole('tab'));
    expect(screen.queryByText('Split right')).not.toBeInTheDocument();
    expect(screen.queryByText('Move to other pane')).toBeInTheDocument();
  });

  it('clicking Split right calls splitRight on the store', () => {
    const t = workspaceStore.addTab(0, { selectedItemId: 'A' });
    renderTab({ tabId: t, paneIndex: 0, siblingCount: 2 });
    fireEvent.contextMenu(screen.getByRole('tab'));
    fireEvent.click(screen.getByText('Split right'));
    expect(workspaceStore.getState().panes.length).toBe(2);
  });

  it('clicking Move to other pane calls moveTabToPane', () => {
    const t = workspaceStore.addTab(0, { selectedItemId: 'A' });
    act(() => workspaceStore.splitRight(t));
    // panes[0]=[DEFAULT], panes[1]=[t]; click t in pane[1] -> move to 0
    renderTab({ tabId: t, paneIndex: 1, siblingCount: 1 });
    fireEvent.contextMenu(screen.getByRole('tab'));
    fireEvent.click(screen.getByText('Move to other pane'));
    const s = workspaceStore.getState();
    expect(s.panes.length).toBe(1); // source emptied -> collapse
    expect(s.panes[0].tabIds).toContain(t);
  });
});

describe('TabItem dirty-state confirm', () => {
  beforeEach(() => {
    const s = workspaceStore.getState();
    if (s.panes.length === 2) act(() => workspaceStore.collapseSplit());
    for (const id of Object.keys(workspaceStore.getState().tabs)) {
      if (id !== DEFAULT_TAB_ID) act(() => workspaceStore.closeTab(id));
    }
  });

  it('opens confirm dialog when closing a dirty tab', () => {
    const t = workspaceStore.addTab(0, { selectedItemId: 'A' });
    workspaceStore.patchTab(t, { editedFields: { foo: 'bar' } });
    renderTab({ tabId: t, paneIndex: 0, siblingCount: 2 });
    fireEvent.click(screen.getByRole('button', { name: /close tab/i }));
    expect(screen.queryByText('Discard changes?')).toBeInTheDocument();
    expect(workspaceStore.getState().tabs[t]).toBeDefined();
  });

  it('clean tabs close immediately without confirm', () => {
    const t = workspaceStore.addTab(0, { selectedItemId: 'A' });
    renderTab({ tabId: t, paneIndex: 0, siblingCount: 2 });
    fireEvent.click(screen.getByRole('button', { name: /close tab/i }));
    expect(screen.queryByText('Discard changes?')).not.toBeInTheDocument();
    expect(workspaceStore.getState().tabs[t]).toBeUndefined();
  });
});
