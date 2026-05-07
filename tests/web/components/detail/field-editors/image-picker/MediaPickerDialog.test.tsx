// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MediaPickerDialog } from '@/components/detail/field-editors/image-picker/MediaPickerDialog';
import * as engineStatusModule from '@/hooks/useEngineStatus';
import * as useItemsModule from '@/hooks/useItems';

// ---- field IDs (mirrors @/lib/image-xml constants) ----
const EXTENSION_FIELD_ID = 'c06867fe-9a43-4c7d-b739-48780492d06f';
const WIDTH_FIELD_ID = '22eac599-f13b-4607-a89d-c091763a467d';
const HEIGHT_FIELD_ID = 'de2ca9e4-c117-4c8a-a139-1ff4b199d15a';
const ALT_FIELD_ID = '65885c44-8fcd-4a7f-94f1-ee63703fe193';

// Default mocks - no source resolution (falls back to media library root),
// and useItem returns null (no media item detail loaded).
const mockUseLookupSource = vi.fn().mockReturnValue({ data: undefined, isLoading: false });
const mockUseItem = vi.fn().mockReturnValue({ data: undefined, isLoading: false });

const descendantsResponse = {
  items: [
    { id: 'a', name: 'A', path: '/sitecore/media library/A', template: 't', hasChildren: true },
    { id: 'b', name: 'B', path: '/sitecore/media library/A/B', template: 't', hasChildren: false },
  ],
};

const mediaItemWithDimensions = {
  id: 'm1',
  name: 'Hero',
  displayName: 'Hero',
  path: '/sitecore/media library/Hero',
  template: 't',
  sharedFields: [
    { id: EXTENSION_FIELD_ID, name: 'Extension', value: 'jpg' },
    { id: WIDTH_FIELD_ID, name: 'Width', value: '1688' },
    { id: HEIGHT_FIELD_ID, name: 'Height', value: '793' },
    { id: ALT_FIELD_ID, name: 'Alt', value: 'Hero alt text' },
  ],
};

function withClient(node: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

beforeEach(() => {
  mockUseLookupSource.mockReturnValue({ data: undefined, isLoading: false });
  mockUseItem.mockReturnValue({ data: undefined, isLoading: false });
  vi.spyOn(useItemsModule, 'useLookupSource').mockImplementation(mockUseLookupSource);
  vi.spyOn(useItemsModule, 'useItem').mockImplementation(mockUseItem);
  vi.spyOn(engineStatusModule, 'useEngineReady').mockReturnValue(true);

  global.fetch = vi.fn().mockImplementation((url: string) => {
    if (url.includes('/api/items/descendants')) {
      return Promise.resolve({ ok: true, json: async () => descendantsResponse });
    }
    if (url.includes('/api/tree/ancestors/')) {
      return Promise.resolve({ ok: true, json: async () => [] });
    }
    return Promise.resolve({ ok: true, json: async () => ({}) });
  }) as unknown as typeof fetch;
});

afterEach(() => vi.restoreAllMocks());

describe('MediaPickerDialog', () => {
  // 1. Tree renders when open.
  it('renders the descendants tree once the dialog is open', async () => {
    render(withClient(
      <MediaPickerDialog open={true} current={null} onConfirm={() => {}} onClose={() => {}} />
    ));
    await waitFor(() => expect(screen.getByText('A')).toBeInTheDocument());
  });

  // 2. All 5 form fields are present.
  it('renders all 5 form fields', () => {
    render(withClient(
      <MediaPickerDialog open={true} current={null} onConfirm={() => {}} onClose={() => {}} />
    ));
    expect(screen.getByLabelText(/alternate text/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^width/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^height/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/horizontal space/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/vertical space/i)).toBeInTheDocument();
  });

  // 3. OK is disabled when no selection.
  it('OK button is disabled when no selection', async () => {
    render(withClient(
      <MediaPickerDialog open={true} current={null} onConfirm={() => {}} onClose={() => {}} />
    ));
    await waitFor(() => expect(screen.getByText('A')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /^ok$/i })).toBeDisabled();
  });

  // 4. OK enables after selecting a tree node.
  it('OK enables after selecting a tree node', async () => {
    render(withClient(
      <MediaPickerDialog open={true} current={null} onConfirm={() => {}} onClose={() => {}} />
    ));
    await waitFor(() => expect(screen.getByText('A')).toBeInTheDocument());
    fireEvent.click(screen.getByText('A'));
    expect(screen.getByRole('button', { name: /^ok$/i })).not.toBeDisabled();
  });

  // 5. OK emits new XML with mediaid swapped + form values applied.
  it('OK emits new XML with selected mediaid and form values', async () => {
    const onConfirm = vi.fn();
    render(withClient(
      <MediaPickerDialog
        open={true}
        current={null}
        onConfirm={onConfirm}
        onClose={() => {}}
      />
    ));
    await waitFor(() => expect(screen.getByText('A')).toBeInTheDocument());
    fireEvent.click(screen.getByText('A'));
    fireEvent.change(screen.getByLabelText(/alternate text/i), { target: { value: 'my alt' } });
    fireEvent.change(screen.getByLabelText(/^width/i), { target: { value: '800' } });
    fireEvent.click(screen.getByRole('button', { name: /^ok$/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    const emitted = onConfirm.mock.calls[0][0] as string;
    expect(emitted).toContain('mediaid="a"');
    expect(emitted).toContain('alt="my alt"');
    expect(emitted).toContain('width="800"');
  });

  // 6. OK preserves hidden class and border from current.
  it('OK preserves the hidden cssClass and border from current (round-trip fidelity)', async () => {
    const onConfirm = vi.fn();
    render(withClient(
      <MediaPickerDialog
        open={true}
        current={{ mediaid: 'old', cssClass: 'scClearfix', border: '1' }}
        onConfirm={onConfirm}
        onClose={() => {}}
      />
    ));
    await waitFor(() => expect(screen.getByText('A')).toBeInTheDocument());
    // Expand A to reveal its child B, then select B.
    fireEvent.click(screen.getByRole('button', { name: /expand a/i }));
    await waitFor(() => expect(screen.getByText('B')).toBeInTheDocument());
    fireEvent.click(screen.getByText('B'));
    fireEvent.click(screen.getByRole('button', { name: /^ok$/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    const emitted = onConfirm.mock.calls[0][0] as string;
    expect(emitted).toContain('mediaid="b"');
    expect(emitted).toContain('class="scClearfix"');
    expect(emitted).toContain('border="1"');
  });

  // 7. Cancel calls onClose without onConfirm.
  it('Cancel calls onClose without onConfirm', async () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    render(withClient(
      <MediaPickerDialog open={true} current={null} onConfirm={onConfirm} onClose={onClose} />
    ));
    await waitFor(() => expect(screen.getByText('A')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  // 8. Filter input narrows the tree.
  it('filter input narrows the tree to matching nodes', async () => {
    render(withClient(
      <MediaPickerDialog open={true} current={null} onConfirm={() => {}} onClose={() => {}} />
    ));
    await waitFor(() => expect(screen.getByText('A')).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText(/filter/i), { target: { value: 'B' } });
    expect(screen.getByText('B')).toBeInTheDocument();
  });

  // 9. Form pre-fills from current ParsedImage.
  it('pre-fills form from current ParsedImage', () => {
    render(withClient(
      <MediaPickerDialog
        open={true}
        current={{ mediaid: 'm1', alt: 'my image', width: '640', hspace: '5', vspace: '10' }}
        onConfirm={() => {}}
        onClose={() => {}}
      />
    ));
    expect((screen.getByLabelText(/alternate text/i) as HTMLInputElement).value).toBe('my image');
    expect((screen.getByLabelText(/^width/i) as HTMLInputElement).value).toBe('640');
    expect((screen.getByLabelText(/horizontal space/i) as HTMLInputElement).value).toBe('5');
    expect((screen.getByLabelText(/vertical space/i) as HTMLInputElement).value).toBe('10');
  });

  // 10. Empty input on emit -> attribute omitted.
  it('empty input does not emit that attribute', async () => {
    const onConfirm = vi.fn();
    render(withClient(
      <MediaPickerDialog
        open={true}
        current={{ mediaid: 'old', width: '500' }}
        onConfirm={onConfirm}
        onClose={() => {}}
      />
    ));
    await waitFor(() => expect(screen.getByText('A')).toBeInTheDocument());
    fireEvent.click(screen.getByText('A'));
    // Clear width
    fireEvent.change(screen.getByLabelText(/^width/i), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /^ok$/i }));
    const emitted = onConfirm.mock.calls[0][0] as string;
    expect(emitted).not.toContain('width=');
    expect(emitted).toContain('mediaid="a"');
  });

  // 11. Non-integer width disables OK with error message.
  it('non-integer width disables OK with validation error', () => {
    render(withClient(
      <MediaPickerDialog
        open={true}
        current={{ mediaid: 'existing' }}
        onConfirm={() => {}}
        onClose={() => {}}
      />
    ));
    fireEvent.change(screen.getByLabelText(/^width/i), { target: { value: 'abc' } });
    expect(screen.getByText(/non-negative integer/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^ok$/i })).toBeDisabled();
  });

  // 12. Default Alt Text hint shows media item's __Alt.
  it('Default Alt Text hint shows the media item Alt when selected item resolves', () => {
    mockUseItem.mockReturnValue({ data: mediaItemWithDimensions, isLoading: false });
    render(withClient(
      <MediaPickerDialog
        open={true}
        current={{ mediaid: 'm1' }}
        onConfirm={() => {}}
        onClose={() => {}}
      />
    ));
    expect(screen.getByText(/Default Alternate Text:.*Hero alt text/)).toBeInTheDocument();
  });

  // 13. Original Dimensions hint shows media item W x H.
  it('Original Dimensions hint shows media item Width x Height', () => {
    mockUseItem.mockReturnValue({ data: mediaItemWithDimensions, isLoading: false });
    render(withClient(
      <MediaPickerDialog
        open={true}
        current={{ mediaid: 'm1' }}
        onConfirm={() => {}}
        onClose={() => {}}
      />
    ));
    expect(screen.getByText(/Original Dimensions:.*1688.*793/)).toBeInTheDocument();
  });

  // 14. Keep Aspect Ratio checkbox defaults to checked.
  it('Keep Aspect Ratio checkbox defaults to checked', () => {
    render(withClient(
      <MediaPickerDialog open={true} current={null} onConfirm={() => {}} onClose={() => {}} />
    ));
    expect(screen.getByLabelText(/keep aspect ratio/i)).toBeChecked();
  });

  // 15. KAR on + typing width auto-updates height proportionally.
  it('KAR on: typing width auto-updates height proportionally', () => {
    // mediaItem has W=1688, H=793
    mockUseItem.mockReturnValue({ data: mediaItemWithDimensions, isLoading: false });
    render(withClient(
      <MediaPickerDialog
        open={true}
        current={{ mediaid: 'm1' }}
        onConfirm={() => {}}
        onClose={() => {}}
      />
    ));
    // Ensure KAR is checked (default)
    expect(screen.getByLabelText(/keep aspect ratio/i)).toBeChecked();
    // Type width = 844 (half of 1688); expected height = round(844 * 793 / 1688) = round(396.5) = 397
    fireEvent.change(screen.getByLabelText(/^width/i), { target: { value: '844' } });
    const heightInput = screen.getByLabelText(/^height/i) as HTMLInputElement;
    expect(heightInput.value).toBe('397');
  });

  // 16. KAR off + typing width does NOT touch height.
  it('KAR off: typing width does not update height', () => {
    mockUseItem.mockReturnValue({ data: mediaItemWithDimensions, isLoading: false });
    render(withClient(
      <MediaPickerDialog
        open={true}
        current={{ mediaid: 'm1', height: '200' }}
        onConfirm={() => {}}
        onClose={() => {}}
      />
    ));
    // Uncheck KAR
    fireEvent.click(screen.getByLabelText(/keep aspect ratio/i));
    expect(screen.getByLabelText(/keep aspect ratio/i)).not.toBeChecked();
    fireEvent.change(screen.getByLabelText(/^width/i), { target: { value: '844' } });
    const heightInput = screen.getByLabelText(/^height/i) as HTMLInputElement;
    // Height should remain what was pre-filled (200), not auto-updated.
    expect(heightInput.value).toBe('200');
  });

  // 17. Site-scoping: useLookupSource called with fieldSource + contextItemId.
  it('passes fieldSource and contextItemId to useLookupSource', () => {
    render(withClient(
      <MediaPickerDialog
        open={true}
        current={null}
        fieldSource="query:$siteMedia"
        contextItemId="ctx-id"
        onConfirm={() => {}}
        onClose={() => {}}
      />
    ));
    expect(mockUseLookupSource).toHaveBeenCalledWith('query:$siteMedia', 'ctx-id');
  });

  // 18. Site-scoping: descendants fetch uses resolved path.
  it('uses the resolved source root path for the descendants fetch when useLookupSource returns items', async () => {
    const siteMediaPath = '/sitecore/media library/Project/tenant/site-bar';
    mockUseLookupSource.mockReturnValue({
      data: [{ id: 'site-root', name: 'site-bar', displayName: 'site-bar', path: siteMediaPath, templateId: 't', hasChildren: true }],
      isLoading: false,
    });
    render(withClient(
      <MediaPickerDialog
        open={true}
        current={null}
        fieldSource="query:$siteMedia"
        contextItemId="ctx-id"
        onConfirm={() => {}}
        onClose={() => {}}
      />
    ));
    await waitFor(() => {
      const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
      const descendantsCalls = fetchMock.mock.calls.filter(
        (args: unknown[]) => typeof args[0] === 'string' && (args[0] as string).includes('/api/items/descendants'),
      );
      expect(descendantsCalls.length).toBeGreaterThan(0);
      expect(descendantsCalls[0][0]).toContain(encodeURIComponent(siteMediaPath));
    });
  });
});
