import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';

vi.mock('../../../src/engine/sitecoreai/environments.js', () => ({
  listEnvironments: vi.fn(async () => [{ id: 'e1', name: 'Acme', cmHost: 'h', hasSecret: true }]),
  upsertEnvironment: vi.fn(async () => {}),
  deleteEnvironment: vi.fn(async () => {}),
  getResolvedEnvironment: vi.fn(async () => ({ id: 'e1', name: 'Acme', cmHost: 'h', clientId: 'c', clientSecret: 's' })),
}));
vi.mock('../../../src/engine/sitecoreai/client.js', () => ({
  createSitecoreAiClient: () => ({ itemExists: async () => true, templateExists: async () => true, executeSerializationCommands: async () => ({ ok: true, errors: [], messages: [] }) }),
}));
vi.mock('../../../src/engine/sitecoreai/install.js', () => ({
  previewInstall: async (_e: unknown, _s: unknown, _st: unknown, _c: unknown, onProgress?: (c: number, t: number) => void) => {
    onProgress?.(1, 1);
    return { steps: [], blockingErrors: [], warnings: [], summary: { create: 1, update: 0, skip: 0 } };
  },
  executeInstall: async (_e: unknown, _s: unknown, _st: unknown, _c: unknown, opts: any) => {
    opts?.onProgress?.({ kind: 'progress', completed: 1, total: 1, message: 'Installed 1/1' });
    return opts?.onProgress?.({ kind: 'done', completed: 1, total: 1 }) ?? { kind: 'done', completed: 1, total: 1 };
  },
}));

import { registerSitecoreAiRoutes } from '../../../src/api/routes/sitecoreai.js';
import { upsertEnvironment, deleteEnvironment, getResolvedEnvironment } from '../../../src/engine/sitecoreai/environments.js';

async function makeApp() {
  const app = Fastify();
  registerSitecoreAiRoutes(app, {} as any);
  await app.ready();
  return app;
}

describe('sitecoreai routes', () => {
  it('lists environments', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: '/api/sitecoreai/environments' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([{ id: 'e1', name: 'Acme', cmHost: 'h', hasSecret: true }]);
  });

  it('upserts an environment', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'PUT', url: '/api/sitecoreai/environments/e1', payload: { name: 'Acme', cmHost: 'h', clientId: 'c', clientSecret: 's' } });
    expect(res.statusCode).toBe(204);
    expect(upsertEnvironment).toHaveBeenCalled();
  });

  it('previews an install (streams progress then a plan)', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'POST', url: '/api/sitecoreai/install/preview', payload: { envId: 'e1', sources: [], strategy: 'skip' } });
    expect(res.statusCode).toBe(200);
    const lines = res.body.trim().split('\n').map((l) => JSON.parse(l));
    expect(lines.some((e) => e.kind === 'progress')).toBe(true);
    const planEvt = lines.find((e) => e.kind === 'plan');
    expect(planEvt?.plan.summary).toEqual({ create: 1, update: 0, skip: 0 });
  });

  it('rejects an invalid strategy', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'POST', url: '/api/sitecoreai/install/preview', payload: { envId: 'e1', sources: [], strategy: 'nuke' } });
    expect(res.statusCode).toBe(400);
  });

  it('streams NDJSON install progress ending in done', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'POST', url: '/api/sitecoreai/install', payload: { envId: 'e1', sources: [], strategy: 'skip' } });
    expect(res.statusCode).toBe(200);
    const lines = res.body.trim().split('\n').map((l) => JSON.parse(l));
    expect(lines.at(-1).kind).toBe('done');
  });

  it('deletes an environment', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'DELETE', url: '/api/sitecoreai/environments/e1' });
    expect(res.statusCode).toBe(204);
    expect(deleteEnvironment).toHaveBeenCalled();
  });

  it('tests a connection successfully', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'POST', url: '/api/sitecoreai/environments/e1/test' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it('returns 400 when the test-connection probe fails', async () => {
    vi.mocked(getResolvedEnvironment).mockRejectedValueOnce(new Error('bad creds'));
    const app = await makeApp();
    const res = await app.inject({ method: 'POST', url: '/api/sitecoreai/environments/e1/test' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('bad creds');
  });

  it('rejects a PUT missing a required field', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'PUT', url: '/api/sitecoreai/environments/e1', payload: { cmHost: 'h', clientId: 'c' } });
    expect(res.statusCode).toBe(400);
  });
});
