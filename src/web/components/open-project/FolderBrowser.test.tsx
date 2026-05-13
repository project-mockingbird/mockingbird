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

  it('renders directories returned by /api/fs/list', async () => {
    restoreFetch = setupFetchMock(() => ({
      path: '/',
      entries: [
        { name: 'repo-a', path: '/repo-a', isDirectory: true, hasSitecoreJson: true, kind: 'directory' },
        { name: 'repo-b', path: '/repo-b', isDirectory: true, hasSitecoreJson: false, kind: 'directory' },
      ],
    }));
    wrap(<FolderBrowser open onClose={() => {}} onFilePick={() => {}} />);
    await waitFor(() => {
      expect(screen.getByText('repo-a')).toBeInTheDocument();
      expect(screen.getByText('repo-b')).toBeInTheDocument();
    });
  });

  it('renders config-file rows inline with module + push-ops summary', async () => {
    restoreFetch = setupFetchMock(() => ({
      path: '/some-project',
      entries: [
        { name: 'items', path: '/some-project/items', isDirectory: true, hasSitecoreJson: false, kind: 'directory' },
        {
          name: 'sitecore.json',
          path: '/some-project/sitecore.json',
          isDirectory: false,
          hasSitecoreJson: false,
          kind: 'config-file',
          moduleCount: 2,
          pushOpsSummary: 'CreateAndUpdate',
        },
      ],
    }));
    wrap(<FolderBrowser open onClose={() => {}} onFilePick={() => {}} />);
    await waitFor(() => screen.getByText('sitecore.json'));
    expect(screen.getByText(/2 modules/i)).toBeInTheDocument();
    expect(screen.getByText(/CreateAndUpdate/)).toBeInTheDocument();
  });

  it('clicking a file row highlights it but does NOT fire onFilePick', async () => {
    restoreFetch = setupFetchMock(() => ({
      path: '/some-project',
      entries: [
        {
          name: 'sitecore.json',
          path: '/some-project/sitecore.json',
          isDirectory: false,
          hasSitecoreJson: false,
          kind: 'config-file',
          moduleCount: 1,
          pushOpsSummary: 'CreateUpdateAndDelete',
        },
      ],
    }));
    const onFilePick = vi.fn();
    wrap(<FolderBrowser open onClose={() => {}} onFilePick={onFilePick} />);
    await waitFor(() => screen.getByText('sitecore.json'));
    fireEvent.click(screen.getByText('sitecore.json'));
    expect(onFilePick).not.toHaveBeenCalled();
    // Select button should now be enabled
    expect(screen.getByRole('button', { name: /^select$/i })).toBeEnabled();
  });

  it('fires onFilePick when file row is clicked then Select button is clicked', async () => {
    restoreFetch = setupFetchMock(() => ({
      path: '/some-project',
      entries: [
        {
          name: 'sitecore.json',
          path: '/some-project/sitecore.json',
          isDirectory: false,
          hasSitecoreJson: false,
          kind: 'config-file',
          moduleCount: 1,
          pushOpsSummary: 'CreateUpdateAndDelete',
        },
      ],
    }));
    const onFilePick = vi.fn();
    wrap(<FolderBrowser open onClose={() => {}} onFilePick={onFilePick} />);
    await waitFor(() => screen.getByText('sitecore.json'));
    fireEvent.click(screen.getByText('sitecore.json'));
    fireEvent.click(screen.getByRole('button', { name: /^select$/i }));
    expect(onFilePick).toHaveBeenCalledWith(
      '/some-project/sitecore.json',
      1,
      'CreateUpdateAndDelete',
    );
  });

  it('Select button is disabled when no file row is highlighted', async () => {
    restoreFetch = setupFetchMock(() => ({
      path: '/some-project',
      entries: [
        {
          name: 'sitecore.json',
          path: '/some-project/sitecore.json',
          isDirectory: false,
          hasSitecoreJson: false,
          kind: 'config-file',
          moduleCount: 1,
          pushOpsSummary: 'CreateAndUpdate',
        },
      ],
    }));
    wrap(<FolderBrowser open onClose={() => {}} onFilePick={() => {}} />);
    await waitFor(() => screen.getByText('sitecore.json'));
    expect(screen.getByRole('button', { name: /^select$/i })).toBeDisabled();
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
            { name: 'child', path: '/child', isDirectory: true, hasSitecoreJson: false, kind: 'directory' },
          ],
        };
      }
      return { path: lastPath, entries: [] };
    });
    wrap(<FolderBrowser open onClose={() => {}} onFilePick={() => {}} />);
    await waitFor(() => screen.getByText('child'));
    fireEvent.click(screen.getByText('child'));
    await waitFor(() => {
      expect(screen.getByTestId('folder-browser-path')).toHaveTextContent('/child');
    });
  });
});
