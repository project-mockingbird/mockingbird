import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { Engine } from '../../src/engine/index.js';
import { ItemTree } from '../../src/engine/tree.js';
import type { ScsItem } from '../../src/engine/types.js';
import {
  RENDERING_TEMPLATE_ID,
  TEMPLATE_TEMPLATE_ID,
  TEMPLATE_SECTION_TEMPLATE_ID,
  TEMPLATE_FIELD_TEMPLATE_ID,
  FIELD_IDS,
  REDIRECT_MAP_TEMPLATE_ID,
  REDIRECT_FIELD_IDS,
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
  for (const item of items) {
    tree.addItem(item, `/fake/${item.id}.yml`);
  }
  (engine as any).tree = tree;
  (engine as any).registry = null;
  (engine as any).options = { rootDir: '/fake' };
  return engine;
}

const DEFAULT_DEVICE = 'fe5d7fdf-89c0-4d99-9aa3-b5fbd009c9f3';
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
const contentFieldDef = makeItem({
  id: 'eeee4444-eeee-eeee-eeee-eeeeeeeeeeee',
  parent: 'eeee2222-eeee-eeee-eeee-eeeeeeeeeeee',
  path: '/sitecore/templates/Project/site/Content Page/Content/Content',
  template: TEMPLATE_FIELD_TEMPLATE_ID,
  sharedFields: [{ id: FIELD_IDS.type, hint: 'Type', value: 'Rich Text' }],
});

const heroBannerRendering = makeItem({
  id: 'rend1111-rend-rend-rend-rendrendrend',
  path: '/sitecore/layout/Renderings/Project/site/HeroBanner',
  template: RENDERING_TEMPLATE_ID,
  sharedFields: [
    { id: 'a77e8568-1ab3-44f1-a664-b7c37ec7810d', hint: 'Parameters Template', value: 'ffffffff-ffff-ffff-ffff-ffffffffffff' },
  ],
});

const homePage = makeItem({
  id: 'home1111-home-home-home-homehomehome',
  path: '/sitecore/content/site/Home',
  template: pageTemplateId,
  languages: [{
    language: 'en',
    fields: [],
    versions: [{
      version: 1,
      fields: [
        {
          id: '04bf00db-f5fb-41f7-8ab7-22408372a981',
          hint: '__Final Renderings',
          value: `<r xmlns:s="s" xmlns:p="p" p:p="1"><d id="{${DEFAULT_DEVICE}}"><r uid="{AAA}" s:id="{REND1111-REND-REND-REND-RENDRENDREND}" s:ph="headless-main" s:ds="" s:par="GridParameters=col-12" /></d></r>`,
        },
        { id: 'eeee3333-eeee-eeee-eeee-eeeeeeeeeeee', hint: 'Title', value: 'Welcome Home' },
        { id: 'eeee4444-eeee-eeee-eeee-eeeeeeeeeeee', hint: 'Content', value: '<p>Hello</p>' },
      ],
    }],
  }],
});

const allFixtures = [
  homePage, pageTemplate, pageSection, titleField, contentFieldDef, heroBannerRendering,
];

const SITE_ROOT_PATH = '/sitecore/content/site/Home';

const LAYOUT_QUERY = `
  query LayoutQuery($site: String!, $routePath: String!, $language: String!) {
    layout(site: $site, routePath: $routePath, language: $language) {
      item {
        rendered
      }
    }
  }
`;

async function createTestApp(items: ScsItem[]): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const engine = buildEngine(items);
  const { registerSiteContextHook } = await import('../../src/api/hooks/site-context.js');
  registerSiteContextHook(app, engine, SITE_ROOT_PATH);
  await registerGraphQLRoutes(app, engine, {
    mediaBaseUrl: '',
  });
  return app;
}

describe('GraphQL Layout API', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await createTestApp(allFixtures); });
  afterAll(async () => { await app.close(); });

  it('returns full envelope with context and route', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/graphql',
      payload: {
        query: LAYOUT_QUERY,
        variables: { site: 'site', routePath: '/', language: 'en' },
      },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.layout.item.rendered.sitecore.context).toBeDefined();
    expect(body.data.layout.item.rendered.sitecore.route).toBeDefined();
  });

  it('populates context fields from query variables', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/graphql',
      payload: {
        query: LAYOUT_QUERY,
        variables: { site: 'site', routePath: '/', language: 'en' },
      },
    });
    const ctx = response.json().data.layout.item.rendered.sitecore.context;
    expect(ctx.pageEditing).toBe(false);
    expect(ctx.site.name).toBe('site');
    expect(ctx.pageState).toBe('normal');
    expect(ctx.editMode).toBe('chromes');
    expect(ctx.language).toBe('en');
    expect(ctx.itemPath).toBe('/');
  });

  it('returns route data matching resolveLayout output', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/graphql',
      payload: {
        query: LAYOUT_QUERY,
        variables: { site: 'site', routePath: '/', language: 'en' },
      },
    });
    const route = response.json().data.layout.item.rendered.sitecore.route;
    expect(route.name).toBe('Home');
    expect(route.fields.Title).toEqual({ value: 'Welcome Home' });
    expect(route.fields.Content).toEqual({ value: '<p>Hello</p>' });
    expect(route.templateName).toBe('Content Page');
    expect(route.itemId).toBe('home1111-home-home-home-homehomehome');
  });

  it('returns item:null for missing page (null-route policy, 0.3.0)', async () => {
    // Prod Edge wire contract: `layout(routePath=...)` returns `{item: null}`
    // when the route doesn't map to an item with renderings. Previously
    // Mockingbird wrapped the null route in a full envelope; 0.3.0's
    // scaffold-vs-null policy matches Edge's emission instead.
    const response = await app.inject({
      method: 'POST',
      url: '/api/graphql',
      payload: {
        query: LAYOUT_QUERY,
        variables: { site: 'site', routePath: '/nonexistent', language: 'en' },
      },
    });
    const layout = response.json().data.layout;
    expect(layout.item).toBeNull();
  });

  it('resolves components in placeholders', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/graphql',
      payload: {
        query: LAYOUT_QUERY,
        variables: { site: 'site', routePath: '/', language: 'en' },
      },
    });
    const route = response.json().data.layout.item.rendered.sitecore.route;
    expect(route.placeholders['headless-main']).toHaveLength(1);
    expect(route.placeholders['headless-main'][0].componentName).toBe('HeroBanner');
    expect(route.placeholders['headless-main'][0].params).toEqual({ GridParameters: 'col-12', FieldNames: 'Default' });
  });
});

// Content SDK 2.x site queries - schema-only stubs for errorHandling +
// dictionary, real resolver for redirects.

/**
 * Build a minimal Sitecore template definition (template item + data
 * section + one field child per entry in `fields`). Used by tests that
 * need the schema generator to emit a specific type with specific fields.
 */
let templateFixtureNextId = 0x10000;
function nextFixtureGuid(prefix: string): string {
  const n = (templateFixtureNextId++).toString(16).padStart(8, '0');
  return `${prefix}${n}-0000-0000-0000-000000000000`.slice(0, 36);
}

function buildTemplateFixtureWithId(
  name: string,
  fieldNames: string[],
  opts: { id?: string; baseTemplateIds?: string[] } = {},
): { id: string; items: ScsItem[] } {
  const templateId = opts.id ?? nextFixtureGuid('t');
  const items: ScsItem[] = [];
  const sharedFields: Array<{ id: string; hint: string; value: string }> = [];
  if (opts.baseTemplateIds && opts.baseTemplateIds.length > 0) {
    sharedFields.push({
      id: FIELD_IDS.baseTemplate,
      hint: '__Base template',
      value: opts.baseTemplateIds.map(id => `{${id.toUpperCase()}}`).join('|'),
    });
  }
  items.push(makeItem({
    id: templateId,
    path: `/sitecore/templates/Project/site/${name}`,
    template: TEMPLATE_TEMPLATE_ID,
    sharedFields,
  }));
  const sectionId = nextFixtureGuid('s');
  items.push(makeItem({
    id: sectionId,
    parent: templateId,
    path: `/sitecore/templates/Project/site/${name}/Data`,
    template: TEMPLATE_SECTION_TEMPLATE_ID,
  }));
  for (const fieldName of fieldNames) {
    items.push(makeItem({
      id: nextFixtureGuid('f'),
      parent: sectionId,
      path: `/sitecore/templates/Project/site/${name}/Data/${fieldName}`,
      template: TEMPLATE_FIELD_TEMPLATE_ID,
      sharedFields: [
        { id: FIELD_IDS.type, hint: 'Type', value: 'Single-Line Text' },
      ],
    }));
  }
  return { id: templateId, items };
}

const demoRootTmpl = buildTemplateFixtureWithId('Demo Root', [
  'Demo Node Text', 'Demo Node Link', 'Demo Icon', 'Demo Flag One', 'Demo Flag Two',
]);
const demoBlockTmpl = buildTemplateFixtureWithId('Demo Block', []);
const demoLinkListTmpl = buildTemplateFixtureWithId('Demo Link List', [
  'Demo Node Text', 'Demo Node Link', 'Demo Node Subtitle Text', 'Demo Node Description',
  'Demo Icon', 'Demo Flag One', 'Demo Flag Two', 'Demo Node Tags',
]);
const demoLinkTmpl = buildTemplateFixtureWithId('Demo Link', [
  'Demo Node Text', 'Demo Node Link', 'Demo Node Description', 'Demo Flag One',
  'Demo Flag Two', 'Demo Node Tags',
]);
const demoLinkTagTmpl = buildTemplateFixtureWithId('Demo Link Tag', [
  'Demo Link Tag Text', 'Demo Link Tag CSS Class',
]);
const demoFeatureTmpl = buildTemplateFixtureWithId('Demo Feature', [
  'Demo Feature Title', 'Demo Feature Text', 'Demo Feature Link',
]);
const demoStaticItemTmpl = buildTemplateFixtureWithId('Demo Static Item', [
  'Demo Static Text', 'Demo Static Url',
]);
const demoStaticRootTmpl = buildTemplateFixtureWithId('Demo Static Root', []);
const baseAlphaTmpl = buildTemplateFixtureWithId('_Base Alpha', [
  'Field Label', 'Field Name',
]);
const baseBetaTmpl = buildTemplateFixtureWithId('_Base Beta', [
  'Demo Placeholder Text',
]);
const baseGammaTmpl = buildTemplateFixtureWithId('_Base Gamma', [
  'Demo Required Flag', 'Demo Error Message',
]);
// A concrete type that implements all three base interfaces at once.
// Concrete Four inherits _Base Alpha, _Base Beta, AND _Base Gamma - the
// DemoGroup query spreads inline fragments on all three and needs at
// least one concrete type to make the spread valid.
const concreteFourTmpl = buildTemplateFixtureWithId('Concrete Four', ['Concrete Four Text'], {
  baseTemplateIds: [
    baseAlphaTmpl.id,
    baseBetaTmpl.id,
    baseGammaTmpl.id,
  ],
});
const demoGroupSectionTmpl = buildTemplateFixtureWithId('Demo Group Section', []);
const demoGroupTmpl = buildTemplateFixtureWithId('Demo Group', [
  'Group Name', 'Group Success Message', 'Group Failure Message',
]);

const NAV_TEMPLATE_FIXTURES: ScsItem[] = [
  ...demoRootTmpl.items,
  ...demoBlockTmpl.items,
  ...demoLinkListTmpl.items,
  ...demoLinkTmpl.items,
  ...demoLinkTagTmpl.items,
  ...demoFeatureTmpl.items,
  ...demoStaticItemTmpl.items,
  ...demoStaticRootTmpl.items,
  ...baseAlphaTmpl.items,
  ...baseBetaTmpl.items,
  ...baseGammaTmpl.items,
  ...concreteFourTmpl.items,
  ...demoGroupSectionTmpl.items,
  ...demoGroupTmpl.items,
];

const SITE_TREE_FIXTURES: ScsItem[] = [
  makeItem({ id: 'site-root-0000-0000-0000-000000000000', path: '/sitecore/content/site' }),
  makeItem({
    id: 'home1111-home-home-home-homehomehome',
    parent: 'site-root-0000-0000-0000-000000000000',
    path: SITE_ROOT_PATH,
    template: pageTemplateId,
    languages: [{
      language: 'en',
      fields: [],
      versions: [{
        version: 1,
        fields: [
          { id: '04bf00db-f5fb-41f7-8ab7-22408372a981', hint: '__Final Renderings', value: '' },
          { id: 'eeee3333-eeee-eeee-eeee-eeeeeeeeeeee', hint: 'Title', value: 'Welcome Home' },
        ],
      }],
    }],
  }),
  makeItem({
    id: 'settings-0000-0000-0000-000000000000',
    parent: 'site-root-0000-0000-0000-000000000000',
    path: '/sitecore/content/site/Settings',
  }),
  makeItem({
    id: 'rdrs-0000-0000-0000-000000000000',
    parent: 'settings-0000-0000-0000-000000000000',
    path: '/sitecore/content/site/Settings/Redirects',
  }),
  makeItem({
    id: 'rdm1-0000-0000-0000-000000000000',
    parent: 'rdrs-0000-0000-0000-000000000000',
    path: '/sitecore/content/site/Settings/Redirects/Vanity',
    template: REDIRECT_MAP_TEMPLATE_ID,
    sharedFields: [
      { id: REDIRECT_FIELD_IDS.urlMapping, hint: 'UrlMapping', value: '%2fold-a=%2Fnew-a&%2fold-b=%2Fnew-b' },
      { id: REDIRECT_FIELD_IDS.redirectType, hint: 'RedirectType', value: 'Redirect301' },
    ],
  }),
  // Include the page/template/rendering fixtures so the app instance built for
  // these tests also has the Home item registered with a full template chain.
  pageTemplate, pageSection, titleField, contentFieldDef, heroBannerRendering,
  // Project templates (Demo Root, Demo Block, ...) - needed so the
  // dynamic schema generator emits corresponding GraphQL types that the
  // DemoNavigation / DemoStaticNav / DemoGroup queries reference via
  // inline fragments.
  ...NAV_TEMPLATE_FIXTURES,
];

describe('GraphQL site queries (Content SDK)', () => {
  let siteApp: FastifyInstance;
  beforeAll(async () => { siteApp = await createTestApp(SITE_TREE_FIXTURES); });
  afterAll(async () => { await siteApp.close(); });

  it('RedirectsQuery returns entries parsed from UrlMapping', async () => {
    const response = await siteApp.inject({
      method: 'POST',
      url: '/api/graphql',
      payload: {
        query: `query($s:String!){site{siteInfo(site:$s){redirects{pattern target redirectType isQueryStringPreserved isLanguagePreserved locale}}}}`,
        variables: { s: 'site' },
      },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.errors).toBeUndefined();
    const redirects = body.data.site.siteInfo.redirects;
    expect(redirects).toHaveLength(2);
    expect(redirects[0]).toEqual({
      pattern: '/old-a',
      target: '/new-a',
      redirectType: 'REDIRECT_301',
      isQueryStringPreserved: false,
      isLanguagePreserved: false,
      locale: '',
    });
  });

  it('RedirectsQuery falls through to ctx.site for an unknown site', async () => {
    // Unknown site arg falls through to ctx.site (matches Sitecore's unknown-sc_site behavior).
    // The synthesized ctx.site for SITE_ROOT_PATH='/sitecore/content/site/Home' has name='site'
    // and the same redirects as an explicit siteInfo(site:'site') query.
    const response = await siteApp.inject({
      method: 'POST',
      url: '/api/graphql',
      payload: {
        query: `query($s:String!){site{siteInfo(site:$s){redirects{pattern}}}}`,
        variables: { s: 'othersite' },
      },
    });
    const redirects = response.json().data.site.siteInfo.redirects;
    expect(redirects).toHaveLength(2);
    expect(redirects[0].pattern).toBe('/old-a');
  });

  it('ErrorPagesQuery returns the Edge-matching null/empty stub shape', async () => {
    const response = await siteApp.inject({
      method: 'POST',
      url: '/api/graphql',
      payload: {
        query: `query($s:String!,$l:String!){site{siteInfo(site:$s){errorHandling(language:$l){notFoundPage{rendered} notFoundPagePath serverErrorPage{rendered} serverErrorPagePath}}}}`,
        variables: { s: 'site', l: 'en' },
      },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.errors).toBeUndefined();
    expect(body.data.site.siteInfo.errorHandling).toEqual({
      notFoundPage: null,
      notFoundPagePath: '',
      serverErrorPage: null,
      serverErrorPagePath: '',
    });
  });

  it('Query.item returns id + template { id, name } for a known path', async () => {
    const response = await siteApp.inject({
      method: 'POST',
      url: '/api/graphql',
      payload: {
        query: `query($p:String!,$l:String!){item(path:$p,language:$l){id template{id name}}}`,
        variables: { p: SITE_ROOT_PATH, l: 'en' },
      },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.errors).toBeUndefined();
    expect(body.data.item.id).toBe('home1111-home-home-home-homehomehome');
    expect(body.data.item.template.id).toBe(pageTemplateId);
    expect(body.data.item.template.name).toBe('Content Page');
  });

  it('Query.item returns null for an unknown path', async () => {
    const response = await siteApp.inject({
      method: 'POST',
      url: '/api/graphql',
      payload: {
        query: `query($p:String!,$l:String!){item(path:$p,language:$l){id}}`,
        variables: { p: '/sitecore/content/nonexistent', l: 'en' },
      },
    });
    expect(response.json().data.item).toBeNull();
  });

  it('Query.item.field(name) returns {value, jsonValue} for a named field', async () => {
    const response = await siteApp.inject({
      method: 'POST',
      url: '/api/graphql',
      payload: {
        query: `query($p:String!,$l:String!){item(path:$p,language:$l){field(name:"Title"){value}}}`,
        variables: { p: SITE_ROOT_PATH, l: 'en' },
      },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.errors).toBeUndefined();
    expect(body.data.item.field.value).toBe('Welcome Home');
  });

  it('Query.item.id emits canonical lowercase-dashed GUIDs (AnyItem path)', async () => {
    // AnyItem/multilist/route-level id projections use canonical
    // lowercase-dashed (`88da64de-28b6-4620-b108-5d8c61564f6f`). The bare
    // 32-hex-uppercase form is reserved for the ComponentQuery executor's
    // result rows (see Feature `data.datasource.links.results[*].id` -
    // covered by the contents-resolvers spec).
    const response = await siteApp.inject({
      method: 'POST',
      url: '/api/graphql',
      payload: {
        query: `query($p:String!,$l:String!){item(path:$p,language:$l){id}}`,
        variables: { p: SITE_ROOT_PATH, l: 'en' },
      },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.errors).toBeUndefined();
    expect(body.data.item.id).toBe('home1111-home-home-home-homehomehome');
  });

  it('SearchItem.id emits canonical lowercase-dashed GUIDs', async () => {
    const response = await siteApp.inject({
      method: 'POST',
      url: '/api/graphql',
      payload: {
        query: `{
          search(where: { AND: [
            { name: "_templates", value: "${pageTemplateId}", operator: EQ }
          ] }) {
            results { id }
          }
        }`,
      },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.errors).toBeUndefined();
    expect(body.data.search.results.map((r: { id: string }) => r.id)).toEqual([
      'home1111-home-home-home-homehomehome',
    ]);
  });

  it('Query.item.url exposes url + path (site-relative) + siteName', async () => {
    // Prod Edge's ItemUrl carries { url, path, siteName } - ComponentQuery
    // text in OOTB renderings selects these fields (Title/LinkList).
    // Mockingbird's schema previously declared only `url`, causing every
    // ComponentQuery to fail MER_ERR_GQL_VALIDATION.
    const response = await siteApp.inject({
      method: 'POST',
      url: '/api/graphql',
      payload: {
        query: `query($p:String!,$l:String!){item(path:$p,language:$l){url{url path siteName}}}`,
        variables: { p: SITE_ROOT_PATH, l: 'en' },
      },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.errors).toBeUndefined();
    // `url` preserves the raw Sitecore path (existing behavior);
    // `path` is site-relative (Home → '/'); `siteName` comes from options.
    expect(body.data.item.url).toEqual({
      url: SITE_ROOT_PATH,
      path: '/',
      siteName: 'site',
    });
  });

  it('SearchItem.url exposes url + path (site-relative) + siteName', async () => {
    const response = await siteApp.inject({
      method: 'POST',
      url: '/api/graphql',
      payload: {
        query: `{
          search(where: { AND: [
            { name: "_templates", value: "${pageTemplateId}", operator: EQ }
          ] }) {
            results { id url { url path siteName } }
          }
        }`,
      },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.errors).toBeUndefined();
    expect(body.data.search.results).toHaveLength(1);
    expect(body.data.search.results[0].url).toEqual({
      url: SITE_ROOT_PATH,
      path: '/',
      siteName: 'site',
    });
  });

  it('Query.item.children filters by includeTemplateIDs', async () => {
    const parent: ScsItem = makeItem({ id: 'p0', path: '/sitecore/content/tree' });
    const childA: ScsItem = makeItem({ id: 'cA', parent: 'p0', path: '/sitecore/content/tree/A', template: 'tmpl-a' });
    const childB: ScsItem = makeItem({ id: 'cB', parent: 'p0', path: '/sitecore/content/tree/B', template: 'tmpl-b' });
    const app = await createTestApp([parent, childA, childB]);
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/graphql',
        payload: {
          query: `{item(path:"/sitecore/content/tree",language:"en"){children(includeTemplateIDs:["tmpl-a"]){results{id}}}}`,
        },
      });
      const body = response.json();
      expect(body.errors).toBeUndefined();
      const ids = body.data.item.children.results.map((r: { id: string }) => r.id);
      expect(ids).toEqual(['cA']);
    } finally {
      await app.close();
    }
  });

  describe('Query.item accepts GUID-shaped path arguments', () => {
    const guidItemId = '01b8917b-d36b-4fb1-91ad-017dfe055e55';
    const guidItem: ScsItem = makeItem({
      id: guidItemId,
      path: '/sitecore/content/tenant/site/Home',
    });

    async function runItemQuery(pathArg: string) {
      const app = await createTestApp([guidItem]);
      try {
        const response = await app.inject({
          method: 'POST',
          url: '/api/graphql',
          payload: {
            query: `query($p:String!,$l:String!){item(path:$p,language:$l){id}}`,
            variables: { p: pathArg, l: 'en' },
          },
        });
        return response.json();
      } finally {
        await app.close();
      }
    }

    it('resolves by content path (regression)', async () => {
      const body = await runItemQuery('/sitecore/content/tenant/site/Home');
      expect(body.errors).toBeUndefined();
      expect(body.data.item.id).toBe(guidItemId);
    });

    it('resolves by brace-wrapped uppercase dashed GUID', async () => {
      const body = await runItemQuery('{01B8917B-D36B-4FB1-91AD-017DFE055E55}');
      expect(body.errors).toBeUndefined();
      expect(body.data.item.id).toBe(guidItemId);
    });

    it('resolves by lowercase dashed GUID', async () => {
      const body = await runItemQuery('01b8917b-d36b-4fb1-91ad-017dfe055e55');
      expect(body.errors).toBeUndefined();
      expect(body.data.item.id).toBe(guidItemId);
    });

    it('resolves by uppercase dashed GUID without braces', async () => {
      const body = await runItemQuery('01B8917B-D36B-4FB1-91AD-017DFE055E55');
      expect(body.errors).toBeUndefined();
      expect(body.data.item.id).toBe(guidItemId);
    });

    it('resolves by 32-hex lowercase GUID without dashes', async () => {
      const body = await runItemQuery('01b8917bd36b4fb191ad017dfe055e55');
      expect(body.errors).toBeUndefined();
      expect(body.data.item.id).toBe(guidItemId);
    });

    it('returns null for a nonexistent content path (regression)', async () => {
      const body = await runItemQuery('/nonexistent/path');
      expect(body.errors).toBeUndefined();
      expect(body.data.item).toBeNull();
    });

    it('returns null for a valid-shaped GUID not in the tree (regression)', async () => {
      const body = await runItemQuery('{00000000-0000-0000-0000-000000000000}');
      expect(body.errors).toBeUndefined();
      expect(body.data.item).toBeNull();
    });
  });

  describe('0.1.9 schema gaps', () => {
    it('children accepts first: Int and caps the result count', async () => {
      const parent: ScsItem = makeItem({ id: 'p-first', path: '/sitecore/content/first-parent' });
      const children: ScsItem[] = Array.from({ length: 5 }, (_, i) =>
        makeItem({
          id: `c${i}aaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa`,
          parent: 'p-first',
          path: `/sitecore/content/first-parent/C${i}`,
          template: 'tmpl-first',
        }),
      );
      const app = await createTestApp([parent, ...children]);
      try {
        const response = await app.inject({
          method: 'POST',
          url: '/api/graphql',
          payload: {
            query: `{item(path:"/sitecore/content/first-parent",language:"en"){children(first:2){results{id}}}}`,
          },
        });
        const body = response.json();
        expect(body.errors).toBeUndefined();
        expect(body.data.item.children.results).toHaveLength(2);
      } finally {
        await app.close();
      }
    });

    it('children accepts both first: Int and includeTemplateIDs together', async () => {
      const parent: ScsItem = makeItem({ id: 'p-both', path: '/sitecore/content/both-parent' });
      const kids: ScsItem[] = Array.from({ length: 4 }, (_, i) =>
        makeItem({
          id: `b${i}aaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa`,
          parent: 'p-both',
          path: `/sitecore/content/both-parent/B${i}`,
          template: i < 3 ? 'tmpl-keep' : 'tmpl-skip',
        }),
      );
      const app = await createTestApp([parent, ...kids]);
      try {
        const response = await app.inject({
          method: 'POST',
          url: '/api/graphql',
          payload: {
            query: `{item(path:"/sitecore/content/both-parent",language:"en"){children(includeTemplateIDs:["tmpl-keep"], first:2){results{id}}}}`,
          },
        });
        const body = response.json();
        expect(body.errors).toBeUndefined();
        expect(body.data.item.children.results).toHaveLength(2);
      } finally {
        await app.close();
      }
    });

    it('ItemField exposes targetItem (singular) that returns the first resolved target', async () => {
      const targetId = 'aaaaaaaa-1111-2222-3333-444444444444';
      const target: ScsItem = makeItem({
        id: targetId,
        path: '/sitecore/content/droplink-target',
      });
      const holder: ScsItem = makeItem({
        id: 'bbbbbbbb-1111-2222-3333-444444444444',
        path: '/sitecore/content/droplink-holder',
        sharedFields: [
          { id: 'ffffffff-0000-0000-0000-000000000001', hint: 'ContactFieldName', value: `{${targetId.toUpperCase()}}` },
        ],
      });
      const app = await createTestApp([target, holder]);
      try {
        const response = await app.inject({
          method: 'POST',
          url: '/api/graphql',
          payload: {
            query: `{item(path:"/sitecore/content/droplink-holder",language:"en"){field(name:"ContactFieldName"){targetItem{id} targetItems{id}}}}`,
          },
        });
        const body = response.json();
        expect(body.errors).toBeUndefined();
        expect(body.data.item.field.targetItem).toEqual({ id: targetId });
        expect(body.data.item.field.targetItems).toEqual([{ id: targetId }]);
      } finally {
        await app.close();
      }
    });

    it('ItemField.targetItem returns null when the field has no GUIDs', async () => {
      const holder: ScsItem = makeItem({
        id: 'cccccccc-1111-2222-3333-444444444444',
        path: '/sitecore/content/plain-holder',
        sharedFields: [
          { id: 'ffffffff-0000-0000-0000-000000000002', hint: 'Title', value: 'just text' },
        ],
      });
      const app = await createTestApp([holder]);
      try {
        const response = await app.inject({
          method: 'POST',
          url: '/api/graphql',
          payload: {
            query: `{item(path:"/sitecore/content/plain-holder",language:"en"){field(name:"Title"){value targetItem{id}}}}`,
          },
        });
        const body = response.json();
        expect(body.errors).toBeUndefined();
        expect(body.data.item.field.value).toBe('just text');
        expect(body.data.item.field.targetItem).toBeNull();
      } finally {
        await app.close();
      }
    });

    it('ItemTemplate.baseTemplates returns the parent templates declared via __Base template', async () => {
      // Build a template-item hierarchy: `ChildTmpl` inherits from `BaseTmpl`
      // via the __Base template shared field (id 12c33f3f-…-5598cec45116).
      const baseTmplId = 'dddddddd-1111-2222-3333-444444444444';
      const childTmplId = 'eeeeeeee-1111-2222-3333-444444444444';
      const baseTmpl = makeItem({
        id: baseTmplId,
        path: '/sitecore/templates/BaseTmpl',
        template: TEMPLATE_TEMPLATE_ID,
      });
      const childTmpl = makeItem({
        id: childTmplId,
        path: '/sitecore/templates/ChildTmpl',
        template: TEMPLATE_TEMPLATE_ID,
        sharedFields: [
          { id: '12c33f3f-86c5-43a5-aeb4-5598cec45116', hint: '__Base template', value: `{${baseTmplId.toUpperCase()}}` },
        ],
      });
      const contentItem = makeItem({
        id: 'ffffffff-1111-2222-3333-444444444444',
        path: '/sitecore/content/base-templates-subject',
        template: childTmplId,
      });
      const app = await createTestApp([baseTmpl, childTmpl, contentItem]);
      try {
        const response = await app.inject({
          method: 'POST',
          url: '/api/graphql',
          payload: {
            query: `{item(path:"/sitecore/content/base-templates-subject",language:"en"){template{id name baseTemplates{id name}}}}`,
          },
        });
        const body = response.json();
        expect(body.errors).toBeUndefined();
        expect(body.data.item.template.name).toBe('ChildTmpl');
        expect(body.data.item.template.baseTemplates).toEqual([
          { id: baseTmplId, name: 'BaseTmpl' },
        ]);
      } finally {
        await app.close();
      }
    });
  });

  it('parses an inline fragment on a declared permissive type (DemoRoot) without errors', async () => {
    // The Home item's template ("Content Page") is NOT in the permissive
    // allowlist, so its runtime type resolves to the generic `Item`. The
    // fragment `... on DemoRoot` is valid syntax because the type is
    // declared as an `AnyItem` implementer, and gets skipped at execution
    // because the runtime type doesn't match. What matters here is that
    // the query parses cleanly - no "Unknown type" or "Abstract type was
    // resolved to a type that does not exist" error.
    const response = await siteApp.inject({
      method: 'POST',
      url: '/api/graphql',
      payload: {
        query: `query($p:String!,$l:String!){
          item(path:$p,language:$l){
            id
            ... on DemoRoot { demoNodeText { value } }
          }
        }`,
        variables: { p: SITE_ROOT_PATH, l: 'en' },
      },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.errors).toBeUndefined();
    expect(body.data.item.id).toBe('home1111-home-home-home-homehomehome');
  });

  it('Query.search matches ContentTokensPage query (template + language, no-braces format)', async () => {
    const tokenTmpl = '7d659ee9-d487-4d40-8a92-10c6d68844c8';
    const tokenItems: ScsItem[] = [];
    for (let i = 0; i < 3; i++) {
      tokenItems.push(makeItem({
        id: `${i.toString(16).padStart(8, '0')}-tok0-tok0-tok0-tok000000000`.replace(/tok/g, 'aaa'),
        path: `/sitecore/content/site/Settings/Content Tokens/Token${i}`,
        template: tokenTmpl,
        sharedFields: [
          { id: 'kkk1', hint: 'Key', value: `key-${i}` },
          { id: 'kkk2', hint: 'Value', value: `value-${i}` },
        ],
        languages: [{ language: 'en', fields: [], versions: [{ version: 1, fields: [] }] }],
      }));
    }
    const app = await createTestApp(tokenItems);
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/graphql',
        payload: {
          query: `query($language:String!,$pageSize:Int!,$after:String){
            search(
              where: { AND: [
                { name: "_templates", value: "7D659EE9D4874D408A9210C6D68844C8", operator: CONTAINS }
                { name: "_language", value: $language }
              ] }
              first: $pageSize
              after: $after
            ) {
              pageInfo { hasNext endCursor }
              results {
                id
                key: field(name: "Key") { value }
                tooltipValue: field(name: "Value") { value }
              }
            }
          }`,
          variables: { language: 'en', pageSize: 5, after: null },
        },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.errors).toBeUndefined();
      expect(body.data.search.results).toHaveLength(3);
      expect(body.data.search.pageInfo.hasNext).toBe(false);
      const first = body.data.search.results[0];
      // Canonical: lowercase hex with hyphens (no braces).
      expect(first.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(first.key.value).toBe('key-0');
      expect(first.tooltipValue.value).toBe('value-0');
    } finally {
      await app.close();
    }
  });

  it('Query.search matches EventSearch query (_path with brace-wrapped GUID)', async () => {
    const ancestorId = 'dc2ce08c-6c71-48d9-8d16-c73fe6739dca';
    const fixtures: ScsItem[] = [
      makeItem({
        id: ancestorId,
        path: '/sitecore/content/site/Events',
      }),
      makeItem({
        id: 'aaaa0001-0000-0000-0000-000000000000',
        parent: ancestorId,
        path: '/sitecore/content/site/Events/Spring',
      }),
      makeItem({
        id: 'aaaa0002-0000-0000-0000-000000000000',
        parent: ancestorId,
        path: '/sitecore/content/site/Events/Summer',
      }),
      makeItem({
        id: 'bbbb0001-0000-0000-0000-000000000000',
        path: '/sitecore/content/site/Home/About',
      }),
    ];
    const app = await createTestApp(fixtures);
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/graphql',
        payload: {
          query: `{
            search(where: { AND: [
              { name: "_path", value: "{DC2CE08C-6C71-48D9-8D16-C73FE6739DCA}", operator: CONTAINS }
            ] }) {
              pageInfo { hasNext }
              results { id url { url } }
            }
          }`,
        },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.errors).toBeUndefined();
      expect(body.data.search.results).toHaveLength(2);
      const urls = body.data.search.results.map((r: { url: { url: string } }) => r.url.url).sort();
      expect(urls).toEqual([
        '/sitecore/content/site/Events/Spring',
        '/sitecore/content/site/Events/Summer',
      ]);
    } finally {
      await app.close();
    }
  });

  it('parses the consuming DemoNavigation query without errors (nested inline fragments)', async () => {
    // Copy of the real DemoNavigationQuery from the headless app. We don't need
    // every template item to exist - what matters is that mercurius
    // accepts the query: the inline fragments reference DemoRoot and
    // DemoBlock, both in the permissive allowlist, so the schema is
    // satisfied and empty results are valid.
    const res = await siteApp.inject({
      method: 'POST',
      url: '/api/graphql',
      payload: {
        query: `query DemoNavigation($datasource: String!, $language: String!) {
          demoNavigation: item(path: $datasource, language: $language) {
            rootItems: children(includeTemplateIDs: ["{91B46589-67ED-45A3-8804-1563A7E39F4E}"]) {
              results {
                ... on DemoRoot {
                  id
                  demoNodeText { value }
                  columns: children(includeTemplateIDs: ["{AEDDB611-901F-4DC3-8F88-3596DC7B5DB3}"]) {
                    results {
                      ... on DemoBlock { id }
                    }
                  }
                }
              }
            }
          }
        }`,
        variables: {
          datasource: '{70C24259-DCD9-4B14-B191-04DCFA4FB9F0}',
          language: 'en',
        },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.errors).toBeUndefined();
    // The datasource doesn't resolve to an item in the site fixture, so the
    // outer item is null - that's fine. What matters is the absence of
    // "Unknown type" / "Abstract type was resolved to ..." errors.
    expect('demoNavigation' in body.data).toBe(true);
  });

  it('children(includeTemplateIDs:) filters by both brace-wrapped and no-brace id formats', async () => {
    const childTemplate = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const parent = makeItem({ id: 'pnt00000-pnt0-pnt0-pnt0-pnt000000000', path: '/sitecore/content/tree' });
    const a = makeItem({ id: 'cha00000-cha0-cha0-cha0-cha000000000', parent: 'pnt00000-pnt0-pnt0-pnt0-pnt000000000', path: '/sitecore/content/tree/A', template: childTemplate });
    const b = makeItem({ id: 'chb00000-chb0-chb0-chb0-chb000000000', parent: 'pnt00000-pnt0-pnt0-pnt0-pnt000000000', path: '/sitecore/content/tree/B', template: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' });
    const app = await createTestApp([parent, a, b]);
    try {
      // Brace-wrapped uppercase dashed (Content SDK format).
      const res1 = await app.inject({
        method: 'POST',
        url: '/api/graphql',
        payload: {
          query: `{ item(path:"/sitecore/content/tree", language:"en"){ children(includeTemplateIDs:["{AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA}"]){ results{ id } } } }`,
        },
      });
      expect(res1.json().errors).toBeUndefined();
      expect(res1.json().data.item.children.results.map((r: { id: string }) => r.id)).toEqual(['cha00000-cha0-cha0-cha0-cha000000000']);

      // Lowercase dashed (engine-native format).
      const res2 = await app.inject({
        method: 'POST',
        url: '/api/graphql',
        payload: {
          query: `{ item(path:"/sitecore/content/tree", language:"en"){ children(includeTemplateIDs:["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"]){ results{ id } } } }`,
        },
      });
      expect(res2.json().errors).toBeUndefined();
      expect(res2.json().data.item.children.results).toHaveLength(1);
    } finally {
      await app.close();
    }
  });

  it('falls back to __typename=Item when the template item is not in the tree (0.1.4 regression)', async () => {
    // Fixture: an item whose template id points at a template that is NOT
    // included in the tree. The schema generator therefore never emits a
    // type for it, and the __typename resolver has to fall back to the
    // generic `Item` - the 0.1.4 regression is that this fallback was
    // missing and mercurius errored out with "Abstract type X was
    // resolved to a type Y that does not exist inside the schema".
    const orphanTemplateId = 'orp00000-orp0-orp0-orp0-orp000000000';
    const orphanItem: ScsItem = makeItem({
      id: 'orph0000-orph-orph-orph-orph00000000',
      path: '/sitecore/content/site/Orphan',
      template: orphanTemplateId,
    });
    const app = await createTestApp([orphanItem]);
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/graphql',
        payload: {
          query: `{ item(path:"/sitecore/content/site/Orphan", language:"en"){ __typename id } }`,
        },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.errors).toBeUndefined();
      expect(body.data.item.__typename).toBe('Item');
    } finally {
      await app.close();
    }
  });

  it('parses a nested DemoNavigation query that spreads inline fragments', async () => {
    const res = await siteApp.inject({
      method: 'POST',
      url: '/api/graphql',
      payload: {
        query: `query DemoNavigation($datasource: String!, $language: String!) {
          demoNavigation: item(path: $datasource, language: $language) {
            rootItems:children(includeTemplateIDs:["{91B46589-67ED-45A3-8804-1563A7E39F4E}"]) {
              results {
                ... on DemoRoot {
                  id, demoNodeText { value }, demoNodeLink { jsonValue }, demoIcon { jsonValue },
                  demoFlagOne { boolValue }, demoFlagTwo { boolValue },
                  columns:children(includeTemplateIDs:["{AEDDB611-901F-4DC3-8F88-3596DC7B5DB3}"]) {
                    results {
                      ... on DemoBlock {
                        id,
                        elements:children(includeTemplateIDs:["{19E9E732-A61E-40A1-B63A-BF46787828B8}","{126AE507-E463-4EEE-A4FF-8CB5855A1CD4}","{3308F3C1-7B11-47DD-8720-4E962C5FE8E5}"]) {
                          results {
                            id, template { id, name },
                            ... on DemoLinkList {
                              demoNodeText { value }, demoNodeLink { jsonValue },
                              demoNodeSubtitleText { value }, demoNodeDescription { value },
                              demoIcon { jsonValue }, demoFlagOne { boolValue }, demoFlagTwo { boolValue },
                              demoNodeTags { targetItems { ... on DemoLinkTag { demoLinkTagText { value }, demoLinkTagCssClass { value } } } },
                              links: children(includeTemplateIDs:["{C792B58A-DB19-408F-9D55-09A28C89C00A}"]){
                                results { ... on DemoLink {
                                  id, demoNodeText { value }, demoNodeLink { jsonValue }, demoNodeDescription { value },
                                  demoFlagOne { boolValue }, demoFlagTwo { boolValue },
                                  demoNodeTags { targetItems { ... on DemoLinkTag { demoLinkTagText { value }, demoLinkTagCssClass { value } } } }
                                } }
                              }
                            },
                            ... on DemoFeature { demoFeatureTitle { value }, demoFeatureText { value }, demoFeatureLink { jsonValue } }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }`,
        variables: {
          datasource: '{70C24259-DCD9-4B14-B191-04DCFA4FB9F0}',
          language: 'en',
        },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.errors).toBeUndefined();
    // The datasource isn't a real item, so the outer demoNavigation is
    // null. The test only verifies that the query parses + validates
    // against the generated schema without throwing "Unknown type" or
    // "Cannot query field" errors.
    expect('demoNavigation' in body.data).toBe(true);
  });

  it('parses a nested DemoStaticNav query that spreads inline fragments', async () => {
    const res = await siteApp.inject({
      method: 'POST',
      url: '/api/graphql',
      payload: {
        query: `query DemoStaticNav($datasource: String!, $language: String!) {
          demoStaticNav: item(path: $datasource, language: $language) {
            links: children(includeTemplateIDs: ["{8B5D4F2A-70DA-4883-934D-F19014DE169F}"]) {
              results {
                ... on DemoStaticItem {
                  id, demoStaticText { value }, demoStaticUrl { jsonValue },
                  links: children(includeTemplateIDs: ["{8B5D4F2A-70DA-4883-934D-F19014DE169F}"]) {
                    results { ... on DemoStaticItem { id, demoStaticText { value }, demoStaticUrl { jsonValue } } }
                  }
                }
              }
            }
            ... on DemoStaticRoot { id }
          }
        }`,
        variables: {
          datasource: '{00000000-0000-0000-0000-000000000001}',
          language: 'en',
        },
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().errors).toBeUndefined();
  });

  it('parses a DemoGroup query that spreads inline fragments on the _Base Alpha / _Base Gamma interfaces', async () => {
    const res = await siteApp.inject({
      method: 'POST',
      url: '/api/graphql',
      payload: {
        query: `query DemoGroup($datasource: String!, $language: String!) {
          form: item(path: $datasource, language: $language) {
            ... on DemoGroup {
              groupName { value }, groupSuccessMessage { value }, groupFailureMessage { value },
              fields: children(includeTemplateIDs:["{10C64411-CC89-4B52-96FB-8B9478C49562}"]) {
                results {
                  ... on DemoGroupSection {
                    elements:children(includeTemplateIDs:["{3108BC9F-0CC9-4EF6-9364-734F983213BC}"]) {
                      results {
                        id, template { name },
                        ... on _BaseAlpha { fieldLabel { value }, fieldName { value } }
                        ... on _BaseBeta { demoPlaceholderText { value } }
                        ... on _BaseGamma { demoRequiredFlag { boolValue }, demoErrorMessage { value } }
                        ... on ConcreteFour { concreteFourText { value } }
                      }
                    }
                  }
                }
              }
            }
          }
        }`,
        variables: {
          datasource: '{00000000-0000-0000-0000-000000000002}',
          language: 'en',
        },
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().errors).toBeUndefined();
  });

  it('sets __typename to the generated template type name and resolves template-specific fields', async () => {
    // Fixture: a full Demo Root template (section + field definition)
    // so the schema generator emits `type DemoRoot implements AnyItem`
    // with a `demoNodeText` field. The concrete test item's template
    // points at this generated type, so inline fragments spread.
    const tmpl = buildTemplateFixtureWithId('Demo Root', ['Demo Node Text']);
    const demoRootItem: ScsItem = makeItem({
      id: 'rmi00000-rmi0-rmi0-rmi0-rmi000000000',
      path: '/sitecore/content/site/Home/Menu/MainMenu',
      template: tmpl.id,
      sharedFields: [
        { id: 'mit00001-0000-0000-0000-000000000000', hint: 'Demo Node Text', value: 'Products' },
      ],
    });
    const app = await createTestApp([...tmpl.items, demoRootItem]);
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/graphql',
        payload: {
          query: `query{
            item(path:"/sitecore/content/site/Home/Menu/MainMenu", language:"en"){
              __typename
              id
              ... on DemoRoot { demoNodeText { value } }
            }
          }`,
        },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.errors).toBeUndefined();
      expect(body.data.item.__typename).toBe('DemoRoot');
      expect(body.data.item.demoNodeText.value).toBe('Products');
    } finally {
      await app.close();
    }
  });

  describe('0.1.14 numberValue / dateValue on ItemField', () => {
    it('numberValue returns parseFloat of a numeric integer field', async () => {
      const holder = makeItem({
        id: 'nv000000-0000-0000-0000-000000000001',
        path: '/sitecore/content/nv-int',
        sharedFields: [
          { id: 'ffffffff-0000-0000-0000-000000003001', hint: 'TabIndex', value: '2' },
        ],
      });
      const app = await createTestApp([holder]);
      try {
        const response = await app.inject({
          method: 'POST',
          url: '/api/graphql',
          payload: {
            query: `{item(path:"/sitecore/content/nv-int",language:"en"){field(name:"TabIndex"){numberValue value}}}`,
          },
        });
        const body = response.json();
        expect(body.errors).toBeUndefined();
        expect(body.data.item.field.numberValue).toBe(2);
        expect(body.data.item.field.value).toBe('2');
      } finally {
        await app.close();
      }
    });

    it('numberValue parses a decimal number field', async () => {
      const holder = makeItem({
        id: 'nv000000-0000-0000-0000-000000000002',
        path: '/sitecore/content/nv-float',
        sharedFields: [
          { id: 'ffffffff-0000-0000-0000-000000003002', hint: 'Weight', value: '3.14' },
        ],
      });
      const app = await createTestApp([holder]);
      try {
        const response = await app.inject({
          method: 'POST',
          url: '/api/graphql',
          payload: {
            query: `{item(path:"/sitecore/content/nv-float",language:"en"){field(name:"Weight"){numberValue}}}`,
          },
        });
        const body = response.json();
        expect(body.errors).toBeUndefined();
        expect(body.data.item.field.numberValue).toBeCloseTo(3.14);
      } finally {
        await app.close();
      }
    });

    it('numberValue on an unset field returns null with the wrapper still present', async () => {
      const holder = makeItem({
        id: 'nv000000-0000-0000-0000-000000000003',
        path: '/sitecore/content/nv-unset',
      });
      const app = await createTestApp([holder]);
      try {
        const response = await app.inject({
          method: 'POST',
          url: '/api/graphql',
          payload: {
            query: `{item(path:"/sitecore/content/nv-unset",language:"en"){field(name:"TabIndex"){numberValue}}}`,
          },
        });
        const body = response.json();
        expect(body.errors).toBeUndefined();
        expect(body.data.item.field).not.toBeNull();
        expect(body.data.item.field.numberValue).toBeNull();
      } finally {
        await app.close();
      }
    });

    it('numberValue on a non-numeric text field returns null', async () => {
      const holder = makeItem({
        id: 'nv000000-0000-0000-0000-000000000004',
        path: '/sitecore/content/nv-text',
        sharedFields: [
          { id: 'ffffffff-0000-0000-0000-000000003003', hint: 'Title', value: 'Welcome' },
        ],
      });
      const app = await createTestApp([holder]);
      try {
        const response = await app.inject({
          method: 'POST',
          url: '/api/graphql',
          payload: {
            query: `{item(path:"/sitecore/content/nv-text",language:"en"){field(name:"Title"){numberValue value}}}`,
          },
        });
        const body = response.json();
        expect(body.errors).toBeUndefined();
        expect(body.data.item.field.numberValue).toBeNull();
        expect(body.data.item.field.value).toBe('Welcome');
      } finally {
        await app.close();
      }
    });

    it('dateValue returns ISO-8601 string for a Sitecore compact date', async () => {
      // Sitecore Datetime fields are stored in the compact form
      // yyyyMMddTHHmmssZ - e.g. 20260115T123456Z. Mockingbird parses this
      // and emits the expanded ISO-8601 form real Edge returns.
      const holder = makeItem({
        id: 'dv000000-0000-0000-0000-000000000001',
        path: '/sitecore/content/dv-set',
        sharedFields: [
          { id: 'ffffffff-0000-0000-0000-000000004001', hint: '__Updated', value: '20260115T123456Z' },
        ],
      });
      const app = await createTestApp([holder]);
      try {
        const response = await app.inject({
          method: 'POST',
          url: '/api/graphql',
          payload: {
            query: `{item(path:"/sitecore/content/dv-set",language:"en"){field(name:"__Updated"){dateValue value}}}`,
          },
        });
        const body = response.json();
        expect(body.errors).toBeUndefined();
        expect(body.data.item.field.dateValue).toBe('2026-01-15T12:34:56Z');
        expect(body.data.item.field.value).toBe('20260115T123456Z');
      } finally {
        await app.close();
      }
    });

    it('dateValue passes through a field already in expanded ISO-8601', async () => {
      const holder = makeItem({
        id: 'dv000000-0000-0000-0000-000000000002',
        path: '/sitecore/content/dv-iso',
        sharedFields: [
          { id: 'ffffffff-0000-0000-0000-000000004002', hint: 'PublishDate', value: '2026-02-20T08:00:00Z' },
        ],
      });
      const app = await createTestApp([holder]);
      try {
        const response = await app.inject({
          method: 'POST',
          url: '/api/graphql',
          payload: {
            query: `{item(path:"/sitecore/content/dv-iso",language:"en"){field(name:"PublishDate"){dateValue}}}`,
          },
        });
        const body = response.json();
        expect(body.errors).toBeUndefined();
        expect(body.data.item.field.dateValue).toBe('2026-02-20T08:00:00Z');
      } finally {
        await app.close();
      }
    });

    it('dateValue on an unset field returns null with the wrapper still present', async () => {
      const holder = makeItem({
        id: 'dv000000-0000-0000-0000-000000000003',
        path: '/sitecore/content/dv-unset',
      });
      const app = await createTestApp([holder]);
      try {
        const response = await app.inject({
          method: 'POST',
          url: '/api/graphql',
          payload: {
            query: `{item(path:"/sitecore/content/dv-unset",language:"en"){field(name:"__Updated"){dateValue}}}`,
          },
        });
        const body = response.json();
        expect(body.errors).toBeUndefined();
        expect(body.data.item.field).not.toBeNull();
        expect(body.data.item.field.dateValue).toBeNull();
      } finally {
        await app.close();
      }
    });

    it('dateValue on unparseable text returns null', async () => {
      const holder = makeItem({
        id: 'dv000000-0000-0000-0000-000000000004',
        path: '/sitecore/content/dv-bogus',
        sharedFields: [
          { id: 'ffffffff-0000-0000-0000-000000004003', hint: 'SomeText', value: 'not a date' },
        ],
      });
      const app = await createTestApp([holder]);
      try {
        const response = await app.inject({
          method: 'POST',
          url: '/api/graphql',
          payload: {
            query: `{item(path:"/sitecore/content/dv-bogus",language:"en"){field(name:"SomeText"){dateValue value}}}`,
          },
        });
        const body = response.json();
        expect(body.errors).toBeUndefined();
        expect(body.data.item.field.dateValue).toBeNull();
        expect(body.data.item.field.value).toBe('not a date');
      } finally {
        await app.close();
      }
    });
  });

  describe('0.1.13 children() enumeration stays consistent with item table', () => {
    // Regression: an item resolvable by id/path must also show up under
    // its parent's children() enumeration, even when its serialised parent
    // reference was stored in a non-canonical form (brace-wrapped, uppercased).
    it('children() returns every item that item(path:) can resolve under the same parent', async () => {
      const parentId = 'c062208b-22d5-4609-a85e-eba0bcee265b';
      const parent: ScsItem = makeItem({
        id: parentId,
        path: '/sitecore/content/tenant-parent',
      });
      const demoLinkTmpl = 'c792b58a-db19-408f-9d55-09a28c89c00a';

      const canonicalChild = makeItem({
        id: '7621f425-e10d-44a9-8d23-f2b7d5f6cd87',
        parent: parentId,
        path: '/sitecore/content/tenant-parent/Document Store',
        template: demoLinkTmpl,
      });
      // Parent reference stored brace-wrapped + uppercase - the real-
      // world SCS writer variant that masked items from children()
      // enumeration in 0.1.12.
      const bracedChild = makeItem({
        id: '97ca43a5-3b10-473e-9326-5044c75f259f',
        parent: `{${parentId.toUpperCase()}}`,
        path: '/sitecore/content/tenant-parent/Catalog Resources',
        template: demoLinkTmpl,
      });
      // Parent reference stored uppercase without braces.
      const upperChild = makeItem({
        id: 'e3f93dda-209c-4e3a-a6f4-a4438e459652',
        parent: parentId.toUpperCase(),
        path: '/sitecore/content/tenant-parent/Resource Catalog',
        template: demoLinkTmpl,
      });

      const app = await createTestApp([parent, canonicalChild, bracedChild, upperChild]);
      try {
        // Sanity: the "hidden" child must also be resolvable by id, which
        // is the asymmetry the original bug report called out.
        const direct = await app.inject({
          method: 'POST',
          url: '/api/graphql',
          payload: {
            query: `{item(path:"97ca43a5-3b10-473e-9326-5044c75f259f",language:"en"){id}}`,
          },
        });
        expect(direct.json().data.item.id).toBe('97ca43a5-3b10-473e-9326-5044c75f259f');

        const response = await app.inject({
          method: 'POST',
          url: '/api/graphql',
          payload: {
            query: `{item(path:"${parentId}",language:"en"){children(includeTemplateIDs:["${demoLinkTmpl}"]){results{id}}}}`,
          },
        });
        const body = response.json();
        expect(body.errors).toBeUndefined();
        const ids = (body.data.item.children.results as Array<{ id: string }>).map(r => r.id).sort();
        expect(ids).toEqual([
          '7621f425-e10d-44a9-8d23-f2b7d5f6cd87',
          '97ca43a5-3b10-473e-9326-5044c75f259f',
          'e3f93dda-209c-4e3a-a6f4-a4438e459652',
        ]);
      } finally {
        await app.close();
      }
    });
  });

  describe('0.1.12 empty-shape jsonValue for unset image/link fields', () => {
    // Real Experience Edge never returns `jsonValue: null` for an image or
    // general-link field on an item whose TEMPLATE declares that field -
    // it always returns a wrapper with all inner string values empty.
    // Consuming apps rely on the shape existing to distinguish "unset"
    // (href === "") from "set" (href non-empty).
    let tmplCounter = 0;
    async function buildAppWithFieldOfType(
      fieldName: string,
      fieldType: string,
      itemHasValue: boolean,
      fieldValue?: string,
      extraItems: ScsItem[] = [],
    ) {
      // Unique ids per call so the module-level template-schema cache
      // doesn't collide across tests in the same file.
      const suffix = (++tmplCounter).toString(16).padStart(4, '0');
      const tmplId = `1111${suffix}-0000-0000-0000-000000000000`;
      const sectionId = `2222${suffix}-0000-0000-0000-000000000000`;
      const fieldDefId = `3333${suffix}-0000-0000-0000-000000000000`;
      const itemId = `4444${suffix}-0000-0000-0000-000000000000`;
      const contentFieldId = 'ffffffff-0000-0000-0000-00000000e012';
      const template = makeItem({
        id: tmplId,
        path: '/sitecore/templates/TestTmpl',
        template: TEMPLATE_TEMPLATE_ID,
      });
      const section = makeItem({
        id: sectionId,
        parent: tmplId,
        path: '/sitecore/templates/TestTmpl/Content',
        template: TEMPLATE_SECTION_TEMPLATE_ID,
      });
      const fieldDef = makeItem({
        id: fieldDefId,
        parent: sectionId,
        path: `/sitecore/templates/TestTmpl/Content/${fieldName}`,
        template: TEMPLATE_FIELD_TEMPLATE_ID,
        sharedFields: [{ id: FIELD_IDS.type, hint: 'Type', value: fieldType }],
      });
      const defaultImageValue = '<image mediaid="{00000000-0000-0000-0000-000000000000}" />';
      const storedValue = fieldValue !== undefined ? fieldValue : defaultImageValue;
      const item = makeItem({
        id: itemId,
        path: '/sitecore/content/test-item',
        template: tmplId,
        sharedFields: itemHasValue
          ? [{ id: contentFieldId, hint: fieldName, value: storedValue }]
          : [],
      });
      return createTestApp([template, section, fieldDef, item, ...extraItems]);
    }

    it('unset image field on a template-declared field returns empty-keys-stripped shape', async () => {
      // 0.3.5: prod Edge emits `jsonValue.value` with empty-valued keys
      // stripped. Pre-0.3.5 local code returned all keys populated with
      // empty strings (Gap 1 from 0.1.12 - Edge never returns null on a
      // template-declared field); the shape is still non-null, it's just
      // the empty object now.
      const app = await buildAppWithFieldOfType('DemoIcon', 'Image', false);
      try {
        const response = await app.inject({
          method: 'POST',
          url: '/api/graphql',
          payload: {
            query: `{item(path:"/sitecore/content/test-item",language:"en"){field(name:"DemoIcon"){jsonValue}}}`,
          },
        });
        const body = response.json();
        expect(body.errors).toBeUndefined();
        expect(body.data.item.field.jsonValue).toEqual({ value: {} });
      } finally {
        await app.close();
      }
    });

    it('unset general link field on a template-declared field returns { value: { href: "" } }', async () => {
      // 0.4.0.5: empty authored Link emits `{href:""}` in Sitecore. The
      // 0.4.0 collapse to generic `{value:{}}` regressed this - a real
      // Feature rendering with an unauthored DemoNodeLink showed
      // `links.results[0].link.jsonValue.value` as `{}` locally vs
      // `{"href":""}` in Sitecore. Links always carry an `href` key even empty.
      const app = await buildAppWithFieldOfType('DemoNodeLink', 'General Link', false);
      try {
        const response = await app.inject({
          method: 'POST',
          url: '/api/graphql',
          payload: {
            query: `{item(path:"/sitecore/content/test-item",language:"en"){field(name:"DemoNodeLink"){jsonValue}}}`,
          },
        });
        const body = response.json();
        expect(body.errors).toBeUndefined();
        expect(body.data.item.field.jsonValue).toEqual({ value: { href: '' } });
      } finally {
        await app.close();
      }
    });

    it('image field with raw XML whose mediaid does not resolve returns empty-keys-stripped shape', async () => {
      const holder = makeItem({
        id: '55555555-0000-0000-0000-000000000001',
        path: '/sitecore/content/holder-broken-image',
        sharedFields: [
          {
            id: 'ffffffff-0000-0000-0000-000000001001',
            hint: 'DemoIcon',
            value: '<image mediaid="{DEADBEEF-DEAD-BEEF-DEAD-BEEFDEADBEEF}" />',
          },
        ],
      });
      const app = await createTestApp([holder]);
      try {
        const response = await app.inject({
          method: 'POST',
          url: '/api/graphql',
          payload: {
            query: `{item(path:"/sitecore/content/holder-broken-image",language:"en"){field(name:"DemoIcon"){jsonValue}}}`,
          },
        });
        const body = response.json();
        expect(body.errors).toBeUndefined();
        expect(body.data.item.field.jsonValue).toEqual({ value: {} });
      } finally {
        await app.close();
      }
    });

    it('0.3.5 - image jsonValue preserves authored hspace/vspace/class/title/border', async () => {
      // The 148-case `hspace=30` gotcha from 0.3.4: prod carries authored
      // image attrs (hspace/vspace/class/title/border) on jsonValue.value,
      // local dropped them because buildImageJsonValue only read mediaid/
      // alt/width/height. Closes a projection gap that is orthogonal to
      // the strip-when-empty rule - authored *non-empty* attrs must land
      // in output verbatim.
      const mediaId = 'cccccccc-bbbb-aaaa-9999-888888888888';
      const media = makeItem({
        id: mediaId,
        path: '/sitecore/media library/Project/imgs/hero',
        sharedFields: [
          { id: 'c06867fe-9a43-4c7d-b739-48780492d06f', hint: 'Extension', value: 'jpg' },
        ],
      });
      const holder = makeItem({
        id: '77777777-0000-0000-0000-000000000001',
        path: '/sitecore/content/holder-image-attrs',
        sharedFields: [
          {
            id: 'ffffffff-0000-0000-0000-000000003001',
            hint: 'DemoIcon',
            value: `<image mediaid="{${mediaId.toUpperCase()}}" alt="Hero" hspace="30" vspace="20" class="custom-img" title="Hero image" border="0" />`,
          },
        ],
      });
      const app = await createTestApp([media, holder]);
      try {
        const response = await app.inject({
          method: 'POST',
          url: '/api/graphql',
          payload: {
            query: `{item(path:"/sitecore/content/holder-image-attrs",language:"en"){field(name:"DemoIcon"){jsonValue}}}`,
          },
        });
        const body = response.json();
        expect(body.errors).toBeUndefined();
        const v = body.data.item.field.jsonValue.value;
        expect(v.hspace).toBe('30');
        expect(v.vspace).toBe('20');
        expect(v.class).toBe('custom-img');
        expect(v.title).toBe('Hero image');
        expect(v.border).toBe('0');
        expect(v.alt).toBe('Hero');
      } finally {
        await app.close();
      }
    });

    it('0.4.0.5 - image jsonValue walks authored attrs + projects alt/width/height from media item; dims dropped when absent', async () => {
      // Phase B of the 0.4.0 port: the ImageRendererFieldProcessor layers
      // a media-item projection on top of the per-item authored-XML walk.
      // Authored attrs win verbatim. For alt/width/height that the author
      // DIDN'T write on the <image /> element, FieldRenderer fills them
      // from the resolved media item.
      //
      // 0.4.0.5 correction: when the media
      // item carries no width/height, those keys are DROPPED rather than
      // projected as "". Sitecore's real FieldRenderer never emits empty
      // dim attrs, so the prior `width:""`/`height:""` shape was a leak.
      const mediaId = 'dddddddd-bbbb-aaaa-9999-888888888888';
      const media = makeItem({
        id: mediaId,
        path: '/sitecore/media library/Project/imgs/spot',
        sharedFields: [
          { id: 'c06867fe-9a43-4c7d-b739-48780492d06f', hint: 'Extension', value: 'png' },
        ],
      });
      const holder = makeItem({
        id: '88888888-0000-0000-0000-000000000002',
        path: '/sitecore/content/holder-image-empties',
        sharedFields: [
          {
            id: 'ffffffff-0000-0000-0000-000000003002',
            hint: 'DemoIcon',
            value: `<image mediaid="{${mediaId.toUpperCase()}}" alt="" class="" hspace="" vspace="" title="" />`,
          },
        ],
      });
      const app = await createTestApp([media, holder]);
      try {
        const response = await app.inject({
          method: 'POST',
          url: '/api/graphql',
          payload: {
            query: `{item(path:"/sitecore/content/holder-image-empties",language:"en"){field(name:"DemoIcon"){jsonValue}}}`,
          },
        });
        const body = response.json();
        expect(body.errors).toBeUndefined();
        const v = body.data.item.field.jsonValue.value;
        // Authored attrs preserved verbatim.
        expect(v.alt).toBe('');
        expect(v.class).toBe('');
        expect(v.hspace).toBe('');
        expect(v.vspace).toBe('');
        expect(v.title).toBe('');
        // Projections: src always; width/height filled from media when
        // present, dropped when absent (0.4.0.5).
        expect(v.src).toBe('/-/media/Project/imgs/spot.png?iar=0');
        expect(v).not.toHaveProperty('width');
        expect(v).not.toHaveProperty('height');
        // border wasn't authored, isn't a projection key - absent.
        expect(v).not.toHaveProperty('border');
      } finally {
        await app.close();
      }
    });

    it('0.4.0.2 - image jsonValue projects alt/width/height from media item when authored XML is minimal', async () => {
      // Real Sitecore shape: authored XML is just `<image mediaid="{X}" />`
      // and Sitecore emits { src, alt, width:"1650", height:"1079" } - the
      // alt/width/height come from the media item via FieldRenderer.
      // 4-key minimum when author didn't override.
      const mediaId = 'f5b4216f-704f-4594-a158-5203055a74b8';
      const media = makeItem({
        id: mediaId,
        path: '/sitecore/media library/site/demo-images/demo-photo',
        sharedFields: [
          { id: 'c06867fe-9a43-4c7d-b739-48780492d06f', hint: 'Extension', value: 'jpg' },
          { id: '22eac599-f13b-4607-a89d-c091763a467d', hint: 'Width', value: '1650' },
          { id: 'de2ca9e4-c117-4c8a-a139-1ff4b199d15a', hint: 'Height', value: '1079' },
        ],
      });
      const holder = makeItem({
        id: 'bbbbbbbb-0000-0000-0000-000000000005',
        path: '/sitecore/content/holder-d2973111',
        sharedFields: [
          {
            id: 'ffffffff-0000-0000-0000-000000003005',
            hint: 'DemoIcon',
            value: `<image mediaid="{${mediaId.toUpperCase()}}" />`,
          },
        ],
      });
      const app = await createTestApp([media, holder]);
      try {
        const response = await app.inject({
          method: 'POST',
          url: '/api/graphql',
          payload: {
            query: `{item(path:"/sitecore/content/holder-d2973111",language:"en"){field(name:"DemoIcon"){jsonValue}}}`,
          },
        });
        const body = response.json();
        expect(body.errors).toBeUndefined();
        expect(body.data.item.field.jsonValue).toEqual({
          value: {
            src: '/-/media/site/demo-images/demo-photo.jpg?h=1079&iar=0&w=1650',
            alt: '',
            width: '1650',
            height: '1079',
          },
        });
      } finally {
        await app.close();
      }
    });

    it('0.4.0.2 - authored alt/width/height win over media item projection', async () => {
      // If the author overrides alt/width/height on the field XML, the
      // media item's fields must NOT clobber them. Authored attrs always
      // win - the projection only fills absent keys.
      const mediaId = 'cccccccc-0000-0000-0000-000000000099';
      const media = makeItem({
        id: mediaId,
        path: '/sitecore/media library/site/override-test',
        sharedFields: [
          { id: 'c06867fe-9a43-4c7d-b739-48780492d06f', hint: 'Extension', value: 'png' },
          { id: '22eac599-f13b-4607-a89d-c091763a467d', hint: 'Width', value: '100' },
          { id: 'de2ca9e4-c117-4c8a-a139-1ff4b199d15a', hint: 'Height', value: '200' },
        ],
        languages: [{
          language: 'en',
          fields: [],
          versions: [{
            version: 1,
            fields: [
              { id: '65885c44-8fcd-4a7f-94f1-ee63703fe193', hint: 'Alt', value: 'Media-level Alt' },
            ],
          }],
        }],
      });
      const holder = makeItem({
        id: 'bbbbbbbb-0000-0000-0000-000000000006',
        path: '/sitecore/content/holder-alt-override',
        sharedFields: [
          {
            id: 'ffffffff-0000-0000-0000-000000003006',
            hint: 'DemoIcon',
            value: `<image mediaid="{${mediaId.toUpperCase()}}" alt="Custom" width="50" />`,
          },
        ],
      });
      const app = await createTestApp([media, holder]);
      try {
        const response = await app.inject({
          method: 'POST',
          url: '/api/graphql',
          payload: {
            query: `{item(path:"/sitecore/content/holder-alt-override",language:"en"){field(name:"DemoIcon"){jsonValue}}}`,
          },
        });
        const body = response.json();
        expect(body.errors).toBeUndefined();
        const v = body.data.item.field.jsonValue.value;
        expect(v.alt).toBe('Custom');       // authored wins
        expect(v.width).toBe('50');          // authored wins
        expect(v.height).toBe('200');        // filled from media (absent on XML)
        expect(v.src).toBe('/-/media/site/override-test.png?h=200&iar=0&w=50');
      } finally {
        await app.close();
      }
    });

    it('0.4.0.2 - media item with versioned Alt field surfaces via projection', async () => {
      // Alt lives on the versioned en field of the media item, not a
      // shared field. The projection must walk languages[en].versions
      // not just sharedFields to find it.
      const mediaId = 'eeeeeeee-0000-0000-0000-000000000007';
      const media = makeItem({
        id: mediaId,
        path: '/sitecore/media library/site/alt-via-versioned',
        sharedFields: [
          { id: 'c06867fe-9a43-4c7d-b739-48780492d06f', hint: 'Extension', value: 'png' },
        ],
        languages: [{
          language: 'en',
          fields: [],
          versions: [{
            version: 1,
            fields: [
              { id: '65885c44-8fcd-4a7f-94f1-ee63703fe193', hint: 'Alt', value: 'Versioned alt value' },
            ],
          }],
        }],
      });
      const holder = makeItem({
        id: 'bbbbbbbb-0000-0000-0000-000000000008',
        path: '/sitecore/content/holder-versioned-alt',
        sharedFields: [
          {
            id: 'ffffffff-0000-0000-0000-000000003007',
            hint: 'DemoIcon',
            value: `<image mediaid="{${mediaId.toUpperCase()}}" />`,
          },
        ],
      });
      const app = await createTestApp([media, holder]);
      try {
        const response = await app.inject({
          method: 'POST',
          url: '/api/graphql',
          payload: {
            query: `{item(path:"/sitecore/content/holder-versioned-alt",language:"en"){field(name:"DemoIcon"){jsonValue}}}`,
          },
        });
        const body = response.json();
        expect(body.errors).toBeUndefined();
        expect(body.data.item.field.jsonValue.value.alt).toBe('Versioned alt value');
      } finally {
        await app.close();
      }
    });

    it('0.4.0.3 - RichText jsonValue rewrites ~/link.aspx tokens to resolved URLs', async () => {
      // Phase C: when a field's declared type is Rich Text, jsonValue.value
      // is the rewritten HTML, not the raw stored string. Dynamic link
      // tokens (`~/link.aspx?_id={GUID}`) become site-relative URLs to
      // the resolved item - matches FieldRenderer.RenderField's
      // DynamicLinkDatabaseSwitcher-backed output.
      const targetId = 'cccccccc-0000-4000-a000-000000000001';
      const target = makeItem({ id: targetId, path: '/sitecore/content/site/Home/about/news' });
      const app = await buildAppWithFieldOfType('MetaDescription', 'Rich Text', true,
        `<p>Read <a href="~/link.aspx?_id=${targetId.toUpperCase()}&_z=z">our news</a>.</p>`,
        [target]);
      try {
        const response = await app.inject({
          method: 'POST',
          url: '/api/graphql',
          payload: {
            query: `{item(path:"/sitecore/content/test-item",language:"en"){field(name:"MetaDescription"){jsonValue}}}`,
          },
        });
        const body = response.json();
        expect(body.errors).toBeUndefined();
        const v = body.data.item.field.jsonValue.value as string;
        expect(v).toContain('href="/about/news"');
        expect(v).not.toContain('~/link.aspx');
      } finally {
        await app.close();
      }
    });

    it('0.4.0.3 - RichText jsonValue rewrites -/media tokens to resolved CDN paths', async () => {
      // Media tokens embedded in RichText (e.g. a figure's <img src>) get
      // resolved the same way - the serializer contract is "pass the
      // rendered output through". Querystring is preserved verbatim.
      const mediaId = 'dddddddd-0000-4000-a000-000000000002';
      const media = makeItem({
        id: mediaId,
        path: '/sitecore/media library/Project/pics/masthead',
        sharedFields: [
          { id: 'c06867fe-9a43-4c7d-b739-48780492d06f', hint: 'Extension', value: 'jpg' },
        ],
      });
      const app = await buildAppWithFieldOfType('MetaDescription', 'Rich Text', true,
        `<img src="-/media/${mediaId.replace(/-/g, '').toUpperCase()}.ashx?h=200&w=400" />`,
        [media]);
      try {
        const response = await app.inject({
          method: 'POST',
          url: '/api/graphql',
          payload: {
            query: `{item(path:"/sitecore/content/test-item",language:"en"){field(name:"MetaDescription"){jsonValue}}}`,
          },
        });
        const body = response.json();
        expect(body.errors).toBeUndefined();
        const v = body.data.item.field.jsonValue.value as string;
        expect(v).toContain('src="/-/media/Project/pics/masthead.jpg?h=200&w=400"');
        expect(v).not.toContain('.ashx');
      } finally {
        await app.close();
      }
    });

    it('0.4.0.32 - MOCKINGBIRD_XA_VARIABLE_EXPANSION=force expands spans on non-RichText fields', async () => {
      // Opt-in escape hatch for environments where a field carrying
      // xa-variable markup isn't classified as `rich text` by
      // `lookupFieldType`. Default (`sitecore`) remains type-based dispatch;
      // `force` additionally expands xa-variable spans anywhere the marker
      // appears. Narrow scope - only span expansion, not ~/link.aspx or
      // -/media rewrites - keeps it safe on plain-text fields.
      const tokenId = '51d83b1b-16db-46ac-b6ce-ec0ffe345520';
      const token = makeItem({
        id: tokenId,
        path: '/sitecore/content/site/Home/Data/Tokens/Scikit-Learn',
        sharedFields: [{
          id: '09147fb2-ebfb-4949-8c8e-26a424409d5e',
          hint: 'Value',
          value: 'A free software ML library.',
        }],
      });
      // Declare the field as "Single-Line Text" - deliberately NOT Rich Text,
      // so the default sitecore-mode dispatch does NOT rewrite.
      const app = await buildAppWithFieldOfType(
        'Answer',
        'Single-Line Text',
        true,
        `See <span class="xa-variable" data-variableid="{${tokenId.toUpperCase()}}">Scikit-Learn</span>.`,
        [token],
      );
      const savedEnv = process.env.MOCKINGBIRD_XA_VARIABLE_EXPANSION;
      try {
        // Default mode - span passes through unchanged.
        delete process.env.MOCKINGBIRD_XA_VARIABLE_EXPANSION;
        const defaultResp = await app.inject({
          method: 'POST',
          url: '/api/graphql',
          payload: {
            query: `{item(path:"/sitecore/content/test-item",language:"en"){field(name:"Answer"){value}}}`,
          },
        });
        expect((defaultResp.json().data.item.field.value as string)).toContain('xa-variable');

        // Force mode - span expanded even on a Single-Line Text field.
        process.env.MOCKINGBIRD_XA_VARIABLE_EXPANSION = 'force';
        const forcedResp = await app.inject({
          method: 'POST',
          url: '/api/graphql',
          payload: {
            query: `{item(path:"/sitecore/content/test-item",language:"en"){field(name:"Answer"){value}}}`,
          },
        });
        const v = forcedResp.json().data.item.field.value as string;
        expect(v).toContain('A free software ML library.');
        expect(v).not.toContain('xa-variable');
      } finally {
        if (savedEnv === undefined) {
          delete process.env.MOCKINGBIRD_XA_VARIABLE_EXPANSION;
        } else {
          process.env.MOCKINGBIRD_XA_VARIABLE_EXPANSION = savedEnv;
        }
        await app.close();
      }
    });

    it('0.4.0.31 - RichText `.value` scalar runs through rewriteRichText (matches Edge render)', async () => {
      // Regression from 0.4.0.30 verification: a FAQ item's Answer field
      // contained raw `<span class="xa-variable">...</span>` markup in
      // mockingbird's `.value` response, while Sitecore's `.value` had
      // the rewritten text. Edge's `.value` scalar for RichText fields
      // runs the renderField pipeline (= rewriteRichText in mockingbird).
      // The `.jsonValue` path already did this; the plain `.value` scalar
      // must too.
      const tokenId = '51d83b1b-16db-46ac-b6ce-ec0ffe345520';
      const token = makeItem({
        id: tokenId,
        path: '/sitecore/content/site/Home/Data/Tokens/Scikit-Learn',
        sharedFields: [{
          id: '09147fb2-ebfb-4949-8c8e-26a424409d5e',
          hint: 'Value',
          value: 'A free software ML library.',
        }],
      });
      const app = await buildAppWithFieldOfType(
        'Answer',
        'Rich Text',
        true,
        `<p>See <span class="xa-variable" data-variableid="{${tokenId.toUpperCase()}}">Scikit-Learn</span>.</p>`,
        [token],
      );
      try {
        const response = await app.inject({
          method: 'POST',
          url: '/api/graphql',
          payload: {
            query: `{item(path:"/sitecore/content/test-item",language:"en"){field(name:"Answer"){value}}}`,
          },
        });
        const body = response.json();
        expect(body.errors).toBeUndefined();
        const v = body.data.item.field.value as string;
        expect(v).toContain('A free software ML library.');
        expect(v).not.toContain('xa-variable');
      } finally {
        await app.close();
      }
    });

    it('0.4.0.7 - RichText jsonValue passes through leading/internal/trailing whitespace byte-for-byte', async () => {
      const app = await buildAppWithFieldOfType('MetaDescription', 'Rich Text', true,
        ' Lead\n\nmiddle  \n\n', []);
      try {
        const response = await app.inject({
          method: 'POST',
          url: '/api/graphql',
          payload: {
            query: `{item(path:"/sitecore/content/test-item",language:"en"){field(name:"MetaDescription"){jsonValue}}}`,
          },
        });
        const body = response.json();
        expect(body.errors).toBeUndefined();
        // 0.4.0.7: RichText jsonValue is a pure passthrough after
        // rewriteRichText runs - the Rainbow SCS reader is byte-faithful,
        // so the emitted value preserves leading / internal / trailing
        // whitespace as authored.
        expect(body.data.item.field.jsonValue.value).toBe(' Lead\n\nmiddle  \n\n');
      } finally {
        await app.close();
      }
    });

    it('0.3.7 - link jsonValue (external) walks authored attrs + href projection', async () => {
      // Acceptance case for external links:
      //   <link linktype="external" url="..." target="_blank" text="..." anchor="" />
      // Sitecore emits exactly 6 keys: href, linktype, url, target, text, anchor.
      // anchor IS in the authored XML (as ""); class/title/querystring/id
      // are NOT, so they must not appear on output.
      const holder = makeItem({
        id: '99999999-0000-0000-0000-000000000003',
        path: '/sitecore/content/holder-link-external',
        sharedFields: [
          {
            id: 'ffffffff-0000-0000-0000-000000003003',
            hint: 'DemoNodeLink',
            value: '<link linktype="external" url="https://x.test" target="_blank" text="Docs" anchor="" />',
          },
        ],
      });
      const app = await createTestApp([holder]);
      try {
        const response = await app.inject({
          method: 'POST',
          url: '/api/graphql',
          payload: {
            query: `{item(path:"/sitecore/content/holder-link-external",language:"en"){field(name:"DemoNodeLink"){jsonValue}}}`,
          },
        });
        const body = response.json();
        expect(body.errors).toBeUndefined();
        const v = body.data.item.field.jsonValue.value;
        // 5 authored keys + 1 href projection = 6 keys exactly.
        expect(Object.keys(v).sort()).toEqual(['anchor', 'href', 'linktype', 'target', 'text', 'url']);
        expect(v.linktype).toBe('external');
        expect(v.url).toBe('https://x.test');
        expect(v.target).toBe('_blank');
        expect(v.text).toBe('Docs');
        expect(v.anchor).toBe('');
        expect(v.href).toBe('https://x.test'); // projection: href = url for external
      } finally {
        await app.close();
      }
    });

    it('0.3.7 - link jsonValue (internal) walks authored attrs + href projection', async () => {
      // Acceptance case for internal links:
      //   <link linktype="internal" id="{GUID}" text="..." anchor="" class="" title="" target="" querystring="" />
      // Sitecore emits exactly 9 keys: 8 authored + href projection. Empty
      // anchor/class/title/target/querystring are preserved verbatim.
      const targetId = 'af176413-1cfe-4c54-9fcb-4f0545258bff';
      const target = makeItem({ id: targetId, path: '/sitecore/content/site/Home/about' });
      const holder = makeItem({
        id: 'aaaaaaaa-0000-0000-0000-000000000004',
        path: '/sitecore/content/site/Home/holder-link-internal',
        sharedFields: [
          {
            id: 'ffffffff-0000-0000-0000-000000003004',
            hint: 'DemoNodeLink',
            value: `<link text="About" anchor="" linktype="internal" class="" title="" target="" querystring="" id="{${targetId.toUpperCase()}}" />`,
          },
        ],
      });
      const app = await createTestApp([target, holder]);
      try {
        const response = await app.inject({
          method: 'POST',
          url: '/api/graphql',
          payload: {
            query: `{item(path:"/sitecore/content/site/Home/holder-link-internal",language:"en"){field(name:"DemoNodeLink"){jsonValue}}}`,
          },
        });
        const body = response.json();
        expect(body.errors).toBeUndefined();
        const v = body.data.item.field.jsonValue.value;
        expect(Object.keys(v).sort()).toEqual([
          'anchor', 'class', 'href', 'id', 'linktype', 'querystring', 'target', 'text', 'title',
        ]);
        expect(v.text).toBe('About');
        expect(v.anchor).toBe('');
        expect(v.linktype).toBe('internal');
        expect(v.class).toBe('');
        expect(v.title).toBe('');
        expect(v.target).toBe('');
        expect(v.querystring).toBe('');
        expect(v.id).toBe(`{${targetId.toUpperCase()}}`);
        expect(v.href).toBe('/about'); // projection: href resolved from id
      } finally {
        await app.close();
      }
    });

    it('set image and set external link cases from 0.1.10 are unchanged', async () => {
      // Sanity regression: the 0.1.10 "set" behavior still emits the real
      // parsed Edge shapes after the empty-shape fallback is added.
      const mediaId = 'cccccccc-1111-2222-3333-444444444444';
      const media = makeItem({
        id: mediaId,
        path: '/sitecore/media library/x/y',
        sharedFields: [
          { id: 'c06867fe-9a43-4c7d-b739-48780492d06f', hint: 'Extension', value: 'png' },
        ],
      });
      const holder = makeItem({
        id: '66666666-0000-0000-0000-000000000001',
        path: '/sitecore/content/holder-regression',
        sharedFields: [
          { id: 'ffffffff-0000-0000-0000-000000002001', hint: 'DemoIcon', value: `<image mediaid="{${mediaId.toUpperCase()}}" alt="X" />` },
          { id: 'ffffffff-0000-0000-0000-000000002002', hint: 'DemoNodeLink', value: '<link text="X" linktype="external" url="https://example.com" target="_blank" />' },
        ],
      });
      const app = await createTestApp([media, holder]);
      try {
        const response = await app.inject({
          method: 'POST',
          url: '/api/graphql',
          payload: {
            query: `{item(path:"/sitecore/content/holder-regression",language:"en"){
              img: field(name:"DemoIcon"){jsonValue}
              lnk: field(name:"DemoNodeLink"){jsonValue}
            }}`,
          },
        });
        const body = response.json();
        expect(body.errors).toBeUndefined();
        expect(body.data.item.img.jsonValue.value.src).toBe('/-/media/x/y.png?iar=0');
        // 0.3.6 - no scImage default; class only present when authored.
        expect(body.data.item.img.jsonValue.value).not.toHaveProperty('class');
        expect(body.data.item.lnk.jsonValue.value.href).toBe('https://example.com');
        expect(body.data.item.lnk.jsonValue.value.linktype).toBe('external');
        expect(body.data.item.lnk.jsonValue.value.target).toBe('_blank');
      } finally {
        await app.close();
      }
    });
  });

  describe('0.1.11 children sort order (__Sortorder then name)', () => {
    // Real Sitecore orders children by the numeric __Sortorder standard
    // field (empty/missing → 100) and breaks ties by the item name,
    // case-insensitive. Mockingbird was returning items in indexing order,
    // which manifested as scrambled nav rendering.
    it('children are sorted by __Sortorder numeric asc, then by name', async () => {
      const parent: ScsItem = makeItem({
        id: 'so000000-0000-0000-0000-000000000000',
        path: '/sitecore/content/sort-parent',
      });
      const childTemplate = 'so000000-tmpl-tmpl-tmpl-tmpltmpltmpl';
      const mkChild = (id: string, name: string, sortorder: string | null): ScsItem =>
        makeItem({
          id,
          parent: 'so000000-0000-0000-0000-000000000000',
          path: `/sitecore/content/sort-parent/${name}`,
          template: childTemplate,
          sharedFields: sortorder === null
            ? []
            : [{ id: 'ba3f86a2-4a1c-4d78-b63d-91c2779c1b5e', hint: '__Sortorder', value: sortorder }],
        });

      // Input order is deliberately scrambled so a stable-identity check
      // on the output would still fail unless we're actually sorting.
      const solutions     = mkChild('so000000-0000-0000-0000-000000000001', 'Solutions', null);
      const resources     = mkChild('so000000-0000-0000-0000-000000000002', 'Resources', '200');
      const products      = mkChild('so000000-0000-0000-0000-000000000003', 'Products', '');
      const gettingStarted = mkChild('so000000-0000-0000-0000-000000000004', 'Getting-Started', null);
      const documentation = mkChild('so000000-0000-0000-0000-000000000005', 'Documentation', '400');
      const contactUs     = mkChild('so000000-0000-0000-0000-000000000006', 'Contact-Us', '500');
      const about         = mkChild('so000000-0000-0000-0000-000000000007', 'About', '300');

      const app = await createTestApp([
        parent,
        solutions, resources, products, gettingStarted, documentation, contactUs, about,
      ]);
      try {
        const response = await app.inject({
          method: 'POST',
          url: '/api/graphql',
          payload: {
            query: `{item(path:"/sitecore/content/sort-parent",language:"en"){children{results{id}}}}`,
          },
        });
        const body = response.json();
        expect(body.errors).toBeUndefined();
        const ids = body.data.item.children.results.map((r: { id: string }) => r.id);
        // Three 100-defaulted children tie-break by name ASC:
        // Getting-Started, Products, Solutions - then the explicitly
        // ordered ones: Resources(200), About(300), Documentation(400),
        // Contact-Us(500).
        expect(ids).toEqual([
          gettingStarted.id,
          products.id,
          solutions.id,
          resources.id,
          about.id,
          documentation.id,
          contactUs.id,
        ]);
      } finally {
        await app.close();
      }
    });

    it('sort runs after includeTemplateIDs filter and before first: slicing', async () => {
      const parent: ScsItem = makeItem({
        id: 'so111111-0000-0000-0000-000000000000',
        path: '/sitecore/content/sort-filter-parent',
      });
      const keep = 'keep-tmpl-0000-0000-000000000000';
      const skip = 'skip-tmpl-0000-0000-000000000000';
      const mk = (id: string, name: string, tmpl: string, sortorder: string): ScsItem =>
        makeItem({
          id,
          parent: 'so111111-0000-0000-0000-000000000000',
          path: `/sitecore/content/sort-filter-parent/${name}`,
          template: tmpl,
          sharedFields: [
            { id: 'ba3f86a2-4a1c-4d78-b63d-91c2779c1b5e', hint: '__Sortorder', value: sortorder },
          ],
        });

      const kA = mk('kkkkkkkk-0000-0000-0000-000000000001', 'Alpha', keep, '300');
      const kB = mk('kkkkkkkk-0000-0000-0000-000000000002', 'Bravo', keep, '100');
      const kC = mk('kkkkkkkk-0000-0000-0000-000000000003', 'Charlie', keep, '200');
      const skipped = mk('sssssss1-0000-0000-0000-000000000001', 'Zulu', skip, '50');

      const app = await createTestApp([parent, kA, kB, kC, skipped]);
      try {
        const response = await app.inject({
          method: 'POST',
          url: '/api/graphql',
          payload: {
            query: `{item(path:"/sitecore/content/sort-filter-parent",language:"en"){children(includeTemplateIDs:["${keep}"], first:2){results{id}}}}`,
          },
        });
        const body = response.json();
        expect(body.errors).toBeUndefined();
        const ids = body.data.item.children.results.map((r: { id: string }) => r.id);
        // skip-tmpl item filtered out first. Then sort → Bravo(100),
        // Charlie(200), Alpha(300). Then first:2 → [Bravo, Charlie].
        expect(ids).toEqual([kB.id, kC.id]);
      } finally {
        await app.close();
      }
    });
  });

  describe('0.1.10 field wrappers + jsonValue Edge-shape parsing', () => {
    // Gap 1 - field wrappers must never be null for a queried field. Real
    // Experience Edge always returns a non-null wrapper object with the
    // inner scalar set to the type-appropriate "unset" default.
    it('field(name:) returns a non-null wrapper with defaults for an unset field', async () => {
      const item = makeItem({
        id: 'wr000000-0000-0000-0000-000000000001',
        path: '/sitecore/content/wrapper-unset',
      });
      const app = await createTestApp([item]);
      try {
        const response = await app.inject({
          method: 'POST',
          url: '/api/graphql',
          payload: {
            query: `{item(path:"/sitecore/content/wrapper-unset",language:"en"){field(name:"Nonexistent"){value boolValue jsonValue}}}`,
          },
        });
        const body = response.json();
        expect(body.errors).toBeUndefined();
        expect(body.data.item.field).not.toBeNull();
        expect(body.data.item.field.value).toBe('');
        expect(body.data.item.field.boolValue).toBe(false);
        expect(body.data.item.field.jsonValue).toBeNull();
      } finally {
        await app.close();
      }
    });

    it('field(name:) boolValue returns true / false for checkbox "1"/"0"', async () => {
      const item = makeItem({
        id: 'wr000000-0000-0000-0000-000000000002',
        path: '/sitecore/content/wrapper-checkbox',
        sharedFields: [
          { id: 'ffffffff-0000-0000-0000-000000000001', hint: 'DemoFlagOne', value: '1' },
          { id: 'ffffffff-0000-0000-0000-000000000002', hint: 'DemoFlagTwo', value: '0' },
        ],
      });
      const app = await createTestApp([item]);
      try {
        const response = await app.inject({
          method: 'POST',
          url: '/api/graphql',
          payload: {
            query: `{item(path:"/sitecore/content/wrapper-checkbox",language:"en"){
              on: field(name:"DemoFlagOne"){boolValue}
              off: field(name:"DemoFlagTwo"){boolValue}
            }}`,
          },
        });
        const body = response.json();
        expect(body.errors).toBeUndefined();
        expect(body.data.item.on.boolValue).toBe(true);
        expect(body.data.item.off.boolValue).toBe(false);
      } finally {
        await app.close();
      }
    });

    // Gap 2 - jsonValue must be the parsed Edge shape for image / link
    // fields, never the raw field XML string.
    it('image field jsonValue emits authored-XML attrs + src/alt/width/height projections from media item (0.4.0.2)', async () => {
      // 0.4.0.2 (Phase B): jsonValue.value contains the authored attrs
      // (minus mediaid) plus projections - src always; alt/width/height
      // filled from the media item when absent from the authored XML,
      // matching FieldRenderer.RenderField's behavior of pulling media
      // defaults into the rendered <img> element.
      const mediaId = 'a5b28914-a1b9-41c3-b932-ab3adfeebeb4';
      const media = makeItem({
        id: mediaId,
        path: '/sitecore/media library/Project/site/docs/docs-icon',
        sharedFields: [
          { id: 'c06867fe-9a43-4c7d-b739-48780492d06f', hint: 'Extension', value: 'png' },
          { id: '22eac599-f13b-4607-a89d-c091763a467d', hint: 'Width', value: '64' },
          { id: 'de2ca9e4-c117-4c8a-a139-1ff4b199d15a', hint: 'Height', value: '64' },
        ],
        languages: [{
          language: 'en',
          fields: [],
          versions: [{
            version: 1,
            fields: [
              { id: '65885c44-8fcd-4a7f-94f1-ee63703fe193', hint: 'Alt', value: 'Docs icon' },
            ],
          }],
        }],
      });
      const holder = makeItem({
        id: 'ho000000-0000-0000-0000-000000000001',
        path: '/sitecore/content/holder-image',
        sharedFields: [
          { id: 'ffffffff-0000-0000-0000-000000000010', hint: 'DemoIcon', value: `<image mediaid="{${mediaId.toUpperCase()}}" />` },
        ],
      });
      const app = await createTestApp([media, holder]);
      try {
        const response = await app.inject({
          method: 'POST',
          url: '/api/graphql',
          payload: {
            query: `{item(path:"/sitecore/content/holder-image",language:"en"){field(name:"DemoIcon"){jsonValue}}}`,
          },
        });
        const body = response.json();
        expect(body.errors).toBeUndefined();
        // Authored XML carries only mediaid (consumed by FieldRenderer,
        // not emitted). alt/width/height come from the media item's own
        // fields via the projection layer; src is always projected.
        expect(body.data.item.field.jsonValue).toEqual({
          value: {
            src: '/-/media/Project/site/docs/docs-icon.png?h=64&iar=0&w=64',
            alt: 'Docs icon',
            width: '64',
            height: '64',
          },
        });
      } finally {
        await app.close();
      }
    });

    it('image field jsonValue is null when the field is unset (empty mediaid)', async () => {
      const holder = makeItem({
        id: 'ho000000-0000-0000-0000-000000000002',
        path: '/sitecore/content/holder-image-unset',
      });
      const app = await createTestApp([holder]);
      try {
        const response = await app.inject({
          method: 'POST',
          url: '/api/graphql',
          payload: {
            query: `{item(path:"/sitecore/content/holder-image-unset",language:"en"){field(name:"DemoIcon"){jsonValue}}}`,
          },
        });
        const body = response.json();
        expect(body.errors).toBeUndefined();
        expect(body.data.item.field).not.toBeNull();
        expect(body.data.item.field.jsonValue).toBeNull();
      } finally {
        await app.close();
      }
    });

    it('link field jsonValue parses external link into Edge shape', async () => {
      const holder = makeItem({
        id: 'ho000000-0000-0000-0000-000000000003',
        path: '/sitecore/content/holder-link-ext',
        sharedFields: [
          {
            id: 'ffffffff-0000-0000-0000-000000000020',
            hint: 'DemoNodeLink',
            value: '<link text="Documentation" linktype="external" url="https://docs.site.example.com" target="_blank" />',
          },
        ],
      });
      const app = await createTestApp([holder]);
      try {
        const response = await app.inject({
          method: 'POST',
          url: '/api/graphql',
          payload: {
            query: `{item(path:"/sitecore/content/holder-link-ext",language:"en"){field(name:"DemoNodeLink"){jsonValue}}}`,
          },
        });
        const body = response.json();
        expect(body.errors).toBeUndefined();
        const v = body.data.item.field.jsonValue.value;
        expect(v.href).toBe('https://docs.site.example.com');
        expect(v.text).toBe('Documentation');
        expect(v.linktype).toBe('external');
        expect(v.target).toBe('_blank');
      } finally {
        await app.close();
      }
    });

    it('link field jsonValue parses internal link with resolved href + id', async () => {
      const targetId = 'af176413-1cfe-4c54-9fcb-4f0545258bff';
      const target = makeItem({
        id: targetId,
        path: '/sitecore/content/site/Home/about',
      });
      const holder = makeItem({
        id: 'ho000000-0000-0000-0000-000000000004',
        path: '/sitecore/content/site/Home/holder-link-int',
        sharedFields: [
          {
            id: 'ffffffff-0000-0000-0000-000000000021',
            hint: 'DemoNodeLink',
            value: `<link text="Contact Us" linktype="internal" id="{${targetId.toUpperCase()}}" />`,
          },
        ],
      });
      const app = await createTestApp([target, holder]);
      try {
        const response = await app.inject({
          method: 'POST',
          url: '/api/graphql',
          payload: {
            query: `{item(path:"/sitecore/content/site/Home/holder-link-int",language:"en"){field(name:"DemoNodeLink"){jsonValue}}}`,
          },
        });
        const body = response.json();
        expect(body.errors).toBeUndefined();
        const v = body.data.item.field.jsonValue.value;
        expect(v.href).toBe('/about');
        expect(v.text).toBe('Contact Us');
        expect(v.linktype).toBe('internal');
        expect(v.id).toBe(`{${targetId.toUpperCase()}}`);
      } finally {
        await app.close();
      }
    });

    it('link field jsonValue parses internal link with unresolved id as href "#"', async () => {
      const holder = makeItem({
        id: 'ho000000-0000-0000-0000-000000000005',
        path: '/sitecore/content/site/Home/holder-link-broken',
        sharedFields: [
          {
            id: 'ffffffff-0000-0000-0000-000000000022',
            hint: 'DemoNodeLink',
            value: '<link text="Gone" linktype="internal" id="{DEADBEEF-DEAD-BEEF-DEAD-BEEFDEADBEEF}" />',
          },
        ],
      });
      const app = await createTestApp([holder]);
      try {
        const response = await app.inject({
          method: 'POST',
          url: '/api/graphql',
          payload: {
            query: `{item(path:"/sitecore/content/site/Home/holder-link-broken",language:"en"){field(name:"DemoNodeLink"){jsonValue}}}`,
          },
        });
        const body = response.json();
        expect(body.errors).toBeUndefined();
        expect(body.data.item.field.jsonValue.value.href).toBe('#');
      } finally {
        await app.close();
      }
    });

    it('link field jsonValue parses media link into /-/media href', async () => {
      const mediaId = 'bbbbbbbb-1111-2222-3333-444444444444';
      const media = makeItem({
        id: mediaId,
        path: '/sitecore/media library/Project/site/files/brochure',
        sharedFields: [
          { id: 'c06867fe-9a43-4c7d-b739-48780492d06f', hint: 'Extension', value: 'pdf' },
        ],
      });
      const holder = makeItem({
        id: 'ho000000-0000-0000-0000-000000000006',
        path: '/sitecore/content/holder-link-media',
        sharedFields: [
          {
            id: 'ffffffff-0000-0000-0000-000000000023',
            hint: 'DemoNodeLink',
            value: `<link text="Brochure" linktype="media" id="{${mediaId.toUpperCase()}}" />`,
          },
        ],
      });
      const app = await createTestApp([media, holder]);
      try {
        const response = await app.inject({
          method: 'POST',
          url: '/api/graphql',
          payload: {
            query: `{item(path:"/sitecore/content/holder-link-media",language:"en"){field(name:"DemoNodeLink"){jsonValue}}}`,
          },
        });
        const body = response.json();
        expect(body.errors).toBeUndefined();
        expect(body.data.item.field.jsonValue.value.href).toBe('/-/media/Project/site/files/brochure.pdf');
        expect(body.data.item.field.jsonValue.value.linktype).toBe('media');
      } finally {
        await app.close();
      }
    });

    it('non-image non-link field jsonValue falls back to { value: raw }', async () => {
      const item = makeItem({
        id: 'wr000000-0000-0000-0000-000000000003',
        path: '/sitecore/content/wrapper-text',
        sharedFields: [
          { id: 'ffffffff-0000-0000-0000-000000000030', hint: 'DemoNodeText', value: 'Products' },
        ],
      });
      const app = await createTestApp([item]);
      try {
        const response = await app.inject({
          method: 'POST',
          url: '/api/graphql',
          payload: {
            query: `{item(path:"/sitecore/content/wrapper-text",language:"en"){field(name:"DemoNodeText"){value jsonValue}}}`,
          },
        });
        const body = response.json();
        expect(body.errors).toBeUndefined();
        expect(body.data.item.field.value).toBe('Products');
        expect(body.data.item.field.jsonValue).toEqual({ value: 'Products' });
      } finally {
        await app.close();
      }
    });
  });

  it('DictionarySiteQuery returns the empty-connection stub shape', async () => {
    const response = await siteApp.inject({
      method: 'POST',
      url: '/api/graphql',
      payload: {
        query: `query($s:String!,$l:String!,$p:Int,$a:String){site{siteInfo(site:$s){dictionary(language:$l,first:$p,after:$a){pageInfo{endCursor hasNext} results{key value}}}}}`,
        variables: { s: 'site', l: 'en', p: 500, a: '' },
      },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.errors).toBeUndefined();
    expect(body.data.site.siteInfo.dictionary).toEqual({
      pageInfo: { endCursor: null, hasNext: false },
      results: [],
    });
  });
});

// 0.7.6.1 regression anchor: the graphqlExecutor closure inside Query.layout
// fires the rendering's ComponentQuery via `app.graphql()`. Pre-0.7.6.1 the
// closure passed `undefined` as the resolver context, so resolvers running
// inside the inner query received Mercurius's framework defaults but no
// `engine` key. Field shaping that routes through the renderField pipeline
// (General Link, Image - anything whose pipeline processor reads
// `args.engine`) crashed with TypeError on `args.engine.getItemById`, the
// `field(name:)` resolver bubbled the throw up, Mercurius caught it, and
// the field came back as null. Feature components consuming
// `link.link.jsonValue` then crashed with "Cannot read properties of null
// (reading 'jsonValue')". Same bug class as 0.7.5.0 alias-bypass
// (`handleEdgeAlias` passing `{}`); same fix family: thread the parent
// resolver's ctx through.
describe('graphqlExecutor threads ctx into integrated GraphQL (0.7.6.1)', () => {
  const integratedRenderingId = 'c1c11111-c1c1-c1c1-c1c1-c1c1c1c1c1c1';
  const integratedPageId = 'c1c19999-c1c1-c1c1-c1c1-c1c1c1c1c1c1';
  const linkPageTemplateId = 'cafe1111-cafe-cafe-cafe-cafecafecafe';
  const linkPageSectionId = 'cafe2222-cafe-cafe-cafe-cafecafecafe';
  const linkPageLinkFieldId = 'cafe3333-cafe-cafe-cafe-cafecafecafe';

  const linkPageTemplate = makeItem({
    id: linkPageTemplateId,
    path: '/sitecore/templates/Project/site/IntegratedLinkPage',
    template: TEMPLATE_TEMPLATE_ID,
  });
  const linkPageSection = makeItem({
    id: linkPageSectionId,
    parent: linkPageTemplateId,
    path: '/sitecore/templates/Project/site/IntegratedLinkPage/Content',
    template: TEMPLATE_SECTION_TEMPLATE_ID,
  });
  const linkPageLinkFieldDef = makeItem({
    id: linkPageLinkFieldId,
    parent: linkPageSectionId,
    path: '/sitecore/templates/Project/site/IntegratedLinkPage/Content/PageLink',
    template: TEMPLATE_FIELD_TEMPLATE_ID,
    sharedFields: [{ id: FIELD_IDS.type, hint: 'Type', value: 'General Link' }],
  });

  const componentQuery = `
    query LinkDatasource($datasource: String!, $language: String!) {
      datasource: item(path: $datasource, language: $language) {
        pageLink: field(name: "PageLink") { jsonValue }
      }
    }
  `;

  const integratedRendering = makeItem({
    id: integratedRenderingId,
    path: '/sitecore/layout/Renderings/Project/site/IntegratedLink',
    template: RENDERING_TEMPLATE_ID,
    sharedFields: [
      { id: '17bb046a-a32a-41b3-8315-81217947611b', hint: 'ComponentQuery', value: componentQuery },
    ],
  });

  const integratedPage = makeItem({
    id: integratedPageId,
    path: '/sitecore/content/site/Home/integrated',
    template: linkPageTemplateId,
    languages: [{
      language: 'en',
      fields: [],
      versions: [{
        version: 1,
        fields: [
          {
            id: '04bf00db-f5fb-41f7-8ab7-22408372a981',
            hint: '__Final Renderings',
            value: `<r xmlns:s="s" xmlns:p="p" p:p="1"><d id="{${DEFAULT_DEVICE}}"><r uid="{BBB00000-0000-0000-0000-000000000001}" s:id="{${integratedRenderingId.toUpperCase()}}" s:ph="headless-main" s:ds="{${integratedPageId.toUpperCase()}}" s:par="" /></d></r>`,
          },
          {
            id: linkPageLinkFieldId,
            hint: 'PageLink',
            value: `<link xhtml:href="" linktype="internal" id="{HOME1111-HOME-HOME-HOME-HOMEHOMEHOME}" />`,
          },
        ],
      }],
    }],
  });

  let integratedApp: FastifyInstance;
  beforeAll(async () => {
    integratedApp = await createTestApp([
      ...allFixtures,
      linkPageTemplate, linkPageSection, linkPageLinkFieldDef,
      integratedRendering,
      integratedPage,
    ]);
  });
  afterAll(async () => { await integratedApp.close(); });

  it('renders datasource.pageLink.jsonValue with a populated href via engine.getItemById', async () => {
    const response = await integratedApp.inject({
      method: 'POST',
      url: '/api/graphql',
      payload: {
        query: LAYOUT_QUERY,
        variables: { site: 'site', routePath: '/integrated', language: 'en' },
      },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.errors).toBeUndefined();

    const route = body.data.layout.item.rendered.sitecore.route;
    const node = route.placeholders['headless-main'][0];
    expect(node.fields).toHaveProperty('data');
    const data = node.fields.data as {
      datasource: {
        pageLink: { jsonValue: { value: { href?: string } } } | null;
      } | null;
    };

    // Pre-fix: `pageLink` is null because `renderLinkStub` reads
    // `args.engine.getItemById(normal)` and crashes on `undefined.getItemById`
    // when the executor passed `undefined` as ctx. The throw bubbles up
    // through readHint, Mercurius catches it, and the field wrapper is null.
    // Post-fix: ctx threads through, the link is rendered, jsonValue.value.href
    // resolves the internal target item to a site-relative path.
    expect(data.datasource).not.toBeNull();
    expect(data.datasource!.pageLink).not.toBeNull();
    expect(data.datasource!.pageLink!.jsonValue.value.href).toBe('/');
  });
});

// 0.9.0.3 regression: `parent`/`ancestors`/`hasChildren` were absent from
// `AnyItem`, breaking a real-world VersionSelector query (two-level walk
// up the content tree to enumerate sibling versions). Decompile-grounded port
// of the EdgeSchema resolvers (Sitecore.Services.GraphQL.EdgeSchema:3519-3522).
describe('AnyItem.parent / ancestors / hasChildren (regression)', () => {
  // Builds a four-level chain
  //   /sitecore/content/site/section/subsection/leaf
  // mirroring a deep-nav VersionSelector query path. Each item has a single
  // en/v1 entry so the version-count gate passes.
  function makeChainItem(id: string, parent: string, path: string, template = 'tmpl-leaf'): ScsItem {
    return makeItem({
      id,
      parent,
      path,
      template,
      languages: [{
        language: 'en',
        fields: [],
        versions: [{ version: 1, fields: [{ id: 'eeee3333-eeee-eeee-eeee-eeeeeeeeeeee', hint: 'Title', value: path.split('/').pop() ?? '' }] }],
      }],
    });
  }

  const ROOT = makeChainItem(
    'root1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '00000000-0000-0000-0000-000000000000',
    '/sitecore/content/site',
  );
  const RESOURCE = makeChainItem(
    'reso1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'root1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '/sitecore/content/site/category-a',
  );
  const VERSION_V1 = makeChainItem(
    'verr1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'reso1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '/sitecore/content/site/category-a/v1',
    'tmpl-version',
  );
  const VERSION_V2 = makeChainItem(
    'vers1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'reso1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '/sitecore/content/site/category-a/v2',
    'tmpl-version',
  );
  const READ = makeChainItem(
    'read1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'verr1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '/sitecore/content/site/category-a/v1/read',
  );
  // Same parent as READ but a sibling, so READ's ancestors filter test has
  // something to filter against.
  const DEEP_NAV_FIXTURES = [ROOT, RESOURCE, VERSION_V1, VERSION_V2, READ];

  it('parent returns the immediate parent item', async () => {
    const app = await createTestApp(DEEP_NAV_FIXTURES);
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/graphql',
        payload: {
          query: `{item(path:"/sitecore/content/site/category-a/v1/read",language:"en"){parent{id name}}}`,
        },
      });
      const body = response.json();
      expect(body.errors).toBeUndefined();
      expect(body.data.item.parent).toEqual({
        id: 'verr1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        name: 'v1',
      });
    } finally {
      await app.close();
    }
  });

  it('parent returns null at the tree root (zero-GUID parent)', async () => {
    const app = await createTestApp(DEEP_NAV_FIXTURES);
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/graphql',
        payload: {
          query: `{item(path:"/sitecore/content/site",language:"en"){parent{id}}}`,
        },
      });
      const body = response.json();
      expect(body.errors).toBeUndefined();
      expect(body.data.item.parent).toBeNull();
    } finally {
      await app.close();
    }
  });

  it('parent returns null when parent has no versions in the requested language', async () => {
    // Sitecore EdgeSchema.ResolveParent: Parent.Versions.Count == 0 -> null.
    // Models a structural ancestor (e.g. a content folder authored only in
    // German while the page is read in English).
    const child = makeChainItem(
      'chld1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'pdeo1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      '/sitecore/content/site/de-only/page',
    );
    const deOnlyParent = makeItem({
      id: 'pdeo1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      parent: 'root1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      path: '/sitecore/content/site/de-only',
      languages: [{
        language: 'de',
        fields: [],
        versions: [{ version: 1, fields: [] }],
      }],
    });
    const app = await createTestApp([ROOT, deOnlyParent, child]);
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/graphql',
        payload: {
          query: `{item(path:"/sitecore/content/site/de-only/page",language:"en"){parent{id}}}`,
        },
      });
      const body = response.json();
      expect(body.errors).toBeUndefined();
      expect(body.data.item.parent).toBeNull();
    } finally {
      await app.close();
    }
  });

  it('reproduces the deep-nav VersionSelector two-level walk-up', async () => {
    // Exact shape of the failing VersionSelector query: leaf -> subsection
    // -> section, then enumerate sibling versions of the subsection.
    const app = await createTestApp(DEEP_NAV_FIXTURES);
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/graphql',
        payload: {
          query: `query VersionQuery($p: String!) {
            interaction: item(path: $p, language: "en") {
              parent { parent { version: children(first: 2) { results { name firstchild: children(first: 1) { results { name } } } } } }
            }
          }`,
          variables: { p: '/sitecore/content/site/category-a/v1/read' },
        },
      });
      const body = response.json();
      expect(body.errors).toBeUndefined();
      const versions = body.data.interaction.parent.parent.version.results;
      expect(versions.map((v: { name: string }) => v.name).sort()).toEqual(['v1', 'v2']);
    } finally {
      await app.close();
    }
  });

  it('ancestors returns items in immediate-parent-first order', async () => {
    const app = await createTestApp(DEEP_NAV_FIXTURES);
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/graphql',
        payload: {
          query: `{item(path:"/sitecore/content/site/category-a/v1/read",language:"en"){ancestors{name}}}`,
        },
      });
      const body = response.json();
      expect(body.errors).toBeUndefined();
      expect(body.data.item.ancestors.map((a: { name: string }) => a.name)).toEqual([
        'v1',
        'category-a',
        'site',
      ]);
    } finally {
      await app.close();
    }
  });

  it('ancestors filters by includeTemplateIDs (exact-template match)', async () => {
    const app = await createTestApp(DEEP_NAV_FIXTURES);
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/graphql',
        payload: {
          query: `{item(path:"/sitecore/content/site/category-a/v1/read",language:"en"){ancestors(includeTemplateIDs:["tmpl-version"]){name}}}`,
        },
      });
      const body = response.json();
      expect(body.errors).toBeUndefined();
      expect(body.data.item.ancestors.map((a: { name: string }) => a.name)).toEqual(['v1']);
    } finally {
      await app.close();
    }
  });

  it('hasChildren returns true for a parent and false for a leaf', async () => {
    const app = await createTestApp(DEEP_NAV_FIXTURES);
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/graphql',
        payload: {
          query: `{
            withKids: item(path:"/sitecore/content/site/category-a",language:"en"){hasChildren},
            leaf: item(path:"/sitecore/content/site/category-a/v1/read",language:"en"){hasChildren}
          }`,
        },
      });
      const body = response.json();
      expect(body.errors).toBeUndefined();
      expect(body.data.withKids.hasChildren).toBe(true);
      expect(body.data.leaf.hasChildren).toBe(false);
    } finally {
      await app.close();
    }
  });

  it('hasChildren respects includeTemplateIDs filter', async () => {
    // category-a has 2 children: v1, v2 (both tmpl-version).
    // No tmpl-other children, so the filtered hasChildren is false.
    const app = await createTestApp(DEEP_NAV_FIXTURES);
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/graphql',
        payload: {
          query: `{
            kept: item(path:"/sitecore/content/site/category-a",language:"en"){hasChildren(includeTemplateIDs:["tmpl-version"])},
            dropped: item(path:"/sitecore/content/site/category-a",language:"en"){hasChildren(includeTemplateIDs:["tmpl-other"])}
          }`,
        },
      });
      const body = response.json();
      expect(body.errors).toBeUndefined();
      expect(body.data.kept.hasChildren).toBe(true);
      expect(body.data.dropped.hasChildren).toBe(false);
    } finally {
      await app.close();
    }
  });

  it('introspection lists parent / ancestors / hasChildren on AnyItem', async () => {
    // Acceptance criterion: __type(name:"AnyItem") must include parent
    // (and the additional fields restored).
    const app = await createTestApp(DEEP_NAV_FIXTURES);
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/graphql',
        payload: {
          query: `{ __type(name: "AnyItem") { fields { name } } }`,
        },
      });
      const body = response.json();
      expect(body.errors).toBeUndefined();
      const fieldNames = (body.data.__type.fields as Array<{ name: string }>).map(f => f.name);
      expect(fieldNames).toContain('parent');
      expect(fieldNames).toContain('ancestors');
      expect(fieldNames).toContain('hasChildren');
    } finally {
      await app.close();
    }
  });
});

describe('GraphiQL UI', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await createTestApp(allFixtures); });
  afterAll(async () => { await app.close(); });

  it('serves a GraphiQL HTML page at GET /graphiql', async () => {
    const response = await app.inject({ method: 'GET', url: '/graphiql' });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toMatch(/html/);
    expect(response.body).toMatch(/GraphiQL/i);
  });
});
