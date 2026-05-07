import { describe, it, expect, afterEach } from 'vitest';
import { resolve } from 'path';
import type { FastifyInstance } from 'fastify';
import { createServer } from '../../../src/api/server.js';
import { serverLogBuffer } from '../../../src/api/logging/buffers.js';

const fixture = resolve(__dirname, '../../fixtures/valid');
let app: FastifyInstance | null = null;

afterEach(async () => {
  if (app) { await app.close(); app = null; }
});

describe('server.ts pino wiring', () => {
  it('populates serverLogBuffer when a request hits the API', async () => {
    const before = serverLogBuffer.getSince(0).length;
    const created = await createServer({ rootDir: fixture });
    app = created.app;

    await app.inject({ method: 'GET', url: '/api/status' });

    const after = serverLogBuffer.getSince(0);
    expect(after.length).toBeGreaterThan(before);

    // Fastify 5 emits two correlated lines per request: `incoming request`
    // carries `req.url`, `request completed` carries `res.statusCode`. They
    // share a `reqId`. We verify both halves landed in the buffer and match.
    const incoming = after.find(e => e.msg === 'incoming request' && e.url === '/api/status');
    expect(incoming).toBeDefined();
    expect(incoming?.requestId).toBeDefined();

    const requestCompleted = after.find(e => e.msg === 'request completed' && e.requestId === incoming?.requestId);
    expect(requestCompleted).toBeDefined();
    expect(requestCompleted?.statusCode).toBe(200);
  });
});
