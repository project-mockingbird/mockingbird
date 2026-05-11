// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useWebSocket } from '../../../src/web/hooks/useWebSocket';
import { FakeWebSocket, installFakeWebSocket } from '../_helpers/FakeWebSocket';

beforeEach(() => {
  installFakeWebSocket();
  Object.defineProperty(window, 'location', {
    value: { protocol: 'http:', host: 'localhost:5173' },
    writable: true,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function makeWrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe('useWebSocket - tree:refresh arm', () => {
  it('invalidates tree + children queries when a tree:refresh event arrives', () => {
    const client = new QueryClient();
    const spy = vi.spyOn(client, 'invalidateQueries');
    renderHook(() => useWebSocket(), { wrapper: makeWrapper(client) });

    const ws = FakeWebSocket.instances[0];
    expect(ws).toBeDefined();

    act(() => {
      ws.emit({
        type: 'tree:refresh',
        reason: 'scaffold',
        rootItemPath: '/sitecore/content/TestTenant',
        createdCount: 12,
      });
    });

    const calls = spy.mock.calls.map(c => c[0]);
    expect(calls).toContainEqual({ queryKey: ['tree'] });
    expect(calls).toContainEqual({ queryKey: ['children'] });
  });

  it('still handles existing item:added events without regression', () => {
    const client = new QueryClient();
    const spy = vi.spyOn(client, 'invalidateQueries');
    renderHook(() => useWebSocket(), { wrapper: makeWrapper(client) });

    const ws = FakeWebSocket.instances[0];
    act(() => {
      ws.emit({ type: 'item:added', id: 'abc', path: '/sitecore/content/X' });
    });

    const calls = spy.mock.calls.map(c => c[0]);
    expect(calls).toContainEqual({ queryKey: ['tree'] });
    expect(calls).toContainEqual({ queryKey: ['children'] });
  });
});
