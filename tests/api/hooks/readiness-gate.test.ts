import { describe, it, expect, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerReadinessGate } from '../../../src/api/hooks/readiness-gate.js';
import { ReadinessState } from '../../../src/engine/readiness.js';

let app: FastifyInstance | null = null;

afterEach(async () => {
  if (app) {
    await app.close();
    app = null;
  }
});

describe('readiness gate', () => {
  it('returns 503 for /api/* while indexing, 200 after ready', async () => {
    const readiness = new ReadinessState();
    app = Fastify();
    registerReadinessGate(app, readiness);
    app.get('/api/tree', async () => ({ ok: true }));

    const gated = await app.inject({ method: 'GET', url: '/api/tree' });
    expect(gated.statusCode).toBe(503);
    const body = gated.json();
    expect(body.status).toBe('indexing');
    expect(body).toHaveProperty('progress');

    readiness.markReady();

    const ok = await app.inject({ method: 'GET', url: '/api/tree' });
    expect(ok.statusCode).toBe(200);
  });

  it('returns 503 with status:error when indexing failed', async () => {
    const readiness = new ReadinessState();
    app = Fastify();
    registerReadinessGate(app, readiness);
    app.get('/api/tree', async () => ({ ok: true }));
    readiness.markError(new Error('disk read failed'));

    const res = await app.inject({ method: 'GET', url: '/api/tree' });
    expect(res.statusCode).toBe(503);
    const body = res.json();
    expect(body.status).toBe('error');
    expect(body.error).toBe('disk read failed');
  });

  it('lets /api/status through even while indexing', async () => {
    const readiness = new ReadinessState();
    app = Fastify();
    registerReadinessGate(app, readiness);
    app.get('/api/status', async () => ({ state: readiness.state }));

    const res = await app.inject({ method: 'GET', url: '/api/status' });
    expect(res.statusCode).toBe(200);
  });

  it('lets /api/admin/* through even while indexing', async () => {
    const readiness = new ReadinessState();
    app = Fastify();
    registerReadinessGate(app, readiness);
    app.get('/api/admin/logs/server/stream', async () => ({ ok: true }));
    app.get('/api/admin/logs/graphql/stream', async () => ({ ok: true }));

    const server = await app.inject({ method: 'GET', url: '/api/admin/logs/server/stream' });
    expect(server.statusCode).toBe(200);
    const graphql = await app.inject({ method: 'GET', url: '/api/admin/logs/graphql/stream' });
    expect(graphql.statusCode).toBe(200);
  });

  it('does not gate non-/api routes (e.g. static web UI)', async () => {
    const readiness = new ReadinessState();
    app = Fastify();
    registerReadinessGate(app, readiness);
    app.get('/', async () => 'hi');

    const res = await app.inject({ method: 'GET', url: '/' });
    expect(res.statusCode).toBe(200);
  });
});
