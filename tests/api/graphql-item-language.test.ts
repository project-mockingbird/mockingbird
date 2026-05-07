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
  languages: [
    {
      language: 'en',
      fields: [],
      versions: [{ version: 1, fields: [{ id: 'titleId', hint: 'Title', value: 'English Home' }] }],
    },
    {
      language: 'de',
      fields: [],
      versions: [{ version: 1, fields: [{ id: 'titleId', hint: 'Title', value: 'Deutsch Heim' }] }],
    },
  ],
});

async function createTestApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const engine = buildEngine([pageTemplate, pageSection, titleField, homePage]);
  const { registerSiteContextHook } = await import('../../src/api/hooks/site-context.js');
  registerSiteContextHook(app, engine, '/sitecore/content/site/Home');
  await registerGraphQLRoutes(app, engine, { mediaBaseUrl: '' });
  return app;
}

describe('GraphQL item(path, language) honors the language argument', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await createTestApp(); });
  afterAll(async () => { await app.close(); });

  it('returns the requested language on Item.language', async () => {
    // language is declared on the AnyItem interface, so we can query it
    // without an inline fragment regardless of which concrete type the
    // schema generator picks for this template.
    const res = await app.inject({
      method: 'POST',
      url: '/sitecore/api/graph/edge',
      payload: {
        query: `query { item(path: "/sitecore/content/site/Home", language: "de") { language } }`,
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.errors).toBeUndefined();
    expect(body.data.item.language).toBe('de');
  });

  it('reads versioned field values for the requested language', async () => {
    const resDe = await app.inject({
      method: 'POST',
      url: '/sitecore/api/graph/edge',
      payload: {
        query: `query { item(path: "/sitecore/content/site/Home", language: "de") { field(name: "Title") { value } } }`,
      },
    });
    expect(resDe.statusCode).toBe(200);
    const bodyDe = resDe.json();
    expect(bodyDe.errors).toBeUndefined();
    expect(bodyDe.data.item.field.value).toBe('Deutsch Heim');

    const resEn = await app.inject({
      method: 'POST',
      url: '/sitecore/api/graph/edge',
      payload: {
        query: `query { item(path: "/sitecore/content/site/Home", language: "en") { field(name: "Title") { value } } }`,
      },
    });
    const bodyEn = resEn.json();
    expect(bodyEn.data.item.field.value).toBe('English Home');
  });
});
