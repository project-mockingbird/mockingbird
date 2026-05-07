// src/web/components/workspace/Tabstrip.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Tabstrip } from './Tabstrip';
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

describe('Tabstrip', () => {
  beforeEach(() => {
    workspaceStore.patchTab(DEFAULT_TAB_ID, { selectedItemId: null });
  });

  afterEach(() => {
    workspaceStore.focusTab(DEFAULT_TAB_ID);
    const extras = workspaceStore.getState().panes[0].tabIds.filter((id) => id !== DEFAULT_TAB_ID);
    for (const id of extras) workspaceStore.closeTab(id);
  });

  it('renders a tab pill per supplied tab', () => {
    wrap(
      <Tabstrip
        paneIndex={0}
        onAdd={() => {}}
        tabs={[{ tabId: 't-1', selectedItemId: 'item-a', isActive: true }]}
      />,
    );
    expect(screen.getByText('Item item-a')).toBeInTheDocument();
  });

  it('renders a `+` add button that calls onAdd', () => {
    const onAdd = vi.fn();
    wrap(<Tabstrip paneIndex={0} onAdd={onAdd} tabs={[{ tabId: DEFAULT_TAB_ID, selectedItemId: null, isActive: true }]} />);
    fireEvent.click(screen.getByLabelText('New tab'));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it('marks the active tab with aria-selected="true"', () => {
    wrap(
      <Tabstrip
        paneIndex={0}
        onAdd={() => {}}
        tabs={[
          { tabId: 'a', selectedItemId: 'item-a', isActive: false },
          { tabId: 'b', selectedItemId: 'item-b', isActive: true },
        ]}
      />,
    );
    const tabs = screen.getAllByRole('tab');
    expect(tabs[0]).toHaveAttribute('aria-selected', 'false');
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
  });
});
