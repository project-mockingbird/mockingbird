import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { createServer } from '../../src/api/server.js';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { mkdtempSync, cpSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { FastifyInstance } from 'fastify';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const FIXTURES = resolve(__dirname, '../fixtures/valid');
const registryFixture = resolve(__dirname, '../../data/registry.json.gz');

let app: FastifyInstance | null = null;
let originalEnv: NodeJS.ProcessEnv;
let workspaceTmp: string | null = null;

beforeEach(() => {
  originalEnv = { ...process.env };
  workspaceTmp = mkdtempSync(join(tmpdir(), 'mb-schema-ext-'));
  cpSync(FIXTURES, workspaceTmp, { recursive: true });
});

afterEach(async () => {
  process.env = originalEnv;
  if (app) {
    await app.close();
    app = null;
  }
  if (workspaceTmp) {
    rmSync(workspaceTmp, { recursive: true, force: true });
    workspaceTmp = null;
  }
});

describe('GraphQL schema extension across openWorkspace', () => {
  it('extends the schema after a project opens via /api/projects/open', async () => {
    delete process.env.SCS_SITECORE_JSON;
    delete process.env.SCS_CONTENT_SITECORE_JSON;
    process.env.MOCKINGBIRD_WORKSPACE = workspaceTmp!;

    const created = await createServer({ registryPath: registryFixture });
    app = created.app;
    const engine = created.engine;

    await engine.readiness.ready();
    expect(engine.readiness.state).toBe('no-project');

    const openRes = await app.inject({
      method: 'POST',
      url: '/api/projects/open',
      payload: {
        layers: [{ sitecoreJsonPath: '/sitecore.json', name: 'authoring' }],
      },
    });
    expect(openRes.statusCode).toBe(200);

    const schemaRes = await app.inject({
      method: 'POST',
      url: '/api/graphql',
      payload: { query: '{ __schema { types { name } } }' },
    });
    expect(schemaRes.statusCode).toBe(200);
    const typeNames: string[] = schemaRes
      .json()
      .data.__schema.types.map((t: { name: string }) => t.name);

    expect(typeNames).toContain('MyTemplate');
  });
});
