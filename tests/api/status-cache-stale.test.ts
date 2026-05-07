import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { Engine } from '../../src/engine/index.js';
import { registerStatusRoute } from '../../src/api/routes/status.js';

describe('/api/status cacheStale flag', () => {
  it('reports cacheStale=false on a fresh engine', async () => {
    const engine = new Engine({ rootDir: '.' });
    expect(engine.isCacheStale()).toBe(false);

    const app = Fastify({ logger: false });
    registerStatusRoute(app, engine);
    try {
      const res = await app.inject({ method: 'GET', url: '/api/status' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.cacheStale).toBe(false);
    } finally {
      await app.close();
    }
  });

  it('reports cacheStale=true after the engine flag flips', async () => {
    const engine = new Engine({ rootDir: '.' });
    // Simulate the post-ready verifier resolving "stale" - the engine sets
    // its private _cacheStale field via the same write the verify-fail
    // branch performs.
    (engine as unknown as { _cacheStale: boolean })._cacheStale = true;
    expect(engine.isCacheStale()).toBe(true);

    const app = Fastify({ logger: false });
    registerStatusRoute(app, engine);
    try {
      const res = await app.inject({ method: 'GET', url: '/api/status' });
      const body = res.json();
      expect(body.cacheStale).toBe(true);
    } finally {
      await app.close();
    }
  });
});
