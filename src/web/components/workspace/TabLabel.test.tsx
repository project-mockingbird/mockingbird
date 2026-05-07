// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TabLabel } from './TabLabel';

vi.mock('@/hooks/useItems', () => ({
  useItem: (id: string | null) => {
    if (id === null) return { data: undefined, isLoading: false };
    if (id === 'loading') return { data: undefined, isLoading: true };
    if (id === 'item-x') return { data: { name: 'Item X', id: 'item-x' }, isLoading: false };
    return { data: undefined, isLoading: false };
  },
}));

const wrap = (ui: React.ReactElement) => {
  const qc = new QueryClient();
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
};

describe('TabLabel', () => {
  it('renders "New Tab" when selectedItemId is null', () => {
    wrap(<TabLabel selectedItemId={null} />);
    expect(screen.getByText('New Tab')).toBeInTheDocument();
  });

  it('renders "..." while loading', () => {
    wrap(<TabLabel selectedItemId="loading" />);
    expect(screen.getByText('...')).toBeInTheDocument();
  });

  it('renders the item name when loaded', () => {
    wrap(<TabLabel selectedItemId="item-x" />);
    expect(screen.getByText('Item X')).toBeInTheDocument();
  });
});
