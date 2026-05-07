// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useSession } from '../../../src/web/components/ise/useSession';

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  url: string;
  readyState = 0;
  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: ((ev: { code: number }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
    queueMicrotask(() => { this.readyState = 1; this.onopen?.({}); });
  }
  send(_: string) {}
  close() { this.readyState = 3; this.onclose?.({ code: 1000 }); }
  _emit(frame: unknown) { this.onmessage?.({ data: JSON.stringify(frame) }); }
}

beforeEach(() => {
  MockWebSocket.instances = [];
  vi.stubGlobal('WebSocket', MockWebSocket);
  vi.stubGlobal('fetch', vi.fn(async (url: string, opts?: { method?: string }) => {
    if (typeof url === 'string' && url.endsWith('/api/spe/sessions') && opts?.method === 'POST') {
      return new Response(JSON.stringify({
        sessionId: 'sess-1',
        expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
        createdAt: new Date().toISOString(),
      }), { status: 201 });
    }
    if (typeof url === 'string' && url.includes('/execute')) {
      return new Response(JSON.stringify({ runId: 'run-1' }), { status: 202 });
    }
    if (typeof url === 'string' && url.includes('/abort')) {
      return new Response(JSON.stringify({ aborted: true }), { status: 200 });
    }
    if (typeof url === 'string' && url.match(/\/api\/spe\/sessions\/[^/]+$/) && opts?.method === 'DELETE') {
      return new Response(null, { status: 204 });
    }
    return new Response('not mocked', { status: 500 });
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useSession', () => {
  it('creates a session and connects WS on mount', async () => {
    const { result } = renderHook(() => useSession({ apiBase: 'http://localhost' }));
    await waitFor(() => expect(result.current.sessionId).toBe('sess-1'));
    expect(MockWebSocket.instances).toHaveLength(1);
    expect(MockWebSocket.instances[0].url).toContain('/api/spe/sessions/sess-1/stream');
  });

  it('execute returns a runId', async () => {
    const { result } = renderHook(() => useSession({ apiBase: 'http://localhost' }));
    await waitFor(() => expect(result.current.sessionId).toBe('sess-1'));
    let runId: string | null = null;
    await act(async () => { runId = await result.current.execute('echo hi', false); });
    expect(runId).toBe('run-1');
  });

  it('frames received via WS appear in the frames array', async () => {
    const { result } = renderHook(() => useSession({ apiBase: 'http://localhost' }));
    await waitFor(() => expect(result.current.sessionId).toBe('sess-1'));
    await waitFor(() => expect(MockWebSocket.instances[0].readyState).toBe(1));
    act(() => {
      MockWebSocket.instances[0]._emit({ type: 'stream', stream: 'stdout', data: 'hello' });
    });
    expect(result.current.frames.find(f => f.type === 'stream' && f.data === 'hello')).toBeTruthy();
  });

  it('dispose closes WS on unmount', async () => {
    const { result, unmount } = renderHook(() => useSession({ apiBase: 'http://localhost' }));
    await waitFor(() => expect(result.current.sessionId).toBe('sess-1'));
    unmount();
    await waitFor(() => expect(MockWebSocket.instances[0].readyState).toBe(3));
  });
});
