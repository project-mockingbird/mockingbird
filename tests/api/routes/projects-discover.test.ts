import { describe, it, expect, afterEach, beforeAll, afterAll } from 'vitest';
import { createServer } from '../../../src/api/server.js';
import { mkdir, writeFile, rm } from 'fs/promises';
import { resolve, join } from 'path';
import { tmpdir } from 'os';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance | null = null;
let workspaceRoot: string;

beforeAll(async () => {
  workspaceRoot = resolve(tmpdir(), `discover-test-${Date.now()}`);
  await mkdir(join(workspaceRoot, 'project-a', 'items'), { recursive: true });
  await writeFile(
    join(workspaceRoot, 'project-a', 'sitecore.json'),
    JSON.stringify({
      modules: ['*.module.json'],
      plugins: ['Sitecore.DevEx.Extensibility.Serialization@6.0.23'],
    }),
  );
  await writeFile(
    join(workspaceRoot, 'project-a', 'a.module.json'),
    JSON.stringify({
      namespace: 'A',
      items: {
        path: 'items',
        includes: [
          { name: 'templates', path: '/sitecore/templates/A', allowedPushOperations: 'CreateUpdateAndDelete' },
        ],
      },
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

describe('POST /api/projects/discover-layers', () => {
  it('returns sitecore.json candidates under the given path', async () => {
    const created = await createServer({});
    app = created.app;
    await created.engine.readiness.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/api/projects/discover-layers',
      payload: { path: '/project-a' },
      headers: { 'content-type': 'application/json' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.candidates).toBeDefined();
    expect(body.candidates.length).toBe(1);
    expect(body.candidates[0].sitecoreJsonPath).toContain('project-a');
    expect(body.candidates[0].moduleCount).toBe(1);
    expect(body.candidates[0].pushOpsSummary).toContain('CreateUpdateAndDelete');
  });

  it('returns 400 if path is missing', async () => {
    const created = await createServer({});
    app = created.app;
    await created.engine.readiness.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/api/projects/discover-layers',
      payload: {},
      headers: { 'content-type': 'application/json' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 if path escapes the workspace root', async () => {
    const created = await createServer({});
    app = created.app;
    await created.engine.readiness.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/api/projects/discover-layers',
      payload: { path: '/../../etc' },
      headers: { 'content-type': 'application/json' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns empty candidates array for a directory with no SCS configs', async () => {
    const emptyDir = resolve(workspaceRoot, 'empty-project');
    await mkdir(emptyDir, { recursive: true });
    const created = await createServer({});
    app = created.app;
    await created.engine.readiness.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/api/projects/discover-layers',
      payload: { path: '/empty-project' },
      headers: { 'content-type': 'application/json' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().candidates).toEqual([]);
  });
});
