// @vitest-environment jsdom
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NoProjectState } from './NoProjectState';

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
}

function renderWithClient(ui: React.ReactNode) {
  const qc = makeClient();
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

// Mock fetch with a stub the per-test setup can override.
let fetchStub: ReturnType<typeof vi.fn>;
const originalFetch = global.fetch;

beforeEach(() => {
  fetchStub = vi.fn(async () => new Response(JSON.stringify({}), { status: 200 }));
  global.fetch = fetchStub as unknown as typeof fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

function defaultFetchHandler(url: string): Response {
  if (url.includes('/api/prefs')) {
    return new Response(JSON.stringify({ autoRestoreLastSession: false }), { status: 200 });
  }
  if (url.includes('/api/projects/last-session')) {
    return new Response('null', { status: 200 });
  }
  if (url.includes('/api/projects/recent')) {
    return new Response(JSON.stringify({ entries: [] }), { status: 200 });
  }
  return new Response('{}', { status: 200 });
}

describe('NoProjectState', () => {
  it('renders the headline and helper copy', () => {
    fetchStub.mockImplementation(async (input) => defaultFetchHandler(String(input)));
    renderWithClient(<NoProjectState onOpenProject={() => {}} />);
    expect(screen.getByText('No project loaded')).toBeInTheDocument();
    expect(
      screen.getByText(/Pick a folder under \/workspaces to scan for sitecore\.json/i),
    ).toBeInTheDocument();
  });

  it('fires onOpenProject when the primary CTA is clicked', () => {
    fetchStub.mockImplementation(async (input) => defaultFetchHandler(String(input)));
    const onOpen = vi.fn();
    renderWithClient(<NoProjectState onOpenProject={onOpen} />);
    fireEvent.click(screen.getByRole('button', { name: /open a project/i }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('auto-restores when prefs.autoRestoreLastSession is true and last-session is set', async () => {
    const openCalls: unknown[] = [];
    fetchStub.mockImplementation(async (input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/prefs')) {
        return new Response(JSON.stringify({ autoRestoreLastSession: true }), { status: 200 });
      }
      if (url.includes('/api/projects/last-session')) {
        return new Response(JSON.stringify({ projectHash: 'h1', profileName: 'dev' }), { status: 200 });
      }
      if (url.includes('/api/profiles/h1/dev')) {
        return new Response(
          JSON.stringify({
            profile: {
              name: 'dev',
              projectName: 'demo',
              layers: [{ sitecoreJsonPath: '/sitecore.json', name: 'core', color: '#3b82f6' }],
              createdAt: 'T0',
              updatedAt: 'T0',
            },
          }),
          { status: 200 },
        );
      }
      if (url.includes('/api/projects/recent')) {
        return new Response(JSON.stringify({ entries: [] }), { status: 200 });
      }
      if (url.includes('/api/projects/open')) {
        openCalls.push(JSON.parse(String(init?.body ?? '{}')));
        return new Response(JSON.stringify({ state: 'ready', layers: [] }), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    });

    renderWithClient(<NoProjectState />);
    await waitFor(() => expect(openCalls.length).toBeGreaterThan(0));
    expect(openCalls[0]).toMatchObject({ profileName: 'dev', projectName: 'demo' });
  });
});
