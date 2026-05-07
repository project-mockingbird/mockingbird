import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { Engine } from '../../src/engine/index.js';
import { ItemTree } from '../../src/engine/tree.js';
import type { ScsItem } from '../../src/engine/types.js';
import {
  TEMPLATE_TEMPLATE_ID,
  TEMPLATE_SECTION_TEMPLATE_ID,
  TEMPLATE_FIELD_TEMPLATE_ID,
  FIELD_IDS,
} from '../../src/engine/constants.js';
import { registerGraphQLRoutes } from '../../src/api/routes/graphql.js';

function makeItem(overrides: Partial<ScsItem> & { id: string; path: string }): ScsItem {
  return {
    parent: '00000000-0000-0000-0000-000000000000',
    template: TEMPLATE_TEMPLATE_ID,
    sharedFields: [],
    languages: [],
    ...overrides,
  };
}

function buildEngine(items: ScsItem[]): Engine {
  const engine = Object.create(Engine.prototype) as Engine;
  const tree = new ItemTree();
  for (const item of items) tree.addItem(item, `/fake/${item.id}.yml`);
  (engine as any).tree = tree;
  (engine as any).registry = null;
  (engine as any).options = { rootDir: '/fake' };
  return engine;
}

const pageTemplateId = 'eeee1111-eeee-eeee-eeee-eeeeeeeeeeee';
const pageTemplate = makeItem({
  id: pageTemplateId,
  path: '/sitecore/templates/Project/site/Content Page',
  template: TEMPLATE_TEMPLATE_ID,
});
const pageSection = makeItem({
  id: 'eeee2222-eeee-eeee-eeee-eeeeeeeeeeee',
  parent: pageTemplateId,
  path: '/sitecore/templates/Project/site/Content Page/Content',
  template: TEMPLATE_SECTION_TEMPLATE_ID,
});
const titleField = makeItem({
  id: 'eeee3333-eeee-eeee-eeee-eeeeeeeeeeee',
  parent: 'eeee2222-eeee-eeee-eeee-eeeeeeeeeeee',
  path: '/sitecore/templates/Project/site/Content Page/Content/Title',
  template: TEMPLATE_FIELD_TEMPLATE_ID,
  sharedFields: [{ id: FIELD_IDS.type, hint: 'Type', value: 'Single-Line Text' }],
});
const homePage = makeItem({
  id: 'home1111-home-home-home-homehomehome',
  path: '/sitecore/content/site/Home',
  template: pageTemplateId,
});

async function createTestApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const engine = buildEngine([pageTemplate, pageSection, titleField, homePage]);
  const { registerSiteContextHook } = await import('../../src/api/hooks/site-context.js');
  registerSiteContextHook(app, engine, '/sitecore/content/site/Home');
  await registerGraphQLRoutes(app, engine, { mediaBaseUrl: '' });
  return app;
}

describe('GraphQL queryDepth guard', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await createTestApp(); });
  afterAll(async () => { await app.close(); });

  it('rejects an excessively deeply-nested children query', async () => {
    // The schema exposes children as `AnyItem.children: AnyItemChildrenConnection`
    // with `results: [AnyItem!]`, so each "real" level of recursion adds 2
    // selection-set depth steps. 20 nested children/results pairs comfortably
    // exceed the queryDepth=15 default.
    let inner = 'id';
    for (let i = 0; i < 20; i++) {
      inner = `children { results { ${inner} } }`;
    }
    const query = `query Deep { item(path: "/sitecore/content/site/Home", language: "en") { ... on Item { ${inner} } } }`;

    const response = await app.inject({
      method: 'POST',
      url: '/api/graphql',
      payload: { query },
    });
    const body = response.json();
    expect(body.errors).toBeDefined();
    expect(body.errors.length).toBeGreaterThan(0);
    expect(JSON.stringify(body.errors).toLowerCase()).toMatch(/depth/);
  });

  it('accepts a shallow children query', async () => {
    const query = `query Shallow { item(path: "/sitecore/content/site/Home", language: "en") { ... on Item { id } } }`;
    const response = await app.inject({
      method: 'POST',
      url: '/api/graphql',
      payload: { query },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.errors).toBeUndefined();
  });
});
