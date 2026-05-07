// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CopyMoveDestinationDialog } from './CopyMoveDestinationDialog';

// Mock data hooks. The dialog uses useAncestors directly; the embedded
// ItemTreePicker uses useTree + useChildren. Mirrors the harness pattern from
// ItemTreePicker.test.tsx so the framework shape stays consistent.
const hookMocks = vi.hoisted(() => ({
  useTree: vi.fn(() => ({ data: [], isLoading: false })),
  useChildren: vi.fn(() => ({ data: [], isLoading: false })),
  useAncestors: vi.fn(() => ({ data: [] })),
}));

vi.mock('@/hooks/useItems', () => hookMocks);

function withQc(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

const baseProps = {
  open: true,
  sourceId: 'source-id',
  sourceName: 'Foo',
  sourcePath: '/sitecore/content/Parent/Foo',
  sourceDescendantIds: new Set<string>(),
  sourceParentId: 'parent-id',
  sourceParentPath: '/sitecore/content/Parent',
  database: 'master',
  onConfirm: vi.fn(),
  onClose: vi.fn(),
};

describe('CopyMoveDestinationDialog', () => {
  it('mode=copy renders Copy title + button', () => {
    render(withQc(<CopyMoveDestinationDialog {...baseProps} mode="copy" />));
    expect(screen.getByText(/Copy "Foo" to/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Copy$/ })).toBeInTheDocument();
  });

  it('mode=move renders Move title + button', () => {
    render(withQc(<CopyMoveDestinationDialog {...baseProps} mode="move" />));
    expect(screen.getByText(/Move "Foo" to/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Move$/ })).toBeInTheDocument();
  });

  it('Copy button is disabled until a destination is picked', () => {
    render(withQc(<CopyMoveDestinationDialog {...baseProps} mode="copy" />));
    const btn = screen.getByRole('button', { name: /^Copy$/ });
    expect(btn).toBeDisabled();
  });

  it('shows server error inline', () => {
    render(withQc(
      <CopyMoveDestinationDialog
        {...baseProps}
        mode="move"
        serverError="An item named Foo already exists at /sitecore/content/Parent/Alt"
      />,
    ));
    expect(screen.getByText(/already exists at/)).toBeInTheDocument();
  });

  it('shows actionable hint under name-collision error in move mode', () => {
    render(withQc(
      <CopyMoveDestinationDialog
        {...baseProps}
        mode="move"
        serverError="An item named Foo already exists at /sitecore/content/Parent/Alt"
      />,
    ));
    expect(screen.getByText(/use Duplicate first then delete the original/i)).toBeInTheDocument();
  });
});
