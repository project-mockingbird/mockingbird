// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FolderBrowser } from './FolderBrowser';

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

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('FolderBrowser', () => {
  let restoreFetch: () => void = () => {};
  afterEach(() => restoreFetch());

  it('renders folders returned by /api/fs/list', async () => {
    restoreFetch = setupFetchMock(() => ({
      path: '/',
      entries: [
        { name: 'repo-a', path: '/repo-a', isDirectory: true, hasSitecoreJson: true },
        { name: 'repo-b', path: '/repo-b', isDirectory: true, hasSitecoreJson: false },
      ],
    }));
    wrap(<FolderBrowser open onClose={() => {}} onConfirm={() => {}} />);
    await waitFor(() => {
      expect(screen.getByText('repo-a')).toBeInTheDocument();
      expect(screen.getByText('repo-b')).toBeInTheDocument();
    });
  });

  it('marks folders with hasSitecoreJson via a visible indicator', async () => {
    restoreFetch = setupFetchMock(() => ({
      path: '/',
      entries: [
        { name: 'repo-a', path: '/repo-a', isDirectory: true, hasSitecoreJson: true },
      ],
    }));
    wrap(<FolderBrowser open onClose={() => {}} onConfirm={() => {}} />);
    await waitFor(() => screen.getByText('repo-a'));
    expect(screen.getByTestId('has-sitecore-json-repo-a')).toBeInTheDocument();
  });

  it('fires onConfirm with the current path when "Scan this folder" is clicked', async () => {
    restoreFetch = setupFetchMock(() => ({
      path: '/',
      entries: [],
    }));
    const onConfirm = vi.fn();
    wrap(<FolderBrowser open onClose={() => {}} onConfirm={onConfirm} />);
    await waitFor(() => screen.getByRole('button', { name: /scan this folder/i }));
    fireEvent.click(screen.getByRole('button', { name: /scan this folder/i }));
    expect(onConfirm).toHaveBeenCalledWith('/');
  });

  it('navigates into a child folder on click and updates the header path', async () => {
    let lastPath = '';
    restoreFetch = setupFetchMock((url) => {
      const u = new URL(url, 'http://localhost');
      lastPath = u.searchParams.get('path') ?? '/';
      if (lastPath === '/') {
        return {
          path: '/',
          entries: [
            { name: 'child', path: '/child', isDirectory: true, hasSitecoreJson: false },
          ],
        };
      }
      return { path: lastPath, entries: [] };
    });
    wrap(<FolderBrowser open onClose={() => {}} onConfirm={() => {}} />);
    await waitFor(() => screen.getByText('child'));
    fireEvent.click(screen.getByText('child'));
    await waitFor(() => {
      expect(screen.getByTestId('folder-browser-path')).toHaveTextContent('/child');
    });
  });
});
