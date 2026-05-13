import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { registerProfilesRoutes } from './profiles.js';

describe('profiles routes', () => {
  let app: FastifyInstance;
  let dir: string;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'mb-profile-routes-'));
    process.env.MOCKINGBIRD_STATE_ROOT = dir;
    app = Fastify();
    registerProfilesRoutes(app);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    delete process.env.MOCKINGBIRD_STATE_ROOT;
    rmSync(dir, { recursive: true, force: true });
  });

  it('GET /api/profiles returns empty list for unknown project', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/profiles?projectHash=abc' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ profiles: [] });
  });

  it('GET /api/profiles requires projectHash query', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/profiles' });
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/profiles creates a profile + GET lists it', async () => {
    const body = {
      projectHash: 'abc',
      name: 'dev',
      projectName: 'demo',
      layers: [{ sitecoreJsonPath: '/sitecore.json', name: 'core', color: '#123456' }],
    };
    const create = await app.inject({ method: 'POST', url: '/api/profiles', payload: body });
    expect(create.statusCode).toBe(200);
    expect(create.json().profile.name).toBe('dev');

    const list = await app.inject({ method: 'GET', url: '/api/profiles?projectHash=abc' });
    expect(list.json().profiles).toHaveLength(1);
    expect(list.json().profiles[0]).toMatchObject({ name: 'dev', projectName: 'demo', layerCount: 1 });
  });

  it('POST /api/profiles validates required fields', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/profiles', payload: { projectHash: 'abc' } });
    expect(res.statusCode).toBe(400);
  });

  it('DELETE /api/profiles removes', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/profiles',
      payload: { projectHash: 'abc', name: 'dev', projectName: 'demo', layers: [{ sitecoreJsonPath: '/x', name: 'c', color: '#000' }] },
    });
    const del = await app.inject({ method: 'DELETE', url: '/api/profiles?projectHash=abc&name=dev' });
    expect(del.statusCode).toBe(200);
    const list = await app.inject({ method: 'GET', url: '/api/profiles?projectHash=abc' });
    expect(list.json().profiles).toEqual([]);
  });

  it('POST /api/profiles/rename moves a profile', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/profiles',
      payload: { projectHash: 'abc', name: 'dev', projectName: 'demo', layers: [{ sitecoreJsonPath: '/x', name: 'c', color: '#000' }] },
    });
    const ren = await app.inject({
      method: 'POST',
      url: '/api/profiles/rename',
      payload: { projectHash: 'abc', oldName: 'dev', newName: 'production' },
    });
    expect(ren.statusCode).toBe(200);
    expect(ren.json().profile.name).toBe('production');

    const list = await app.inject({ method: 'GET', url: '/api/profiles?projectHash=abc' });
    expect(list.json().profiles[0].name).toBe('production');
  });

  it('POST /api/profiles/rename returns 404 when source missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/profiles/rename',
      payload: { projectHash: 'abc', oldName: 'nope', newName: 'x' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('POST /api/profiles rejects malformed layer entries with 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/profiles',
      payload: {
        projectHash: 'abc',
        name: 'dev',
        projectName: 'demo',
        layers: [{ sitecoreJsonPath: '/x', name: 'no-color' }],
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/invalid profile layer/);
  });

  it('GET /api/profiles/:projectHash/:name returns a single profile', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/profiles',
      payload: { projectHash: 'abc', name: 'dev', projectName: 'demo', layers: [{ sitecoreJsonPath: '/x', name: 'c', color: '#000' }] },
    });
    const res = await app.inject({ method: 'GET', url: '/api/profiles/abc/dev' });
    expect(res.statusCode).toBe(200);
    expect(res.json().profile.name).toBe('dev');
    expect(res.json().profile.layers).toHaveLength(1);
  });

  it('GET /api/profiles/:projectHash/:name returns 404 when missing', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/profiles/abc/missing' });
    expect(res.statusCode).toBe(404);
  });
});
