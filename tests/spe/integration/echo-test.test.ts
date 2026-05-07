// tests/spe/integration/echo-test.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import Fastify, { type FastifyInstance } from 'fastify';
import websocket from '@fastify/websocket';
import WebSocket from 'ws';
import { registerSpeRoutes } from '../../../src/api/routes/spe.js';
import { SessionManager } from '../../../src/spe/host/session-manager.js';
import type { Frame } from '../../../src/spe/host/types.js';

const HAS_PWSH = (() => {
  try {
    execSync('pwsh -NoProfile -NoLogo -Command "$PSVersionTable.PSVersion.Major"', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

const describeIfPwsh = HAS_PWSH ? describe : describe.skip;

describeIfPwsh('SPE end-to-end with real pwsh', () => {
  let app: FastifyInstance;
  let manager: SessionManager;
  let port: number;

  beforeAll(async () => {
    manager = new SessionManager({ sessionTtlMin: 5 });
    app = Fastify();
    await app.register(websocket);
    registerSpeRoutes(app, manager);
    await app.listen({ port: 0 });
    port = (app.server.address() as { port: number }).port;
  });

  afterAll(async () => {
    await app.close();
    await manager.disposeAll();
  });

  it('Echo-Test round-trip: stdin -> pwsh -> framed stdout -> WS', async () => {
    // 1. Create session
    const createRes = await fetch(`http://localhost:${port}/api/spe/sessions`, { method: 'POST' });
    expect(createRes.status).toBe(201);
    const { sessionId } = await createRes.json() as { sessionId: string };

    // 2. Connect WS
    const ws = new WebSocket(`ws://localhost:${port}/api/spe/sessions/${sessionId}/stream`);
    const received: Frame[] = [];
    ws.on('message', (msg) => received.push(JSON.parse(msg.toString())));
    await new Promise<void>((r) => ws.once('open', () => r()));

    // 3. Execute Echo-Test
    const execRes = await fetch(`http://localhost:${port}/api/spe/sessions/${sessionId}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ script: 'Echo-Test -InputText "hello-world"', applyMode: false }),
    });
    expect(execRes.status).toBe(202);
    const { runId } = await execRes.json() as { runId: string };

    // 4. Wait for runComplete
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('runComplete not received in 10s')), 10_000);
      const interval = setInterval(() => {
        if (received.find(f => f.type === 'runComplete' && f.runId === runId)) {
          clearTimeout(timeout);
          clearInterval(interval);
          resolve();
        }
      }, 50);
    });

    // 5. Assert lifecycle frames
    const runStarted = received.find(f => f.type === 'runStarted' && f.runId === runId);
    const runComplete = received.find(f => f.type === 'runComplete' && f.runId === runId);
    expect(runStarted).toBeTruthy();
    expect(runComplete).toBeTruthy();
    expect((runComplete as { exitCode: number }).exitCode).toBe(0);

    // 6. Assert the echo output landed as a stream frame
    const echoFrame = received.find(f => f.type === 'stream' && f.stream === 'stdout' && f.data.includes('hello-world'));
    expect(echoFrame).toBeTruthy();

    ws.close();

    // 7. Cleanup
    await fetch(`http://localhost:${port}/api/spe/sessions/${sessionId}`, { method: 'DELETE' });
  }, 30_000);
});
