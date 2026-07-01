// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useSerializationRoots, useAddSerializationRoot } from '@/hooks/useSerializationRoots';

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

describe('useSerializationRoots', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('queries the modules endpoint', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ modules: [] }), { status: 200 }),
    );
    const { result } = renderHook(() => useSerializationRoots(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(global.fetch).toHaveBeenCalledWith('/api/serialization-roots');
  });

  it('posts the mutation body', async () => {
    const spy = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ applied: true }), { status: 201 }),
    );
    const { result } = renderHook(() => useAddSerializationRoot(), { wrapper: wrapper() });
    await result.current.mutateAsync({ path: '/x', target: { newFile: true } });
    expect(spy).toHaveBeenCalledWith('/api/serialization-roots', expect.objectContaining({ method: 'POST' }));
  });
});
