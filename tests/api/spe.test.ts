// tests/api/spe.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import websocket from '@fastify/websocket';
import { registerSpeRoutes } from '../../src/api/routes/spe.js';
import { SessionManager } from '../../src/spe/host/session-manager.js';
import type { IChildHandle, FrameListener, Frame } from '../../src/spe/host/types.js';

class MockChildHandle implements IChildHandle {
  private listeners: FrameListener[] = [];
  private _closed = false;
  public writeLog: string[] = [];
  writeLine(line: string): void { if (this._closed) throw new Error('closed'); this.writeLog.push(line); }
  async abort(): Promise<void> {}
  async kill(): Promise<void> { this._closed = true; this.emit({ type: 'sessionClosed', reason: 'explicit' }); }
  onFrame(l: FrameListener): () => void { this.listeners.push(l); return () => { this.listeners = this.listeners.filter(x => x !== l); }; }
  emit(f: Frame): void { for (const l of [...this.listeners]) l(f); }
  get closed(): boolean { return this._closed; }
}

describe('SPE routes', () => {
  let app: FastifyInstance;
  let manager: SessionManager;

  beforeEach(async () => {
    manager = new SessionManager({
      childHandleFactory: () => {
        const h = new MockChildHandle();
        // Signal ready on the next tick
        queueMicrotask(() => h.emit({ type: 'stream', stream: 'info', data: 'mockingbird-startup-complete' }));
        return h;
      },
    });
    app = Fastify();
    await app.register(websocket);
    registerSpeRoutes(app, manager);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    await manager.disposeAll();
  });

  it('POST /api/spe/sessions creates a session', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/spe/sessions' });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { sessionId: string; expiresAt: string };
    expect(body.sessionId).toBeTruthy();
    expect(body.expiresAt).toBeTruthy();
  });

  it('POST /api/spe/sessions/:id/execute returns runId', async () => {
    const create = await app.inject({ method: 'POST', url: '/api/spe/sessions' });
    const { sessionId } = create.json() as { sessionId: string };
    const exec = await app.inject({
      method: 'POST',
      url: `/api/spe/sessions/${sessionId}/execute`,
      payload: { script: 'Echo-Test "hi"', applyMode: false },
    });
    expect(exec.statusCode).toBe(202);
    const body = exec.json() as { runId: string };
    expect(body.runId).toBeTruthy();
  });

  it('execute returns 404 for unknown session', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/spe/sessions/no-such-id/execute',
      payload: { script: 'x', applyMode: false },
    });
    expect(res.statusCode).toBe(404);
  });

  it('execute returns 409 when a run is already active', async () => {
    const create = await app.inject({ method: 'POST', url: '/api/spe/sessions' });
    const { sessionId } = create.json() as { sessionId: string };
    await app.inject({ method: 'POST', url: `/api/spe/sessions/${sessionId}/execute`, payload: { script: 'a', applyMode: false } });
    const second = await app.inject({ method: 'POST', url: `/api/spe/sessions/${sessionId}/execute`, payload: { script: 'b', applyMode: false } });
    expect(second.statusCode).toBe(409);
  });

  it('execute returns 400 when payload missing script', async () => {
    const create = await app.inject({ method: 'POST', url: '/api/spe/sessions' });
    const { sessionId } = create.json() as { sessionId: string };
    const res = await app.inject({ method: 'POST', url: `/api/spe/sessions/${sessionId}/execute`, payload: {} });
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/spe/sessions/:id/abort returns aborted:true when run active', async () => {
    const create = await app.inject({ method: 'POST', url: '/api/spe/sessions' });
    const { sessionId } = create.json() as { sessionId: string };
    await app.inject({ method: 'POST', url: `/api/spe/sessions/${sessionId}/execute`, payload: { script: 'a', applyMode: false } });
    const res = await app.inject({ method: 'POST', url: `/api/spe/sessions/${sessionId}/abort` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { aborted: boolean };
    expect(body.aborted).toBe(true);
  });

  it('POST /api/spe/sessions/:id/abort returns aborted:false when no run active', async () => {
    const create = await app.inject({ method: 'POST', url: '/api/spe/sessions' });
    const { sessionId } = create.json() as { sessionId: string };
    const res = await app.inject({ method: 'POST', url: `/api/spe/sessions/${sessionId}/abort` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { aborted: boolean };
    expect(body.aborted).toBe(false);
  });

  it('DELETE /api/spe/sessions/:id disposes and 204s', async () => {
    const create = await app.inject({ method: 'POST', url: '/api/spe/sessions' });
    const { sessionId } = create.json() as { sessionId: string };
    const res = await app.inject({ method: 'DELETE', url: `/api/spe/sessions/${sessionId}` });
    expect(res.statusCode).toBe(204);
    expect(manager.get(sessionId)).toBeNull();
  });

  it('DELETE /api/spe/sessions/:id 404s for unknown id', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/api/spe/sessions/no-such-id' });
    expect(res.statusCode).toBe(404);
  });

  // --- Warmup-window gate (425 Too Early) ---

  it('POST /api/spe/sessions returns 425 + Retry-After when speState is "starting"', async () => {
    // Build a manager whose children never signal ready - warmup() stays
    // in 'starting' for the duration of this test, exercising the gate.
    const stallingManager = new SessionManager({
      childHandleFactory: () => new MockChildHandle(), // never signals ready
    });
    const stallingApp = Fastify();
    await stallingApp.register(websocket);
    registerSpeRoutes(stallingApp, stallingManager);
    await stallingApp.ready();
    try {
      // Kick off warmup (don't await - it would hang). The synchronous
      // body of warmup() flips state to 'starting' before returning.
      void stallingManager.warmup();
      expect(stallingManager.state.state).toBe('starting');

      const res = await stallingApp.inject({ method: 'POST', url: '/api/spe/sessions' });
      expect(res.statusCode).toBe(425);
      expect(res.headers['retry-after']).toBe('5');
      const body = res.json() as { error: string; speState: string };
      expect(body.speState).toBe('starting');
    } finally {
      await stallingApp.close();
      await stallingManager.disposeAll();
    }
  });

  it('POST /api/spe/sessions proceeds normally (201) when speState is "ready"', async () => {
    // The default beforeEach manager signals ready synchronously - but it
    // never had warmup() called, so state is still 'starting'. Trigger
    // warmup so state flips to 'ready' before we hit the gate.
    await manager.warmup();
    const res = await app.inject({ method: 'POST', url: '/api/spe/sessions' });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { sessionId: string };
    expect(body.sessionId).toBeTruthy();
  });
});
