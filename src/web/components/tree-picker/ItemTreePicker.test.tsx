// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ItemTreePicker } from './ItemTreePicker';

// Mock the data hooks the picker depends on. Mirrors the harness pattern used
// by InsertLinkDialog.test.tsx so the test framework shape is consistent.
const hookMocks = vi.hoisted(() => ({
  useTree: vi.fn(() => ({
    data: [
      { id: 'aaa', name: 'sitecore', path: '/sitecore', template: 'tpl', type: 'unknown', source: 'serialized', hasChildren: true },
    ],
    isLoading: false,
  })),
  useChildren: vi.fn((id: string | null) => {
    if (id === 'aaa') return {
      data: [
        { id: 'bbb', name: 'Home', path: '/sitecore/content/Home', template: 'tpl', type: 'unknown', source: 'serialized', hasChildren: false },
        { id: 'ccc', name: 'Settings', path: '/sitecore/content/Settings', template: 'tpl', type: 'unknown', source: 'serialized', hasChildren: false },
      ],
      isLoading: false,
    };
    return { data: [], isLoading: false };
  }),
}));

vi.mock('@/hooks/useItems', () => hookMocks);

function withQc(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

describe('ItemTreePicker', () => {
  it('renders a tree role region', () => {
    render(
      withQc(
        <ItemTreePicker
          database="master"
          selectedId={null}
          onSelect={() => {}}
        />,
      ),
    );
    expect(screen.getByRole('tree')).toBeInTheDocument();
  });

  it('renders top-level items from useTree by default', () => {
    render(
      withQc(
        <ItemTreePicker
          database="master"
          selectedId={null}
          onSelect={() => {}}
        />,
      ),
    );
    expect(screen.getByText('sitecore')).toBeInTheDocument();
  });

  it('expands a node on chevron click and shows children (lazy load)', () => {
    render(
      withQc(
        <ItemTreePicker
          database="master"
          selectedId={null}
          onSelect={() => {}}
        />,
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: /Expand sitecore/i }));
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('clicking a row calls onSelect with that node id', () => {
    const onSelect = vi.fn();
    render(
      withQc(
        <ItemTreePicker
          database="master"
          selectedId={null}
          onSelect={onSelect}
        />,
      ),
    );
    fireEvent.click(screen.getByText('sitecore'));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0].id).toBe('aaa');
  });
});
