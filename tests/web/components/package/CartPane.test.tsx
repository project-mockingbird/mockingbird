// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CartPane, readPersistedCartPaneOpen } from '@/components/package/CartPane';
import { packageCartStore } from '@/state/packageCartStore';

const PANE_OPEN_STORAGE_KEY = 'mockingbird.packageCartPane.open';

let mem: Record<string, string>;
let originalFetch: typeof globalThis.fetch;

function renderPane(ui: React.ReactElement) {
  // CartSourceRow uses React Query (for /api/package/source-size). Wrap so
  // the row's hook has a client; the tests themselves don't assert on the
  // count value (CartSourceRow's own tests cover that).
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

function stubFetchAlwaysOk() {
  globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ count: 0, state: 'ready', taco: false }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  })) as unknown as typeof globalThis.fetch;
}

describe('CartPane', () => {
  beforeEach(() => {
    mem = {};
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => mem[k] ?? null,
      setItem: (k: string, v: string) => { mem[k] = v; },
      removeItem: (k: string) => { delete mem[k]; },
      clear: () => { mem = {}; },
    });
    originalFetch = globalThis.fetch;
    stubFetchAlwaysOk();
    packageCartStore.clearAll();
  });

  afterEach(() => {
    packageCartStore.clearAll();
    globalThis.fetch = originalFetch;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders empty state when cart has no sources', () => {
    renderPane(<CartPane open onOpenChange={() => {}} onCheckout={() => {}} />);
    expect(screen.getByText(/your package is empty/i)).toBeInTheDocument();
    expect(screen.getByText(/0 sources/i)).toBeInTheDocument();
  });

  it('lists rows and source-count when cart has sources', () => {
    act(() => {
      packageCartStore.addSource({
        rootItemId: 'r1', rootItemPath: '/sitecore/content/Site/Home', rootItemName: 'Home', scope: 'itemAndDescendants',
      });
      packageCartStore.addSource({
        rootItemId: 'r2', rootItemPath: '/sitecore/content/Data/Hero', rootItemName: 'Hero', scope: 'itemAndChildren',
      });
    });
    renderPane(<CartPane open onOpenChange={() => {}} onCheckout={() => {}} />);
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Hero')).toBeInTheDocument();
    expect(screen.getByText(/2 sources/)).toBeInTheDocument();
    expect(screen.queryByText(/your package is empty/i)).not.toBeInTheDocument();
  });

  it('Download ZIP button is disabled with empty cart', () => {
    renderPane(<CartPane open onOpenChange={() => {}} onCheckout={() => {}} />);
    expect(screen.getByRole('button', { name: /download zip/i })).toBeDisabled();
  });

  it('Download ZIP button is enabled with at least one source and calls onCheckout', () => {
    act(() => {
      packageCartStore.addSource({
        rootItemId: 'r1', rootItemPath: '/a', rootItemName: 'a', scope: 'itemAndDescendants',
      });
    });
    const onCheckout = vi.fn();
    renderPane(<CartPane open onOpenChange={() => {}} onCheckout={onCheckout} />);
    const btn = screen.getByRole('button', { name: /download zip/i });
    expect(btn).toBeEnabled();
    fireEvent.click(btn);
    expect(onCheckout).toHaveBeenCalledTimes(1);
  });

  it('renders the "Package" title (not "Package Cart")', () => {
    renderPane(<CartPane open onOpenChange={() => {}} onCheckout={() => {}} />);
    const heading = screen.getByText('Package');
    expect(heading).toBeInTheDocument();
    expect(screen.queryByText('Package Cart')).not.toBeInTheDocument();
  });

  it('Clear button is hidden when cart is empty', () => {
    renderPane(<CartPane open onOpenChange={() => {}} onCheckout={() => {}} />);
    expect(screen.queryByRole('button', { name: /clear package/i })).not.toBeInTheDocument();
  });

  it('Clear button appears when cart has sources, opens AlertDialog, clears on confirm', () => {
    act(() => {
      packageCartStore.addSource({
        rootItemId: 'r1', rootItemPath: '/a', rootItemName: 'a', scope: 'itemAndDescendants',
      });
    });
    renderPane(<CartPane open onOpenChange={() => {}} onCheckout={() => {}} />);
    expect(packageCartStore.getSnapshot().sources).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: /clear package/i }));
    // The AlertDialog now appears with "Clear package?" title.
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByText(/clear package\?/i)).toBeInTheDocument();

    // Click the in-dialog "Clear" action to confirm.
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(packageCartStore.getSnapshot().sources).toHaveLength(0);
  });

  it('Clear AlertDialog Cancel keeps the cart intact', () => {
    act(() => {
      packageCartStore.addSource({
        rootItemId: 'r1', rootItemPath: '/a', rootItemName: 'a', scope: 'itemAndDescendants',
      });
    });
    renderPane(<CartPane open onOpenChange={() => {}} onCheckout={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /clear package/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(packageCartStore.getSnapshot().sources).toHaveLength(1);
  });

  it('persists open=true to localStorage when open', () => {
    renderPane(<CartPane open onOpenChange={() => {}} onCheckout={() => {}} />);
    expect(mem[PANE_OPEN_STORAGE_KEY]).toBe('true');
  });

  it('persists open=false to localStorage when closed', () => {
    renderPane(<CartPane open={false} onOpenChange={() => {}} onCheckout={() => {}} />);
    expect(mem[PANE_OPEN_STORAGE_KEY]).toBe('false');
  });

  it('readPersistedCartPaneOpen returns the stored value', () => {
    mem[PANE_OPEN_STORAGE_KEY] = 'true';
    expect(readPersistedCartPaneOpen()).toBe(true);
    mem[PANE_OPEN_STORAGE_KEY] = 'false';
    expect(readPersistedCartPaneOpen()).toBe(false);
  });

  it('readPersistedCartPaneOpen returns default when no value stored', () => {
    expect(readPersistedCartPaneOpen()).toBe(false);
    expect(readPersistedCartPaneOpen(true)).toBe(true);
  });

  it('readPersistedCartPaneOpen returns default on corrupt JSON', () => {
    mem[PANE_OPEN_STORAGE_KEY] = '{not-json';
    expect(readPersistedCartPaneOpen(false)).toBe(false);
  });
});
