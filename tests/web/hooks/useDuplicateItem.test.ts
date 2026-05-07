// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { useDuplicateItem } from '../../../src/web/hooks/useDuplicateItem';
import { api } from '../../../src/web/lib/api';

describe('useDuplicateItem', () => {
  let qc: QueryClient;
  beforeEach(() => {
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.restoreAllMocks();
  });

  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);

  it('calls api.duplicateItem and returns its result', async () => {
    const fakeResponse = { id: 'new-id', name: 'Copy', path: '/foo/Copy' };
    const spy = vi.spyOn(api, 'duplicateItem').mockResolvedValueOnce(fakeResponse as any);

    const { result } = renderHook(() => useDuplicateItem(), { wrapper });
    await result.current.mutateAsync({ type: 'duplicate', sourceId: 'src-id', name: 'Copy' });

    expect(spy).toHaveBeenCalledWith({ type: 'duplicate', sourceId: 'src-id', name: 'Copy' });
  });

  it('invalidates tree and validation queries on success', async () => {
    vi.spyOn(api, 'duplicateItem').mockResolvedValueOnce({ id: 'x' } as any);
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    const { result } = renderHook(() => useDuplicateItem(), { wrapper });
    await result.current.mutateAsync({ type: 'duplicate', sourceId: 'src-id', name: 'Copy' });

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['tree'] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['children'] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['validation'] });
    });
  });
});
