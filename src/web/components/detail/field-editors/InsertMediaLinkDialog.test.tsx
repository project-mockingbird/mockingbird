// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { InsertMediaLinkDialog } from './InsertMediaLinkDialog';

const hookMocks = vi.hoisted(() => ({
  useTree: vi.fn(() => ({
    data: [{ id: 'media-root', name: 'media library', path: '/sitecore/media library', template: 't', type: 'unknown', source: 'serialized', hasChildren: true }],
    isLoading: false,
  })),
  useChildren: vi.fn((id: string | null) => {
    if (id === 'media-root') return {
      data: [
        { id: 'm1', name: 'Photo 1', displayName: 'Photo 1', path: '/sitecore/media library/Photo 1', template: 't', type: 'unknown', source: 'serialized', hasChildren: false },
        { id: 'm2', name: 'Photo 2', displayName: 'Photo 2', path: '/sitecore/media library/Photo 2', template: 't', type: 'unknown', source: 'serialized', hasChildren: false },
      ],
      isLoading: false,
    };
    return { data: [], isLoading: false };
  }),
  useAncestors: vi.fn((): { data: string[]; isLoading: boolean } => ({ data: [], isLoading: false })),
  useLookupSource: vi.fn((): { data: unknown; isLoading: boolean; isError: boolean } => ({ data: undefined, isLoading: false, isError: false })),
  useItemByPath: vi.fn((path?: string | null) => {
    if (path === '/sitecore/media library') return { data: { id: 'media-root', name: 'media library', path: '/sitecore/media library' }, isLoading: false };
    return { data: undefined, isLoading: false };
  }),
  useItem: vi.fn((_id?: string | null): { data: unknown; isLoading: boolean } => ({ data: undefined, isLoading: false })),
}));

vi.mock('@/hooks/useItems', () => hookMocks);

const wrap = (ui: React.ReactElement) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
};

describe('InsertMediaLinkDialog', () => {
  it('renders title and description', () => {
    wrap(
      <InsertMediaLinkDialog open onOpenChange={() => {}} onInsert={() => {}} existing={null} />,
    );
    expect(screen.getByText('Insert Media Link')).toBeInTheDocument();
    expect(screen.getByText(/Navigate to the media item/)).toBeInTheDocument();
  });

  it('Insert is disabled until a media item is selected', () => {
    wrap(
      <InsertMediaLinkDialog open onOpenChange={() => {}} onInsert={() => {}} existing={null} />,
    );
    expect(screen.getByRole('button', { name: 'Insert' })).toBeDisabled();
  });

  it('roots the tree at the media library item children', () => {
    wrap(
      <InsertMediaLinkDialog open onOpenChange={() => {}} onInsert={() => {}} existing={null} />,
    );
    expect(screen.getByText('Photo 1')).toBeInTheDocument();
    expect(screen.getByText('Photo 2')).toBeInTheDocument();
  });

  it('selecting an item enables Insert and auto-defaults Description to the item name', () => {
    wrap(
      <InsertMediaLinkDialog open onOpenChange={() => {}} onInsert={() => {}} existing={null} />,
    );
    fireEvent.click(screen.getByText('Photo 1'));
    expect(screen.getByRole('button', { name: 'Insert' })).toBeEnabled();
    expect(screen.getByLabelText('Description')).toHaveValue('Photo 1');
  });

  it('serializes media link XML on Insert', () => {
    const onInsert = vi.fn();
    wrap(
      <InsertMediaLinkDialog open onOpenChange={() => {}} onInsert={onInsert} existing={null} />,
    );
    fireEvent.click(screen.getByText('Photo 1'));
    fireEvent.click(screen.getByRole('button', { name: 'Insert' }));
    const xml = onInsert.mock.calls[0][0] as string;
    expect(xml).toContain('linktype="media"');
    expect(xml).toContain('text="Photo 1"');
    expect(xml).toContain('id="{M1}"');
  });

  it('uses lookup-source results as multi-root tree tops when fieldSource resolves', () => {
    hookMocks.useLookupSource.mockReturnValue({
      data: [
        { id: 'site-media-a', name: 'SiteA Media', displayName: 'SiteA Media', path: '/sitecore/media library/Project/SiteA', templateId: 't', hasChildren: true },
        { id: 'site-media-b', name: 'SiteB Media', displayName: 'SiteB Media', path: '/sitecore/media library/Project/SiteB', templateId: 't', hasChildren: true },
      ],
      isLoading: false,
      isError: false,
    });
    try {
      wrap(
        <InsertMediaLinkDialog
          open
          onOpenChange={() => {}}
          onInsert={() => {}}
          existing={null}
          fieldSource="query:$siteMedia"
          contextItemId="ctx-id"
        />,
      );
      expect(hookMocks.useLookupSource).toHaveBeenCalledWith('query:$siteMedia', 'ctx-id');
      expect(screen.getByText('SiteA Media')).toBeInTheDocument();
      expect(screen.getByText('SiteB Media')).toBeInTheDocument();
      // The full media library fallback root should NOT be visible.
      expect(screen.queryByText('Photo 1')).toBeNull();
    } finally {
      hookMocks.useLookupSource.mockReturnValue({ data: undefined, isLoading: false, isError: false });
    }
  });

  it('falls back to /sitecore/media library when fieldSource is empty', () => {
    wrap(
      <InsertMediaLinkDialog
        open
        onOpenChange={() => {}}
        onInsert={() => {}}
        existing={null}
        fieldSource=""
        contextItemId="ctx-id"
      />,
    );
    expect(screen.getByText('Photo 1')).toBeInTheDocument();
    expect(screen.getByText('Photo 2')).toBeInTheDocument();
  });
});
