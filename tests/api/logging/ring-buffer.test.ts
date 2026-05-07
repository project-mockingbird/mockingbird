import { describe, it, expect, vi } from 'vitest';
import { RingBuffer } from '../../../src/api/logging/ring-buffer.js';

interface E { id: number; ts: number; msg: string }
const make = (id: number, msg = 'x'): E => ({ id, ts: id * 1000, msg });

describe('RingBuffer', () => {
  it('assigns monotonic ids and stores last N entries', () => {
    const rb = new RingBuffer<E>(3);
    rb.push({ ts: 1, msg: 'a' });
    rb.push({ ts: 2, msg: 'b' });
    rb.push({ ts: 3, msg: 'c' });
    rb.push({ ts: 4, msg: 'd' });
    const all = rb.getSince(0);
    expect(all.map(e => e.msg)).toEqual(['b', 'c', 'd']);
    expect(all.map(e => e.id)).toEqual([2, 3, 4]);
  });

  it('returns only entries newer than the given id', () => {
    const rb = new RingBuffer<E>(5);
    rb.push({ ts: 1, msg: 'a' });
    rb.push({ ts: 2, msg: 'b' });
    rb.push({ ts: 3, msg: 'c' });
    expect(rb.getSince(1).map(e => e.msg)).toEqual(['b', 'c']);
    expect(rb.getSince(99).map(e => e.msg)).toEqual([]);
  });

  it('falls back to full replay when sinceId is below oldest', () => {
    const rb = new RingBuffer<E>(2);
    rb.push({ ts: 1, msg: 'a' });
    rb.push({ ts: 2, msg: 'b' });
    rb.push({ ts: 3, msg: 'c' });
    expect(rb.getSince(1).map(e => e.msg)).toEqual(['b', 'c']);
  });

  it('notifies subscribers on each push', () => {
    const rb = new RingBuffer<E>(3);
    const fn = vi.fn();
    const unsub = rb.subscribe(fn);
    rb.push({ ts: 1, msg: 'a' });
    rb.push({ ts: 2, msg: 'b' });
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn.mock.calls[0][0].msg).toBe('a');
    unsub();
    rb.push({ ts: 3, msg: 'c' });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('tracks dropped count', () => {
    const rb = new RingBuffer<E>(3);
    expect(rb.dropped).toBe(0);
    rb.recordDrop();
    rb.recordDrop();
    expect(rb.dropped).toBe(2);
  });

  it('isolates subscriber errors so other subscribers and pushes still run', () => {
    const rb = new RingBuffer<E>(3);
    const ok = vi.fn();
    rb.subscribe(() => { throw new Error('boom'); });
    rb.subscribe(ok);
    expect(() => rb.push({ ts: 1, msg: 'a' })).not.toThrow();
    expect(ok).toHaveBeenCalledTimes(1);
    rb.push({ ts: 2, msg: 'b' });
    expect(rb.getSince(0)).toHaveLength(2);
  });
});
