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
  workspaceRoot = resolve(tmpdir(), `close-test-${Date.now()}`);
  projectPath = join(workspaceRoot, 'project-close');
  await mkdir(join(projectPath, 'serialization', 'items'), { recursive: true });
  await writeFile(
    join(projectPath, 'sitecore.json'),
    JSON.stringify({ modules: ['*.module.json'], plugins: ['Sitecore.DevEx.Extensibility.Serialization@6.0.23'] }),
  );
  await writeFile(
    join(projectPath, 'x.module.json'),
    JSON.stringify({
      namespace: 'X',
      items: { path: 'serialization', includes: [{ name: 'items', path: '/sitecore/content/x', allowedPushOperations: 'CreateUpdateAndDelete' }] },
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

describe('POST /api/projects/close', () => {
  it('transitions a ready engine to no-project', async () => {
    const created = await createServer({ registryPath: registryFixture });
    app = created.app;
    await created.engine.readiness.ready();

    await app.inject({
      method: 'POST',
      url: '/api/projects/open',
      payload: { layers: [{ sitecoreJsonPath: '/project-close/sitecore.json', name: 'x' }] },
    });
    expect(created.engine.readiness.state).toBe('ready');

    const res = await app.inject({ method: 'POST', url: '/api/projects/close', payload: {} });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.state).toBe('no-project');
    expect(body.layers).toEqual([]);
    expect(created.engine.readiness.state).toBe('no-project');
  });

  it('is idempotent when called on a no-project engine', async () => {
    const created = await createServer({ registryPath: registryFixture });
    app = created.app;
    // engine state may be 'initializing' or 'no-project' right after createServer; ensure it's no-project.
    await created.engine.closeWorkspace();
    expect(created.engine.readiness.state).toBe('no-project');

    const res = await app.inject({ method: 'POST', url: '/api/projects/close', payload: {} });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ state: 'no-project', layers: [] });
  });

  it('clears lastOpenedHash but preserves project records on close', async () => {
    process.env.MOCKINGBIRD_CONFIG_PATH = join(workspaceRoot, 'config-close-clear.mockingbird');
    const created = await createServer({ registryPath: registryFixture });
    app = created.app;
    await created.engine.readiness.ready();

    // Open first to populate the persisted state
    await app.inject({
      method: 'POST',
      url: '/api/projects/open',
      payload: { layers: [{ sitecoreJsonPath: '/project-close/sitecore.json', name: 'project-close' }] },
      headers: { 'content-type': 'application/json' },
    });

    const { readConfig } = await import('../../../src/api/state/config-store.js');
    const beforeClose = await readConfig(process.env.MOCKINGBIRD_CONFIG_PATH);
    expect(beforeClose.lastOpenedHash).toBeDefined();
    const hash = beforeClose.lastOpenedHash!;

    // Now close
    const closeRes = await app.inject({ method: 'POST', url: '/api/projects/close' });
    expect(closeRes.statusCode).toBe(200);

    const afterClose = await readConfig(process.env.MOCKINGBIRD_CONFIG_PATH);
    expect(afterClose.lastOpenedHash).toBeUndefined();
    // Project record still there
    expect(afterClose.projects[hash]).toBeDefined();

    delete process.env.MOCKINGBIRD_CONFIG_PATH;
  });
});
