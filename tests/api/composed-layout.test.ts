import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerItemRoutes } from '../../src/api/routes/items.js';
import { registerSiteContextHook } from '../../src/api/hooks/site-context.js';
import { buildEngine, makeItem } from '../engine/layout/_helpers.js';
import type { Engine } from '../../src/engine/index.js';

const SITE_ROOT = '/sitecore/content/site';
const PAGE_ID = 'eeeeeeee-0000-0000-0000-0000000000ab';

async function buildApp(engine: Engine, siteRootPath: string): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  registerSiteContextHook(app, engine, siteRootPath);
  registerItemRoutes(app, engine);
  await app.ready();
  return app;
}

describe('GET /api/items/:id/composed-layout', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const page = makeItem({ id: PAGE_ID, path: `${SITE_ROOT}/home` });
    app = await buildApp(buildEngine([page]), SITE_ROOT);
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns composed root placeholders for an empty page', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/items/${PAGE_ID}/composed-layout` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.placeholders.map((p: { value: string }) => p.value)).toContain('headless-main');
    expect(body.entries).toEqual([]);
  });

  it('returns 404 for an unknown item', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/items/00000000-0000-0000-0000-000000000000/composed-layout',
    });
    expect(res.statusCode).toBe(404);
  });
});
