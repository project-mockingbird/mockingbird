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
  workspaceRoot = resolve(tmpdir(), `tree-prov-test-${Date.now()}`);
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
    `---\nID: "aaaaaaaa-aaaa-aaaa-aaaa-400000000001"\nParent: "11111111-1111-1111-1111-111111111111"\nTemplate: "bbbbbbbb-bbbb-bbbb-bbbb-000000000020"\nPath: /sitecore/content/p/one\nSharedFields: []\nLanguages: []\n`,
  );
  process.env.MOCKINGBIRD_WORKSPACE_ROOT = workspaceRoot;
});

afterAll(async () => {
  await rm(workspaceRoot, { recursive: true, force: true });
});

afterEach(async () => {
  if (app) { await app.close(); app = null; }
});

describe('Tree responses carry provenance', () => {
  it('includes provenance on serialized tree nodes', async () => {
    const created = await createServer({ registryPath: registryFixture });
    app = created.app;
    await created.engine.readiness.ready();
    await app.inject({
      method: 'POST',
      url: '/api/projects/open',
      payload: { layers: [{ sitecoreJsonPath: '/p/sitecore.json', name: 'primary' }] },
    });

    const res = await app.inject({ method: 'GET', url: '/api/tree' });
    expect(res.statusCode).toBe(200);
    const nodes: Array<{ id: string; provenance?: { winnerLayer: string }; children?: any[] }> = res.json();
    const walk = (xs: any[]): boolean => xs.some((n) => (n.provenance?.winnerLayer === 'primary') || (n.children && walk(n.children)));
    expect(walk(nodes)).toBe(true);
  });

  it('includes provenance: ootb on registry-only nodes', async () => {
    const created = await createServer({ registryPath: registryFixture });
    app = created.app;
    await created.engine.readiness.ready();
    await app.inject({
      method: 'POST',
      url: '/api/projects/open',
      payload: { layers: [{ sitecoreJsonPath: '/p/sitecore.json', name: 'primary' }] },
    });

    const res = await app.inject({ method: 'GET', url: '/api/tree' });
    const nodes: Array<{ id: string; provenance?: { winnerLayer: string }; children?: any[] }> = res.json();
    const walk = (xs: any[]): boolean => xs.some((n) => n.provenance?.winnerLayer === 'ootb' || (n.children && walk(n.children)));
    expect(walk(nodes)).toBe(true);
  });
});
