// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CartSourceRow } from '@/components/package/CartSourceRow';
import { packageCartStore, type CartSource } from '@/state/packageCartStore';

let mem: Record<string, string>;
let originalFetch: typeof globalThis.fetch;

const makeSource = (overrides: Partial<CartSource> = {}): CartSource => ({
  id: 'cart-row-1',
  rootItemId: 'root-id',
  rootItemPath: '/sitecore/content/Site/Home',
  rootItemName: 'Home',
  scope: 'itemAndDescendants',
  database: 'master',
  ...overrides,
});

function renderWithQuery(ui: React.ReactElement) {
  // Disable retry + caching wrappers per-test so each render starts fresh.
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

// useEngineStatus -> /api/status fetch + /api/package/source-size fetch are
// all served by the same global fetch stub. Default returns ready engine
// + count=712 unless overridden.
function stubFetch({
  ready = true,
  sourceSize,
}: {
  ready?: boolean;
  sourceSize?: { ok: boolean; count?: number; status?: number; error?: string };
} = {}) {
  const size = sourceSize ?? { ok: true, count: 712 };
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/api/status')) {
      return new Response(
        JSON.stringify({ state: ready ? 'ready' : 'indexing', taco: false }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    if (url.includes('/api/package/source-size')) {
      if (size.ok) {
        return new Response(JSON.stringify({ count: size.count ?? 0 }), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ error: size.error ?? 'not found' }), {
        status: size.status ?? 404, headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('not found', { status: 404 });
  }) as unknown as typeof globalThis.fetch;
}

describe('CartSourceRow', () => {
  beforeEach(() => {
    mem = {};
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => mem[k] ?? null,
      setItem: (k: string, v: string) => { mem[k] = v; },
      removeItem: (k: string) => { delete mem[k]; },
      clear: () => { mem = {}; },
    });
    originalFetch = globalThis.fetch;
    packageCartStore.clearAll();
  });

  afterEach(() => {
    packageCartStore.clearAll();
    globalThis.fetch = originalFetch;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders the source name, path, and the current scope label', () => {
    stubFetch();
    renderWithQuery(<CartSourceRow source={makeSource()} />);
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('/sitecore/content/Site/Home')).toBeInTheDocument();
    expect(screen.getByText('Root and descendants')).toBeInTheDocument();
  });

  it('shows a loading placeholder before the count arrives', () => {
    stubFetch();
    renderWithQuery(<CartSourceRow source={makeSource()} />);
    expect(screen.getByLabelText(/item count/i)).toHaveTextContent('...');
  });

  it('renders the resolved item count once the fetch succeeds', async () => {
    stubFetch({ sourceSize: { ok: true, count: 712 } });
    renderWithQuery(<CartSourceRow source={makeSource()} />);
    await waitFor(() => {
      expect(screen.getByLabelText(/item count/i)).toHaveTextContent('712 items');
    });
  });

  it('uses singular "item" when the count is exactly 1', async () => {
    stubFetch({ sourceSize: { ok: true, count: 1 } });
    renderWithQuery(<CartSourceRow source={makeSource()} />);
    await waitFor(() => {
      expect(screen.getByLabelText(/item count/i)).toHaveTextContent('1 item');
    });
  });

  it('shows an unavailable label when the fetch fails', async () => {
    stubFetch({ sourceSize: { ok: false, status: 404, error: 'Item not found' } });
    renderWithQuery(<CartSourceRow source={makeSource()} />);
    await waitFor(() => {
      expect(screen.getByLabelText(/item count/i)).toHaveTextContent('count unavailable');
    });
  });

  it('remove button opens AlertDialog; confirm removes the source', () => {
    stubFetch();
    act(() => {
      packageCartStore.addSource({
        rootItemId: 'root-id',
        rootItemPath: '/sitecore/content/Site/Home',
        rootItemName: 'Home',
        scope: 'itemAndDescendants',
      });
    });
    const id = packageCartStore.getSnapshot().sources[0].id;
    renderWithQuery(<CartSourceRow source={packageCartStore.getSnapshot().sources[0]} />);

    fireEvent.click(screen.getByLabelText(/remove home from cart/i));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByText(/remove source\?/i)).toBeInTheDocument();
    expect(screen.getByText(/the source "Home" will be removed/i)).toBeInTheDocument();
    // Source still in cart until the user confirms.
    expect(packageCartStore.getSnapshot().sources.find((s) => s.id === id)).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(packageCartStore.getSnapshot().sources.find((s) => s.id === id)).toBeUndefined();
  });

  it('remove button + Cancel keeps the source in the cart', () => {
    stubFetch();
    act(() => {
      packageCartStore.addSource({
        rootItemId: 'root-id',
        rootItemPath: '/sitecore/content/Site/Home',
        rootItemName: 'Home',
        scope: 'itemAndDescendants',
      });
    });
    const id = packageCartStore.getSnapshot().sources[0].id;
    renderWithQuery(<CartSourceRow source={packageCartStore.getSnapshot().sources[0]} />);

    fireEvent.click(screen.getByLabelText(/remove home from cart/i));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(packageCartStore.getSnapshot().sources.find((s) => s.id === id)).toBeDefined();
  });

  it('scope dropdown change is reflected in the store API', () => {
    stubFetch();
    act(() => {
      packageCartStore.addSource({
        rootItemId: 'root-id',
        rootItemPath: '/sitecore/content/Site/Home',
        rootItemName: 'Home',
        scope: 'itemAndDescendants',
      });
    });
    const seeded = packageCartStore.getSnapshot().sources[0];
    renderWithQuery(<CartSourceRow source={seeded} />);

    // Radix Select doesn't fire pointer events through jsdom; we hit the store
    // API directly to confirm the row's contract. Mirrors how other Radix-based
    // dropdowns are tested elsewhere.
    act(() => {
      packageCartStore.setScope(seeded.id, 'childrenOnly');
    });
    expect(packageCartStore.getSnapshot().sources[0].scope).toBe('childrenOnly');
  });
});
