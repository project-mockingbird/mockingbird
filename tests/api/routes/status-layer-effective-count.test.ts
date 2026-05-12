import { describe, it, expect, afterEach, beforeAll, afterAll } from 'vitest';
import { createServer } from '../../../src/api/server.js';
import { mkdir, writeFile, rm } from 'fs/promises';
import { resolve, join } from 'path';
import { tmpdir } from 'os';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance | null = null;
let workspaceRoot: string;
const registryFixture = resolve(__dirname, '../../../data/registry.json.gz');

beforeAll(async () => {
  workspaceRoot = resolve(tmpdir(), `effcount-test-${Date.now()}`);
  const projectPath = join(workspaceRoot, 'p');
  await mkdir(join(projectPath, 'serialization', 'items'), { recursive: true });
  await writeFile(
    join(projectPath, 'sitecore.json'),
    JSON.stringify({ modules: ['*.module.json'], plugins: ['Sitecore.DevEx.Extensibility.Serialization@6.0.23'] }),
  );
  await writeFile(
    join(projectPath, 'm.module.json'),
    JSON.stringify({
      namespace: 'M',
      items: { path: 'serialization', includes: [{ name: 'items', path: '/sitecore/content/p', allowedPushOperations: 'CreateUpdateAndDelete' }] },
    }),
  );
  await writeFile(
    join(projectPath, 'serialization', 'items', 'one.yml'),
    `---\nID: "aaaaaaaa-aaaa-aaaa-aaaa-300000000001"\nParent: "00000000-0000-0000-0000-000000000000"\nTemplate: "bbbbbbbb-bbbb-bbbb-bbbb-000000000020"\nPath: /sitecore/content/p/one\nSharedFields: []\nLanguages: []\n`,
  );
  process.env.MOCKINGBIRD_WORKSPACE_ROOT = workspaceRoot;
});

afterAll(async () => {
  await rm(workspaceRoot, { recursive: true, force: true });
});

afterEach(async () => {
  if (app) { await app.close(); app = null; }
});

describe('GET /api/status with active layers', () => {
  it('reports effectiveCount per user layer plus the ootb substrate row', async () => {
    const created = await createServer({ registryPath: registryFixture });
    app = created.app;
    await created.engine.readiness.ready();
    await app.inject({
      method: 'POST',
      url: '/api/projects/open',
      payload: { layers: [{ sitecoreJsonPath: '/p/sitecore.json', name: 'primary' }] },
    });

    const res = await app.inject({ method: 'GET', url: '/api/status' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.layers).toBeDefined();
    const primary = body.layers.find((l: { name: string }) => l.name === 'primary');
    expect(primary).toBeDefined();
    expect(typeof primary.effectiveCount).toBe('number');
    expect(primary.effectiveCount).toBeGreaterThanOrEqual(1);
    const ootb = body.layers.find((l: { name: string }) => l.name === 'ootb');
    expect(ootb?.effectiveCount).toBeGreaterThan(0);
  });
});
