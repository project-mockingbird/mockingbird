import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from '../../src/api/server.js';
import type { FastifyInstance } from 'fastify';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const FIXTURES = resolve(__dirname, '../fixtures/valid');

describe('Schema API', () => {
  let app: FastifyInstance;
  beforeAll(async () => { const result = await createServer({ rootDir: FIXTURES }); app = result.app; await result.engine.readiness.ready(); });
  afterAll(async () => { await app.close(); });

  it('GET /api/schema/field-types returns valid field types', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/schema/field-types' });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toContain('Single-Line Text');
    expect(body).toContain('Rich Text');
  });

  it('GET /api/schema/standard-templates returns template info', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/schema/standard-templates' });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toHaveProperty('loaded');
    expect(body).toHaveProperty('templates');
  });
});
