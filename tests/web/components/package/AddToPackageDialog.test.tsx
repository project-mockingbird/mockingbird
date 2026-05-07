// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { AddToPackageDialog } from '@/components/package/AddToPackageDialog';
import { packageCartStore } from '@/state/packageCartStore';

const ITEM = {
  id: '{a1b2c3d4-e5f6-7890-1234-567890abcdef}',
  path: '/sitecore/content/Site/Home',
  name: 'Home',
};

let mem: Record<string, string>;

describe('AddToPackageDialog (cart mode)', () => {
  beforeEach(() => {
    mem = {};
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => mem[k] ?? null,
      setItem: (k: string, v: string) => { mem[k] = v; },
      removeItem: (k: string) => { delete mem[k]; },
      clear: () => { mem = {}; },
    });
    packageCartStore.clearAll();
  });

  afterEach(() => {
    packageCartStore.clearAll();
    vi.unstubAllGlobals();
  });

  it('renders the item path and the cart-mode title when open', () => {
    render(<AddToPackageDialog item={ITEM} open onOpenChange={() => {}} />);
    expect(screen.getByText(/Add "Home" to Package/)).toBeInTheDocument();
    expect(screen.getByText('/sitecore/content/Site/Home')).toBeInTheDocument();
  });

  it('does not render the ID field', () => {
    render(<AddToPackageDialog item={ITEM} open onOpenChange={() => {}} />);
    expect(screen.queryByText(ITEM.id)).not.toBeInTheDocument();
    expect(screen.queryByText(/^ID:/)).not.toBeInTheDocument();
  });

  it('renders a Source Name input defaulted to the item name', () => {
    render(<AddToPackageDialog item={ITEM} open onOpenChange={() => {}} />);
    const input = screen.getByLabelText(/source name/i) as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.value).toBe('Home');
  });

  it('does not render dialog content when closed', () => {
    render(<AddToPackageDialog item={ITEM} open={false} onOpenChange={() => {}} />);
    expect(screen.queryByText(/Add "Home" to Package/)).not.toBeInTheDocument();
  });

  it('defaults to "Root and descendants" scope', () => {
    render(<AddToPackageDialog item={ITEM} open onOpenChange={() => {}} />);
    const radio = document.getElementById('scope-itemAndDescendants');
    expect(radio?.getAttribute('aria-checked')).toBe('true');
  });

  it('submit uses the typed Source Name as rootItemName', () => {
    const onOpenChange = vi.fn();
    render(<AddToPackageDialog item={ITEM} open onOpenChange={onOpenChange} />);

    const input = screen.getByLabelText(/source name/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Site Home Page' } });
    fireEvent.click(document.getElementById('scope-childrenOnly')!);
    fireEvent.click(screen.getByRole('button', { name: /add to package/i }));

    const sources = packageCartStore.getSnapshot().sources;
    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({
      rootItemId: ITEM.id,
      rootItemPath: ITEM.path,
      rootItemName: 'Site Home Page',
      scope: 'childrenOnly',
      database: 'master',
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('blank Source Name falls back to the item name on submit', () => {
    render(<AddToPackageDialog item={ITEM} open onOpenChange={() => {}} />);
    const input = screen.getByLabelText(/source name/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: /add to package/i }));
    expect(packageCartStore.getSnapshot().sources[0].rootItemName).toBe('Home');
  });

  it('cancel button closes without adding to cart', () => {
    const onOpenChange = vi.fn();
    render(<AddToPackageDialog item={ITEM} open onOpenChange={onOpenChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(packageCartStore.getSnapshot().sources).toEqual([]);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe('AddToPackageDialog (download mode)', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    mem = {};
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => mem[k] ?? null,
      setItem: (k: string, v: string) => { mem[k] = v; },
      removeItem: (k: string) => { delete mem[k]; },
      clear: () => { mem = {}; },
    });
    packageCartStore.clearAll();
    originalFetch = globalThis.fetch;
    // Stub URL.createObjectURL / revokeObjectURL for jsdom.
    if (!('createObjectURL' in URL)) {
      // @ts-expect-error - jsdom stub
      URL.createObjectURL = () => 'blob:stub';
    }
    if (!('revokeObjectURL' in URL)) {
      // @ts-expect-error - jsdom stub
      URL.revokeObjectURL = () => {};
    }
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:stub');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  });

  afterEach(() => {
    packageCartStore.clearAll();
    globalThis.fetch = originalFetch;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('uses the download-mode title and submit label', () => {
    render(<AddToPackageDialog item={ITEM} open mode="download" onOpenChange={() => {}} />);
    expect(screen.getByText(/Download "Home"/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add to package/i })).not.toBeInTheDocument();
  });

  it('submit calls /api/package and fires onDownloadSuccess (no cart mutation)', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="MyPackage.zip"',
        'X-Mockingbird-Package-Warnings': '[]',
        'X-Mockingbird-Package-Item-Count': '5',
      },
    }));
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;

    const onOpenChange = vi.fn();
    const onDownloadSuccess = vi.fn();
    render(
      <AddToPackageDialog
        item={ITEM}
        open
        mode="download"
        onOpenChange={onOpenChange}
        onDownloadSuccess={onDownloadSuccess}
      />,
    );

    const input = screen.getByLabelText(/source name/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'MyPackage' } });
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));

    await waitFor(() => expect(onDownloadSuccess).toHaveBeenCalledWith('MyPackage.zip'));
    expect(fetchSpy).toHaveBeenCalledWith('/api/package', expect.objectContaining({
      method: 'POST',
    }));
    const callBody = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(callBody.metadata.name).toBe('MyPackage');
    expect(callBody.sources[0].rootItemName).toBe('MyPackage');
    expect(packageCartStore.getSnapshot().sources).toEqual([]);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('failure path fires onDownloadError and keeps the dialog open', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'boom' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    }));
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;

    const onOpenChange = vi.fn();
    const onDownloadError = vi.fn();
    render(
      <AddToPackageDialog
        item={ITEM}
        open
        mode="download"
        onOpenChange={onOpenChange}
        onDownloadError={onDownloadError}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    await waitFor(() => expect(onDownloadError).toHaveBeenCalledWith('boom'));
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
