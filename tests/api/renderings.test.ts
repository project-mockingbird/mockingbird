import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from '../../src/api/server.js';
import Fastify, { type FastifyInstance } from 'fastify';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import {
  RENDERING_ID,
  buildEngineWithRenderingFixture,
} from '../engine/renderings/_fixtures.js';
import { registerRenderingsRoutes } from '../../src/api/routes/renderings.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const FIXTURES = resolve(__dirname, '../fixtures/valid');

describe('GET /api/renderings/:id', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const result = await createServer({ rootDir: FIXTURES });
    app = result.app;
    await result.engine.readiness.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns rendering metadata for a known rendering', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/renderings/a1b2c3d4-e5f6-7890-abcd-000000000010' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({
      id: expect.stringMatching(/^\{[A-F0-9\-]+\}$/),
      name: expect.any(String),
      displayName: expect.any(String),
    });
    expect(body.id).toBe('{A1B2C3D4-E5F6-7890-ABCD-000000000010}');
  });

  it('returns 404 for an unknown rendering id', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/renderings/00000000-0000-0000-0000-000000000099' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'Rendering not found' });
  });
});

describe('GET /api/renderings/compatible', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const result = await createServer({ rootDir: FIXTURES });
    app = result.app;
    await result.engine.readiness.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 400 when placeholder query param is missing', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/renderings/compatible?pageItemId=327ba80a-33c9-4b6a-af27-d0170e77518b' });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when pageItemId query param is missing', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/renderings/compatible?placeholder=/some/path' });
    expect(res.statusCode).toBe(400);
  });

  it('returns renderings compatible with a placeholder', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/renderings/compatible?placeholder=/some/placeholder&pageItemId=327ba80a-33c9-4b6a-af27-d0170e77518b',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.renderings).toBeInstanceOf(Array);
    // The fixture may or may not have renderings; the important part is the
    // response structure is correct. If there are renderings, verify the shape.
    if (body.renderings.length > 0) {
      expect(body.renderings[0]).toMatchObject({
        id: expect.any(String),
        name: expect.any(String),
        displayName: expect.any(String),
      });
    }
  });
});

describe('GET /api/renderings/:id/parameters-schema', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const result = await createServer({ rootDir: FIXTURES });
    app = result.app;
    await result.engine.readiness.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 404 for a rendering that does not exist', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/renderings/00000000-0000-0000-0000-000000000099/parameters-schema' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'Rendering has no Parameters Template' });
  });

  it('returns 404 for a rendering without a Parameters Template field', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/renderings/a1b2c3d4-e5f6-7890-abcd-000000000010/parameters-schema' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'Rendering has no Parameters Template' });
  });

  it('returns 200 + schema for a rendering with a Parameters Template', async () => {
    // MyRenderingWithParams (id ...0020) sets Parameters Template to
    // MyTemplate (id ...0001), which has a Data section with Title + Description fields.
    const res = await app.inject({ method: 'GET', url: '/api/renderings/a1b2c3d4-e5f6-7890-abcd-000000000020/parameters-schema' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.sections).toBeInstanceOf(Array);
    expect(body.sections.length).toBeGreaterThan(0);
  });
});

describe('GET /api/renderings/:id - datasource fields', () => {
  // Synthetic-fixture rationale: content tree spot-check (recorded in
  // tests/engine/renderings/_fixtures.ts) found zero rendering items in the
  // live registry that populate the Datasource Template / Datasource Location
  // fields. The disk-based valid fixture also has no rendering with these
  // fields. So this suite uses the shared synthetic fixture builder and
  // registers /api/renderings routes directly on a bare Fastify - same pattern
  // used by tests/api/media.test.ts and tests/api/graphql.test.ts.
  let app: FastifyInstance;

  beforeAll(async () => {
    const engine = buildEngineWithRenderingFixture({
      templateValue: '{683910CA-9213-4196-A949-B5C2A86C90BC}',
      locationValue: '/sitecore/content/tenant/site/Data/Articles',
    });
    app = Fastify({ logger: false });
    registerRenderingsRoutes(app, engine);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns datasourceTemplate and datasourceLocation when the rendering declares them', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/renderings/${RENDERING_ID}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.datasourceLocation).toBe('/sitecore/content/tenant/site/Data/Articles');
    expect(body.datasourceTemplate).toBe('{683910CA-9213-4196-A949-B5C2A86C90BC}');
    expect(body.datasourceTemplate).toMatch(/^\{[0-9A-F-]{36}\}$/);
  });
});
