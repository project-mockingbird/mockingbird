import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import { createServer } from '../../../src/api/server.js';
import { mkdir, writeFile, rm } from 'fs/promises';
import { resolve, join } from 'path';
import { tmpdir } from 'os';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance | null = null;
let workspaceRoot: string;

beforeAll(async () => {
  workspaceRoot = resolve(tmpdir(), `mockingbird-fs-test-${Date.now()}`);
  await mkdir(workspaceRoot, { recursive: true });
  await mkdir(join(workspaceRoot, 'project-a'), { recursive: true });
  await mkdir(join(workspaceRoot, 'project-b'), { recursive: true });
  await mkdir(join(workspaceRoot, 'project-b', 'nested'), { recursive: true });
  await mkdir(join(workspaceRoot, '.git'), { recursive: true });           // noise dir, should be excluded
  await mkdir(join(workspaceRoot, '.sitecore'), { recursive: true });       // legitimate dot-prefixed, should appear
  await writeFile(join(workspaceRoot, 'project-a', 'sitecore.json'), '{"modules":["x/**"]}');
  // project-b has no sitecore.json; nested subfolder does
  await writeFile(join(workspaceRoot, 'project-b', 'nested', 'sitecore.json'), '{"modules":["y/**"]}');
  await writeFile(join(workspaceRoot, 'README.md'), '# top-level file - should not appear in listing');
  process.env.MOCKINGBIRD_WORKSPACE_ROOT = workspaceRoot;
});

afterEach(async () => {
  if (app) {
    await app.close();
    app = null;
  }
});

describe('GET /api/fs/list', () => {
  it('lists immediate subdirectories of the workspace root', async () => {
    const created = await createServer({});
    app = created.app;
    await created.engine.readiness.ready();

    const res = await app.inject({ method: 'GET', url: '/api/fs/list?path=/' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.entries).toBeDefined();
    const names = body.entries.map((e: { name: string }) => e.name).sort();
    expect(names).toContain('project-a');
    expect(names).toContain('project-b');
  });

  it('flags entries that contain a sitecore.json', async () => {
    const created = await createServer({});
    app = created.app;
    await created.engine.readiness.ready();

    const res = await app.inject({ method: 'GET', url: '/api/fs/list?path=/' });
    const body = res.json();
    const projectA = body.entries.find((e: { name: string }) => e.name === 'project-a');
    expect(projectA.hasSitecoreJson).toBe(true);
    const projectB = body.entries.find((e: { name: string }) => e.name === 'project-b');
    expect(projectB.hasSitecoreJson).toBe(false);
  });

  it('lists nested subdirectories', async () => {
    const created = await createServer({});
    app = created.app;
    await created.engine.readiness.ready();

    const res = await app.inject({ method: 'GET', url: '/api/fs/list?path=/project-b' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const names = body.entries.map((e: { name: string }) => e.name);
    expect(names).toContain('nested');
    const nested = body.entries.find((e: { name: string }) => e.name === 'nested');
    expect(nested.hasSitecoreJson).toBe(true);
  });

  it('rejects paths that escape the workspace root via ..', async () => {
    const created = await createServer({});
    app = created.app;
    await created.engine.readiness.ready();

    const res = await app.inject({ method: 'GET', url: '/api/fs/list?path=/../../etc' });
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 for nonexistent paths inside the workspace root', async () => {
    const created = await createServer({});
    app = created.app;
    await created.engine.readiness.ready();

    const res = await app.inject({ method: 'GET', url: '/api/fs/list?path=/does-not-exist' });
    expect(res.statusCode).toBe(404);
  });

  it('returns absolute path inside the workspace root as part of each entry', async () => {
    const created = await createServer({});
    app = created.app;
    await created.engine.readiness.ready();

    const res = await app.inject({ method: 'GET', url: '/api/fs/list?path=/' });
    const body = res.json();
    expect(body.path).toBe('/');
    expect(body.entries[0]).toHaveProperty('path');
    // path inside body is workspace-relative (starts with /), not host-absolute
    expect(body.entries[0].path.startsWith('/')).toBe(true);
  });

  it('excludes common noise directories (.git, node_modules, etc) but includes other dot-prefixed dirs', async () => {
    const created = await createServer({});
    app = created.app;
    await created.engine.readiness.ready();

    const res = await app.inject({ method: 'GET', url: '/api/fs/list?path=/' });
    const body = res.json();
    const names = body.entries.map((e: { name: string }) => e.name);
    expect(names).not.toContain('.git');
    expect(names).toContain('.sitecore');
  });

  it('does not list files at the workspace root, only directories', async () => {
    const created = await createServer({});
    app = created.app;
    await created.engine.readiness.ready();

    const res = await app.inject({ method: 'GET', url: '/api/fs/list?path=/' });
    const body = res.json();
    const names = body.entries.map((e: { name: string }) => e.name);
    expect(names).not.toContain('README.md');
  });
});
