// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useRefreshItem } from './useRefreshItem';
import { api } from '@/lib/api';
import type { ReactNode } from 'react';

describe('useRefreshItem', () => {
  afterEach(() => vi.restoreAllMocks());

  it('invalidates tree/children/validation AND item/template-schema on success', async () => {
    vi.spyOn(api, 'refreshItem').mockResolvedValue({
      rootItemId: 'x', refreshed: 3, removed: 0,
    } as Awaited<ReturnType<typeof api.refreshItem>>);

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useRefreshItem(), { wrapper });
    result.current.mutate('some-item-id');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const invalidatedKeys = invalidateSpy.mock.calls.map(c => (c[0] as { queryKey: string[] }).queryKey[0]);
    // The Builder reads ['template-schema'] and the detail fields read ['item'];
    // both must refresh so a refreshed template no longer shows a stale schema.
    expect(invalidatedKeys).toEqual(
      expect.arrayContaining(['tree', 'children', 'validation', 'item', 'template-schema']),
    );
  });
});
