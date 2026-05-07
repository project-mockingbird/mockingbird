import { describe, it, expect, vi } from 'vitest';
import { routeFrame, type FrameRouterTargets } from '../../../src/web/components/ise/frame-router';

function makeTargets(): FrameRouterTargets {
  return {
    onTerminalWrite: vi.fn(),
    onDiff: vi.fn(),
    onApplied: vi.fn(),
    onRunStarted: vi.fn(),
    onRunComplete: vi.fn(),
    onRunAborted: vi.fn(),
    onSessionExpiring: vi.fn(),
    onSessionClosed: vi.fn(),
  };
}

describe('routeFrame', () => {
  it('routes stdout to terminal write', () => {
    const t = makeTargets();
    routeFrame({ type: 'stream', stream: 'stdout', data: 'hello' }, t);
    expect(t.onTerminalWrite).toHaveBeenCalledWith('stdout', 'hello');
  });

  it('routes stderr/error with red ANSI prefix', () => {
    const t = makeTargets();
    routeFrame({ type: 'stream', stream: 'error', data: 'oops' }, t);
    const call = (t.onTerminalWrite as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe('error');
    expect(call[1]).toContain('oops');
    // Should be wrapped in red ANSI
    expect(call[1]).toMatch(/\x1b\[31m/);
  });

  it('routes diff frames to onDiff', () => {
    const t = makeTargets();
    routeFrame({ type: 'diff', format: 'unified', operation: 'Set-ItemField', data: '--- a\n+++ b\n', warnings: [] }, t);
    expect(t.onDiff).toHaveBeenCalled();
  });

  it('routes applied frames to onApplied', () => {
    const t = makeTargets();
    routeFrame({ type: 'applied', summary: { writes: 2, paths: ['/a', '/b'] } }, t);
    expect(t.onApplied).toHaveBeenCalled();
  });

  it('routes runStarted/runComplete/runAborted to their handlers', () => {
    const t = makeTargets();
    routeFrame({ type: 'runStarted', runId: 'r1' }, t);
    routeFrame({ type: 'runComplete', runId: 'r1', exitCode: 0, durationMs: 100 }, t);
    routeFrame({ type: 'runAborted', runId: 'r2' }, t);
    expect(t.onRunStarted).toHaveBeenCalledWith('r1');
    expect(t.onRunComplete).toHaveBeenCalledWith('r1', 0, 100);
    expect(t.onRunAborted).toHaveBeenCalledWith('r2');
  });

  it('handles sessionExpiring and sessionClosed', () => {
    const t = makeTargets();
    routeFrame({ type: 'sessionExpiring', expiresAt: '2026-01-01T00:00:00Z' }, t);
    routeFrame({ type: 'sessionClosed', reason: 'ttl' }, t);
    expect(t.onSessionExpiring).toHaveBeenCalled();
    expect(t.onSessionClosed).toHaveBeenCalledWith('ttl');
  });
});
