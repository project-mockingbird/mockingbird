// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProjectsStoreHydrator } from '@/state/projectsStoreHydrator';
import { useProjectsStore, resetProjectsStore } from '@/state/projectsStore';
import { SettingsProvider } from '@/settings/SettingsProvider';
import { reset as resetSettings } from '@/settings/store';
import React from 'react';

const SETTINGS_KEY = 'mockingbird.settings.v1';

// jsdom's localStorage in this harness lacks full method support; stub
// explicitly so all methods exist and state is isolated between tests.
let _mem: Record<string, string> = {};
vi.stubGlobal('localStorage', {
  getItem: (k: string) => _mem[k] ?? null,
  setItem: (k: string, v: string) => { _mem[k] = v; },
  removeItem: (k: string) => { delete _mem[k]; },
  clear: () => { _mem = {}; },
});

function wrapper(client: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>
      <SettingsProvider>{children}</SettingsProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  _mem = {};
  resetProjectsStore();
  resetSettings();
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('lastOpenedHash migration in ProjectsStoreHydrator', () => {
  it('PUTs migrated hash + removes the browser key when browser has hash and server has none', async () => {
    _mem[SETTINGS_KEY] = JSON.stringify({ 'session.lastOpenedHash': 'browserhash' });

    const putBody = vi.fn();
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
      if (url === '/api/config' && (!init || !init.method || init.method === 'GET')) {
        return Promise.resolve(new Response(JSON.stringify({ version: 1, projects: {} }), { status: 200 }));
      }
      if (url === '/api/config' && init?.method === 'PUT') {
        putBody(JSON.parse(init.body as string));
        return Promise.resolve(new Response('{}', { status: 200 }));
      }
      return Promise.resolve(new Response('{}', { status: 200 }));
    }));

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<ProjectsStoreHydrator />, { wrapper: wrapper(client) });

    await waitFor(() => expect(useProjectsStore.getState().hydrated).toBe(true));

    expect(putBody).toHaveBeenCalledWith(expect.objectContaining({
      lastOpenedHash: 'browserhash',
    }));

    // Browser key removed
    const stored = JSON.parse(_mem[SETTINGS_KEY] ?? '{}');
    expect(stored['session.lastOpenedHash']).toBeUndefined();
  });

  it('skips PUT when server already has a hash, still clears browser key', async () => {
    _mem[SETTINGS_KEY] = JSON.stringify({ 'session.lastOpenedHash': 'browserhash' });

    const putCalled = vi.fn();
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
      if (url === '/api/config' && (!init || !init.method || init.method === 'GET')) {
        return Promise.resolve(new Response(
          JSON.stringify({ version: 1, projects: {}, lastOpenedHash: 'serverhash' }),
          { status: 200 },
        ));
      }
      if (url === '/api/config' && init?.method === 'PUT') {
        putCalled();
        return Promise.resolve(new Response('{}', { status: 200 }));
      }
      return Promise.resolve(new Response('{}', { status: 200 }));
    }));

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<ProjectsStoreHydrator />, { wrapper: wrapper(client) });

    await waitFor(() => expect(useProjectsStore.getState().hydrated).toBe(true));

    expect(putCalled).not.toHaveBeenCalled();

    const stored = JSON.parse(_mem[SETTINGS_KEY] ?? '{}');
    expect(stored['session.lastOpenedHash']).toBeUndefined();
  });

  it('is a no-op when browser has nothing to migrate', async () => {
    const putCalled = vi.fn();
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
      if (url === '/api/config' && (!init || !init.method || init.method === 'GET')) {
        return Promise.resolve(new Response(JSON.stringify({ version: 1, projects: {} }), { status: 200 }));
      }
      if (url === '/api/config' && init?.method === 'PUT') {
        putCalled();
        return Promise.resolve(new Response('{}', { status: 200 }));
      }
      return Promise.resolve(new Response('{}', { status: 200 }));
    }));

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<ProjectsStoreHydrator />, { wrapper: wrapper(client) });

    await waitFor(() => expect(useProjectsStore.getState().hydrated).toBe(true));
    expect(putCalled).not.toHaveBeenCalled();
  });
});
