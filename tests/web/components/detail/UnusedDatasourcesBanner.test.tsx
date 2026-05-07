// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { UnusedDatasourcesBanner } from '../../../../src/web/components/detail/UnusedDatasourcesBanner';

const HOME_ID = 'a1b2c3d4-e5f6-7890-abcd-000000000001';

function makeWrapper(qc: QueryClient) {
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
}

describe('UnusedDatasourcesBanner', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let qc: QueryClient;

  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('renders nothing when count === 0', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ count: 0, items: [] }) });
    const { container } = render(<UnusedDatasourcesBanner item={{ id: HOME_ID }} />, { wrapper: makeWrapper(qc) });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(container.textContent).toBe('');
  });

  it('renders banner with count when count > 0', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        count: 3,
        items: [
          { id: 'i1', name: 'orphan-a', path: '/sitecore/content/Home/Data/orphan-a' },
          { id: 'i2', name: 'orphan-b', path: '/sitecore/content/Home/Data/orphan-b' },
          { id: 'i3', name: 'orphan-c', path: '/sitecore/content/Home/Data/orphan-c' },
        ],
      }),
    });
    render(<UnusedDatasourcesBanner item={{ id: HOME_ID }} />, { wrapper: makeWrapper(qc) });
    expect(await screen.findByText('3 unused local datasource items')).toBeInTheDocument();
    expect(screen.getByText(/Would you like to delete them\?/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clean up' })).toBeInTheDocument();
  });

  it('opens confirm dialog on Clean up click and lists items', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        count: 2,
        items: [
          { id: 'i1', name: 'orphan-a', path: '/sitecore/content/Home/Data/orphan-a' },
          { id: 'i2', name: 'orphan-b', path: '/sitecore/content/Home/Data/orphan-b' },
        ],
      }),
    });
    render(<UnusedDatasourcesBanner item={{ id: HOME_ID }} />, { wrapper: makeWrapper(qc) });
    const cleanupBtn = await screen.findByRole('button', { name: 'Clean up' });
    fireEvent.click(cleanupBtn);

    expect(await screen.findByText('Delete 2 unused datasource items?')).toBeInTheDocument();
    expect(screen.getByText('orphan-a')).toBeInTheDocument();
    expect(screen.getByText('orphan-b')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Delete 2/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('posts itemIds on Delete click and invalidates queries', async () => {
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return { ok: true, json: async () => ({ deleted: ['i1'], failed: [] }) } as Response;
      }
      return { ok: true, json: async () => ({ count: 1, items: [{ id: 'i1', name: 'orphan-a', path: '/sitecore/content/Home/Data/orphan-a' }] }) } as Response;
    });

    render(<UnusedDatasourcesBanner item={{ id: HOME_ID }} />, { wrapper: makeWrapper(qc) });
    fireEvent.click(await screen.findByRole('button', { name: 'Clean up' }));
    const deleteBtn = await screen.findByRole('button', { name: /Delete 1/ });
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find((c) => c[1]?.method === 'POST');
      expect(postCall).toBeDefined();
      expect(postCall![0]).toBe(`/api/items/${HOME_ID}/unused-datasources/cleanup`);
      expect(JSON.parse(postCall![1].body as string)).toEqual({ itemIds: ['i1'] });
    });
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['unused-datasources', HOME_ID] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['item', HOME_ID] });
    });
  });

  it('shows loading state on Delete button while cleanup is in flight', async () => {
    let resolvePost: (value: Response) => void;
    const postPromise = new Promise<Response>((resolve) => { resolvePost = resolve; });

    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return postPromise;
      return { ok: true, json: async () => ({ count: 1, items: [{ id: 'i1', name: 'orphan-a', path: '/sitecore/content/Home/Data/orphan-a' }] }) } as Response;
    });

    render(<UnusedDatasourcesBanner item={{ id: HOME_ID }} />, { wrapper: makeWrapper(qc) });
    fireEvent.click(await screen.findByRole('button', { name: 'Clean up' }));
    const deleteBtn = await screen.findByRole('button', { name: /Delete 1/ });
    fireEvent.click(deleteBtn);

    const deletingBtn = await screen.findByRole('button', { name: /Deleting 1\.\.\./ });
    expect(deletingBtn).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();

    resolvePost!({ ok: true, json: async () => ({ deleted: ['i1'], failed: [] }) } as Response);
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Delete 1/ })).toBeNull();
    });
  });
});
