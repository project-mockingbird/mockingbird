// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCurrentProjectHash } from '@/hooks/useCurrentProjectHash';
import React from 'react';

function wrapper(client: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe('useCurrentProjectHash', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null while the config query is loading', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    const { result } = renderHook(() => useCurrentProjectHash(), { wrapper: wrapper(client) });
    expect(result.current).toBeNull();
  });

  it('returns the hash from the config response', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ version: 1, projects: {}, lastOpenedHash: 'aabbccdd1122' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        ),
      ),
    );
    const { result } = renderHook(() => useCurrentProjectHash(), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current).toBe('aabbccdd1122'));
  });

  it('returns null when lastOpenedHash is absent', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ version: 1, projects: {} }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        ),
      ),
    );
    const { result } = renderHook(() => useCurrentProjectHash(), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current).toBeNull());
  });
});
