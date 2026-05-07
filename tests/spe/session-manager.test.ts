// tests/spe/session-manager.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SessionManager } from '../../src/spe/host/session-manager.js';
import type { Frame, IChildHandle, FrameListener } from '../../src/spe/host/types.js';

class MockChildHandle implements IChildHandle {
  private listeners: FrameListener[] = [];
  private _closed = false;
  public writeLog: string[] = [];
  public abortCalls = 0;
  public killCalls = 0;

  writeLine(line: string): void {
    if (this._closed) throw new Error('child closed');
    this.writeLog.push(line);
  }
  async abort(): Promise<void> { this.abortCalls++; }
  async kill(): Promise<void> { this.killCalls++; this._closed = true; this.emit({ type: 'sessionClosed', reason: 'explicit' }); }
  onFrame(listener: FrameListener): () => void {
    this.listeners.push(listener);
    return () => { this.listeners = this.listeners.filter(l => l !== listener); };
  }
  emit(frame: Frame): void { for (const l of [...this.listeners]) l(frame); }
  get closed(): boolean { return this._closed; }

  /** Helper: simulate the child becoming ready (info "mockingbird-startup-complete"). */
  signalReady(): void {
    this.emit({ type: 'stream', stream: 'info', data: 'mockingbird-startup-complete' });
  }
}

describe('SessionManager', () => {
  let mockChildren: MockChildHandle[];
  let manager: SessionManager;

  beforeEach(() => {
    vi.useFakeTimers();
    mockChildren = [];
    manager = new SessionManager({
      sessionTtlMin: 30,
      maxSessions: 3,
      childHandleFactory: () => {
        const h = new MockChildHandle();
        mockChildren.push(h);
        // Simulate the child becoming ready synchronously after spawn
        queueMicrotask(() => h.signalReady());
        return h;
      },
    });
  });

  afterEach(async () => {
    await manager.disposeAll();
    vi.useRealTimers();
  });

  it('create returns a session info with id and expiresAt', async () => {
    const promise = manager.create();
    await vi.advanceTimersByTimeAsync(0);
    const info = await promise;
    expect(info.sessionId).toBeTruthy();
    expect(info.expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(mockChildren).toHaveLength(1);
  });

  it('rejects new sessions past maxSessions', async () => {
    const p1 = manager.create();
    const p2 = manager.create();
    const p3 = manager.create();
    await vi.advanceTimersByTimeAsync(0);
    await Promise.all([p1, p2, p3]);
    await expect(manager.create()).rejects.toThrow(/max sessions/i);
  });

  it('execute returns runId and writes Invoke-MockingbirdRun to child stdin', async () => {
    const info = await waitForCreate(manager);
    const script = 'Echo-Test "hi"';
    const result = manager.execute(info.sessionId, { script, applyMode: false });
    expect('runId' in result).toBe(true);
    if ('runId' in result) {
      expect(result.runId).toBeTruthy();
      expect(mockChildren[0].writeLog).toHaveLength(1);
      const written = mockChildren[0].writeLog[0];
      expect(written).toContain('Invoke-MockingbirdRun');
      expect(written).toContain(result.runId);
      // Script body is base64-encoded then decoded via iex inside the wrapper -
      // see SessionManager.execute for why (multi-line stdin parsing). Assert
      // the encoded form is present rather than the raw script text.
      expect(written).toContain('Invoke-Expression');
      expect(written).toContain(Buffer.from(script, 'utf-8').toString('base64'));
    }
  });

  it('execute returns run-active error when a run is in progress', async () => {
    const info = await waitForCreate(manager);
    manager.execute(info.sessionId, { script: 'a', applyMode: false });
    const second = manager.execute(info.sessionId, { script: 'b', applyMode: false });
    expect(second).toEqual({ error: 'run-active' });
  });

  it('execute returns session-not-found for unknown id', () => {
    const result = manager.execute('no-such-id', { script: 'x', applyMode: false });
    expect(result).toEqual({ error: 'session-not-found' });
  });

  it('runComplete frame clears the active run, allowing the next execute', async () => {
    const info = await waitForCreate(manager);
    const first = manager.execute(info.sessionId, { script: 'a', applyMode: false });
    expect('runId' in first).toBe(true);
    if ('runId' in first) {
      mockChildren[0].emit({ type: 'runComplete', runId: first.runId, exitCode: 0, durationMs: 1 });
    }
    const second = manager.execute(info.sessionId, { script: 'b', applyMode: false });
    expect('runId' in second).toBe(true);
  });

  it('abort calls child.abort and emits runAborted', async () => {
    const info = await waitForCreate(manager);
    const result = manager.execute(info.sessionId, { script: 'a', applyMode: false });
    if (!('runId' in result)) throw new Error('execute failed');
    const aborted = await manager.abort(info.sessionId);
    expect(aborted).toBe(true);
    expect(mockChildren[0].abortCalls).toBe(1);
  });

  it('translates a post-abort child crash into runAborted + sessionClosed/explicit', async () => {
    // Windows path: process.kill('SIGINT') terminates the child rather than
    // interrupting the pipeline. The child emits sessionClosed/crash on exit;
    // the manager should translate that into the user-visible (runAborted,
    // sessionClosed/explicit) pair so the UI doesn't report a phantom crash.
    const info = await waitForCreate(manager);
    const result = manager.execute(info.sessionId, { script: 'a', applyMode: false });
    if (!('runId' in result)) throw new Error('execute failed');

    const received: Frame[] = [];
    const sub = manager.subscribe(info.sessionId, (f) => received.push(f));
    if (!sub) throw new Error('subscribe returned null');

    await manager.abort(info.sessionId);
    // Simulate the Windows post-SIGINT exit: child reports its own death.
    mockChildren[0].emit({ type: 'sessionClosed', reason: 'crash' });

    expect(received).toEqual([
      { type: 'runAborted', runId: result.runId },
      { type: 'sessionClosed', reason: 'explicit' },
    ]);
    expect(manager.get(info.sessionId)).toBeNull();
  });

  it('dispose kills child and removes from map', async () => {
    const info = await waitForCreate(manager);
    await manager.dispose(info.sessionId, 'explicit');
    expect(mockChildren[0].killCalls).toBe(1);
    expect(manager.get(info.sessionId)).toBeNull();
  });

  it('idle TTL evicts a session after sessionTtlMin minutes of no activity', async () => {
    const info = await waitForCreate(manager);
    // Advance time past TTL
    await vi.advanceTimersByTimeAsync(31 * 60_000);
    expect(mockChildren[0].killCalls).toBe(1);
    expect(manager.get(info.sessionId)).toBeNull();
  });

  it('execute resets the idle timer', async () => {
    const info = await waitForCreate(manager);
    await vi.advanceTimersByTimeAsync(20 * 60_000); // 20 min in
    manager.execute(info.sessionId, { script: 'a', applyMode: false });
    await vi.advanceTimersByTimeAsync(20 * 60_000); // another 20 min - would be 40 from create, but timer reset at 20
    // Should still be alive (only 20 min since last activity)
    expect(manager.get(info.sessionId)).not.toBeNull();
  });

  it('child crash emits sessionClosed and removes from map', async () => {
    const info = await waitForCreate(manager);
    mockChildren[0].emit({ type: 'sessionClosed', reason: 'crash' });
    expect(manager.get(info.sessionId)).toBeNull();
  });

  // --- Resource-management edge cases ---

  it('disposeAll kills every spawned child (no orphans)', async () => {
    const a = await waitForCreate(manager);
    const b = await waitForCreate(manager);
    const c = await waitForCreate(manager);
    expect(mockChildren).toHaveLength(3);
    await manager.disposeAll();
    expect(mockChildren[0].killCalls).toBe(1);
    expect(mockChildren[1].killCalls).toBe(1);
    expect(mockChildren[2].killCalls).toBe(1);
    expect(manager.get(a.sessionId)).toBeNull();
    expect(manager.get(b.sessionId)).toBeNull();
    expect(manager.get(c.sessionId)).toBeNull();
  });

  it('TTL timer is cleared on dispose (no double-dispose after explicit dispose)', async () => {
    const info = await waitForCreate(manager);
    await manager.dispose(info.sessionId, 'explicit');
    expect(mockChildren[0].killCalls).toBe(1);
    // Advance past TTL: the timer was cleared, so no second kill should fire.
    await vi.advanceTimersByTimeAsync(60 * 60_000);
    expect(mockChildren[0].killCalls).toBe(1);
  });

  it('frame buffer caps at 200 (eviction fires on 201+)', async () => {
    const info = await waitForCreate(manager);
    for (let i = 0; i < 250; i++) {
      mockChildren[0].emit({ type: 'stream', stream: 'stdout', data: `frame-${i}` });
    }
    const sub = manager.subscribe(info.sessionId, () => {});
    expect(sub).not.toBeNull();
    if (sub) {
      expect(sub.replay.length).toBeLessThanOrEqual(200);
      // Earliest frame should have been evicted; the most recent 200 remain.
      expect(sub.replay[0]).toEqual({ type: 'stream', stream: 'stdout', data: 'frame-50' });
      sub.unsubscribe();
    }
  });

  it('subscribe returns null for unknown session', () => {
    const sub = manager.subscribe('no-such-id', () => {});
    expect(sub).toBeNull();
  });

  it('subscribe unsubscribe removes the listener', async () => {
    const info = await waitForCreate(manager);
    const received: Frame[] = [];
    const sub = manager.subscribe(info.sessionId, (f) => received.push(f));
    if (!sub) throw new Error('subscribe failed');
    mockChildren[0].emit({ type: 'stream', stream: 'stdout', data: 'a' });
    sub.unsubscribe();
    mockChildren[0].emit({ type: 'stream', stream: 'stdout', data: 'b' });
    expect(received.find(f => f.type === 'stream' && f.data === 'a')).toBeTruthy();
    expect(received.find(f => f.type === 'stream' && f.data === 'b')).toBeFalsy();
  });

  // --- Eager warmup + state machine ---

  it('state defaults to "ready" with no warmup (legacy on-demand mode)', () => {
    const snap = manager.state;
    expect(snap.state).toBe('ready');
    expect(snap.error).toBeNull();
    expect(snap.startedAt).toBeNull();
    expect(snap.readyAt).toBeNull();
  });

  it('warmup() flips to "starting" synchronously on entry, then "ready" on success', async () => {
    const promise = manager.warmup();
    // Synchronously after the call (before any await) state has flipped
    // and startedAt is recorded - 425 Too Early can fire from this point.
    expect(manager.state.state).toBe('starting');
    expect(manager.state.startedAt).not.toBeNull();
    await vi.advanceTimersByTimeAsync(0);
    await promise;
    expect(manager.state.state).toBe('ready');
    expect(manager.state.error).toBeNull();
    expect(manager.state.readyAt).not.toBeNull();
    expect(manager.state.readyAt).toBeGreaterThanOrEqual(manager.state.startedAt!);
  });

  it('warmup() failure transitions state to "error" with the message captured', async () => {
    // Build a manager whose children never signal ready - waitForReady will
    // time out at 10s.
    const failingManager = new SessionManager({
      sessionTtlMin: 30,
      maxSessions: 3,
      childHandleFactory: () => {
        const h = new MockChildHandle();
        // deliberately do NOT call h.signalReady()
        mockChildren.push(h);
        return h;
      },
    });
    const promise = failingManager.warmup();
    await vi.advanceTimersByTimeAsync(11_000);
    await promise; // warmup() never throws
    expect(failingManager.state.state).toBe('error');
    expect(failingManager.state.error).toMatch(/did not signal ready/);
    expect(failingManager.state.readyAt).toBeNull();
  });

  it('create() after a successful warmup() reuses the primer (no new child spawned)', async () => {
    await runWarmup(manager);
    expect(mockChildren).toHaveLength(1);
    const info = await manager.create();
    expect(info.sessionId).toBeTruthy();
    // No second child was spawned: the primer was claimed.
    expect(mockChildren).toHaveLength(1);
  });

  it('a second create() after the primer is claimed spawns fresh', async () => {
    await runWarmup(manager);
    await manager.create();
    expect(mockChildren).toHaveLength(1);
    // Second create has no primer to claim - must spawn.
    const second = await waitForCreate(manager);
    expect(second.sessionId).toBeTruthy();
    expect(mockChildren).toHaveLength(2);
  });

  it('create() with no prior warmup() spawns fresh (legacy on-demand behavior unchanged)', async () => {
    expect(manager.state.state).toBe('ready');
    const info = await waitForCreate(manager);
    expect(info.sessionId).toBeTruthy();
    expect(mockChildren).toHaveLength(1);
  });
});

/** Helper for the common create+wait-ready pattern.
 *
 * NOTE: We deliberately use `advanceTimersByTimeAsync(0)` rather than
 * `runOnlyPendingTimersAsync()` here because the latter fires ALL pending
 * timers including the 30-minute TTL eviction, which would dispose the
 * session before `create()` even resolves. `advanceTimersByTimeAsync(0)`
 * drains the microtask queue (so `queueMicrotask(() => signalReady())` runs)
 * without advancing the clock, leaving the TTL timer pending for the test
 * to control explicitly.
 */
async function waitForCreate(manager: SessionManager): Promise<{ sessionId: string; expiresAt: string }> {
  const promise = manager.create();
  await vi.advanceTimersByTimeAsync(0);
  return promise;
}

async function runWarmup(manager: SessionManager): Promise<void> {
  const promise = manager.warmup();
  await vi.advanceTimersByTimeAsync(0);
  await promise;
}
