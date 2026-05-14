// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useReopenWithLayers } from '../../../src/web/hooks/useReopenWithLayers';
import { useProjectsStore, resetProjectsStore } from '../../../src/web/state/projectsStore';
import { setSetting } from '../../../src/web/settings/store';

// jsdom's localStorage in this harness lacks removeItem; stub a full impl so
// settings/store.ts can call setItem / removeItem freely.
let _mem: Record<string, string> = {};
vi.stubGlobal('localStorage', {
  getItem: (k: string) => _mem[k] ?? null,
  setItem: (k: string, v: string) => { _mem[k] = v; },
  removeItem: (k: string) => { delete _mem[k]; },
  clear: () => { _mem = {}; },
});

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const fetchMock = vi.fn();

beforeEach(() => {
  resetProjectsStore();
  setSetting('session.lastOpenedHash', null);
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  vi.restoreAllMocks();
});

const baseLayer = { sitecoreJsonPath: '/ws/a/sitecore.json', name: 'a', color: '#111' };

function seedProject(hash: string) {
  useProjectsStore.getState().upsert({
    hash,
    name: 'proj',
    layers: [baseLayer],
    createdAt: 100,
    lastOpenedAt: 200,
  });
  setSetting('session.lastOpenedHash', hash);
}

describe('useReopenWithLayers', () => {
  it('posts to /api/projects/open with layers + projectName', async () => {
    seedProject('oldhash');
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ state: 'ready', layers: [] }), { status: 200 }));

    const { result } = renderHook(() => useReopenWithLayers(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        oldHash: 'oldhash',
        nextLayers: [baseLayer, { sitecoreJsonPath: '/ws/b/sitecore.json', name: 'b', color: '#222' }],
        projectName: 'proj',
      });
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/projects/open');
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({
      projectName: 'proj',
      layers: [
        baseLayer,
        { sitecoreJsonPath: '/ws/b/sitecore.json', name: 'b', color: '#222' },
      ],
    });
  });

  it('rekeys the project on success and updates lastOpenedHash', async () => {
    seedProject('oldhash');
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ state: 'ready', layers: [] }), { status: 200 }));

    const { result } = renderHook(() => useReopenWithLayers(), { wrapper });
    const nextLayers = [baseLayer, { sitecoreJsonPath: '/ws/b/sitecore.json', name: 'b', color: '#222' }];

    await act(async () => {
      await result.current.mutateAsync({ oldHash: 'oldhash', nextLayers, projectName: 'proj' });
    });

    expect(useProjectsStore.getState().get('oldhash')).toBeNull();
    const fresh = useProjectsStore.getState().list();
    expect(fresh).toHaveLength(1);
    expect(fresh[0].name).toBe('proj');
    expect(fresh[0].createdAt).toBe(100);
    expect(fresh[0].layers).toEqual(nextLayers);
  });

  it('surfaces server error and does NOT rekey', async () => {
    seedProject('oldhash');
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: 'boom' }), { status: 500 }),
    );

    const { result } = renderHook(() => useReopenWithLayers(), { wrapper });

    await expect(
      result.current.mutateAsync({
        oldHash: 'oldhash',
        nextLayers: [baseLayer, { sitecoreJsonPath: '/ws/b/sitecore.json', name: 'b', color: '#222' }],
        projectName: 'proj',
      }),
    ).rejects.toThrow(/boom/);

    expect(useProjectsStore.getState().get('oldhash')).not.toBeNull();
  });

  it('detects collision: returns colliding hash without firing POST', async () => {
    seedProject('oldhash');
    const collidingLayers = [
      baseLayer,
      { sitecoreJsonPath: '/ws/b/sitecore.json', name: 'b', color: '#222' },
    ];
    const { computeProjectHash } = await import('../../../src/web/state/project-hash');
    const collidingHash = await computeProjectHash(collidingLayers.map((l) => l.sitecoreJsonPath));
    useProjectsStore.getState().upsert({
      hash: collidingHash,
      name: 'other',
      layers: collidingLayers,
      createdAt: 1,
      lastOpenedAt: 2,
    });
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));

    const { result } = renderHook(() => useReopenWithLayers(), { wrapper });

    const next = await result.current.detectCollision({
      oldHash: 'oldhash',
      nextLayers: collidingLayers,
    });

    expect(next.collidingHash).toBe(collidingHash);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('when rekey throws (concurrent collision), mutation reflects the error but server reopen already happened', async () => {
    seedProject('oldhash');
    // Seed a project at a hash that will collide with the computed newHash for nextLayers.
    const nextLayers = [
      baseLayer,
      { sitecoreJsonPath: '/ws/b/sitecore.json', name: 'b', color: '#222' },
    ];
    const newHash = await (await import('../../../src/web/state/project-hash')).computeProjectHash(
      nextLayers.map((l) => l.sitecoreJsonPath),
    );
    useProjectsStore.getState().upsert({
      hash: newHash,
      name: 'preexisting',
      layers: nextLayers,
      createdAt: 1,
      lastOpenedAt: 2,
    });
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ state: 'ready', layers: [] }), { status: 200 }));

    const { result } = renderHook(() => useReopenWithLayers(), { wrapper });

    await expect(
      result.current.mutateAsync({ oldHash: 'oldhash', nextLayers, projectName: 'proj' }),
    ).rejects.toThrow(/already exists/i);

    // The HTTP call DID happen (server-side reopen succeeded)
    expect(fetchMock).toHaveBeenCalledOnce();
    // Old hash entry remains (rekey aborted before deletion)
    expect(useProjectsStore.getState().get('oldhash')).not.toBeNull();
  });
});
