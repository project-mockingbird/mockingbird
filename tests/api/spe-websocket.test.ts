// tests/api/spe-websocket.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import websocket from '@fastify/websocket';
import WebSocket from 'ws';
import { registerSpeRoutes } from '../../src/api/routes/spe.js';
import { SessionManager } from '../../src/spe/host/session-manager.js';
import type { IChildHandle, FrameListener, Frame } from '../../src/spe/host/types.js';

class MockChildHandle implements IChildHandle {
  private listeners: FrameListener[] = [];
  private _closed = false;
  writeLine(_line: string): void {}
  async abort(): Promise<void> {}
  async kill(): Promise<void> { this._closed = true; this.emit({ type: 'sessionClosed', reason: 'explicit' }); }
  onFrame(l: FrameListener): () => void { this.listeners.push(l); return () => { this.listeners = this.listeners.filter(x => x !== l); }; }
  emit(f: Frame): void { for (const l of [...this.listeners]) l(f); }
  get closed(): boolean { return this._closed; }
}

describe('WS /api/spe/sessions/:id/stream', () => {
  let app: FastifyInstance;
  let manager: SessionManager;
  let port: number;
  let mockChildren: MockChildHandle[];

  beforeEach(async () => {
    mockChildren = [];
    manager = new SessionManager({
      childHandleFactory: () => {
        const h = new MockChildHandle();
        mockChildren.push(h);
        queueMicrotask(() => h.emit({ type: 'stream', stream: 'info', data: 'mockingbird-startup-complete' }));
        return h;
      },
    });
    app = Fastify();
    await app.register(websocket);
    registerSpeRoutes(app, manager);
    await app.listen({ port: 0 });
    port = (app.server.address() as { port: number }).port;
  });

  afterEach(async () => {
    await app.close();
    await manager.disposeAll();
  });

  it('streams a frame to the WS client when the manager dispatches one', async () => {
    const info = await manager.create();
    const child = mockChildren[mockChildren.length - 1];
    const ws = new WebSocket(`ws://localhost:${port}/api/spe/sessions/${info.sessionId}/stream`);
    await new Promise<void>((resolve) => ws.once('open', () => resolve()));

    const received: Frame[] = [];
    ws.on('message', (msg) => received.push(JSON.parse(msg.toString())));

    child.emit({ type: 'stream', stream: 'stdout', data: 'hello' });
    await new Promise(r => setTimeout(r, 50));

    expect(received).toContainEqual({ type: 'stream', stream: 'stdout', data: 'hello' });
    ws.close();
  });

  it('replays buffered frames on connect', async () => {
    const info = await manager.create();
    const child = mockChildren[mockChildren.length - 1];
    // Emit BEFORE connecting
    child.emit({ type: 'stream', stream: 'stdout', data: 'before-connect' });

    const ws = new WebSocket(`ws://localhost:${port}/api/spe/sessions/${info.sessionId}/stream`);
    const received: Frame[] = [];
    ws.on('message', (msg) => received.push(JSON.parse(msg.toString())));
    await new Promise<void>((resolve) => ws.once('open', () => resolve()));
    await new Promise(r => setTimeout(r, 50));

    expect(received).toContainEqual({ type: 'stream', stream: 'stdout', data: 'before-connect' });
    ws.close();
  });

  it('closes the WS with code 1011 when session does not exist', async () => {
    const ws = new WebSocket(`ws://localhost:${port}/api/spe/sessions/no-such-id/stream`);
    const closeCode = await new Promise<number>((resolve) => ws.once('close', (code) => resolve(code)));
    expect(closeCode).toBe(1011);
  });

  it('unsubscribes from manager when client disconnects', async () => {
    const info = await manager.create();
    const ws = new WebSocket(`ws://localhost:${port}/api/spe/sessions/${info.sessionId}/stream`);
    await new Promise<void>((resolve) => ws.once('open', () => resolve()));
    // Wait briefly for server-side subscribe to complete
    await new Promise(r => setTimeout(r, 50));

    const entry = manager.get(info.sessionId);
    expect(entry).not.toBeNull();
    if (!entry) throw new Error('entry vanished');
    expect(entry.externalListeners.length).toBeGreaterThan(0);
    const before = entry.externalListeners.length;

    ws.close();
    await new Promise<void>((resolve) => ws.once('close', () => resolve()));
    // Give server a tick to process the close event
    await new Promise(r => setTimeout(r, 50));

    expect(entry.externalListeners.length).toBeLessThan(before);
  });
});
