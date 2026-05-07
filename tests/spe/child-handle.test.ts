// tests/spe/child-handle.test.ts
import { describe, it, expect, vi } from 'vitest';
import type { Frame, IChildHandle, FrameListener } from '../../src/spe/host/types.js';

/**
 * MockChildHandle for testing components that consume IChildHandle.
 * The session-manager tests use this; here we use it to assert the interface contract.
 */
class MockChildHandle implements IChildHandle {
  private listeners: FrameListener[] = [];
  private _closed = false;
  writeLog: string[] = [];

  writeLine(line: string): void {
    if (this._closed) throw new Error('child closed');
    this.writeLog.push(line);
  }

  async abort(): Promise<void> {
    /* simulate cooperative stop */
  }

  async kill(): Promise<void> {
    this._closed = true;
    this.emit({ type: 'sessionClosed', reason: 'explicit' });
  }

  onFrame(listener: FrameListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  emit(frame: Frame): void {
    for (const l of this.listeners) l(frame);
  }

  get closed(): boolean { return this._closed; }
}

describe('IChildHandle contract', () => {
  it('writeLine throws after kill', async () => {
    const h = new MockChildHandle();
    await h.kill();
    expect(() => h.writeLine('foo')).toThrow();
  });

  it('onFrame returns an unsubscribe that prevents further callbacks', () => {
    const h = new MockChildHandle();
    const spy = vi.fn();
    const unsub = h.onFrame(spy);
    h.emit({ type: 'stream', stream: 'stdout', data: 'a' });
    unsub();
    h.emit({ type: 'stream', stream: 'stdout', data: 'b' });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('closed flips to true after kill', async () => {
    const h = new MockChildHandle();
    expect(h.closed).toBe(false);
    await h.kill();
    expect(h.closed).toBe(true);
  });
});
