import { describe, it, expect, afterEach, beforeAll, afterAll } from 'vitest';
import { createServer } from '../../../src/api/server.js';
import { mkdir, writeFile, rm } from 'fs/promises';
import { resolve, join } from 'path';
import { tmpdir } from 'os';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance | null = null;
let workspaceRoot: string;
let projectPath: string;
const registryFixture = resolve(__dirname, '../../../data/registry.json.gz');

beforeAll(async () => {
  workspaceRoot = resolve(tmpdir(), `open-test-${Date.now()}`);
  projectPath = join(workspaceRoot, 'project-x');
  await mkdir(join(projectPath, 'items', 'foo'), { recursive: true });
  await writeFile(
    join(projectPath, 'sitecore.json'),
    JSON.stringify({
      modules: ['*.module.json'],
      plugins: ['Sitecore.DevEx.Extensibility.Serialization@6.0.23'],
    }),
  );
  await writeFile(
    join(projectPath, 'x.module.json'),
    JSON.stringify({
      namespace: 'X',
      items: { path: 'items', includes: [{ name: 'foo', path: '/sitecore/content/x', allowedPushOperations: 'CreateUpdateAndDelete' }] },
    }),
  );

  process.env.MOCKINGBIRD_WORKSPACE_ROOT = workspaceRoot;
});

afterAll(async () => {
  await rm(workspaceRoot, { recursive: true, force: true });
});

afterEach(async () => {
  if (app) {
    await app.close();
    app = null;
  }
});

describe('POST /api/projects/open', () => {
  it('transitions engine from no-project to ready with the given layers', async () => {
    const created = await createServer({ registryPath: registryFixture });
    app = created.app;
    await created.engine.readiness.ready();
    expect(created.engine.readiness.state).toBe('no-project');

    const res = await app.inject({
      method: 'POST',
      url: '/api/projects/open',
      payload: {
        layers: [
          { sitecoreJsonPath: '/project-x/sitecore.json', name: 'project-x' },
        ],
      },
      headers: { 'content-type': 'application/json' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().state).toBe('ready');
    expect(created.engine.readiness.state).toBe('ready');
  });

  it('exposes the active layer set via GET /api/status after open', async () => {
    const created = await createServer({ registryPath: registryFixture });
    app = created.app;
    await created.engine.readiness.ready();

    await app.inject({
      method: 'POST',
      url: '/api/projects/open',
      payload: {
        layers: [
          { sitecoreJsonPath: '/project-x/sitecore.json', name: 'project-x', color: '#56c879' },
        ],
      },
      headers: { 'content-type': 'application/json' },
    });

    const statusRes = await app.inject({ method: 'GET', url: '/api/status' });
    const body = statusRes.json();
    expect(body.layers).toBeDefined();
    const userLayer = body.layers.find((l: { name: string }) => l.name === 'project-x');
    expect(userLayer).toBeDefined();
    expect(userLayer.color).toBe('#56c879');
  });

  it('returns 400 when layers is missing or empty', async () => {
    const created = await createServer({ registryPath: registryFixture });
    app = created.app;
    await created.engine.readiness.ready();

    const r1 = await app.inject({
      method: 'POST',
      url: '/api/projects/open',
      payload: {},
      headers: { 'content-type': 'application/json' },
    });
    expect(r1.statusCode).toBe(400);

    const r2 = await app.inject({
      method: 'POST',
      url: '/api/projects/open',
      payload: { layers: [] },
      headers: { 'content-type': 'application/json' },
    });
    expect(r2.statusCode).toBe(400);
  });

  it('open response includes effectiveCount on each layer and the ootb row', async () => {
    const created = await createServer({ registryPath: registryFixture });
    app = created.app;
    await created.engine.readiness.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/api/projects/open',
      payload: { layers: [{ sitecoreJsonPath: '/project-x/sitecore.json', name: 'project-x' }] },
      headers: { 'content-type': 'application/json' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const userLayer = body.layers.find((l: { name: string }) => l.name === 'project-x');
    expect(userLayer).toBeDefined();
    expect(typeof userLayer.effectiveCount).toBe('number');
    // Ootb row should also be present because registry is loaded.
    expect(body.layers.find((l: { name: string }) => l.name === 'ootb')).toBeDefined();
  });

  it('returns 400 when a layer path escapes the workspace root', async () => {
    const created = await createServer({ registryPath: registryFixture });
    app = created.app;
    await created.engine.readiness.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/api/projects/open',
      payload: {
        layers: [{ sitecoreJsonPath: '/../../etc/passwd', name: 'evil' }],
      },
      headers: { 'content-type': 'application/json' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('writes lastOpenedHash to config.mockingbird after a successful open', async () => {
    process.env.MOCKINGBIRD_CONFIG_PATH = join(workspaceRoot, 'config-hash-write.mockingbird');
    const created = await createServer({ registryPath: registryFixture });
    app = created.app;
    await created.engine.readiness.ready();

    await app.inject({
      method: 'POST',
      url: '/api/projects/open',
      payload: {
        layers: [{ sitecoreJsonPath: '/project-x/sitecore.json', name: 'project-x' }],
        projectName: 'Project X',
      },
      headers: { 'content-type': 'application/json' },
    });

    const { readConfig } = await import('../../../src/api/state/config-store.js');
    const config = await readConfig(process.env.MOCKINGBIRD_CONFIG_PATH);
    expect(config.lastOpenedHash).toBeDefined();
    expect(typeof config.lastOpenedHash).toBe('string');
    expect(config.lastOpenedHash!.length).toBe(12);

    // Also upserts the project record under that hash
    expect(config.projects[config.lastOpenedHash!]).toBeDefined();
    expect(config.projects[config.lastOpenedHash!].name).toBe('Project X');

    delete process.env.MOCKINGBIRD_CONFIG_PATH;
  });

  it('bumps lastOpenedAt on the project record on repeat open', async () => {
    process.env.MOCKINGBIRD_CONFIG_PATH = join(workspaceRoot, 'config-bump.mockingbird');
    const created = await createServer({ registryPath: registryFixture });
    app = created.app;
    await created.engine.readiness.ready();

    await app.inject({
      method: 'POST',
      url: '/api/projects/open',
      payload: { layers: [{ sitecoreJsonPath: '/project-x/sitecore.json', name: 'project-x' }] },
      headers: { 'content-type': 'application/json' },
    });

    const { readConfig } = await import('../../../src/api/state/config-store.js');
    const firstRead = await readConfig(process.env.MOCKINGBIRD_CONFIG_PATH);
    const hash = firstRead.lastOpenedHash!;
    const firstOpenedAt = firstRead.projects[hash].lastOpenedAt;

    await new Promise((r) => setTimeout(r, 10));

    await app.inject({
      method: 'POST',
      url: '/api/projects/open',
      payload: { layers: [{ sitecoreJsonPath: '/project-x/sitecore.json', name: 'project-x' }] },
      headers: { 'content-type': 'application/json' },
    });

    const secondRead = await readConfig(process.env.MOCKINGBIRD_CONFIG_PATH);
    expect(secondRead.projects[hash].lastOpenedAt).toBeGreaterThan(firstOpenedAt);

    delete process.env.MOCKINGBIRD_CONFIG_PATH;
  });
});
