import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { resolve } from 'path';
import type { FastifyInstance } from 'fastify';
import { createServer } from '../../src/api/server.js';

// POST /api/admin/reindex - backend for the in-app "Restart" / "Clear Cache and
// Restart" power button. Must respond 202 immediately AND flip readiness to
// 'initializing' synchronously so the client's reload lands on the splash.

describe('POST /api/admin/reindex', () => {
  let app: FastifyInstance | null = null;
  let tempDir: string | null = null;

  afterEach(async () => {
    if (app) { await app.close(); app = null; }
    if (tempDir) { await rm(tempDir, { recursive: true, force: true }); tempDir = null; }
  });

  it('returns 202 and flips readiness to initializing', async () => {
    tempDir = await mkdtemp(resolve(tmpdir(), 'mockingbird-reindex-'));
    const created = await createServer({ rootDir: tempDir });
    app = created.app;
    await created.engine.readiness.ready();
    expect(created.engine.readiness.state).toBe('ready');

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/reindex',
      payload: { clearCache: false },
    });
    expect(res.statusCode).toBe(202);
    expect(res.json()).toMatchObject({ status: 'reindexing', clearCache: false });
    // Synchronous reset means the very next observation is 'initializing'.
    expect(created.engine.readiness.state).toBe('initializing');

    await created.engine.readiness.ready();
    expect(created.engine.readiness.state).toBe('ready');
  });

  it('passes the clearCache flag through', async () => {
    tempDir = await mkdtemp(resolve(tmpdir(), 'mockingbird-reindex-'));
    const created = await createServer({ rootDir: tempDir });
    app = created.app;
    await created.engine.readiness.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/reindex',
      payload: { clearCache: true },
    });
    expect(res.statusCode).toBe(202);
    expect(res.json()).toMatchObject({ status: 'reindexing', clearCache: true });
    await created.engine.readiness.ready();
  });

  it('is reachable while re-indexing (admin routes are exempt from the readiness gate)', async () => {
    tempDir = await mkdtemp(resolve(tmpdir(), 'mockingbird-reindex-'));
    const created = await createServer({ rootDir: tempDir });
    app = created.app;
    await created.engine.readiness.ready();

    // Kick a reindex, then hit the endpoint again mid-warmup - the gate would
    // 503 a non-admin route here.
    await app.inject({ method: 'POST', url: '/api/admin/reindex', payload: { clearCache: false } });
    const second = await app.inject({ method: 'POST', url: '/api/admin/reindex', payload: { clearCache: false } });
    expect(second.statusCode).toBe(202);
    await created.engine.readiness.ready();
  });
});
