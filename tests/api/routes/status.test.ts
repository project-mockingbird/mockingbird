import { describe, it, expect, afterEach } from 'vitest';
import { createServer } from '../../../src/api/server.js';
import { resolve } from 'path';
import type { FastifyInstance } from 'fastify';

const fixture = resolve(__dirname, '../../fixtures/valid');
let app: FastifyInstance | null = null;

afterEach(async () => {
  if (app) {
    await app.close();
    app = null;
  }
});

describe('GET /api/status', () => {
  it('reports indexing immediately after startup, then ready', async () => {
    const created = await createServer({ rootDir: fixture });
    app = created.app;

    const initial = await app.inject({ method: 'GET', url: '/api/status' });
    expect(initial.statusCode).toBe(200);
    const initialBody = initial.json();
    expect(['initializing', 'ready']).toContain(initialBody.state);
    expect(initialBody).toHaveProperty('progress');
    expect(initialBody.progress).toHaveProperty('scanned');
    expect(initialBody.progress).toHaveProperty('total');

    await created.engine.readiness.ready();

    const after = await app.inject({ method: 'GET', url: '/api/status' });
    expect(after.statusCode).toBe(200);
    const body = after.json();
    expect(body.state).toBe('ready');
    expect(body.itemCount).toBeGreaterThan(0);
  });

  it('exposes phaseTimings as a structured boot timeline', async () => {
    const created = await createServer({ rootDir: fixture });
    app = created.app;
    await created.engine.readiness.ready();

    const res = await app.inject({ method: 'GET', url: '/api/status' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      phaseTimings: { label: string; durationMs: number; extras?: Record<string, string | number> }[];
    };
    expect(Array.isArray(body.phaseTimings)).toBe(true);
    expect(body.phaseTimings.length).toBeGreaterThan(0);
    const labels = body.phaseTimings.map((p) => p.label);
    // The discoverModules + indexInBackground TOTAL phases always run.
    expect(labels).toContain('discoverModules (rootDir)');
    expect(labels).toContain('indexInBackground TOTAL');
    for (const p of body.phaseTimings) {
      expect(typeof p.durationMs).toBe('number');
      expect(p.durationMs).toBeGreaterThanOrEqual(0);
    }
  });

});

describe('GET /api/status (no-project boot)', () => {
  it('reports state: no-project when server boots without rootDir', async () => {
    const created = await createServer({});
    app = created.app;
    await created.engine.readiness.ready();

    const res = await app.inject({ method: 'GET', url: '/api/status' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.state).toBe('no-project');
    expect(body.itemCount).toBe(0);
  });

  it('does not load registry when booted without rootDir and no registryPath', async () => {
    const created = await createServer({});
    app = created.app;
    await created.engine.readiness.ready();

    const res = await app.inject({ method: 'GET', url: '/api/status' });
    const body = res.json();
    expect(body.registryLoaded).toBe(false);
  });

  it('loads the registry in no-project mode when registryPath is supplied', async () => {
    const created = await createServer({
      registryPath: resolve(__dirname, '../../../data/registry.json.gz'),
    });
    app = created.app;
    await created.engine.readiness.ready();

    const res = await app.inject({ method: 'GET', url: '/api/status' });
    const body = res.json();
    expect(body.state).toBe('no-project');
    expect(body.registryLoaded).toBe(true);
  });

  it('reports layers as empty array in no-project mode', async () => {
    const created = await createServer({});
    app = created.app;
    await created.engine.readiness.ready();

    const res = await app.inject({ method: 'GET', url: '/api/status' });
    const body = res.json();
    expect(Array.isArray(body.layers)).toBe(true);
    expect(body.layers.length).toBe(0);
  });
});
