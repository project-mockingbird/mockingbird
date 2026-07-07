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

describe('GraphQL Edge parity - Phase B2: ItemTemplate ownFields/fields + ItemTemplateField', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await createTestApp(); });
  afterAll(async () => { await app.close(); });

  it('item.template.fields returns the flattened fields with name/type/section', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/graphql',
      payload: {
        query: `query($p: String!) {
          item(path: $p, language: "en") {
            template {
              name
              fields {
                name
                type
                section
              }
            }
          }
        }`,
        variables: { p: HOME },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.errors).toBeUndefined();
    const tmpl = body.data.item.template;
    expect(tmpl.name).toBe('Page');
    expect(Array.isArray(tmpl.fields)).toBe(true);
    const titleF = tmpl.fields.find((f: { name: string }) => f.name === 'Title');
    expect(titleF).toBeDefined();
    expect(titleF.type).toBe('Single-Line Text');
    expect(titleF.section).toBe('Content');
  });

  it('item.template.ownFields returns direct-template fields with all ItemTemplateField scalars', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/graphql',
      payload: {
        query: `query($p: String!) {
          item(path: $p, language: "en") {
            template {
              ownFields {
                name
                title
                type
                source
                shared
                unversioned
                sortOrder
                section
                sectionSortOrder
              }
            }
          }
        }`,
        variables: { p: HOME },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.errors).toBeUndefined();
    const { ownFields } = body.data.item.template;
    expect(Array.isArray(ownFields)).toBe(true);
    const titleF = ownFields.find((f: { name: string }) => f.name === 'Title');
    expect(titleF).toBeDefined();
    expect(titleF.type).toBe('Single-Line Text');
    expect(titleF.section).toBe('Content');
    // "Title" field is versioned (not shared, not unversioned) - assert real values
    expect(titleF.shared).toBe(false);
    expect(titleF.unversioned).toBe(false);
    expect(typeof titleF.sortOrder).toBe('number');
    expect(typeof titleF.sectionSortOrder).toBe('number');
  });
});

// ---------------------------------------------------------------------------
// Regression: ownFields field-level sourceTemplateId filter
// ---------------------------------------------------------------------------
// Scenario: base template B declares section "Content" with field "Heading";
// derived template A inherits from B and also declares section "Content" with
// field "Body". getTemplateSchema merges both "Content" sections by name,
// giving the merged section sourceTemplateId = A (most-derived wins). The OLD
// section-level filter would then emit both Heading AND Body as ownFields of A.
// The field-level filter emits only Body.

const baseTemplateId2 = 'cccc0001-cccc-cccc-cccc-cccccccccccc';
const derivedTemplateId2 = 'dddd0001-dddd-dddd-dddd-dddddddddddd';

const baseTemplate2 = makeItem({
  id: baseTemplateId2,
  path: '/sitecore/templates/Project/site/Base',
  template: TEMPLATE_TEMPLATE_ID,
});
const baseSectionContent = makeItem({
  id: 'cccc0002-cccc-cccc-cccc-cccccccccccc',
  parent: baseTemplateId2,
  path: '/sitecore/templates/Project/site/Base/Content',
  template: TEMPLATE_SECTION_TEMPLATE_ID,
});
const headingField = makeItem({
  id: 'cccc0003-cccc-cccc-cccc-cccccccccccc',
  parent: 'cccc0002-cccc-cccc-cccc-cccccccccccc',
  path: '/sitecore/templates/Project/site/Base/Content/Heading',
  template: TEMPLATE_FIELD_TEMPLATE_ID,
  sharedFields: [{ id: FIELD_IDS.type, hint: 'Type', value: 'Single-Line Text' }],
});

// Derived template declares its own "Content" section (same name as Base's)
// and adds field "Body".
const derivedTemplate2 = makeItem({
  id: derivedTemplateId2,
  path: '/sitecore/templates/Project/site/Derived',
  template: TEMPLATE_TEMPLATE_ID,
  sharedFields: [
    { id: FIELD_IDS.baseTemplate, hint: '__Base template', value: `{${baseTemplateId2.toUpperCase()}}` },
  ],
});
const derivedSectionContent = makeItem({
  id: 'dddd0002-dddd-dddd-dddd-dddddddddddd',
  parent: derivedTemplateId2,
  path: '/sitecore/templates/Project/site/Derived/Content',
  template: TEMPLATE_SECTION_TEMPLATE_ID,
});
const bodyField = makeItem({
  id: 'dddd0003-dddd-dddd-dddd-dddddddddddd',
  parent: 'dddd0002-dddd-dddd-dddd-dddddddddddd',
  path: '/sitecore/templates/Project/site/Derived/Content/Body',
  template: TEMPLATE_FIELD_TEMPLATE_ID,
  sharedFields: [{ id: FIELD_IDS.type, hint: 'Type', value: 'Multi-Line Text' }],
});
const derivedContentItem = makeItem({
  id: 'eeee0001-eeee-eeee-eeee-eeeeeeeeeeee',
  path: HOME,
  template: derivedTemplateId2,
  languages: [],
});

// ---------------------------------------------------------------------------
// Phase B3: ItemUrl hostName/scheme, item.languages/rendered/ancestors(hasLayout)
// ---------------------------------------------------------------------------

describe('GraphQL Edge parity - Phase B3: ItemUrl hostName/scheme + item.languages/rendered/ancestors(hasLayout)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await createTestApp(); });
  afterAll(async () => { await app.close(); });

  it('url.hostName is a string and url.scheme defaults to https', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/graphql',
      payload: {
        query: `query($p: String!) {
          item(path: $p, language: "en") {
            url { path hostName scheme }
          }
        }`,
        variables: { p: HOME },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.errors).toBeUndefined();
    const { url } = body.data.item;
    expect(url.hostName).toBe('*');
    expect(url.scheme).toBe('https');
  });

  it('item.languages returns one entry per language the item has versions in', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/graphql',
      payload: {
        query: `query($p: String!) {
          item(path: $p, language: "en") {
            languages { language { name } }
          }
        }`,
        variables: { p: HOME },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.errors).toBeUndefined();
    const { languages } = body.data.item;
    expect(Array.isArray(languages)).toBe(true);
    const names = (languages as Array<{ language: { name: string } }>).map(l => l.language.name);
    expect(names).toContain('en');
    expect(names).toContain('de');
  });

  it('item.rendered returns an object', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/graphql',
      payload: {
        query: `query($p: String!) {
          item(path: $p, language: "en") { rendered }
        }`,
        variables: { p: HOME },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.errors).toBeUndefined();
    expect(typeof body.data.item.rendered).toBe('object');
    expect(body.data.item.rendered).not.toBeNull();
  });

  it('ancestors(hasLayout) accepts the hasLayout arg without error and returns an array', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/graphql',
      payload: {
        query: `query($p: String!) {
          item(path: $p, language: "en") {
            ancestors(hasLayout: true) { name }
          }
        }`,
        variables: { p: HOME },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.errors).toBeUndefined();
    expect(Array.isArray(body.data.item.ancestors)).toBe(true);
  });
});

describe('GraphQL Edge parity - Phase B2: ownFields field-level filter regression', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const server = Fastify({ logger: false });
    const engine = buildEngine([
      baseTemplate2, baseSectionContent, headingField,
      derivedTemplate2, derivedSectionContent, bodyField,
      derivedContentItem,
    ]);
    const { registerSiteContextHook } = await import('../../src/api/hooks/site-context.js');
    registerSiteContextHook(server, engine, HOME);
    await registerGraphQLRoutes(server, engine, { mediaBaseUrl: '' });
    app = server;
  });
  afterAll(async () => { await app.close(); });

  it('ownFields contains only the derived-template field, not the inherited field in the same-named section', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/graphql',
      payload: {
        query: `query($p: String!) {
          item(path: $p, language: "en") {
            template {
              ownFields { name type section }
              fields { name type section }
            }
          }
        }`,
        variables: { p: HOME },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.errors).toBeUndefined();
    const { ownFields, fields } = body.data.item.template;

    // ownFields: only "Body" (declared directly on derived template)
    const bodyOwn = (ownFields as Array<{ name: string }>).find(f => f.name === 'Body');
    expect(bodyOwn).toBeDefined();

    // ownFields: must NOT include "Heading" (declared on base template)
    const headingOwn = (ownFields as Array<{ name: string }>).find(f => f.name === 'Heading');
    expect(headingOwn).toBeUndefined();

    // fields: includes both "Body" and "Heading"
    const bodyAll = (fields as Array<{ name: string }>).find(f => f.name === 'Body');
    expect(bodyAll).toBeDefined();
    const headingAll = (fields as Array<{ name: string }>).find(f => f.name === 'Heading');
    expect(headingAll).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Phase C1: ItemField interface + resolveType + TextField fallback
// ---------------------------------------------------------------------------

describe('GraphQL Edge parity - Phase C1: ItemField interface + TextField', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await createTestApp(); });
  afterAll(async () => { await app.close(); });

  it('field(name) __typename is TextField and name matches the requested field name', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/graphql',
      payload: {
        query: `query($p: String!) {
          item(path: $p, language: "en") {
            field(name: "Title") { __typename name value jsonValue }
          }
        }`,
        variables: { p: HOME },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.errors).toBeUndefined();
    const f = body.data.item.field;
    expect(f.__typename).toBe('TextField');
    expect(f.name).toBe('Title');
    expect(f.value).toBe('Home v2');
    expect(f.jsonValue).toEqual({ value: 'Home v2' });
  });
});
