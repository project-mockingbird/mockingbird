import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { registerProjectsRoutes } from './projects.js';
import type { Engine } from '../../engine/index.js';
import { setActiveProfile, getActiveProfile } from '../session-state.js';
import { readRecents } from '../recents-store.js';
import { readLastSession } from '../last-session-store.js';

function makeEngineStub(): Engine {
  return {
    readiness: { state: 'ready' },
    openWorkspace: vi.fn(async () => undefined),
    closeWorkspace: vi.fn(async () => undefined),
    getLayers: () => [{ name: 'core', sitecoreJsonPath: '/abs/sitecore.json', color: '#3b82f6' }],
    getLayerStats: () => [{ name: 'core', effectiveCount: 0 }],
  } as unknown as Engine;
}

describe('projects routes - recents/last-session', () => {
  let app: FastifyInstance;
  let dir: string;
  let workspace: string;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'mb-proj-routes-'));
    workspace = mkdtempSync(join(tmpdir(), 'mb-ws-'));
    process.env.MOCKINGBIRD_STATE_ROOT = dir;
    process.env.MOCKINGBIRD_WORKSPACE_ROOT = workspace;
    setActiveProfile(null);
    app = Fastify();
    const engine = makeEngineStub();
    registerProjectsRoutes(app, engine);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    delete process.env.MOCKINGBIRD_STATE_ROOT;
    delete process.env.MOCKINGBIRD_WORKSPACE_ROOT;
    rmSync(dir, { recursive: true, force: true });
    rmSync(workspace, { recursive: true, force: true });
  });

  it('POST /api/projects/open with profileName writes recents + last-session + active', async () => {
    const { writeFileSync } = await import('fs');
    writeFileSync(join(workspace, 'sitecore.json'), '{}');

    const res = await app.inject({
      method: 'POST',
      url: '/api/projects/open',
      payload: {
        layers: [{ sitecoreJsonPath: '/sitecore.json', name: 'core', color: '#3b82f6' }],
        projectName: 'demo',
        profileName: 'dev',
      },
    });
    expect(res.statusCode).toBe(200);

    const recents = await readRecents();
    expect(recents).toHaveLength(1);
    expect(recents[0]).toMatchObject({ projectName: 'demo', profileName: 'dev' });

    const ls = await readLastSession();
    expect(ls?.profileName).toBe('dev');

    const active = getActiveProfile();
    expect(active?.profileName).toBe('dev');
  });

  it('POST /api/projects/open without profileName does NOT write recents', async () => {
    const { writeFileSync } = await import('fs');
    writeFileSync(join(workspace, 'sitecore.json'), '{}');

    await app.inject({
      method: 'POST',
      url: '/api/projects/open',
      payload: {
        layers: [{ sitecoreJsonPath: '/sitecore.json', name: 'core', color: '#3b82f6' }],
        projectName: 'demo',
      },
    });
    expect(await readRecents()).toEqual([]);
    expect(await readLastSession()).toBeNull();
    expect(getActiveProfile()).toBeNull();
  });

  it('POST /api/projects/close clears last-session and active', async () => {
    const { writeFileSync } = await import('fs');
    writeFileSync(join(workspace, 'sitecore.json'), '{}');

    await app.inject({
      method: 'POST',
      url: '/api/projects/open',
      payload: { layers: [{ sitecoreJsonPath: '/sitecore.json', name: 'core', color: '#3b82f6' }], profileName: 'dev', projectName: 'demo' },
    });
    expect(await readLastSession()).not.toBeNull();

    await app.inject({ method: 'POST', url: '/api/projects/close' });
    expect(await readLastSession()).toBeNull();
    expect(getActiveProfile()).toBeNull();
  });

  it('GET /api/projects/recent returns enriched entries', async () => {
    const { writeFileSync } = await import('fs');
    writeFileSync(join(workspace, 'sitecore.json'), '{}');

    // First, save a profile via the store directly.
    const { upsertProfile } = await import('../profile-store.js');
    const { computeProjectHash } = await import('../project-hash.js');
    const hash = computeProjectHash(['/sitecore.json']);
    await upsertProfile(hash, {
      name: 'dev',
      projectName: 'demo',
      layers: [{ sitecoreJsonPath: '/sitecore.json', name: 'core', color: '#3b82f6' }],
      createdAt: 'T0',
      updatedAt: 'T0',
    });

    await app.inject({
      method: 'POST',
      url: '/api/projects/open',
      payload: {
        layers: [{ sitecoreJsonPath: '/sitecore.json', name: 'core', color: '#3b82f6' }],
        projectName: 'demo',
        profileName: 'dev',
      },
    });

    const list = await app.inject({ method: 'GET', url: '/api/projects/recent' });
    expect(list.statusCode).toBe(200);
    const entries = list.json().entries;
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      projectName: 'demo',
      profileName: 'dev',
      layerColors: ['#3b82f6'],
      layerCount: 1,
    });
  });

  it('GET /api/projects/recent marks missing profiles', async () => {
    const { upsertRecent } = await import('../recents-store.js');
    await upsertRecent({ projectHash: 'doesnotexist', projectName: 'p', profileName: 'gone', lastOpenedAt: 'T1' });

    const list = await app.inject({ method: 'GET', url: '/api/projects/recent' });
    const entries = list.json().entries;
    expect(entries[0].missing).toBe(true);
    expect(entries[0].layerColors).toEqual([]);
  });

  it('DELETE /api/projects/recent removes a row', async () => {
    const { upsertRecent } = await import('../recents-store.js');
    await upsertRecent({ projectHash: 'a', projectName: 'p', profileName: 'dev', lastOpenedAt: 'T1' });

    const del = await app.inject({
      method: 'DELETE',
      url: '/api/projects/recent',
      payload: { projectHash: 'a', profileName: 'dev' },
    });
    expect(del.statusCode).toBe(200);
    expect(await readRecents()).toEqual([]);
  });

  it('GET /api/projects/last-session reflects writes', async () => {
    const { writeLastSession } = await import('../last-session-store.js');
    await writeLastSession({ projectHash: 'a', profileName: 'dev' });
    const res = await app.inject({ method: 'GET', url: '/api/projects/last-session' });
    expect(res.json()).toEqual({ projectHash: 'a', profileName: 'dev' });
  });

  it('DELETE /api/projects/last-session clears', async () => {
    const { writeLastSession } = await import('../last-session-store.js');
    await writeLastSession({ projectHash: 'a', profileName: 'dev' });
    await app.inject({ method: 'DELETE', url: '/api/projects/last-session' });
    expect(await readLastSession()).toBeNull();
  });
});
