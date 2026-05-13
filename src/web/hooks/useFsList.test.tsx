// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFsList } from './useFsList';
import type { ReactNode } from 'react';

function setupFetchMock(impl: (url: string) => unknown) {
  const original = globalThis.fetch;
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    const body = impl(url);
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

const wrapper = ({ children }: { children: ReactNode }) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
};

describe('useFsList', () => {
  let restoreFetch: () => void = () => {};
  afterEach(() => restoreFetch());

  it('passes includeFiles=false by default', async () => {
    let capturedUrl = '';
    restoreFetch = setupFetchMock((url) => {
      capturedUrl = url;
      return { path: '/', entries: [] };
    });
    const { result } = renderHook(() => useFsList('/'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(capturedUrl).toContain('includeFiles=false');
  });

  it('passes includeFiles=true when the option is set', async () => {
    let capturedUrl = '';
    restoreFetch = setupFetchMock((url) => {
      capturedUrl = url;
      return { path: '/', entries: [] };
    });
    const { result } = renderHook(
      () => useFsList('/', { includeFiles: true }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(capturedUrl).toContain('includeFiles=true');
  });

  it('is disabled when path is null', () => {
    restoreFetch = setupFetchMock(() => ({ path: '/', entries: [] }));
    const { result } = renderHook(() => useFsList(null), { wrapper });
    expect(result.current.isFetching).toBe(false);
    expect(result.current.isPending).toBe(true);
  });
});
