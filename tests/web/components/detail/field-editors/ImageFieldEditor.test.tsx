// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ImageFieldEditor } from '@/components/detail/field-editors/ImageFieldEditor';
import * as engineStatusModule from '@/hooks/useEngineStatus';
import * as useItemsModule from '@/hooks/useItems';

function withClient(node: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

beforeEach(() => {
  vi.spyOn(engineStatusModule, 'useEngineReady').mockReturnValue(true);
  vi.spyOn(useItemsModule, 'useLookupSource').mockReturnValue({ data: undefined, isLoading: false });
  global.fetch = vi.fn().mockImplementation((url: string) => {
    if (typeof url !== 'string') return Promise.resolve({ ok: true, json: async () => ({}) });
    if (url.includes('/api/items/descendants')) {
      return Promise.resolve({ ok: true, json: async () => ({ items: [] }) });
    }
    if (url.includes('/api/tree/ancestors/')) {
      return Promise.resolve({ ok: true, json: async () => [] });
    }
    if (url.includes('/api/items/')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          id: 'stub', name: 'stub', path: '/sitecore/media library/stub', sharedFields: [],
        }),
      });
    }
    return Promise.resolve({ ok: true, json: async () => ({}) });
  }) as unknown as typeof fetch;
});

afterEach(() => vi.restoreAllMocks());

describe('ImageFieldEditor browse wiring', () => {
  it('Browse button opens the MediaPickerDialog when editing', async () => {
    render(withClient(
      <ImageFieldEditor
        fieldId="x"
        label="Image"
        value=""
        editing={true}
        onChange={() => {}}
      />
    ));
    fireEvent.click(screen.getByRole('button', { name: /^browse$/i }));
    await waitFor(() => expect(screen.getByText(/select an image/i)).toBeInTheDocument());
  });

  it('Browse button is disabled when not editing', () => {
    render(withClient(
      <ImageFieldEditor
        fieldId="x"
        label="Image"
        value=""
        editing={false}
        onChange={() => {}}
      />
    ));
    expect(screen.getByRole('button', { name: /^browse$/i })).toBeDisabled();
  });

  it('Properties button is not present in the toolbar', () => {
    render(withClient(
      <ImageFieldEditor
        fieldId="x"
        label="Image"
        value='<image mediaid="abc" alt="hi" />'
        editing={true}
        onChange={() => {}}
      />
    ));
    expect(screen.queryByRole('button', { name: /properties/i })).toBeNull();
  });
});
