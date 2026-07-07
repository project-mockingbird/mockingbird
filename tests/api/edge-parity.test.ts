/**
 * GraphQL XM Cloud Edge parity tests - Phase B.
 * Verifies that Mockingbird's GraphQL response shape matches real
 * Sitecore Edge for fields added in Phase B.
 */
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

const HOME = '/sitecore/content/site/Home';

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

const pageTemplateId = 'bbbb1111-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const pageTemplate = makeItem({
  id: pageTemplateId,
  path: '/sitecore/templates/Project/site/Page',
  template: TEMPLATE_TEMPLATE_ID,
});
const pageSection = makeItem({
  id: 'bbbb2222-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  parent: pageTemplateId,
  path: '/sitecore/templates/Project/site/Page/Content',
  template: TEMPLATE_SECTION_TEMPLATE_ID,
});
const titleField = makeItem({
  id: 'bbbb3333-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  parent: 'bbbb2222-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  path: '/sitecore/templates/Project/site/Page/Content/Title',
  template: TEMPLATE_FIELD_TEMPLATE_ID,
  sharedFields: [{ id: FIELD_IDS.type, hint: 'Type', value: 'Single-Line Text' }],
});
const homePage = makeItem({
  id: 'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  path: HOME,
  template: pageTemplateId,
  languages: [
    {
      language: 'en',
      fields: [],
      versions: [
        { version: 1, fields: [{ id: 'bbbb3333-bbbb-bbbb-bbbb-bbbbbbbbbbbb', hint: 'Title', value: 'Home v1' }] },
        { version: 2, fields: [{ id: 'bbbb3333-bbbb-bbbb-bbbb-bbbbbbbbbbbb', hint: 'Title', value: 'Home v2' }] },
      ],
    },
    {
      language: 'de',
      fields: [],
      versions: [
        { version: 1, fields: [{ id: 'bbbb3333-bbbb-bbbb-bbbb-bbbbbbbbbbbb', hint: 'Title', value: 'Startseite' }] },
      ],
    },
  ],
});

async function createTestApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const engine = buildEngine([pageTemplate, pageSection, titleField, homePage]);
  const { registerSiteContextHook } = await import('../../src/api/hooks/site-context.js');
  registerSiteContextHook(app, engine, HOME);
  await registerGraphQLRoutes(app, engine, { mediaBaseUrl: '' });
  return app;
}

describe('GraphQL Edge parity - Phase B: ItemLanguage object + version', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await createTestApp(); });
  afterAll(async () => { await app.close(); });

  it('item.language is an ItemLanguage object with name and englishName', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/graphql',
      payload: {
        query: `query($p: String!) {
          item(path: $p, language: "en") {
            language { name englishName }
            version
          }
        }`,
        variables: { p: HOME },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.errors).toBeUndefined();
    const i = body.data.item;
    expect(i.language.name).toBe('en');
    expect(typeof i.language.englishName).toBe('string');
    expect(i.language.englishName.length).toBeGreaterThan(0);
    expect(typeof i.version).toBe('number');
  });

  it('version returns the highest version number in the requested language', async () => {
    // en has versions 1 and 2, so max = 2
    const resEn = await app.inject({
      method: 'POST',
      url: '/api/graphql',
      payload: {
        query: `query($p: String!) { item(path: $p, language: "en") { version } }`,
        variables: { p: HOME },
      },
    });
    expect(resEn.json().data.item.version).toBe(2);

    // de has only version 1
    const resDe = await app.inject({
      method: 'POST',
      url: '/api/graphql',
      payload: {
        query: `query($p: String!) { item(path: $p, language: "de") { version } }`,
        variables: { p: HOME },
      },
    });
    expect(resDe.json().data.item.version).toBe(1);
  });

  it('language.nativeName and language.displayName are present', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/graphql',
      payload: {
        query: `query($p: String!) {
          item(path: $p, language: "de") {
            language { name nativeName displayName }
          }
        }`,
        variables: { p: HOME },
      },
    });
    const body = res.json();
    expect(body.errors).toBeUndefined();
    const lang = body.data.item.language;
    expect(lang.name).toBe('de');
    expect(typeof lang.nativeName).toBe('string');
    expect(lang.nativeName.length).toBeGreaterThan(0);
    expect(typeof lang.displayName).toBe('string');
    expect(lang.displayName.length).toBeGreaterThan(0);
  });
});
