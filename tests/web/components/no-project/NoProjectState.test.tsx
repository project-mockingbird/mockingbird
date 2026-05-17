// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { SettingsProvider } from '@/settings/SettingsProvider';
import { NoProjectState } from '@/components/no-project/NoProjectState';
import { useProjectsStore, resetProjectsStore } from '@/state/projectsStore';
import { setSetting, reset as resetSettings } from '@/settings/store';

// jsdom localStorage stub (matches pattern in useReopenWithLayers.test.tsx)
let _mem: Record<string, string> = {};
vi.stubGlobal('localStorage', {
  getItem: (k: string) => _mem[k] ?? null,
  setItem: (k: string, v: string) => { _mem[k] = v; },
  removeItem: (k: string) => { delete _mem[k]; },
  clear: () => { _mem = {}; },
});

const fetchMock = vi.fn();

beforeEach(() => {
  _mem = {};
  resetProjectsStore();
  resetSettings();
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

function makeClient(initial?: { lastOpenedHash?: string }) {
  const c = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  c.setQueryData(['config', 'mockingbird'], {
    version: 1,
    projects: {},
    ...(initial?.lastOpenedHash !== undefined ? { lastOpenedHash: initial.lastOpenedHash } : {}),
  });
  return c;
}

function Wrapper({
  client,
  children,
}: {
  client: QueryClient;
  children: React.ReactNode;
}) {
  return (
    <QueryClientProvider client={client}>
      <SettingsProvider>{children}</SettingsProvider>
    </QueryClientProvider>
  );
}

const baseProject = {
  hash: 'hash1',
  name: 'My Project',
  layers: [{ sitecoreJsonPath: '/ws/a/sitecore.json', name: 'a', color: '#111' }],
  createdAt: 100,
  lastOpenedAt: 200,
};

describe('NoProjectState', () => {
  it('renders the empty-state heading', () => {
    const client = makeClient();
    render(<NoProjectState />, {
      wrapper: ({ children }) => <Wrapper client={client}>{children}</Wrapper>,
    });
    expect(screen.getByText(/No project loaded/i)).toBeInTheDocument();
  });

  it('renders "Get started" button', () => {
    const client = makeClient();
    render(<NoProjectState />, {
      wrapper: ({ children }) => <Wrapper client={client}>{children}</Wrapper>,
    });
    expect(screen.getByRole('button', { name: /get started/i })).toBeInTheDocument();
  });

  it('auto-restores when autoRestore is true and lastOpenedHash is set', async () => {
    // Seed the project in the store so NoProjectState can find it
    useProjectsStore.getState().upsert(baseProject);
    useProjectsStore.getState().markHydrated();

    // autoRestore stays browser-side - set it in settings
    setSetting('session.autoRestore', true);

    // lastOpenedHash now comes from config query
    const client = makeClient({ lastOpenedHash: 'hash1' });

    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ state: 'ready', layers: [] }), { status: 200 }),
    );

    render(<NoProjectState />, {
      wrapper: ({ children }) => <Wrapper client={client}>{children}</Wrapper>,
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/projects/open',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  it('does not auto-restore when autoRestore is false', async () => {
    useProjectsStore.getState().upsert(baseProject);
    useProjectsStore.getState().markHydrated();

    setSetting('session.autoRestore', false);

    const client = makeClient({ lastOpenedHash: 'hash1' });

    render(<NoProjectState />, {
      wrapper: ({ children }) => <Wrapper client={client}>{children}</Wrapper>,
    });

    // Let any async effects settle
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not auto-restore when lastOpenedHash is absent', async () => {
    useProjectsStore.getState().upsert(baseProject);
    useProjectsStore.getState().markHydrated();

    setSetting('session.autoRestore', true);

    // No lastOpenedHash in config
    const client = makeClient();

    render(<NoProjectState />, {
      wrapper: ({ children }) => <Wrapper client={client}>{children}</Wrapper>,
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('invalidates config query on successful auto-restore', async () => {
    useProjectsStore.getState().upsert(baseProject);
    useProjectsStore.getState().markHydrated();
    setSetting('session.autoRestore', true);

    const client = makeClient({ lastOpenedHash: 'hash1' });
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');

    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ state: 'ready', layers: [] }), { status: 200 }),
    );

    render(<NoProjectState />, {
      wrapper: ({ children }) => <Wrapper client={client}>{children}</Wrapper>,
    });

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ['config', 'mockingbird'] }),
      );
    });
  });
});
