// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TabItem } from './TabItem';
import { workspaceStore, DEFAULT_TAB_ID } from '@/state/workspaceStore';

vi.mock('@/hooks/useItems', () => ({
  useItem: (id: string | null) => ({
    data: id ? { name: `Item ${id}`, id } : undefined,
    isLoading: false,
  }),
}));

const wrap = (ui: React.ReactElement) => {
  const qc = new QueryClient();
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
};

describe('TabItem', () => {
  beforeEach(() => {
    workspaceStore.patchTab(DEFAULT_TAB_ID, { selectedItemId: null });
  });

  afterEach(() => {
    workspaceStore.focusTab(DEFAULT_TAB_ID);
    const extras = workspaceStore.getState().panes[0].tabIds.filter((id) => id !== DEFAULT_TAB_ID);
    for (const id of extras) workspaceStore.closeTab(id);
  });

  it('renders the tab title via TabLabel', () => {
    wrap(<TabItem tabId={DEFAULT_TAB_ID} paneIndex={0} isActive selectedItemId="item-a" siblingCount={1} />);
    expect(screen.getByText('Item item-a')).toBeInTheDocument();
  });

  it('clicking the tab calls focusTab', () => {
    const id = workspaceStore.addTab(0, undefined, { focus: false });
    wrap(<TabItem tabId={id} paneIndex={0} isActive={false} selectedItemId={null} siblingCount={2} />);
    fireEvent.click(screen.getByRole('tab'));
    expect(workspaceStore.getState().panes[0].activeTabId).toBe(id);
  });

  it('does not render close button when siblingCount is 1', () => {
    wrap(<TabItem tabId={DEFAULT_TAB_ID} paneIndex={0} isActive selectedItemId={null} siblingCount={1} />);
    expect(screen.queryByLabelText('Close tab')).toBeNull();
  });

  it('renders close button when siblingCount > 1 and clicking it calls closeTab', () => {
    const id = workspaceStore.addTab(0, undefined, { focus: false });
    wrap(<TabItem tabId={id} paneIndex={0} isActive={false} selectedItemId={null} siblingCount={2} />);
    const close = screen.getByLabelText('Close tab');
    fireEvent.click(close);
    expect(workspaceStore.getState().tabs[id]).toBeUndefined();
  });

  it('close button click does not bubble to tab focus', () => {
    const id = workspaceStore.addTab(0, undefined, { focus: false });
    wrap(<TabItem tabId={id} paneIndex={0} isActive={false} selectedItemId={null} siblingCount={2} />);
    fireEvent.click(screen.getByLabelText('Close tab'));
    // After close, the tab is gone; activeTabId stayed on default (didn't get refocused to closed tab during click)
    expect(workspaceStore.getState().panes[0].activeTabId).toBe(DEFAULT_TAB_ID);
  });
});
