import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from '../../src/api/server.js';
import type { FastifyInstance } from 'fastify';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const FIXTURES = resolve(__dirname, '../fixtures/valid');

describe('GET /api/templates', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const result = await createServer({ rootDir: FIXTURES });
    app = result.app;
    await result.engine.readiness.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 200 with { templates: [...] }', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/templates' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty('templates');
    expect(body.templates).toBeInstanceOf(Array);
  });

  it('returns templates with the expected meta shape', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/templates' });
    const body = res.json();
    if (body.templates.length > 0) {
      expect(body.templates[0]).toMatchObject({
        id: expect.stringMatching(/^\{[A-F0-9-]+\}$/),
        name: expect.any(String),
        displayName: expect.any(String),
        path: expect.stringMatching(/^\/sitecore\/templates\//i),
        template: expect.any(String),
      });
    }
  });

  it('only returns items under /sitecore/templates/', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/templates' });
    const body = res.json();
    for (const t of body.templates) {
      expect(t.path.toLowerCase().startsWith('/sitecore/templates/')).toBe(true);
    }
  });
});
