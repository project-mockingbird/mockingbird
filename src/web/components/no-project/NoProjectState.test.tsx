// @vitest-environment jsdom
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NoProjectState } from './NoProjectState';
import { useProjectsStore } from '@/state/projectsStore';

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

let fetchStub: ReturnType<typeof vi.fn>;
const originalFetch = global.fetch;

beforeEach(() => {
  fetchStub = vi.fn(async () => new Response('{}', { status: 200 }));
  global.fetch = fetchStub as unknown as typeof fetch;
  useProjectsStore.setState({ projects: {}, lastOpenedHash: null, prefs: { autoRestore: true } });
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('NoProjectState', () => {
  it('renders the headline and helper copy', () => {
    renderWithClient(<NoProjectState onOpenProject={() => {}} />);
    expect(screen.getByText('No project loaded')).toBeInTheDocument();
    expect(
      screen.getByText(/point mockingbird at a folder with sitecore\.json/i),
    ).toBeInTheDocument();
  });

  it('fires onOpenProject when the primary CTA is clicked', () => {
    const onOpen = vi.fn();
    renderWithClient(<NoProjectState onOpenProject={onOpen} />);
    fireEvent.click(screen.getByRole('button', { name: /get started/i }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('auto-restores when autoRestore is true and lastOpenedHash is set in localStorage', async () => {
    const openCalls: unknown[] = [];
    fetchStub.mockImplementation(async (input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/projects/open')) {
        openCalls.push(JSON.parse(String(init?.body ?? '{}')));
        return new Response(JSON.stringify({ state: 'ready', layers: [] }), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    });

    useProjectsStore.setState({
      projects: {
        h1: {
          hash: 'h1',
          name: 'demo',
          layers: [{ sitecoreJsonPath: '/sitecore.json', name: 'core', color: '#3b82f6' }],
          createdAt: 'T0',
          lastOpenedAt: 'T0',
        },
      },
      lastOpenedHash: 'h1',
      prefs: { autoRestore: true },
    });

    renderWithClient(<NoProjectState />);
    await waitFor(() => expect(openCalls.length).toBeGreaterThan(0));
    expect(openCalls[0]).toMatchObject({ projectName: 'demo' });
  });

  it('does not auto-restore when autoRestore is false', async () => {
    const openCalls: unknown[] = [];
    fetchStub.mockImplementation(async (input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/projects/open')) {
        openCalls.push(JSON.parse(String(init?.body ?? '{}')));
        return new Response(JSON.stringify({ state: 'ready', layers: [] }), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    });

    useProjectsStore.setState({
      projects: {
        h1: {
          hash: 'h1',
          name: 'demo',
          layers: [{ sitecoreJsonPath: '/sitecore.json', name: 'core', color: '#3b82f6' }],
          createdAt: 'T0',
          lastOpenedAt: 'T0',
        },
      },
      lastOpenedHash: 'h1',
      prefs: { autoRestore: false },
    });

    renderWithClient(<NoProjectState />);
    // Give effects a chance to fire.
    await new Promise((r) => setTimeout(r, 20));
    expect(openCalls).toHaveLength(0);
  });
});
