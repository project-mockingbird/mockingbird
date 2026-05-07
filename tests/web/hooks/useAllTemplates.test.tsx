// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { useAllTemplates } from '../../../src/web/hooks/useAllTemplates';
import { api } from '../../../src/web/lib/api';

vi.mock('../../../src/web/hooks/useEngineStatus', () => ({
  useEngineReady: () => true,
}));

describe('useAllTemplates', () => {
  let qc: QueryClient;
  beforeEach(() => {
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.restoreAllMocks();
  });

  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);

  it('does not fetch when enabled=false', () => {
    const spy = vi.spyOn(api, 'getAllTemplates').mockResolvedValue({ templates: [] });
    renderHook(() => useAllTemplates({ enabled: false }), { wrapper });
    expect(spy).not.toHaveBeenCalled();
  });

  it('fetches when enabled=true', async () => {
    const spy = vi.spyOn(api, 'getAllTemplates').mockResolvedValue({
      templates: [
        { id: '{ABC}', name: 'Foo', displayName: 'Foo', path: '/sitecore/templates/Foo', template: 'ab86861a-6030-46c5-b394-e8f99e8b87db' },
      ],
    });
    const { result } = renderHook(() => useAllTemplates({ enabled: true }), { wrapper });
    await waitFor(() => {
      expect(spy).toHaveBeenCalledTimes(1);
      expect(result.current.data?.templates).toHaveLength(1);
    });
  });
});
