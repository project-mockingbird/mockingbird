// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useDescendants } from '../../../src/web/hooks/useDescendants';
import * as engineStatusModule from '../../../src/web/hooks/useEngineStatus';

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

const sampleResponse = {
  items: [
    { id: '1', name: 'A', path: '/sitecore/media library/A', template: 't', hasChildren: true },
    { id: '2', name: 'B', path: '/sitecore/media library/A/B', template: 't', hasChildren: false },
  ],
};

describe('useDescendants', () => {
  beforeEach(() => {
    vi.spyOn(engineStatusModule, 'useEngineReady').mockReturnValue(true);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => sampleResponse,
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the items array on success', async () => {
    const { result } = renderHook(
      () => useDescendants('/sitecore/media library'),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.items).toEqual(sampleResponse.items);
  });

  it('does not fetch when the engine is not ready', () => {
    vi.spyOn(engineStatusModule, 'useEngineReady').mockReturnValue(false);
    const { result } = renderHook(
      () => useDescendants('/sitecore/media library'),
      { wrapper: makeWrapper() },
    );
    expect(result.current.fetchStatus).toBe('idle');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('does not fetch when path is null', () => {
    const { result } = renderHook(
      () => useDescendants(null),
      { wrapper: makeWrapper() },
    );
    expect(result.current.fetchStatus).toBe('idle');
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
