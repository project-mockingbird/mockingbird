import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { createServer } from '../../src/api/server.js';
import { resolve } from 'path';
import type { FastifyInstance } from 'fastify';

const registryFixture = resolve(__dirname, '../../data/registry.json.gz');
let app: FastifyInstance | null = null;
let originalEnv: NodeJS.ProcessEnv;

beforeEach(() => {
  originalEnv = { ...process.env };
});

afterEach(async () => {
  process.env = originalEnv;
  if (app) {
    await app.close();
    app = null;
  }
});

describe('Server boot without SCS_SITECORE_JSON', () => {
  it('boots cleanly without SCS_SITECORE_JSON env var', async () => {
    delete process.env.SCS_SITECORE_JSON;
    delete process.env.SCS_CONTENT_SITECORE_JSON;

    const created = await createServer({ registryPath: registryFixture });
    app = created.app;
    await created.engine.readiness.ready();

    expect(created.engine.readiness.state).toBe('no-project');
  });

  it('GET /api/status returns no-project + registry loaded', async () => {
    delete process.env.SCS_SITECORE_JSON;

    const created = await createServer({ registryPath: registryFixture });
    app = created.app;
    await created.engine.readiness.ready();

    const res = await app.inject({ method: 'GET', url: '/api/status' });
    const body = res.json();
    expect(body.state).toBe('no-project');
    expect(body.registryLoaded).toBe(true);
  });
});
