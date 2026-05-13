import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { registerPrefsRoutes } from './prefs.js';

describe('prefs route', () => {
  let app: FastifyInstance;
  let dir: string;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'mb-prefs-route-'));
    process.env.MOCKINGBIRD_STATE_ROOT = dir;
    app = Fastify();
    registerPrefsRoutes(app);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    delete process.env.MOCKINGBIRD_STATE_ROOT;
    rmSync(dir, { recursive: true, force: true });
  });

  it('GET /api/prefs returns defaults when missing', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/prefs' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ autoRestoreLastSession: false });
  });

  it('PUT /api/prefs merges patch and returns full prefs', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/prefs',
      payload: { autoRestoreLastSession: true },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ autoRestoreLastSession: true });

    const read = await app.inject({ method: 'GET', url: '/api/prefs' });
    expect(read.json().autoRestoreLastSession).toBe(true);
  });

  it('PUT /api/prefs ignores unknown keys in patch', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/prefs',
      payload: { autoRestoreLastSession: true, legacyKey: 'should-be-stripped' },
    });
    expect(res.statusCode).toBe(200);
    // The route only forwards the known boolean field; the response shape contains only known prefs.
    expect(res.json()).toEqual({ autoRestoreLastSession: true });
    expect((res.json() as Record<string, unknown>).legacyKey).toBeUndefined();
  });
});
