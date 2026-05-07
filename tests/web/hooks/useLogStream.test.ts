// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLogStream } from '../../../src/web/hooks/useLogStream';
import { FakeEventSource, installFakeEventSource } from '../_helpers/FakeEventSource';

beforeEach(() => {
  installFakeEventSource();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useLogStream', () => {
  it('opens an EventSource and accepts replay then entry events', () => {
    const { result } = renderHook(() => useLogStream<{ id: number; ts: number; msg: string }>('/api/admin/logs/server/stream'));
    const es = FakeEventSource.instances[0];
    expect(es.url).toBe('/api/admin/logs/server/stream');

    act(() => { es.emit('replay', [{ id: 1, ts: 1, msg: 'a' }, { id: 2, ts: 2, msg: 'b' }], '2'); });
    expect(result.current.entries.map(e => e.msg)).toEqual(['a', 'b']);

    act(() => { es.emit('entry', { id: 3, ts: 3, msg: 'c' }, '3'); });
    expect(result.current.entries.map(e => e.msg)).toEqual(['a', 'b', 'c']);
  });

  it('caps in-memory entries to a sane bound', () => {
    const { result } = renderHook(() => useLogStream<{ id: number; ts: number }>('/api/admin/logs/server/stream', { max: 3 }));
    const es = FakeEventSource.instances[0];
    act(() => { es.emit('replay', [], '0'); });
    for (let i = 1; i <= 5; i++) {
      act(() => { es.emit('entry', { id: i, ts: i }, String(i)); });
    }
    expect(result.current.entries.map(e => e.id)).toEqual([3, 4, 5]);
  });

  it('dedupes by id across replay and entry events', () => {
    const { result } = renderHook(() => useLogStream<{ id: number; ts: number }>('/x'));
    const es = FakeEventSource.instances[0];
    act(() => { es.emit('replay', [{ id: 1, ts: 1 }, { id: 2, ts: 2 }], '2'); });
    act(() => { es.emit('entry', { id: 2, ts: 2 }, '2'); }); // duplicate
    act(() => { es.emit('replay', [{ id: 2, ts: 2 }, { id: 3, ts: 3 }], '3'); }); // overlap
    expect(result.current.entries.map(e => e.id)).toEqual([1, 2, 3]);
  });

  it('closes the EventSource on unmount', () => {
    const { unmount } = renderHook(() => useLogStream('/foo'));
    const es = FakeEventSource.instances[0];
    expect(es.closed).toBe(false);
    unmount();
    expect(es.closed).toBe(true);
  });
});
