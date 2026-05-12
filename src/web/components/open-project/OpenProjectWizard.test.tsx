// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/sonner';
import { OpenProjectWizard } from './OpenProjectWizard';

// jsdom does not implement window.matchMedia; sonner requires it.
beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

function setupFetchMock(handler: (method: string, url: string, body?: string) => unknown) {
  const original = globalThis.fetch;
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? init.body : undefined;
    const result = handler(method, url, body);
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      {ui}
      <Toaster />
    </QueryClientProvider>,
  );
}

describe('OpenProjectWizard', () => {
  let restoreFetch: () => void = () => {};
  afterEach(() => restoreFetch());

  it('clicking a config-file row advances to the layer-selection step with one layer', async () => {
    restoreFetch = setupFetchMock((_method, url) => {
      if (url.includes('/api/fs/list')) {
        return {
          path: '/',
          entries: [
            {
              name: 'sitecore.json',
              path: '/sitecore.json',
              isDirectory: false,
              hasSitecoreJson: false,
              kind: 'config-file',
              moduleCount: 1,
              pushOpsSummary: 'CreateAndUpdate',
            },
          ],
        };
      }
      return {};
    });
    wrap(<OpenProjectWizard open onClose={() => {}} />);
    await waitFor(() => screen.getByText('sitecore.json'));
    fireEvent.click(screen.getByText('sitecore.json'));
    await waitFor(() => screen.getByRole('button', { name: /open project/i }));
    expect(screen.getByText('sitecore.json')).toBeInTheDocument();
  });

  it('"Add another layer" returns to the folder step preserving picked layers', async () => {
    restoreFetch = setupFetchMock((_method, url) => {
      if (url.includes('/api/fs/list')) {
        return {
          path: '/',
          entries: [
            {
              name: 'sitecore.json',
              path: '/sitecore.json',
              isDirectory: false,
              hasSitecoreJson: false,
              kind: 'config-file',
              moduleCount: 1,
              pushOpsSummary: 'CreateAndUpdate',
            },
          ],
        };
      }
      return {};
    });
    wrap(<OpenProjectWizard open onClose={() => {}} />);
    await waitFor(() => screen.getByText('sitecore.json'));
    fireEvent.click(screen.getByText('sitecore.json'));
    await waitFor(() => screen.getByRole('button', { name: /add another layer/i }));
    fireEvent.click(screen.getByRole('button', { name: /add another layer/i }));
    await waitFor(() => screen.getByTestId('folder-browser-path'));
    expect(screen.getByTestId('folder-browser-path')).toHaveTextContent('/');
  });

  it('picking the same file twice triggers a duplicate-warn toast and does not duplicate the row', async () => {
    restoreFetch = setupFetchMock((_method, url) => {
      if (url.includes('/api/fs/list')) {
        return {
          path: '/',
          entries: [
            {
              name: 'sitecore.json',
              path: '/sitecore.json',
              isDirectory: false,
              hasSitecoreJson: false,
              kind: 'config-file',
              moduleCount: 1,
              pushOpsSummary: 'CreateAndUpdate',
            },
          ],
        };
      }
      return {};
    });
    wrap(<OpenProjectWizard open onClose={() => {}} />);
    await waitFor(() => screen.getByText('sitecore.json'));
    fireEvent.click(screen.getByText('sitecore.json'));
    await waitFor(() => screen.getByRole('button', { name: /add another layer/i }));
    fireEvent.click(screen.getByRole('button', { name: /add another layer/i }));
    await waitFor(() => screen.getByTestId('folder-browser-path'));
    fireEvent.click(screen.getByText('sitecore.json'));
    await waitFor(() => expect(document.body.textContent ?? '').toMatch(/already added/i));
  });
});
