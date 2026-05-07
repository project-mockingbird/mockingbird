// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { InsertLinkDialog } from './InsertLinkDialog';

const hookMocks = vi.hoisted(() => ({
  useTree: vi.fn(() => ({
    data: [{ id: 'aaa', name: 'sitecore', path: '/sitecore', template: 'tpl', type: 'unknown', source: 'serialized', hasChildren: true }],
    isLoading: false,
  })),
  useChildren: vi.fn((id: string | null) => {
    if (id === 'aaa') return {
      data: [
        { id: 'bbb', name: 'Home', path: '/sitecore/content/Home', template: 'tpl', type: 'unknown', source: 'serialized', hasChildren: true },
        { id: 'ccc', name: 'Settings', path: '/sitecore/content/Settings', template: 'tpl', type: 'unknown', source: 'serialized', hasChildren: false },
      ],
      isLoading: false,
    };
    if (id === 'content-id') return {
      data: [
        { id: 'bbb', name: 'Home', path: '/sitecore/content/Home', template: 'tpl', type: 'unknown', source: 'serialized', hasChildren: true },
        { id: 'ccc', name: 'Settings', path: '/sitecore/content/Settings', template: 'tpl', type: 'unknown', source: 'serialized', hasChildren: false },
      ],
      isLoading: false,
    };
    return { data: [], isLoading: false };
  }),
  useAncestors: vi.fn((): { data: string[]; isLoading: boolean } => ({ data: [], isLoading: false })),
  useLookupSource: vi.fn((): { data: unknown; isLoading: boolean; isError: boolean } => ({ data: undefined, isLoading: false, isError: false })),
  useItem: vi.fn((_id?: string | null): { data: unknown; isLoading: boolean } => ({ data: undefined, isLoading: false })),
}));

vi.mock('@/hooks/useItems', () => hookMocks);

const wrap = (ui: React.ReactElement) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
};

describe('InsertLinkDialog skeleton', () => {
  it('does not render when open=false', () => {
    wrap(
      <InsertLinkDialog
        open={false}
        onOpenChange={() => {}}
        onInsert={() => {}}
        existing={null}
        fieldSource=""
        contextItemId={undefined}
      />,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders dialog with title, Insert and Cancel buttons when open', () => {
    wrap(
      <InsertLinkDialog
        open
        onOpenChange={() => {}}
        onInsert={() => {}}
        existing={null}
        fieldSource=""
        contextItemId={undefined}
      />,
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Insert Link')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Insert' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
  });

  it('Cancel button calls onOpenChange(false) and does NOT call onInsert', () => {
    const onOpenChange = vi.fn();
    const onInsert = vi.fn();
    wrap(
      <InsertLinkDialog
        open
        onOpenChange={onOpenChange}
        onInsert={onInsert}
        existing={null}
        fieldSource=""
        contextItemId={undefined}
      />,
    );
    screen.getByRole('button', { name: 'Cancel' }).click();
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onInsert).not.toHaveBeenCalled();
  });
});

describe('InsertLinkDialog form pane', () => {
  it('renders all 7 form inputs, all disabled when no selection', () => {
    wrap(
      <InsertLinkDialog
        open
        onOpenChange={() => {}}
        onInsert={() => {}}
        existing={null}
        fieldSource=""
        contextItemId={undefined}
      />,
    );
    expect(screen.getByLabelText('Description')).toBeDisabled();
    expect(screen.getByLabelText('Anchor')).toBeDisabled();
    expect(screen.getByLabelText('Target')).toBeDisabled();
    expect(screen.getByLabelText('Custom')).toBeDisabled();
    expect(screen.getByLabelText('Alternate text')).toBeDisabled();
    expect(screen.getByLabelText('Style class')).toBeDisabled();
    expect(screen.getByLabelText('Query string')).toBeDisabled();
  });

  it('Item Name and Type display dashes when no selection', () => {
    wrap(
      <InsertLinkDialog
        open
        onOpenChange={() => {}}
        onInsert={() => {}}
        existing={null}
        fieldSource=""
        contextItemId={undefined}
      />,
    );
    expect(screen.getByTestId('insert-link-item-name')).toHaveTextContent('-');
    expect(screen.getByTestId('insert-link-item-type')).toHaveTextContent('-');
  });
});

describe('InsertLinkDialog tree pane', () => {
  it('renders the root-level items from useTree', () => {
    wrap(
      <InsertLinkDialog
        open
        onOpenChange={() => {}}
        onInsert={() => {}}
        existing={null}
        fieldSource=""
        contextItemId={undefined}
      />,
    );
    expect(screen.getByText('sitecore')).toBeInTheDocument();
  });

  it('expands a node on chevron click and shows children', () => {
    wrap(
      <InsertLinkDialog
        open
        onOpenChange={() => {}}
        onInsert={() => {}}
        existing={null}
        fieldSource=""
        contextItemId={undefined}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Expand sitecore/i }));
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('selecting a node enables form inputs and Insert button', () => {
    wrap(
      <InsertLinkDialog
        open
        onOpenChange={() => {}}
        onInsert={() => {}}
        existing={null}
        fieldSource=""
        contextItemId={undefined}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Expand sitecore/i }));
    fireEvent.click(screen.getByText('Settings'));
    expect(screen.getByLabelText('Description')).toBeEnabled();
    expect(screen.getByLabelText('Target')).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Insert' })).toBeEnabled();
    expect(screen.getByTestId('insert-link-item-name')).toHaveTextContent('Settings');
  });
});

describe('InsertLinkDialog Source-handling', () => {
  beforeEach(() => {
    hookMocks.useLookupSource.mockReturnValue({ data: undefined, isLoading: false, isError: false });
  });

  it('falls back to full tree when Source is empty', () => {
    hookMocks.useLookupSource.mockReturnValue({ data: undefined, isLoading: false, isError: false });
    wrap(
      <InsertLinkDialog
        open
        onOpenChange={() => {}}
        onInsert={() => {}}
        existing={null}
        fieldSource=""
        contextItemId={undefined}
      />,
    );
    // No source -> full tree via useTree() shows the mock 'sitecore' root.
    expect(screen.getByText('sitecore')).toBeInTheDocument();
  });

  it('falls back to full tree when useLookupSource returns empty list', () => {
    hookMocks.useLookupSource.mockReturnValue({ data: [], isLoading: false, isError: false });
    wrap(
      <InsertLinkDialog
        open
        onOpenChange={() => {}}
        onInsert={() => {}}
        existing={null}
        fieldSource="query:$linkableHomes"
        contextItemId="ctx-id"
      />,
    );
    expect(screen.getByText('sitecore')).toBeInTheDocument();
  });

  it('renders Source items as multi-root tree (cross-parent case e.g. $linkableHomes)', () => {
    hookMocks.useLookupSource.mockReturnValue({
      data: [
        { id: 'home-a', name: 'Home A', displayName: 'Home A', path: '/sitecore/content/SiteA/Home', templateId: 't', hasChildren: true },
        { id: 'home-b', name: 'Home B', displayName: 'Home B', path: '/sitecore/content/SiteB/Home', templateId: 't', hasChildren: true },
      ],
      isLoading: false,
      isError: false,
    });
    wrap(
      <InsertLinkDialog
        open
        onOpenChange={() => {}}
        onInsert={() => {}}
        existing={null}
        fieldSource="query:$linkableHomes"
        contextItemId="ctx-id"
      />,
    );
    expect(screen.getByText('Home A')).toBeInTheDocument();
    expect(screen.getByText('Home B')).toBeInTheDocument();
    // Source items REPLACE the full /sitecore fallback - tree is constrained to source.
    expect(screen.queryByText('sitecore')).toBeNull();
  });

  it('renders Source items as multi-root tree even when they share a parent (constrains to source items)', () => {
    // Earlier design rooted at the common parent and showed ALL its children;
    // that defeats the point of the Source constraint. Now we always surface
    // the resolved items themselves as the tree roots.
    hookMocks.useLookupSource.mockReturnValue({
      data: [
        { id: 'x', name: 'Foo', displayName: 'Foo', path: '/sitecore/content/Foo', templateId: 't', hasChildren: true },
        { id: 'y', name: 'Bar', displayName: 'Bar', path: '/sitecore/content/Bar', templateId: 't', hasChildren: true },
      ],
      isLoading: false,
      isError: false,
    });
    wrap(
      <InsertLinkDialog
        open
        onOpenChange={() => {}}
        onInsert={() => {}}
        existing={null}
        fieldSource="/sitecore/content"
        contextItemId="ctx-id"
      />,
    );
    // The two source items appear as independently-expandable roots.
    expect(screen.getByText('Foo')).toBeInTheDocument();
    expect(screen.getByText('Bar')).toBeInTheDocument();
    // No fallback to the full /sitecore tree.
    expect(screen.queryByText('sitecore')).toBeNull();
  });
});

describe('InsertLinkDialog Description auto-default', () => {
  beforeEach(() => {
    hookMocks.useLookupSource.mockReturnValue({ data: undefined, isLoading: false, isError: false });
    hookMocks.useItem.mockReturnValue({ data: undefined, isLoading: false });
  });

  it('auto-fills Description with selected item name when no existing text', () => {
    wrap(
      <InsertLinkDialog
        open
        onOpenChange={() => {}}
        onInsert={() => {}}
        existing={null}
        fieldSource=""
        contextItemId={undefined}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Expand sitecore/i }));
    fireEvent.click(screen.getByText('Settings'));
    expect((screen.getByLabelText('Description') as HTMLInputElement).value).toBe('Settings');
  });

  it('updates Description when selection changes (until the user types)', () => {
    wrap(
      <InsertLinkDialog
        open
        onOpenChange={() => {}}
        onInsert={() => {}}
        existing={null}
        fieldSource=""
        contextItemId={undefined}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Expand sitecore/i }));
    fireEvent.click(screen.getByText('Home'));
    expect((screen.getByLabelText('Description') as HTMLInputElement).value).toBe('Home');
    fireEvent.click(screen.getByText('Settings'));
    expect((screen.getByLabelText('Description') as HTMLInputElement).value).toBe('Settings');
  });

  it('preserves user-typed Description across selection changes', () => {
    wrap(
      <InsertLinkDialog
        open
        onOpenChange={() => {}}
        onInsert={() => {}}
        existing={null}
        fieldSource=""
        contextItemId={undefined}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Expand sitecore/i }));
    fireEvent.click(screen.getByText('Home'));
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'My Custom Text' } });
    fireEvent.click(screen.getByText('Settings'));
    // Selection changed; Description is preserved because user explicitly typed.
    expect((screen.getByLabelText('Description') as HTMLInputElement).value).toBe('My Custom Text');
  });

  it('does NOT auto-default when opening with existing non-empty text', () => {
    hookMocks.useItem.mockReturnValue({
      data: { id: 'bbb', name: 'Linked Item', displayName: 'Linked Item', path: '/x', template: 'tpl' },
      isLoading: false,
    });
    wrap(
      <InsertLinkDialog
        open
        onOpenChange={() => {}}
        onInsert={() => {}}
        existing={{ linktype: 'internal', id: 'bbb', text: 'Existing Author Text' }}
        fieldSource=""
        contextItemId={undefined}
      />,
    );
    expect((screen.getByLabelText('Description') as HTMLInputElement).value).toBe('Existing Author Text');
  });
});

describe('InsertLinkDialog edit-mode pre-population', () => {
  beforeEach(() => {
    hookMocks.useItem.mockReturnValue({ data: undefined, isLoading: false });
    hookMocks.useAncestors.mockReturnValue({ data: [], isLoading: false });
  });

  it('pre-populates form fields from existing internal-link parts', () => {
    wrap(
      <InsertLinkDialog
        open
        onOpenChange={() => {}}
        onInsert={() => {}}
        existing={{
          linktype: 'internal',
          id: 'bbb',
          text: 'Read More',
          anchor: 'top',
          target: '_blank',
          title: 'tip',
          class: 'btn',
          querystring: 'foo=bar',
        }}
        fieldSource=""
        contextItemId={undefined}
      />,
    );
    expect((screen.getByLabelText('Description') as HTMLInputElement).value).toBe('Read More');
    expect((screen.getByLabelText('Anchor') as HTMLInputElement).value).toBe('top');
    expect((screen.getByLabelText('Alternate text') as HTMLInputElement).value).toBe('tip');
    expect((screen.getByLabelText('Style class') as HTMLInputElement).value).toBe('btn');
    expect((screen.getByLabelText('Query string') as HTMLInputElement).value).toBe('foo=bar');
  });

  it('opens with blank form when existing linktype is not internal', () => {
    wrap(
      <InsertLinkDialog
        open
        onOpenChange={() => {}}
        onInsert={() => {}}
        existing={{
          linktype: 'media',
          id: 'media-id',
          text: 'IGNORED',
        }}
        fieldSource=""
        contextItemId={undefined}
      />,
    );
    expect((screen.getByLabelText('Description') as HTMLInputElement).value).toBe('');
  });

  it('toggling Target to Custom enables Custom input', () => {
    wrap(
      <InsertLinkDialog
        open
        onOpenChange={() => {}}
        onInsert={() => {}}
        existing={{
          linktype: 'internal',
          id: 'bbb',
          text: '',
          target: 'my-frame', // custom value
        }}
        fieldSource=""
        contextItemId={undefined}
      />,
    );
    expect((screen.getByLabelText('Custom') as HTMLInputElement).value).toBe('my-frame');
  });

  it('expands to the linked item via ancestors when editing', () => {
    hookMocks.useAncestors.mockReturnValue({
      data: ['aaa', 'content-id', 'bbb'],
      isLoading: false,
    });
    wrap(
      <InsertLinkDialog
        open
        onOpenChange={() => {}}
        onInsert={() => {}}
        existing={{
          linktype: 'internal',
          id: 'bbb',
        }}
        fieldSource=""
        contextItemId={undefined}
      />,
    );
    expect(hookMocks.useAncestors).toHaveBeenCalledWith('bbb');
  });

  it('pre-selects the linked item in the tree when editing', () => {
    hookMocks.useItem.mockReturnValue({
      data: {
        id: 'bbb',
        name: 'Linked Item',
        displayName: 'Linked Item',
        path: '/sitecore/content/Home/Linked Item',
        template: 'tpl',
      },
      isLoading: false,
    });
    wrap(
      <InsertLinkDialog
        open
        onOpenChange={() => {}}
        onInsert={() => {}}
        existing={{
          linktype: 'internal',
          id: 'bbb',
        }}
        fieldSource=""
        contextItemId={undefined}
      />,
    );
    // Item Name shows the linked item's name
    expect(screen.getByTestId('insert-link-item-name')).toHaveTextContent('Linked Item');
    // Form inputs are now enabled because there's a selection
    expect(screen.getByLabelText('Description')).toBeEnabled();
    // Insert button enabled
    expect(screen.getByRole('button', { name: 'Insert' })).toBeEnabled();
  });
});

describe('InsertLinkDialog Insert button', () => {
  beforeEach(() => {
    hookMocks.useLookupSource.mockReturnValue({ data: undefined, isLoading: false, isError: false });
    hookMocks.useAncestors.mockReturnValue({ data: [], isLoading: false });
  });

  it('on Insert: calls onInsert with serialized XML and closes dialog', () => {
    const onInsert = vi.fn();
    const onOpenChange = vi.fn();
    wrap(
      <InsertLinkDialog
        open
        onOpenChange={onOpenChange}
        onInsert={onInsert}
        existing={null}
        fieldSource=""
        contextItemId={undefined}
      />,
    );
    // Select Settings (id ccc)
    fireEvent.click(screen.getByRole('button', { name: /Expand sitecore/i }));
    fireEvent.click(screen.getByText('Settings'));
    // Fill in some fields
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'My Link' } });
    fireEvent.change(screen.getByLabelText('Style class'), { target: { value: 'btn' } });
    // Insert
    fireEvent.click(screen.getByRole('button', { name: 'Insert' }));
    expect(onInsert).toHaveBeenCalledTimes(1);
    const xml = onInsert.mock.calls[0][0];
    expect(xml).toContain('text="My Link"');
    expect(xml).toContain('class="btn"');
    expect(xml).toContain('linktype="internal"');
    expect(xml).toContain('id="{CCC');  // braced uppercase prefix
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
