// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LookupFieldEditor } from './LookupFieldEditor';

const hookMocks = vi.hoisted(() => ({
  useTree: vi.fn(() => ({ data: [], isLoading: false })),
  useChildren: vi.fn(() => ({ data: [], isLoading: false })),
  useAncestors: vi.fn(() => ({ data: [], isLoading: false })),
  useLookupSource: vi.fn(() => ({
    data: [
      { id: '11111111-1111-1111-1111-111111111111', name: 'Alpha', displayName: 'Alpha' },
      { id: '22222222-2222-2222-2222-222222222222', name: 'Beta', displayName: 'Beta' },
    ],
    isLoading: false,
    error: undefined,
  })),
  useItem: vi.fn((_id: string | null) => ({ data: undefined as { id: string; name: string } | undefined })),
  useItemByPath: vi.fn((_path: string | null) => ({ data: undefined })),
}));

vi.mock('@/hooks/useItems', () => hookMocks);

const wrap = (ui: React.ReactElement) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
};

describe('LookupFieldEditor Droptree variant', () => {
  it('renders the resolved item name when value is a braced GUID matching a source item', () => {
    wrap(
      <LookupFieldEditor
        kind="Droptree"
        fieldId="abc"
        label="Parameters Template"
        value="{11111111-1111-1111-1111-111111111111}"
        fieldSource="/sitecore/templates/foo"
        editing
        onChange={() => {}}
      />
    );
    expect(screen.getByText('Alpha')).toBeInTheDocument();
  });

  it('shows a fallback option name when stored GUID is not in the source list', () => {
    // SXA Droptree case: Parameters Template = /sitecore/templates resolves
    // to top-level folders, but the stored value points at a deeply-nested
    // project template. Without the fallback, the Select trigger renders
    // blank; with it, useItem resolves the name and a phantom option shows.
    hookMocks.useItem.mockImplementation((id: string | null) =>
      id === '99999999-9999-9999-9999-999999999999'
        ? { data: { id, name: 'Deeply Nested Template' } }
        : { data: undefined }
    );
    wrap(
      <LookupFieldEditor
        kind="Droptree"
        fieldId="abc"
        label="Parameters Template"
        value="{99999999-9999-9999-9999-999999999999}"
        fieldSource="/sitecore/templates"
        editing
        onChange={() => {}}
      />
    );
    expect(screen.getByText('Deeply Nested Template')).toBeInTheDocument();
  });

  it('falls back to a raw text input when fieldSource is empty', () => {
    wrap(
      <LookupFieldEditor
        kind="Droptree"
        fieldId="abc"
        label="Parameters Template"
        value="{11111111-1111-1111-1111-111111111111}"
        fieldSource=""
        editing
        onChange={() => {}}
      />
    );
    expect(screen.getByText(/no Source/i)).toBeInTheDocument();
  });
});
