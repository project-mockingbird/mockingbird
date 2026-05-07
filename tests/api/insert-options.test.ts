import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerItemRoutes } from '../../src/api/routes/items.js';
import { Engine } from '../../src/engine/index.js';
import { buildEngine, makeItem } from '../engine/layout/_helpers.js';
import { FIELD_IDS, TEMPLATE_TEMPLATE_ID } from '../../src/engine/constants.js';

describe('GET /api/items/:id/insert-options', () => {
  let app: FastifyInstance;
  let engine: Engine;

  beforeAll(async () => {
    // Minimal fixture:
    //   /sitecore/content/Home (item) -> template `pagetpl`
    //   pagetpl with __Standard Values containing __Masters = {ARTICLETPL}
    //   articletpl (the menu entry)
    const articleTpl = makeItem({
      id: 'articletpl', template: TEMPLATE_TEMPLATE_ID,
      path: '/sitecore/templates/Article',
    });
    const sv = makeItem({
      id: 'svid', template: 'pagetpl', parent: 'pagetpl',
      path: '/sitecore/templates/Page/__Standard Values',
      sharedFields: [{ id: FIELD_IDS.masters, hint: '__Masters', value: '{ARTICLETPL}' }],
    });
    const pageTpl = makeItem({
      id: 'pagetpl', template: TEMPLATE_TEMPLATE_ID,
      path: '/sitecore/templates/Page',
      sharedFields: [{ id: FIELD_IDS.standardValues, hint: '__Standard values', value: '{SVID}' }],
    });
    const home = makeItem({
      id: 'home1', template: 'pagetpl', parent: 'parent',
      path: '/sitecore/content/Home',
    });

    engine = buildEngine([articleTpl, pageTpl, sv, home]);
    app = Fastify();
    registerItemRoutes(app, engine);
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns options for an item with __Masters on its template SV', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/items/home1/insert-options',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { options: Array<{ templateId: string; templateName: string; kind: string }> };
    expect(body.options).toHaveLength(1);
    expect(body.options[0]).toMatchObject({
      templateId: 'articletpl',
      templateName: 'Article',
      kind: 'template',
    });
  });

  it('returns 404 for an unknown id', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/items/00000000-0000-0000-0000-000000000999/insert-options',
    });
    expect(res.statusCode).toBe(404);
  });
});
