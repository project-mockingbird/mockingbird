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

describe('item interface naming (Edge parity)', () => {
  it('item interface is "Item", fallback is "UnknownItem"', async () => {
    delete process.env.SCS_SITECORE_JSON;
    delete process.env.SCS_CONTENT_SITECORE_JSON;
    process.env.MOCKINGBIRD_WORKSPACE = workspaceTmp!;

    const created = await createServer({ registryPath: registryFixture });
    app = created.app;

    const res = await app.inject({
      method: 'POST',
      url: '/api/graphql',
      payload: { query: '{ i: __type(name:"Item"){kind} u: __type(name:"UnknownItem"){kind} }' },
    });
    const d = res.json().data;
    expect(d.i.kind).toBe('INTERFACE');
    expect(d.u.kind).toBe('OBJECT');
  });
});

describe('base schema scalars and enums (Edge parity A3)', () => {
  it('Long is SCALAR, OrderByDirection/RedirectType enums present, SearchOperator has 8 operators', async () => {
    delete process.env.SCS_SITECORE_JSON;
    delete process.env.SCS_CONTENT_SITECORE_JSON;
    process.env.MOCKINGBIRD_WORKSPACE = workspaceTmp!;

    const created = await createServer({ registryPath: registryFixture });
    app = created.app;

    const res = await app.inject({
      method: 'POST',
      url: '/api/graphql',
      payload: {
        query: `{
          long: __type(name:"Long") { kind }
          orderBy: __type(name:"OrderByDirection") { enumValues { name } }
          redirectType: __type(name:"RedirectType") { enumValues { name } }
          searchOp: __type(name:"SearchOperator") { enumValues { name } }
        }`,
      },
    });
    expect(res.statusCode).toBe(200);
    const d = res.json().data;

    expect(d.long.kind).toBe('SCALAR');

    const orderByNames = d.orderBy.enumValues.map((e: { name: string }) => e.name);
    expect(orderByNames).toEqual(['ASC', 'DESC']);

    const redirectTypeNames = d.redirectType.enumValues.map((e: { name: string }) => e.name);
    expect(redirectTypeNames).toContain('REDIRECT_301');
    expect(redirectTypeNames).toContain('REDIRECT_302');
    expect(redirectTypeNames).toContain('SERVER_TRANSFER');

    const searchOpNames = d.searchOp.enumValues.map((e: { name: string }) => e.name);
    expect(searchOpNames).toContain('EQ');
    expect(searchOpNames).toContain('CONTAINS');
    expect(searchOpNames).toContain('NEQ');
    expect(searchOpNames).toContain('NCONTAINS');
    expect(searchOpNames).toContain('LT');
    expect(searchOpNames).toContain('LTE');
    expect(searchOpNames).toContain('GT');
    expect(searchOpNames).toContain('GTE');
    expect(searchOpNames).toHaveLength(8);
  });
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
