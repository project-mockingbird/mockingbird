import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { resolve } from 'path';
import type { FastifyInstance } from 'fastify';
import { createServer } from '../../src/api/server.js';

// Cold-start behavior: with deferEngineStart the HTTP surface (including the
// splash) is live before the engine initializes, so a reverse proxy always
// reaches a responsive server instead of returning Bad Gateway.

describe('cold-start splash (deferEngineStart)', () => {
  let app: FastifyInstance | null = null;
  let tempDir: string | null = null;

  afterEach(async () => {
    if (app) { await app.close(); app = null; }
    if (tempDir) { await rm(tempDir, { recursive: true, force: true }); tempDir = null; }
  });

  it('serves the splash before the engine starts, then hands off to the app once ready', async () => {
    tempDir = await mkdtemp(resolve(tmpdir(), 'mockingbird-splash-'));
    const created = await createServer({ rootDir: tempDir, deferEngineStart: true });
    app = created.app;
    const { engine, startEngine } = created;

    // Engine has not started: readiness is still initializing.
    expect(engine.readiness.state).toBe('initializing');

    // A top-level browser navigation gets the splash, not a blank/404.
    const splash = await app.inject({ method: 'GET', url: '/', headers: { accept: 'text/html' } });
    expect(splash.statusCode).toBe(200);
    expect(splash.body).toContain('Starting Mockingbird');

    // /api/status still answers so the splash JS can poll for progress.
    const status = await app.inject({ method: 'GET', url: '/api/status' });
    expect(status.statusCode).toBe(200);

    // Start the engine and let it settle (empty temp dir -> ready).
    await startEngine();
    await engine.readiness.ready();
    expect(engine.readiness.state).toBe('ready');

    // The splash no longer intercepts; the real app takes over.
    const afterReady = await app.inject({ method: 'GET', url: '/', headers: { accept: 'text/html' } });
    expect(afterReady.body).not.toContain('Starting Mockingbird');
  });

  it('default mode (no flag) auto-starts the engine, preserving existing behavior', async () => {
    tempDir = await mkdtemp(resolve(tmpdir(), 'mockingbird-splash-'));
    const created = await createServer({ rootDir: tempDir });
    app = created.app;
    // startInit ran inside createServer, so readiness resolves without a manual start.
    await created.engine.readiness.ready();
    expect(created.engine.readiness.state).toBe('ready');
  });
});
