// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RenderingsList } from './RenderingsList';
import type { ComposedLayout } from '@/lib/types';
import type { RenderingEntry } from './types';

const hooks = vi.hoisted(() => ({
  usePlaceholderPaths: vi.fn((): { data: unknown } => ({ data: undefined })),
  useComposedLayout: vi.fn((): { data: unknown } => ({ data: undefined })),
  useRenderingMeta: vi.fn((): { data: unknown } => ({ data: undefined })),
}));
vi.mock('./hooks', () => hooks);

function mockComposed(data: ComposedLayout) {
  hooks.useComposedLayout.mockReturnValue({ data });
}

const noop = () => {};

function renderList(entries: RenderingEntry[] = []) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <RenderingsList
        entries={entries}
        pageItemId="page-1"
        editing
        onAdd={noop}
        onEdit={noop}
        onMoveUp={noop}
        onMoveDown={noop}
        onRemove={noop}
      />
    </QueryClientProvider>,
  );
}

describe('RenderingsList - composed layout', () => {
  it('renders composed root placeholders for an empty page instead of "No placeholders"', () => {
    mockComposed({ entries: [], placeholders: [{ value: 'headless-main', source: 'discovered' }] });
    renderList([]);
    expect(screen.queryByText('No placeholders.')).not.toBeInTheDocument();
    expect(screen.getByText('headless-main')).toBeInTheDocument();
  });
});
