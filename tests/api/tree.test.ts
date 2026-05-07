import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from '../../src/api/server.js';
import type { FastifyInstance } from 'fastify';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const FIXTURES = resolve(__dirname, '../fixtures/valid');

describe('GET /api/tree', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const result = await createServer({ rootDir: FIXTURES }); app = result.app; await result.engine.readiness.ready();
  });
  afterAll(async () => { await app.close(); });

  it('returns the full item tree', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/tree' });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
    expect(body[0]).toHaveProperty('id');
    expect(body[0]).toHaveProperty('source');
    expect(body[0]).toHaveProperty('hasChildren');
  });

  it('returns a subtree with ?root= parameter', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/tree?root=/sitecore/templates/Project/MyProject/MyTemplate',
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.name).toBe('MyTemplate');
    expect(body.children.length).toBeGreaterThan(0);
  });

  it('returns 404 for unknown root path', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/tree?root=/sitecore/nonexistent',
    });
    expect(response.statusCode).toBe(404);
  });
});

describe('GET /api/tree/children/:id - response shape', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const result = await createServer({ rootDir: FIXTURES });
    app = result.app;
    await result.engine.readiness.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('children carry displayName, createdAt, updatedAt fields when populated', async () => {
    // Pick any parent that has children; the fixture's tree should have at least one.
    const rootRes = await app.inject({ method: 'GET', url: '/api/tree?db=master' });
    const roots = rootRes.json();
    expect(Array.isArray(roots)).toBe(true);
    if (roots.length === 0) return;
    const root = roots.find((r: { hasChildren: boolean }) => r.hasChildren);
    if (!root) return;

    const res = await app.inject({ method: 'GET', url: `/api/tree/children/${root.id}?db=master` });
    expect(res.statusCode).toBe(200);
    const children = res.json();
    expect(Array.isArray(children)).toBe(true);
    if (children.length === 0) return;
    // Shape contract: displayName/createdAt/updatedAt are optional but typed.
    for (const c of children) {
      if (c.displayName !== undefined) expect(typeof c.displayName).toBe('string');
      if (c.createdAt !== undefined) expect(typeof c.createdAt).toBe('number');
      if (c.updatedAt !== undefined) expect(typeof c.updatedAt).toBe('number');
    }
  });
});
